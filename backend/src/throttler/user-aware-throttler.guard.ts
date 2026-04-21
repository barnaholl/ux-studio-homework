import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { sub?: string } | undefined;
    if (user?.sub) {
      return Promise.resolve(`user:${user.sub}`);
    }
    const request = req as { ip?: string };
    return Promise.resolve(request.ip ?? 'unknown');
  }
}
