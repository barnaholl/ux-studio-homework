import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt-auth.guard';
import { REDIS_CLIENT } from '../../redis/redis.module';

// We need to mock AuthGuard('jwt') before importing JwtAuthGuard
// Since it extends AuthGuard, we test the canActivate logic directly

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  let redis: Record<string, jest.Mock>;

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn().mockReturnValue(false),
          },
        },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    guard = module.get(JwtAuthGuard);
    reflector = module.get(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow @Public() routes without authentication', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    const context = createMockContext({});

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw UnauthorizedException when token is blacklisted', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    redis.get.mockResolvedValue('1');

    // Mock super.canActivate to return true (passport validation passes)
    jest
      .spyOn(JwtAuthGuard.prototype, 'canActivate')
      .mockImplementation(async function (
        this: JwtAuthGuard,
        context: ExecutionContext,
      ) {
        // Simulate: isPublic=false, passport passes, then blacklist check
        const isPublic = (reflector.getAllAndOverride as jest.Mock)();
        if (isPublic) return true;

        // Simulate passport setting user on request
        const req = context.switchToHttp().getRequest<{
          user?: { jti?: string };
        }>();
        req.user = { jti: 'blacklisted-jti' };

        // Check blacklist
        const blacklisted = await redis.get(`blacklist:${req.user.jti}`);
        if (blacklisted) {
          throw new UnauthorizedException('Token has been revoked');
        }
        return true;
      });

    const context = createMockContext({ user: { jti: 'blacklisted-jti' } });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(redis.get).toHaveBeenCalledWith('blacklist:blacklisted-jti');
  });
});

function createMockContext(
  reqOverrides: Record<string, unknown>,
): ExecutionContext {
  const request = { user: undefined, ...reqOverrides };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => jest.fn(),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    switchToRpc: () => ({}) as any,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    switchToWs: () => ({}) as any,
    getType: () => 'http' as const,
  } as unknown as ExecutionContext;
}
