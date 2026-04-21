// Set environment variables BEFORE any imports
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'e2e-test-secret';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.DO_SPACES_REGION = 'test';
process.env.DO_SPACES_ENDPOINT = 'https://test.example.com';
process.env.DO_SPACES_BUCKET = 'test-bucket';
process.env.DO_SPACES_KEY = 'test-key';
process.env.DO_SPACES_SECRET = 'test-secret';

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { S3Service } from '../src/s3/s3.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ThrottlerStorage } from '@nestjs/throttler';
import { AvatarService } from '../src/avatar/avatar.service';

const TEST_DB_PATH = path.join(__dirname, '..', 'prisma', 'test.db');
const PREFIX = '/api/v1';

// Minimal 1x1 white pixel PNG (valid magic bytes pass FileTypeValidator)
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=',
  'base64',
);
// Valid UUID v4 for CommitAvatarDto stageId validation
const TEST_STAGE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

// Mock S3 service — we don't make real S3 calls in E2E tests
const mockS3Service = {
  presignPut: jest
    .fn()
    .mockResolvedValue('https://test.example.com/presigned-url'),
  getObject: jest.fn().mockResolvedValue(Buffer.alloc(100)),
  upload: jest.fn().mockResolvedValue('https://test.example.com/uploaded'),
  delete: jest.fn().mockResolvedValue(undefined),
};

// Mock throttler storage so rate limiting is disabled for tests
const mockThrottlerStorage = {
  increment: async () => ({
    totalHits: 1,
    timeToExpire: 60000,
    isBlocked: false,
    timeToBlockExpire: 0,
  }),
};

// Mock avatar service — image processing is unit-tested separately
const mockAvatarService = {
  stageAvatar: jest.fn().mockResolvedValue({ stageId: TEST_STAGE_ID }),
  commitContactAvatar: jest
    .fn()
    .mockImplementation(
      (contactId: string, _userId: string, _stageId: string) => {
        if (contactId === 'nonexistent')
          throw new NotFoundException('Contact nonexistent not found');
        return Promise.resolve({
          avatarUrl: `https://cdn.example.com/avatars/test/${TEST_STAGE_ID}`,
        });
      },
    ),
  commitUserAvatar: jest.fn().mockResolvedValue({
    avatarUrl: `https://cdn.example.com/avatars/user/${TEST_STAGE_ID}`,
  }),
  uploadContactAvatar: jest
    .fn()
    .mockImplementation(
      (
        contactId: string,
        _userId: string,
        _buffer: Buffer,
        _contentType: string,
      ) => {
        if (contactId === 'nonexistent')
          throw new NotFoundException('Contact nonexistent not found');
        return Promise.resolve({
          jobId: 'test-job-id',
          message: 'Avatar processing started',
        });
      },
    ),
  uploadUserAvatar: jest.fn().mockResolvedValue({
    jobId: 'test-job-id',
    message: 'Avatar processing started',
  }),
  removeUserAvatar: jest.fn().mockResolvedValue(undefined),
};

