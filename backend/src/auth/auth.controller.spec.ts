import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { JwtPayload } from './decorators';
import type { Response, Request } from 'express';

const USER_ID = 'user-1';
const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'test@example.com',
  jti: 'jti-1',
  exp: Math.floor(Date.now() / 1000) + 3600,
};

const mockTokens = {
  accessToken: 'access-token',
  accessTokenExp: 9999999999,
  refreshToken: 'refresh-token',
  refreshTokenExpiresAt: new Date(Date.now() + 86400000),
};

const mockRes = (): Partial<Response> => ({
  cookie: jest.fn(),
  clearCookie: jest.fn(),
});

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn().mockResolvedValue(mockTokens),
            login: jest.fn().mockResolvedValue(mockTokens),
            refresh: jest.fn().mockResolvedValue(mockTokens),
            logout: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get(AuthController);
    authService = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── register ───────────────────────────────────────────────
  describe('register', () => {
    it('should register user, set cookie, and return accessToken', async () => {
      const res = mockRes();
      const dto = {
        email: 'test@example.com',
        password: 'Password1!',
        displayName: 'Test',
      };

      const result = await controller.register(dto, res as Response);

      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          path: '/',
        }),
      );
      expect(result).toEqual({ accessToken: 'access-token' });
    });
  });

  // ── login ──────────────────────────────────────────────────
  describe('login', () => {
    it('should login, set cookie, and return accessToken', async () => {
      const res = mockRes();
      const dto = { email: 'test@example.com', password: 'Password1!' };

      const result = await controller.login(dto, res as Response);

      expect(authService.login).toHaveBeenCalledWith(dto);
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(result).toEqual({ accessToken: 'access-token' });
    });
  });

  // ── refresh ────────────────────────────────────────────────
  describe('refresh', () => {
    it('should refresh tokens from cookie', async () => {
      const res = mockRes();
      const req = {
        cookies: { refresh_token: 'old-refresh' },
      } as unknown as Request;

      const result = await controller.refresh(req, res as Response);

      expect(authService.refresh).toHaveBeenCalledWith('old-refresh');
      expect(res.cookie).toHaveBeenCalled();
      expect(result).toEqual({ accessToken: 'access-token' });
    });

    it('should throw UnauthorizedException when no cookie', async () => {
      const res = mockRes();
      const req = { cookies: {} } as unknown as Request;

      await expect(controller.refresh(req, res as Response)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when cookies object is absent', async () => {
      const res = mockRes();
      const req = {} as unknown as Request;

      await expect(controller.refresh(req, res as Response)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── logout ─────────────────────────────────────────────────
  describe('logout', () => {
    it('should logout, clear cookie, and return message', async () => {
      const res = mockRes();
      const req = {
        cookies: { refresh_token: 'refresh-to-delete' },
      } as unknown as Request;

      const result = await controller.logout(mockUser, req, res as Response);

      expect(authService.logout).toHaveBeenCalledWith(
        'jti-1',
        mockUser.exp,
        'refresh-to-delete',
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          path: '/',
        }),
      );
      expect(result).toEqual({ message: 'Logged out' });
    });

    it('should handle logout without refresh cookie', async () => {
      const res = mockRes();
      const req = { cookies: {} } as unknown as Request;

      const result = await controller.logout(mockUser, req, res as Response);

      expect(authService.logout).toHaveBeenCalledWith(
        'jti-1',
        mockUser.exp,
        undefined,
      );
      expect(result).toEqual({ message: 'Logged out' });
    });
  });

  // ── cookie shape ────────────────────────────────────────────
  describe('cookie shape', () => {
    it('should include maxAge derived from refreshTokenExpiresAt on register', async () => {
      const res = mockRes();

      await controller.register(
        { email: 'a@b.com', password: 'Password1!', displayName: 'A' },
        res as Response,
      );

      const cookieCall = (res.cookie as jest.Mock).mock.calls[0];
      const options = cookieCall[2] as Record<string, unknown>;
      expect(typeof options.maxAge).toBe('number');
      expect(options.maxAge as number).toBeGreaterThan(0);
    });

    it('should set httpOnly, sameSite strict, path / on all auth cookies', async () => {
      const res = mockRes();

      await controller.login(
        { email: 'a@b.com', password: 'Password1!' },
        res as Response,
      );

      const cookieCall = (res.cookie as jest.Mock).mock.calls[0];
      const options = cookieCall[2] as Record<string, unknown>;
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('strict');
      expect(options.path).toBe('/');
    });

    it('should clear cookie with httpOnly, sameSite strict, path / on logout', async () => {
      const res = mockRes();
      const req = { cookies: {} } as unknown as Request;

      await controller.logout(mockUser, req, res as Response);

      const clearCall = (res.clearCookie as jest.Mock).mock.calls[0];
      const options = clearCall[1] as Record<string, unknown>;
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('strict');
      expect(options.path).toBe('/');
    });
  });
});
