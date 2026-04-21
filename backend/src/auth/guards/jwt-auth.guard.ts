import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import Redis from 'ioredis';
import { IS_PUBLIC_KEY } from '../decorators';
import { REDIS_CLIENT } from '../../redis/redis.module';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Allow @Public() routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Run passport JWT validation
    const canActivate = await (super.canActivate(context) as Promise<boolean>);
    if (!canActivate) return false;

    // Check access token blacklist
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { jti?: string } }>();
    const jti = request.user?.jti;
    if (jti) {
      const blacklisted = await this.redis.get(`blacklist:${jti}`);
      if (blacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    return true;
  }
}
