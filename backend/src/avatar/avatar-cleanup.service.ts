import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import { S3Service } from '../s3/s3.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AVATAR_SIZES } from './avatar.service';

const STAGED_SET_KEY = 'avatar:staged:pending';
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class AvatarCleanupService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly s3: S3Service,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.logger.setContext(AvatarCleanupService.name);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOrphanedAvatars(): Promise<void> {
    this.logger.info('Starting orphaned staged avatar cleanup');

    try {
      const cutoff = Date.now() - MAX_AGE_MS;

      // Get all staged entries older than the cutoff
      const expired = await this.redis.zrangebyscore(STAGED_SET_KEY, 0, cutoff);
      if (expired.length === 0) {
        this.logger.info('No orphaned staged avatars found');
        return;
      }

      let deleted = 0;
      const BATCH_SIZE = 10;
      for (let i = 0; i < expired.length; i += BATCH_SIZE) {
        const batch = expired.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.flatMap((entry) => {
            const prefix = `avatars/${entry}`;
            return AVATAR_SIZES.map((size) =>
              this.s3.delete(`${prefix}-${size}.webp`),
            );
          }),
        );
        deleted += batch.length;
      }

      // Remove processed entries from the sorted set
      await this.redis.zremrangebyscore(STAGED_SET_KEY, 0, cutoff);

      this.logger.info({ deleted }, 'Orphaned avatar cleanup completed');
    } catch (error) {
      this.logger.error({ err: error }, 'Orphaned avatar cleanup failed');
    }
  }
}
