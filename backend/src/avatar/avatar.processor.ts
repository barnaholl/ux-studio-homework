import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import * as fs from 'fs/promises';
import sharp from 'sharp';
import Redis from 'ioredis';
import { S3Service } from '../s3/s3.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AVATAR_SIZES } from './avatar.service';
import { AVATAR_PROCESS_QUEUE } from './avatar.constants';

export interface AvatarJobData {
  userId: string;
  stageId: string;
  tmpPath: string;
}

@Processor(AVATAR_PROCESS_QUEUE)
export class AvatarProcessor extends WorkerHost {
  constructor(
    private readonly logger: PinoLogger,
    private readonly s3: S3Service,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super();
    this.logger.setContext(AvatarProcessor.name);
  }

  async process(job: Job<AvatarJobData>): Promise<void> {
    const { userId, stageId, tmpPath } = job.data;
    this.logger.info({ userId, stageId }, 'Processing avatar job');

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(tmpPath);
    } catch {
      // Temp file missing — already gone (e.g. container restart). Nothing to retry.
      this.logger.error(
        { userId, stageId, tmpPath },
        'Temp file not found, skipping job',
      );
      return;
    }

    try {
      const prefix = `avatars/${userId}`;
      for (const size of AVATAR_SIZES) {
        const resized = await sharp(buffer)
          .resize(size, size, { fit: 'cover', position: 'centre' })
          .webp({ quality: 80 })
          .toBuffer();
        await this.s3.upload(
          `${prefix}/${stageId}-${size}.webp`,
          resized,
          'image/webp',
        );
      }

      // Mark as ready for commit
      await this.redis.set(
        `avatar:staged:${userId}:${stageId}`,
        '1',
        'EX',
        1800,
      );
      await this.redis.zadd(
        'avatar:staged:pending',
        Date.now(),
        `${userId}/${stageId}`,
      );

      // Only delete the temp file on success — if S3 fails, leave it so
      // BullMQ retries can read it again on the next attempt.
      await fs.unlink(tmpPath).catch(() => {});

      this.logger.info({ userId, stageId }, 'Avatar processed and staged');
    } catch (err) {
      this.logger.error({ userId, stageId, err }, 'Avatar processing failed');
      throw err; // let BullMQ retry
    }
  }
}
