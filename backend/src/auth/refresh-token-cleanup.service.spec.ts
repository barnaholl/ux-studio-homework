import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RefreshTokenCleanupService', () => {
  let service: RefreshTokenCleanupService;
  let prisma: { refreshToken: { deleteMany: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      refreshToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenCleanupService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: PinoLogger,
          useValue: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            setContext: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(RefreshTokenCleanupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should delete all tokens with expiresAt in the past', async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 42 });

    await service.purgeExpiredTokens();

    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });

  it('should pass a current timestamp as the expiry cutoff', async () => {
    const before = new Date();
    await service.purgeExpiredTokens();
    const after = new Date();

    const callArg: Date =
      prisma.refreshToken.deleteMany.mock.calls[0][0].where.expiresAt.lt;

    expect(callArg.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(callArg.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should complete without error when no tokens are expired', async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.purgeExpiredTokens()).resolves.toBeUndefined();
  });
});
