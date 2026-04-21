import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';

const USER_ID = 'user-1';
const EMAIL = 'test@example.com';

const mockUser = {
  id: USER_ID,
  email: EMAIL,
  passwordHash: '$2b$12$hashedpassword',
  displayName: 'Test User',
  phone: null,
  avatarUrl: null,
  theme: 'system',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let redis: Record<string, jest.Mock>;

  beforeEach(async () => {
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              create: jest.fn(),
              findUnique: jest.fn(),
            },
            refreshToken: {
              create: jest.fn().mockResolvedValue({}),
              findUnique: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('access-token'),
            decode: jest.fn().mockReturnValue({ exp: 9999999999 }),
          },
        },
        { provide: REDIS_CLIENT, useValue: redis },
        {
          provide: PinoLogger,
          useValue: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            setContext: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    prisma = module.get(PrismaService);
    jwtService = module.get(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── register ───────────────────────────────────────────────
  describe('register', () => {
    it('should create a user and return tokens', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.register({
        email: EMAIL,
        password: 'Password1!',
        displayName: 'Test User',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: EMAIL,
          displayName: 'Test User',
        }),
      });
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.accessTokenExp).toBeDefined();
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });

    it('should throw ConflictException on duplicate email (P2002)', async () => {
      (prisma.user.create as jest.Mock).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '5.0.0',
        }),
      );

      await expect(
        service.register({
          email: EMAIL,
          password: 'Password1!',
          displayName: 'Test',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should rethrow non-P2002 errors', async () => {
      (prisma.user.create as jest.Mock).mockRejectedValue(new Error('DB down'));

      await expect(
        service.register({
          email: EMAIL,
          password: 'Password1!',
          displayName: 'Test',
        }),
      ).rejects.toThrow('DB down');
    });

    it('should hash the password before storing', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      await service.register({
        email: EMAIL,
        password: 'Password1!',
        displayName: 'Test',
      });

      const call = (prisma.user.create as jest.Mock).mock.calls[0][0];
      expect(call.data.passwordHash).not.toBe('Password1!');
      expect(call.data.passwordHash).toMatch(/^\$2[aby]\$/);
    });
  });

  // ── login ──────────────────────────────────────────────────
  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bcrypt = require('bcrypt') as typeof import('bcrypt');
      const hash = await bcrypt.hash('Password1!', 4);
      const userWithHash = { ...mockUser, passwordHash: hash };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(userWithHash);

      const result = await service.login({
        email: EMAIL,
        password: 'Password1!',
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeDefined();
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.login({ email: EMAIL, password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        service.login({ email: EMAIL, password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── refresh ────────────────────────────────────────────────
  describe('refresh', () => {
    it('should throw UnauthorizedException when token not found', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            refreshToken: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
          }),
      );

      await expect(service.refresh('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should NOT revoke any family when token is not found', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            refreshToken: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
          }),
      );

      await expect(service.refresh('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      const expired = {
        id: 'rt-1',
        tokenHash: 'hash',
        familyId: 'family-1',
        userId: USER_ID,
        expiresAt: new Date(Date.now() - 1000),
      };
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            refreshToken: {
              findUnique: jest.fn().mockResolvedValue(expired),
            },
          }),
      );

      await expect(service.refresh('some-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should revoke entire family when expired token is presented', async () => {
      const expired = {
        id: 'rt-1',
        tokenHash: 'hash',
        familyId: 'family-1',
        userId: USER_ID,
        expiresAt: new Date(Date.now() - 1000),
      };
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            refreshToken: {
              findUnique: jest.fn().mockResolvedValue(expired),
            },
          }),
      );

      await expect(service.refresh('some-token')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { familyId: 'family-1' },
      });
    });

    it('should delete old token and issue new tokens on valid refresh', async () => {
      const stored = {
        id: 'rt-1',
        tokenHash: 'hash',
        familyId: 'family-1',
        userId: USER_ID,
        expiresAt: new Date(Date.now() + 86400000),
      };
      const deleteFn = jest.fn().mockResolvedValue(stored);
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            refreshToken: {
              findUnique: jest.fn().mockResolvedValue(stored),
              delete: deleteFn,
            },
          }),
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.refresh('valid-token');

      expect(deleteFn).toHaveBeenCalledWith({ where: { id: 'rt-1' } });
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeDefined();
    });

    it('should carry familyId through rotation', async () => {
      const stored = {
        id: 'rt-1',
        tokenHash: 'hash',
        familyId: 'family-1',
        userId: USER_ID,
        expiresAt: new Date(Date.now() + 86400000),
      };
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            refreshToken: {
              findUnique: jest.fn().mockResolvedValue(stored),
              delete: jest.fn().mockResolvedValue(stored),
            },
          }),
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await service.refresh('valid-token');

      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ familyId: 'family-1' }),
      });
    });

    it('should throw UnauthorizedException when user not found after refresh', async () => {
      const stored = {
        id: 'rt-1',
        tokenHash: 'hash',
        familyId: 'family-1',
        userId: USER_ID,
        expiresAt: new Date(Date.now() + 86400000),
      };
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            refreshToken: {
              findUnique: jest.fn().mockResolvedValue(stored),
              delete: jest.fn().mockResolvedValue(stored),
            },
          }),
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.refresh('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── logout ─────────────────────────────────────────────────
  describe('logout', () => {
    it('should blacklist access token in Redis with correct TTL', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 600;
      await service.logout('jti-1', futureExp);

      expect(redis.set).toHaveBeenCalledWith(
        'blacklist:jti-1',
        '1',
        'EX',
        expect.any(Number),
      );
      const ttl = redis.set.mock.calls[0][3] as number;
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(600);
    });

    it('should not set blacklist when token already expired', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 10;
      await service.logout('jti-1', pastExp);

      expect(redis.set).not.toHaveBeenCalled();
    });

    it('should delete refresh token when provided', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 600;
      await service.logout('jti-1', futureExp, 'raw-refresh-token');

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { tokenHash: expect.any(String) },
      });
    });

    it('should not delete refresh token when not provided', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 600;
      await service.logout('jti-1', futureExp);

      expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ── issueTokens (via register) ─────────────────────────────
  describe('issueTokens', () => {
    it('should call jwtService.sign with correct payload shape', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      await service.register({
        email: EMAIL,
        password: 'Password1!',
        displayName: 'Test',
      });

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: USER_ID, email: EMAIL }),
        { expiresIn: '15m' },
      );
    });

    it('should store refresh token hash and familyId in DB', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      await service.register({
        email: EMAIL,
        password: 'Password1!',
        displayName: 'Test',
      });

      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tokenHash: expect.any(String),
          familyId: expect.any(String),
          userId: USER_ID,
          expiresAt: expect.any(Date),
        }),
      });
    });

    it('should return a raw hex refresh token (not the stored hash)', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.register({
        email: EMAIL,
        password: 'Password1!',
        displayName: 'Test',
      });

      // Raw token is 48 bytes as hex = 96 hex chars
      expect(result.refreshToken).toMatch(/^[0-9a-f]{96}$/);

      // Stored hash must differ from the raw token
      const storedHash = (prisma.refreshToken.create as jest.Mock).mock
        .calls[0][0].data.tokenHash as string;
      expect(storedHash).not.toBe(result.refreshToken);
      // Hash is SHA-256 = 64 hex chars
      expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate a UUID v4 familyId on register', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      await service.register({
        email: EMAIL,
        password: 'Password1!',
        displayName: 'Test',
      });

      const call = (prisma.refreshToken.create as jest.Mock).mock.calls[0][0];
      expect(call.data.familyId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should generate a UUID v4 familyId on login', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bcrypt = require('bcrypt') as typeof import('bcrypt');
      const hash = await bcrypt.hash('Password1!', 4);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        passwordHash: hash,
      });

      await service.login({ email: EMAIL, password: 'Password1!' });

      const call = (prisma.refreshToken.create as jest.Mock).mock.calls[0][0];
      expect(call.data.familyId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should return a positive numeric accessTokenExp', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.register({
        email: EMAIL,
        password: 'Password1!',
        displayName: 'Test',
      });

      expect(typeof result.accessTokenExp).toBe('number');
      expect(result.accessTokenExp).toBeGreaterThan(0);
    });
  });

  // ── anti-enumeration ───────────────────────────────────────
  describe('anti-enumeration', () => {
    it('should return identical error message for unknown email and wrong password', async () => {
      // Unknown email
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      let err1: Error | undefined;
      try {
        await service.login({
          email: 'nobody@example.com',
          password: 'anything',
        });
      } catch (e) {
        err1 = e as Error;
      }

      // Wrong password — user exists
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      let err2: Error | undefined;
      try {
        await service.login({ email: EMAIL, password: 'wrong-password' });
      } catch (e) {
        err2 = e as Error;
      }

      expect(err1?.message).toBe('Invalid credentials');
      expect(err2?.message).toBe('Invalid credentials');
    });
  });
});
