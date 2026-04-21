import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Nightly job that hard-deletes RefreshToken rows whose expiresAt has passed.
 *
 * Refresh tokens have a 7-day lifetime. Without cleanup, the table grows
 * unboundedly — every login adds one row that is never removed unless the user
 * explicitly logs out. This job runs at 03:00 UTC daily and removes all expired
 * rows in a single batch DELETE, keeping the table size proportional to the
 * number of active sessions rather than total logins over time.
 */
@Injectable()
export class RefreshTokenCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RefreshTokenCleanupService.name);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredTokens(): Promise<void> {
    const now = new Date();
    this.logger.info('Starting nightly expired refresh token purge');

    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    this.logger.info({ count }, 'Expired refresh token purge complete');
  }
}
