import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import * as crypto from 'crypto';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { fromBuffer } from 'file-type';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AVATAR_PROCESS_QUEUE } from './avatar.constants';

export const AVATAR_SIZES = [40, 120] as const;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

@Injectable()
export class AvatarService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue(AVATAR_PROCESS_QUEUE) private readonly avatarQueue: Queue,
  ) {
    this.logger.setContext(AvatarService.name);
  }

  /* ──────────────────────────── Stage + Commit ──────────────────────────── */

  /**
   * Validate file type (magic bytes), write to a temp file, and queue a
   * BullMQ job for the heavy work (Sharp resize + S3 upload).
   * Returns a stageId immediately — the job runs in the background.
   */
  async stageAvatar(userId: string, buffer: Buffer, contentType: string) {
    this.logger.info(
      { userId, contentType, size: buffer.length },
      'Avatar staging started',
    );

    // Quick pre-validation: magic bytes only (no I/O, fast)
    const detected = await fromBuffer(buffer);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      this.logger.warn(
        { userId, detectedMime: detected?.mime ?? 'unknown' },
        'Invalid file type (magic bytes)',
      );
      throw new BadRequestException('Invalid file type');
    }

    const stageId = crypto.randomUUID();
    const tmpPath = path.join(os.tmpdir(), `avatar-${userId}-${stageId}`);

    // Write raw buffer to temp file for the processor to consume
    await fs.writeFile(tmpPath, buffer);

    // Mark as pending in Redis before queuing (so commit can detect in-progress state)
    await this.redis.set(
      `avatar:staged:${userId}:${stageId}`,
      'pending',
      'EX',
      1800,
    );

    // Queue the heavy work: resize + S3 upload
    await this.avatarQueue.add(
      'process',
      { userId, stageId, tmpPath },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );

    this.logger.info({ userId, stageId }, 'Avatar queued for processing');
    return { stageId };
  }

  /** Commit a previously staged avatar to a contact (instant DB write). */
  async commitContactAvatar(
    contactId: string,
    userId: string,
    stageId: string,
  ) {
    this.logger.info(
      { contactId, userId, stageId },
      'Committing staged avatar to contact',
    );

    const stagingValue = await this.redis.get(
      `avatar:staged:${userId}:${stageId}`,
    );
    if (!stagingValue) {
      this.logger.warn({ userId, stageId }, 'Invalid or expired stage ID');
      throw new BadRequestException('Invalid or expired stage ID');
    }
    if (stagingValue !== '1') {
      this.logger.warn({ userId, stageId }, 'Avatar still processing');
      throw new BadRequestException(
        'Avatar is still processing, please try again in a moment',
      );
    }

    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact || contact.userId !== userId) {
      throw new NotFoundException(`Contact ${contactId} not found`);
    }

    if (contact.avatarUrl) {
      this.deleteAvatarByUrl(contact.avatarUrl);
    }

    const baseUrl = `${this.s3.getCdnUrl()}/avatars/${userId}/${stageId}`;

    await this.prisma.contact.update({
      where: { id: contactId },
      data: { avatarUrl: baseUrl },
    });
    await this.redis.incr(`contacts:version:${userId}`);
    await this.redis.del(`avatar:staged:${userId}:${stageId}`);
    await this.redis.zrem('avatar:staged:pending', `${userId}/${stageId}`);

    this.logger.info(
      { contactId, stageId, baseUrl },
      'Staged avatar committed to contact',
    );
    return { avatarUrl: baseUrl };
  }

  /** Commit a previously staged avatar to the authenticated user (instant DB write). */
  async commitUserAvatar(userId: string, stageId: string) {
    this.logger.info({ userId, stageId }, 'Committing staged avatar to user');

    const stagingValue = await this.redis.get(
      `avatar:staged:${userId}:${stageId}`,
    );
    if (!stagingValue) {
      this.logger.warn({ userId, stageId }, 'Invalid or expired stage ID');
      throw new BadRequestException('Invalid or expired stage ID');
    }
    if (stagingValue !== '1') {
      this.logger.warn({ userId, stageId }, 'Avatar still processing');
      throw new BadRequestException(
        'Avatar is still processing, please try again in a moment',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.avatarUrl) {
      this.deleteAvatarByUrl(user.avatarUrl);
    }

    const baseUrl = `${this.s3.getCdnUrl()}/avatars/${userId}/${stageId}`;

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: baseUrl },
    });
    await this.redis.del(`avatar:staged:${userId}:${stageId}`);
    await this.redis.zrem('avatar:staged:pending', `${userId}/${stageId}`);

    this.logger.info(
      { userId, stageId, baseUrl },
      'Staged avatar committed to user',
    );
    return { avatarUrl: baseUrl };
  }

  /** Remove the user's avatar (delete from S3 + clear DB) */
  async removeUserAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.avatarUrl) {
      this.deleteAvatarByUrl(user.avatarUrl);
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: null },
      });
    }
  }

  /** Fire-and-forget deletion of avatar files by base URL */
  deleteAvatarByUrl(avatarUrl: string): void {
    const cdnUrl = this.s3.getCdnUrl();
    const baseKey = avatarUrl.replace(`${cdnUrl}/`, '');
    this.logger.info({ baseKey }, 'Deleting avatar files by URL');
    for (const size of AVATAR_SIZES) {
      const key = `${baseKey}-${size}.webp`;
      void this.s3.delete(key).catch((error: unknown) => {
        this.logger.warn(
          { key, err: error },
          'Failed to delete avatar from S3',
        );
      });
    }
  }
}