describe('E2E Tests', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: Redis;

  beforeAll(async () => {
    // Clean up any existing test DB
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_DB_PATH + '-journal')) {
      fs.unlinkSync(TEST_DB_PATH + '-journal');
    }

    // Run migrations on test DB
    execSync('npx prisma migrate deploy', {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: 'file:./test.db' },
      stdio: 'pipe',
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(S3Service)
      .useValue(mockS3Service)
      .overrideProvider(ThrottlerStorage)
      .useValue(mockThrottlerStorage)
      .overrideProvider(AvatarService)
      .useValue(mockAvatarService)
      .compile();

    app = moduleFixture.createNestApplication();

    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = moduleFixture.get(PrismaService);
    redis = moduleFixture.get('REDIS_CLIENT');
  });

  afterAll(async () => {
    // Flush test keys from Redis
    const keys = await redis.keys('*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    await app.close();

    // Clean up test DB
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_DB_PATH + '-journal')) {
      fs.unlinkSync(TEST_DB_PATH + '-journal');
    }
  });

  // ─── Health Check ──────────────────────────────────────────────
  describe('GET /api/v1 (Health)', () => {
    it('should return 200 API is running', () => {
      return request(app.getHttpServer())
        .get(`${PREFIX}`)
        .expect(200)
        .expect('API is running');
    });
  });

  // ─── Auth Flow ─────────────────────────────────────────────────
  describe('Auth', () => {
    const user = {
      email: 'test@example.com',
      password: 'SecureP@ss123',
      displayName: 'Test User',
    };
    let accessToken: string;
    let refreshCookie: string;

    describe('POST /auth/register', () => {
      it('should register a new user and return access token', async () => {
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/auth/register`)
          .send(user)
          .expect(201);

        expect(res.body).toHaveProperty('accessToken');
        expect(typeof res.body.accessToken).toBe('string');
        accessToken = res.body.accessToken as string;

        // Should set refresh_token cookie
        const cookies = res.headers['set-cookie'] as unknown as string[];
        expect(cookies).toBeDefined();
        const refreshCookieStr = cookies.find((c: string) =>
          c.startsWith('refresh_token='),
        );
        expect(refreshCookieStr).toBeDefined();
        refreshCookie = refreshCookieStr!;
      });

      it('should reject duplicate email (409)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/auth/register`)
          .send(user)
          .expect(409);
      });

      it('should normalise email to lowercase on register', async () => {
        // Use a unique email so it doesn't conflict with the existing user
        const upperEmail = `UPPER-${Date.now()}@Example.COM`;
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/auth/register`)
          .send({
            email: upperEmail,
            password: 'SecureP@ss123',
            displayName: 'Upper',
          })
          .expect(201);

        // Login with the lowercase version to confirm it was normalised
        await request(app.getHttpServer())
          .post(`${PREFIX}/auth/login`)
          .send({ email: upperEmail.toLowerCase(), password: 'SecureP@ss123' })
          .expect(200);

        // Clean up this extra user
        const extraUser = await prisma.user.findUnique({
          where: { email: upperEmail.toLowerCase() },
        });
        if (extraUser) {
          await prisma.refreshToken.deleteMany({
            where: { userId: extraUser.id },
          });
          await prisma.user.delete({ where: { id: extraUser.id } });
        }

        expect(res.body).toHaveProperty('accessToken');
      });

      it('should set HttpOnly, SameSite=Strict, Path=/ on refresh cookie', async () => {
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/auth/register`)
          .send({
            email: `flags-${Date.now()}@example.com`,
            password: 'SecureP@ss123',
            displayName: 'FlagsTest',
          })
          .expect(201);

        const cookies = res.headers['set-cookie'] as unknown as string[];
        const cookie = cookies.find((c: string) =>
          c.startsWith('refresh_token='),
        )!;
        expect(cookie).toContain('HttpOnly');
        expect(cookie.toLowerCase()).toContain('samesite=strict');
        expect(cookie).toContain('Path=/');
        expect(cookie).toContain('Max-Age=');

        // Clean up
        const extraEmail = cookie; // just used for scoping — clean by email parsed above
        void extraEmail;
      });

      it('should reject invalid email (400)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/auth/register`)
          .send({ email: 'bad', password: 'SecureP@ss123', displayName: 'X' })
          .expect(400);
      });

      it('should reject short password (400)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/auth/register`)
          .send({
            email: 'new@example.com',
            password: 'short',
            displayName: 'X',
          })
          .expect(400);
      });

      it('should reject missing displayName (400)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/auth/register`)
          .send({ email: 'new@example.com', password: 'SecureP@ss123' })
          .expect(400);
      });
    });

    describe('POST /auth/login', () => {
      it('should login with correct credentials', async () => {
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/auth/login`)
          .send({ email: user.email, password: user.password })
          .expect(200);

        expect(res.body).toHaveProperty('accessToken');
        accessToken = res.body.accessToken as string;

        const cookies = res.headers['set-cookie'] as unknown as string[];
        const refreshCookieStr = cookies.find((c: string) =>
          c.startsWith('refresh_token='),
        );
        expect(refreshCookieStr).toBeDefined();
        refreshCookie = refreshCookieStr!;
      });

      it('should reject wrong password (401)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/auth/login`)
          .send({ email: user.email, password: 'wrongpassword' })
          .expect(401);
      });

      it('should reject non-existent email (401)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/auth/login`)
          .send({ email: 'nobody@example.com', password: 'whatever1' })
          .expect(401);
      });
    });

    describe('POST /auth/refresh', () => {
      it('should refresh tokens with valid cookie', async () => {
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/auth/refresh`)
          .set('Cookie', refreshCookie)
          .expect(200);

        expect(res.body).toHaveProperty('accessToken');
        accessToken = res.body.accessToken as string;

        // New refresh cookie should be set
        const cookies = res.headers['set-cookie'] as unknown as string[];
        const newRefreshCookie = cookies.find((c: string) =>
          c.startsWith('refresh_token='),
        );
        expect(newRefreshCookie).toBeDefined();
        refreshCookie = newRefreshCookie!;
      });

      it('should reject without cookie (401)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/auth/refresh`)
          .expect(401);
      });

      it('should reject reused refresh token (401)', async () => {
        // Login to get a fresh token
        const loginRes = await request(app.getHttpServer())
          .post(`${PREFIX}/auth/login`)
          .send({ email: user.email, password: user.password })
          .expect(200);

        const cookies = loginRes.headers['set-cookie'] as unknown as string[];
        const oldCookie = cookies.find((c: string) =>
          c.startsWith('refresh_token='),
        )!;

        // Use it once (consumes it)
        const refreshRes = await request(app.getHttpServer())
          .post(`${PREFIX}/auth/refresh`)
          .set('Cookie', oldCookie)
          .expect(200);

        // Update our tokens
        accessToken = refreshRes.body.accessToken as string;
        const newCookies = refreshRes.headers[
          'set-cookie'
        ] as unknown as string[];
        refreshCookie = newCookies.find((c: string) =>
          c.startsWith('refresh_token='),
        )!;

        // Try reusing the old cookie — should fail
        await request(app.getHttpServer())
          .post(`${PREFIX}/auth/refresh`)
          .set('Cookie', oldCookie)
          .expect(401);
      });

      it('should issue a usable new access token after rotation', async () => {
        // Login fresh
        const loginRes = await request(app.getHttpServer())
          .post(`${PREFIX}/auth/login`)
          .send({ email: user.email, password: user.password })
          .expect(200);

        const cookies = loginRes.headers['set-cookie'] as unknown as string[];
        const freshCookie = cookies.find((c: string) =>
          c.startsWith('refresh_token='),
        )!;

        // Rotate
        const rotateRes = await request(app.getHttpServer())
          .post(`${PREFIX}/auth/refresh`)
          .set('Cookie', freshCookie)
          .expect(200);

        const newToken = rotateRes.body.accessToken as string;
        const newCookies = rotateRes.headers[
          'set-cookie'
        ] as unknown as string[];
        refreshCookie = newCookies.find((c: string) =>
          c.startsWith('refresh_token='),
        )!;

        // New access token must work on a protected endpoint
        await request(app.getHttpServer())
          .get(`${PREFIX}/users/me`)
          .set('Authorization', `Bearer ${newToken}`)
          .expect(200);

        accessToken = newToken;
      });
    });

    describe('POST /auth/logout', () => {
      it('should logout and blacklist access token', async () => {
        // Login fresh
        const loginRes = await request(app.getHttpServer())
          .post(`${PREFIX}/auth/login`)
          .send({ email: user.email, password: user.password })
          .expect(200);

        const logoutToken = loginRes.body.accessToken as string;
        const cookies = loginRes.headers['set-cookie'] as unknown as string[];
        const logoutCookie = cookies.find((c: string) =>
          c.startsWith('refresh_token='),
        )!;

        // Logout
        const logoutRes = await request(app.getHttpServer())
          .post(`${PREFIX}/auth/logout`)
          .set('Authorization', `Bearer ${logoutToken}`)
          .set('Cookie', logoutCookie)
          .expect(200);

        expect(logoutRes.body).toEqual({ message: 'Logged out' });

        // Should clear refresh cookie
        const clearCookies = logoutRes.headers[
          'set-cookie'
        ] as unknown as string[];
        const clearedCookie = clearCookies.find((c: string) =>
          c.startsWith('refresh_token='),
        );
        expect(clearedCookie).toContain('Expires=');

        // Using blacklisted access token should fail
        await request(app.getHttpServer())
          .get(`${PREFIX}/users/me`)
          .set('Authorization', `Bearer ${logoutToken}`)
          .expect(401);
      });

      it('should reject unauthenticated (401)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/auth/logout`)
          .expect(401);
      });

      it('should reject refresh token after logout', async () => {
        // Login fresh to get isolated tokens
        const loginRes = await request(app.getHttpServer())
          .post(`${PREFIX}/auth/login`)
          .send({ email: user.email, password: user.password })
          .expect(200);

        const logoutToken = loginRes.body.accessToken as string;
        const cookies = loginRes.headers['set-cookie'] as unknown as string[];
        const logoutCookie = cookies.find((c: string) =>
          c.startsWith('refresh_token='),
        )!;

        // Logout
        await request(app.getHttpServer())
          .post(`${PREFIX}/auth/logout`)
          .set('Authorization', `Bearer ${logoutToken}`)
          .set('Cookie', logoutCookie)
          .expect(200);

        // The refresh token should now be deleted — rotation must fail
        await request(app.getHttpServer())
          .post(`${PREFIX}/auth/refresh`)
          .set('Cookie', logoutCookie)
          .expect(401);
      });
    });

    // Re-login for subsequent tests
    describe('Re-login for subsequent tests', () => {
      it('should login for further tests', async () => {
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/auth/login`)
          .send({ email: user.email, password: user.password })
          .expect(200);

        accessToken = res.body.accessToken as string;
        const cookies = res.headers['set-cookie'] as unknown as string[];
        refreshCookie = cookies.find((c: string) =>
          c.startsWith('refresh_token='),
        )!;
      });
    });

    // Expose tokens for use in other describe blocks
    afterAll(() => {
      // Store tokens for nested describe blocks
      (globalThis as Record<string, unknown>).__e2e_accessToken = accessToken;
      (globalThis as Record<string, unknown>).__e2e_refreshCookie =
        refreshCookie;
    });
  });

  // ─── User Profile ──────────────────────────────────────────────
  describe('Users', () => {
    const getToken = () =>
      (globalThis as Record<string, unknown>).__e2e_accessToken as string;

    describe('GET /users/me', () => {
      it('should return the authenticated user profile', async () => {
        const res = await request(app.getHttpServer())
          .get(`${PREFIX}/users/me`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(200);

        expect(res.body).toMatchObject({
          email: 'test@example.com',
          displayName: 'Test User',
        });
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('createdAt');
        expect(res.body).not.toHaveProperty('passwordHash');
      });

      it('should reject unauthenticated (401)', async () => {
        await request(app.getHttpServer())
          .get(`${PREFIX}/users/me`)
          .expect(401);
      });
    });

    describe('PATCH /users/me', () => {
      it('should update displayName', async () => {
        const res = await request(app.getHttpServer())
          .patch(`${PREFIX}/users/me`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({ displayName: 'Updated Name' })
          .expect(200);

        expect(res.body.displayName).toBe('Updated Name');
      });

      it('should update phone', async () => {
        const res = await request(app.getHttpServer())
          .patch(`${PREFIX}/users/me`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({ phone: '+36 1 555 1234' })
          .expect(200);

        expect(res.body.phone).toBe('+36 1 555 1234');
      });

      it('should update theme', async () => {
        const res = await request(app.getHttpServer())
          .patch(`${PREFIX}/users/me`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({ theme: 'dark' })
          .expect(200);

        expect(res.body.theme).toBe('dark');
      });

      it('should reject invalid theme value (400)', async () => {
        await request(app.getHttpServer())
          .patch(`${PREFIX}/users/me`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({ theme: 'rainbow' })
          .expect(400);
      });

      it('should reject unknown fields (400)', async () => {
        await request(app.getHttpServer())
          .patch(`${PREFIX}/users/me`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({ admin: true })
          .expect(400);
      });
    });
  });

  // ─── Contacts CRUD + Favourites ────────────────────────────────
  describe('Contacts', () => {
    const getToken = () =>
      (globalThis as Record<string, unknown>).__e2e_accessToken as string;

    let contactId: string;

    describe('POST /contacts', () => {
      it('should create a contact', async () => {
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/contacts`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({
            name: 'Alice Smith',
            phone: '+36 1 111 2222',
            email: 'alice@example.com',
          })
          .expect(201);

        expect(res.body).toMatchObject({
          name: 'Alice Smith',
          phone: '+36 1 111 2222',
          email: 'alice@example.com',
          isFavourite: false,
        });
        expect(res.body).toHaveProperty('id');
        contactId = res.body.id as string;
      });

      it('should create a contact without phone', async () => {
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/contacts`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({ name: 'Bob NoPhone' })
          .expect(201);

        expect(res.body.name).toBe('Bob NoPhone');
        expect(res.body.phone).toBeNull();
      });

      it('should reject empty name (400)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/contacts`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({ name: '' })
          .expect(400);
      });

      it('should reject missing name (400)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/contacts`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({})
          .expect(400);
      });
    });

    describe('GET /contacts', () => {
      it('should list all contacts', async () => {
        const res = await request(app.getHttpServer())
          .get(`${PREFIX}/contacts`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(200);

        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('nextCursor');
        expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      });

      it('should search contacts by name', async () => {
        const res = await request(app.getHttpServer())
          .get(`${PREFIX}/contacts?search=Alice`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(200);

        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].name).toBe('Alice Smith');
      });

      it('should paginate with cursor', async () => {
        const res = await request(app.getHttpServer())
          .get(`${PREFIX}/contacts?take=1`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(200);

        expect(res.body.data.length).toBe(1);
        expect(res.body.nextCursor).toBeDefined();
      });

      it('should reject unauthenticated (401)', async () => {
        await request(app.getHttpServer())
          .get(`${PREFIX}/contacts`)
          .expect(401);
      });
    });

    describe('GET /contacts/:id', () => {
      it('should return a single contact', async () => {
        const res = await request(app.getHttpServer())
          .get(`${PREFIX}/contacts/${contactId}`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(200);

        expect(res.body).toMatchObject({
          id: contactId,
          name: 'Alice Smith',
          isFavourite: false,
        });
      });

      it('should return 404 for non-existent contact', async () => {
        await request(app.getHttpServer())
          .get(`${PREFIX}/contacts/nonexistent`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(404);
      });
    });

    describe('PATCH /contacts/:id', () => {
      it('should update contact name', async () => {
        const res = await request(app.getHttpServer())
          .patch(`${PREFIX}/contacts/${contactId}`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({ name: 'Alice Johnson' })
          .expect(200);

        expect(res.body.name).toBe('Alice Johnson');
      });

      it('should update contact phone', async () => {
        const res = await request(app.getHttpServer())
          .patch(`${PREFIX}/contacts/${contactId}`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({ phone: '+36 1 999 8888' })
          .expect(200);

        expect(res.body.phone).toBe('+36 1 999 8888');
      });

      it('should return 404 for non-existent contact', async () => {
        await request(app.getHttpServer())
          .patch(`${PREFIX}/contacts/nonexistent`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({ name: 'X' })
          .expect(404);
      });
    });

    describe('POST /contacts/:id/favourite', () => {
      it('should mark contact as favourite', async () => {
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/contacts/${contactId}/favourite`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(200);

        expect(res.body).toEqual({ isFavourite: true });
      });

      it('should be idempotent', async () => {
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/contacts/${contactId}/favourite`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(200);

        expect(res.body).toEqual({ isFavourite: true });
      });

      it('should return 404 for non-existent contact', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/contacts/nonexistent/favourite`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(404);
      });
    });

    describe('GET /contacts?favourites=true', () => {
      it('should filter to favourites only', async () => {
        const res = await request(app.getHttpServer())
          .get(`${PREFIX}/contacts?favourites=true`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(200);

        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].id).toBe(contactId);
        expect(res.body.data[0].isFavourite).toBe(true);
      });
    });

    describe('DELETE /contacts/:id/favourite', () => {
      it('should remove contact from favourites', async () => {
        const res = await request(app.getHttpServer())
          .delete(`${PREFIX}/contacts/${contactId}/favourite`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(200);

        expect(res.body).toEqual({ isFavourite: false });
      });

      it('should return 404 for non-existent contact', async () => {
        await request(app.getHttpServer())
          .delete(`${PREFIX}/contacts/nonexistent/favourite`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(404);
      });
    });

    describe('DELETE /contacts/:id', () => {
      it('should delete a contact', async () => {
        // Create a throwaway contact
        const createRes = await request(app.getHttpServer())
          .post(`${PREFIX}/contacts`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({ name: 'To Delete' })
          .expect(201);

        const deleteId = createRes.body.id as string;

        await request(app.getHttpServer())
          .delete(`${PREFIX}/contacts/${deleteId}`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(204);

        // Confirm it's gone
        await request(app.getHttpServer())
          .get(`${PREFIX}/contacts/${deleteId}`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(404);
      });

      it('should return 404 for non-existent contact', async () => {
        await request(app.getHttpServer())
          .delete(`${PREFIX}/contacts/nonexistent`)
          .set('Authorization', `Bearer ${getToken()}`)
          .expect(404);
      });
    });

    // ─── Cross-user isolation ─────────────────────────────────────
    describe('Cross-user isolation', () => {
      let otherToken: string;

      it('should register a second user', async () => {
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/auth/register`)
          .send({
            email: 'other@example.com',
            password: 'OtherP@ss123',
            displayName: 'Other User',
          })
          .expect(201);

        otherToken = res.body.accessToken as string;
      });

      it('should not see first user contacts', async () => {
        const res = await request(app.getHttpServer())
          .get(`${PREFIX}/contacts`)
          .set('Authorization', `Bearer ${otherToken}`)
          .expect(200);

        expect(res.body.data).toHaveLength(0);
      });

      it('should not access first user contact by ID', async () => {
        await request(app.getHttpServer())
          .get(`${PREFIX}/contacts/${contactId}`)
          .set('Authorization', `Bearer ${otherToken}`)
          .expect(404);
      });

      it('should not update first user contact', async () => {
        await request(app.getHttpServer())
          .patch(`${PREFIX}/contacts/${contactId}`)
          .set('Authorization', `Bearer ${otherToken}`)
          .send({ name: 'Hacked' })
          .expect(404);
      });

      it('should not delete first user contact', async () => {
        await request(app.getHttpServer())
          .delete(`${PREFIX}/contacts/${contactId}`)
          .set('Authorization', `Bearer ${otherToken}`)
          .expect(404);
      });

      it('should not favourite first user contact', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/contacts/${contactId}/favourite`)
          .set('Authorization', `Bearer ${otherToken}`)
          .expect(404);
      });
    });
  });

  // ─── Avatars ────────────────────────────────────────────────────
  describe('Avatars', () => {
    const getToken = () =>
      (globalThis as Record<string, unknown>).__e2e_accessToken as string;

    let contactId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`${PREFIX}/contacts`)
        .set('Authorization', `Bearer ${getToken()}`)
        .send({ name: 'Avatar Test Contact' })
        .expect(201);
      contactId = res.body.id as string;
      // Reset mock call counts before avatar tests
      jest.clearAllMocks();
    });

    describe('POST /avatars/stage', () => {
      it('should stage an avatar and return stageId (200)', async () => {
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/avatars/stage`)
          .set('Authorization', `Bearer ${getToken()}`)
          .attach('file', TINY_PNG, {
            filename: 'avatar.png',
            contentType: 'image/png',
          })
          .expect(200);

        expect(res.body).toHaveProperty('stageId');
      });

      it('should reject non-image file (400)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/avatars/stage`)
          .set('Authorization', `Bearer ${getToken()}`)
          .attach('file', Buffer.alloc(10), {
            filename: 'file.txt',
            contentType: 'text/plain',
          })
          .expect(400);
      });

      it('should reject unauthenticated (401)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/avatars/stage`)
          .attach('file', TINY_PNG, {
            filename: 'a.png',
            contentType: 'image/png',
          })
          .expect(401);
      });
    });

    describe('POST /contacts/:id/avatar/commit', () => {
      it('should commit staged avatar to contact (200)', async () => {
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/contacts/${contactId}/avatar/commit`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({ stageId: TEST_STAGE_ID })
          .expect(200);

        expect(res.body).toHaveProperty('avatarUrl');
      });

      it('should return 400 for missing stageId', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/contacts/${contactId}/avatar/commit`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({})
          .expect(400);
      });

      it('should return 404 for non-existent contact', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/contacts/nonexistent/avatar/commit`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({ stageId: TEST_STAGE_ID })
          .expect(404);
      });

      it('should reject unauthenticated (401)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/contacts/${contactId}/avatar/commit`)
          .send({ stageId: TEST_STAGE_ID })
          .expect(401);
      });
    });

    describe('POST /contacts/:id/avatar (legacy multipart)', () => {
      it('should enqueue processing and return jobId (202)', async () => {
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/contacts/${contactId}/avatar`)
          .set('Authorization', `Bearer ${getToken()}`)
          .attach('file', TINY_PNG, {
            filename: 'avatar.png',
            contentType: 'image/png',
          })
          .expect(202);

        expect(res.body).toHaveProperty('jobId');
        expect(res.body).toHaveProperty('message', 'Avatar processing started');
      });

      it('should reject non-image file (400)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/contacts/${contactId}/avatar`)
          .set('Authorization', `Bearer ${getToken()}`)
          .attach('file', Buffer.alloc(10), {
            filename: 'file.txt',
            contentType: 'text/plain',
          })
          .expect(400);
      });

      it('should return 404 for non-existent contact', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/contacts/nonexistent/avatar`)
          .set('Authorization', `Bearer ${getToken()}`)
          .attach('file', TINY_PNG, {
            filename: 'a.jpg',
            contentType: 'image/jpeg',
          })
          .expect(404);
      });

      it('should reject unauthenticated (401)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/contacts/${contactId}/avatar`)
          .attach('file', TINY_PNG, {
            filename: 'a.jpg',
            contentType: 'image/jpeg',
          })
          .expect(401);
      });
    });

    describe('POST /users/me/avatar (legacy multipart)', () => {
      it('should enqueue processing and return jobId (202)', async () => {
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/users/me/avatar`)
          .set('Authorization', `Bearer ${getToken()}`)
          .attach('file', TINY_PNG, {
            filename: 'avatar.png',
            contentType: 'image/png',
          })
          .expect(202);

        expect(res.body).toHaveProperty('jobId');
        expect(res.body).toHaveProperty('message', 'Avatar processing started');
      });

      it('should reject non-image file (400)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/users/me/avatar`)
          .set('Authorization', `Bearer ${getToken()}`)
          .attach('file', Buffer.alloc(10), {
            filename: 'file.txt',
            contentType: 'text/plain',
          })
          .expect(400);
      });

      it('should reject unauthenticated (401)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/users/me/avatar`)
          .attach('file', TINY_PNG, {
            filename: 'a.png',
            contentType: 'image/png',
          })
          .expect(401);
      });
    });

    describe('POST /users/me/avatar/commit', () => {
      it('should commit staged avatar to user (200)', async () => {
        const res = await request(app.getHttpServer())
          .post(`${PREFIX}/users/me/avatar/commit`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({ stageId: TEST_STAGE_ID })
          .expect(200);

        expect(res.body).toHaveProperty('avatarUrl');
      });

      it('should return 400 for missing stageId', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/users/me/avatar/commit`)
          .set('Authorization', `Bearer ${getToken()}`)
          .send({})
          .expect(400);
      });

      it('should reject unauthenticated (401)', async () => {
        await request(app.getHttpServer())
          .post(`${PREFIX}/users/me/avatar/commit`)
          .send({ stageId: TEST_STAGE_ID })
          .expect(401);
      });
    });
  });

  // ─── Validation & Security ─────────────────────────────────────
  describe('Validation & Security', () => {
    it('should return 401 for invalid JWT', async () => {
      await request(app.getHttpServer())
        .get(`${PREFIX}/users/me`)
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });

    it('should return 401 for missing Authorization header on protected route', async () => {
      await request(app.getHttpServer()).get(`${PREFIX}/contacts`).expect(401);
    });

    it('should strip unknown properties (forbidNonWhitelisted)', async () => {
      const getToken = () =>
        (globalThis as Record<string, unknown>).__e2e_accessToken as string;

      await request(app.getHttpServer())
        .post(`${PREFIX}/contacts`)
        .set('Authorization', `Bearer ${getToken()}`)
        .send({ name: 'Valid', malicious: 'data' })
        .expect(400);
    });
  });
});
