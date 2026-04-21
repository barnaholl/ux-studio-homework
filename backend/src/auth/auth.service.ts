/* eslint-disable prettier/prettier */
import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RegisterDto, LoginDto } from './dto';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_BYTES = 48;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const ACCESS_TOKEN_EXPIRY = '15m';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthService.name);
  }

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          displayName: dto.displayName,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw e;
    }

    this.logger.info({ userId: user.id }, 'User registered');
    return this.issueTokens(user.id, user.email, user.displayName, crypto.randomUUID());
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      this.logger.warn('Login failed: unknown email');
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      this.logger.warn({ userId: user.id }, 'Login failed: wrong password');
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.info({ userId: user.id }, 'User logged in');
    return this.issueTokens(user.id, user.email, user.displayName, crypto.randomUUID());
  }

  async refresh(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);

    // Atomic rotate: delete old token + verify it existed in one transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.refreshToken.findUnique({
        where: { tokenHash },
      });

      if (!stored) {
        // Token hash not found — either already consumed or never issued.
        // We cannot revoke a family here because we have no familyId without
        // the stored row. The caller will receive 401 and must re-authenticate.
        return { status: 'not_found' as const, familyId: null };
      }

      if (stored.expiresAt < new Date()) {
        return { status: 'expired' as const, familyId: stored.familyId };
      }

      await tx.refreshToken.delete({ where: { id: stored.id } });
      return { status: 'ok' as const, stored };
    });

    if (result.status === 'not_found') {
      this.logger.warn('Token refresh failed: token not found (possible replay)');
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (result.status === 'expired') {
      this.logger.warn({ familyId: result.familyId }, 'Token refresh failed: expired — revoking family');
      await this.prisma.refreshToken.deleteMany({ where: { familyId: result.familyId! } });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { stored } = result;

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    this.logger.debug({ userId: user.id }, 'Token refreshed');
    return this.issueTokens(user.id, user.email, user.displayName, stored.familyId);
  }

  async logout(jti: string, accessTokenExp: number, refreshTokenRaw?: string) {
    // Blacklist access token in Redis for its remaining lifetime
    const now = Math.floor(Date.now() / 1000);
    const ttl = accessTokenExp - now;
    if (ttl > 0) {
      await this.redis.set(`blacklist:${jti}`, '1', 'EX', ttl);
    }

    // Delete refresh token from DB if provided
    if (refreshTokenRaw) {
      const tokenHash = this.hashToken(refreshTokenRaw);
      await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
    }

    this.logger.info({ jti }, 'User logged out');
  }

  private async issueTokens(userId: string, email: string, displayName: string, familyId: string) {
    const jti = crypto.randomUUID();

    const accessToken = this.jwtService.sign(
      { sub: userId, email, displayName, jti },
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    const decoded = this.jwtService.decode<{ exp: number }>(accessToken);
    const accessTokenExp = decoded?.exp ?? 0;

    const rawRefreshToken = crypto
      .randomBytes(REFRESH_TOKEN_BYTES)
      .toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: { tokenHash, familyId, expiresAt, userId },
    });

    return {
      accessToken,
      accessTokenExp,
      refreshToken: rawRefreshToken,
      refreshTokenExpiresAt: expiresAt,
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
