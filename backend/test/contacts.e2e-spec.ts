// Set environment variables BEFORE any imports
process.env.DATABASE_URL = 'file:./test-contacts.db';
process.env.JWT_SECRET = 'e2e-test-secret';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.module';

const TEST_DB_PATH = path.join(__dirname, '..', 'prisma', 'test-contacts.db');

// Mock throttler storage so rate limiting is disabled for tests
const mockThrottlerStorage = {
  increment: async () => ({
    totalHits: 1,
    timeToExpire: 60000,
    isBlocked: false,
    timeToBlockExpire: 0,
  }),
};

describe('Contacts API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: Redis;
  let accessToken: string;
  let userId: string;

  const TEST_EMAIL = `e2e-contacts-${Date.now()}@example.com`;
  const TEST_PASSWORD = 'Password1!';

  beforeAll(async () => {
    // Clean up any existing test DB
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_DB_PATH + '-journal')) {
      fs.unlinkSync(TEST_DB_PATH + '-journal');
    }

    // Run migrations on the contacts test DB
    execSync('npx prisma migrate deploy', {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: 'file:./test-contacts.db' },
      stdio: 'pipe',
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ThrottlerStorage)
      .useValue(mockThrottlerStorage)
      .compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);

    // Register a test user and obtain an access token
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        displayName: 'E2E User',
      })
      .expect(201);

    accessToken = body.accessToken as string;

    // Resolve userId from DB for direct Prisma inserts
    const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    userId = user!.id;
  });

  beforeEach(async () => {
    // Clear contacts before each test for isolation
    await prisma.contact.deleteMany({ where: { userId } });
    // Invalidate Redis cache so the API doesn't return stale results
    await redis.incr(`contacts:version:${userId}`);
  });

  afterAll(async () => {
    await prisma.contact.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await app.close();

    // Clean up test DB
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_DB_PATH + '-journal')) {
      fs.unlinkSync(TEST_DB_PATH + '-journal');
    }
  });

  // Helper: authenticated request
  const auth = (req: request.Test) =>
    req.set('Authorization', `Bearer ${accessToken}`);

  // â”€â”€ POST /api/v1/contacts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  describe('POST /api/v1/contacts', () => {
    it('should create a contact with name and phone', async () => {
      const { body } = await auth(
        request(app.getHttpServer())
          .post('/api/v1/contacts')
          .send({ name: 'Jane Doe', phone: '+36 1 234 5678' }),
      ).expect(201);

      expect(body).toMatchObject({
        name: 'Jane Doe',
        phone: '+36 1 234 5678',
        email: null,
      });
      expect(body.id).toBeDefined();
      expect(body.createdAt).toBeDefined();
      expect(body.avatarUrl).toBeNull();
    });

    it('should create a contact with all fields including email', async () => {
      const { body } = await auth(
        request(app.getHttpServer()).post('/api/v1/contacts').send({
          name: 'Jane Email',
          phone: '+36 1 234 5678',
          email: 'jane@example.com',
        }),
      ).expect(201);

      expect(body.email).toBe('jane@example.com');
    });

    it('should normalise email to lowercase on create', async () => {
      const { body } = await auth(
        request(app.getHttpServer())
          .post('/api/v1/contacts')
          .send({ name: 'Upper Email', email: 'Upper@Example.COM' }),
      ).expect(201);

      expect(body.email).toBe('upper@example.com');
    });

    it('should reject invalid email (400)', async () => {
      await auth(
        request(app.getHttpServer())
          .post('/api/v1/contacts')
          .send({ name: 'Bad Email', email: 'not-an-email' }),
      ).expect(400);
    });

    it('should create a contact with name only', async () => {
      const { body } = await auth(
        request(app.getHttpServer())
          .post('/api/v1/contacts')
          .send({ name: 'John' }),
      ).expect(201);

      expect(body.name).toBe('John');
      expect(body.phone).toBeNull();
    });

    it('should trim whitespace from name', async () => {
      const { body } = await auth(
        request(app.getHttpServer())
          .post('/api/v1/contacts')
          .send({ name: '  Trimmed  ' }),
      ).expect(201);

      expect(body.name).toBe('Trimmed');
    });

    it('should convert whitespace-only phone to null', async () => {
      const { body } = await auth(
        request(app.getHttpServer())
          .post('/api/v1/contacts')
          .send({ name: 'Test', phone: '   ' }),
      ).expect(201);

      expect(body.phone).toBeNull();
    });

    it('should return 400 when name is missing', async () => {
      const { body } = await auth(
        request(app.getHttpServer()).post('/api/v1/contacts').send({}),
      ).expect(400);

      // Service throws BadRequestException with a plain string message
      expect(body.message).toEqual(expect.stringContaining('name'));
    });

    it('should return 400 when name is empty string', async () => {
      await auth(
        request(app.getHttpServer())
          .post('/api/v1/contacts')
          .send({ name: '' }),
      ).expect(400);
    });

    it('should return 400 when name is whitespace only', async () => {
      await auth(
        request(app.getHttpServer())
          .post('/api/v1/contacts')
          .send({ name: '   ' }),
      ).expect(400);
    });

    it('should return 400 when name is not a string', async () => {
      await auth(
        request(app.getHttpServer())
          .post('/api/v1/contacts')
          .send({ name: 123 }),
      ).expect(400);
    });

    it('should return 400 for unknown fields (forbidNonWhitelisted)', async () => {
      const { body } = await auth(
        request(app.getHttpServer())
          .post('/api/v1/contacts')
          .send({ name: 'Test', unknownField: 'x' }),
      ).expect(400);

      expect(body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('unknownField')]),
      );
    });

    it('should return 400 when body is empty', async () => {
      await auth(
        request(app.getHttpServer()).post('/api/v1/contacts').send(),
      ).expect(400);
    });

    it('should return 401 when no token provided', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .send({ name: 'Jane' })
        .expect(401);
    });
  });

  // â”€â”€ GET /api/v1/contacts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  describe('GET /api/v1/contacts', () => {
    it('should return empty list when no contacts', async () => {
      const { body } = await auth(
        request(app.getHttpServer()).get('/api/v1/contacts'),
      ).expect(200);

      expect(body.data).toEqual([]);
      expect(body.nextCursor).toBeNull();
    });

    it('should return contacts sorted by createdAt desc', async () => {
      await prisma.contact.create({
        data: {
          name: 'First',
          createdAt: new Date('2026-01-01'),
          user: { connect: { id: userId } },
        },
      });
      await prisma.contact.create({
        data: {
          name: 'Second',
          createdAt: new Date('2026-01-02'),
          user: { connect: { id: userId } },
        },
      });

      const { body } = await auth(
        request(app.getHttpServer()).get('/api/v1/contacts'),
      ).expect(200);

      expect(body.data).toHaveLength(2);
      expect(body.data[0].name).toBe('Second');
      expect(body.data[1].name).toBe('First');
    });

    it('should filter by search query', async () => {
      await prisma.contact.createMany({
        data: [
          { name: 'Alice', userId },
          { name: 'Bob', userId },
          { name: 'Alicia', userId },
        ],
      });

      const { body } = await auth(
        request(app.getHttpServer()).get('/api/v1/contacts?search=ali'),
      ).expect(200);

      expect(body.data).toHaveLength(2);
      expect(
        body.data.every((c: { name: string }) =>
          c.name.toLowerCase().includes('ali'),
        ),
      ).toBe(true);
    });

    it('should paginate with cursor', async () => {
      const base = new Date('2026-01-01');
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          prisma.contact.create({
            data: {
              name: `Contact ${i}`,
              userId,
              createdAt: new Date(base.getTime() + i * 1000),
            },
          }),
        ),
      );

      // First page
      const { body: page1 } = await auth(
        request(app.getHttpServer()).get('/api/v1/contacts?take=2'),
      ).expect(200);

      expect(page1.data).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();
      expect(page1.nextCursor).not.toBeNull();

      // Second page using cursor
      const { body: page2 } = await auth(
        request(app.getHttpServer()).get(
          `/api/v1/contacts?take=2&cursor=${page1.nextCursor as string}`,
        ),
      ).expect(200);

      expect(page2.data).toHaveLength(2);
      // Page 2 items must not overlap with page 1
      const page1Ids = page1.data.map((c: { id: string }) => c.id) as string[];
      page2.data.forEach((c: { id: string }) => {
        expect(page1Ids).not.toContain(c.id);
      });
    });

    it('should clamp invalid take to default page size', async () => {
      const { body } = await auth(
        request(app.getHttpServer()).get('/api/v1/contacts?take=abc'),
      ).expect(200);

      // Service falls back to PAGE_SIZE (50) for non-numeric take
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return empty data array when search has no matches', async () => {
      await prisma.contact.create({ data: { name: 'Alice', userId } });

      const { body } = await auth(
        request(app.getHttpServer()).get('/api/v1/contacts?search=zzzzz'),
      ).expect(200);

      expect(body.data).toHaveLength(0);
    });

    it('should return 401 when no token provided', async () => {
      await request(app.getHttpServer()).get('/api/v1/contacts').expect(401);
    });
  });

  // â”€â”€ GET /api/v1/contacts/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  describe('GET /api/v1/contacts/:id', () => {
    it('should return a contact by id', async () => {
      const created = await prisma.contact.create({
        data: { name: 'Alice', phone: '123', userId },
      });

      const { body } = await auth(
        request(app.getHttpServer()).get(`/api/v1/contacts/${created.id}`),
      ).expect(200);

      expect(body).toMatchObject({
        id: created.id,
        name: 'Alice',
        phone: '123',
      });
    });

    it('should return 404 for non-existent id', async () => {
      const { body } = await auth(
        request(app.getHttpServer()).get('/api/v1/contacts/nonexistent'),
      ).expect(404);

      expect(body.statusCode).toBe(404);
      expect(body.message).toContain('nonexistent');
    });
  });

  // â”€â”€ PATCH /api/v1/contacts/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  describe('PATCH /api/v1/contacts/:id', () => {
    it('should update name', async () => {
      const created = await prisma.contact.create({
        data: { name: 'Alice', userId },
      });

      const { body } = await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/contacts/${created.id}`)
          .send({ name: 'Updated Alice' }),
      ).expect(200);

      expect(body.name).toBe('Updated Alice');
      expect(body.id).toBe(created.id);
    });

    it('should update phone', async () => {
      const created = await prisma.contact.create({
        data: { name: 'Alice', phone: '111', userId },
      });

      const { body } = await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/contacts/${created.id}`)
          .send({ phone: '222' }),
      ).expect(200);

      expect(body.phone).toBe('222');
      expect(body.name).toBe('Alice'); // name unchanged
    });

    it('should update email', async () => {
      const created = await prisma.contact.create({
        data: { name: 'Alice', userId },
      });

      const { body } = await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/contacts/${created.id}`)
          .send({ email: 'alice@example.com' }),
      ).expect(200);

      expect(body.email).toBe('alice@example.com');
    });

    it('should reject invalid email on update (400)', async () => {
      const created = await prisma.contact.create({
        data: { name: 'Alice', userId },
      });

      await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/contacts/${created.id}`)
          .send({ email: 'not-valid' }),
      ).expect(400);
    });

    it('should trim name on update', async () => {
      const created = await prisma.contact.create({
        data: { name: 'Alice', userId },
      });

      const { body } = await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/contacts/${created.id}`)
          .send({ name: '  Bob  ' }),
      ).expect(200);

      expect(body.name).toBe('Bob');
    });

    it('should return 404 for non-existent id', async () => {
      await auth(
        request(app.getHttpServer())
          .patch('/api/v1/contacts/nonexistent')
          .send({ name: 'X' }),
      ).expect(404);
    });

    it('should treat empty name string as no-op on update', async () => {
      const created = await prisma.contact.create({
        data: { name: 'Alice', userId },
      });

      // The DTO Transform converts '' → undefined, so the name stays unchanged
      const { body } = await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/contacts/${created.id}`)
          .send({ name: '' }),
      ).expect(200);

      expect(body.name).toBe('Alice');
    });

    it('should return 400 for unknown fields', async () => {
      const created = await prisma.contact.create({
        data: { name: 'Alice', userId },
      });

      await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/contacts/${created.id}`)
          .send({ name: 'Test', foo: 'bar' }),
      ).expect(400);
    });

    it('should clear phone when set to null', async () => {
      const created = await prisma.contact.create({
        data: { name: 'Alice', phone: '123', userId },
      });

      const { body } = await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/contacts/${created.id}`)
          .send({ phone: null }),
      ).expect(200);

      expect(body.phone).toBeNull();
    });

    it('should treat whitespace-only phone as no-op', async () => {
      const created = await prisma.contact.create({
        data: { name: 'Alice', phone: '123', userId },
      });

      const { body } = await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/contacts/${created.id}`)
          .send({ phone: '   ' }),
      ).expect(200);

      // Transform converts '   ' â†’ undefined, PartialType treats undefined as "don't update"
      expect(body.phone).toBe('123');
    });

    it('should accept empty body (no-op update)', async () => {
      const created = await prisma.contact.create({
        data: { name: 'Alice', userId },
      });

      const { body } = await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/contacts/${created.id}`)
          .send({}),
      ).expect(200);

      expect(body.name).toBe('Alice');
    });
  });

  // â”€â”€ DELETE /api/v1/contacts/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  describe('DELETE /api/v1/contacts/:id', () => {
    it('should delete a contact and return 204', async () => {
      const created = await prisma.contact.create({
        data: { name: 'Alice', userId },
      });

      await auth(
        request(app.getHttpServer()).delete(`/api/v1/contacts/${created.id}`),
      ).expect(204);

      // Soft delete keeps the row — verify it's not visible (deletedAt is set)
      const found = await prisma.contact.findFirst({
        where: { id: created.id, deletedAt: null },
      });
      expect(found).toBeNull();
    });

    it('should return 404 for non-existent id', async () => {
      await auth(
        request(app.getHttpServer()).delete('/api/v1/contacts/nonexistent'),
      ).expect(404);
    });

    it('should return 404 when deleting the same contact twice', async () => {
      const created = await prisma.contact.create({
        data: { name: 'Alice', userId },
      });

      await auth(
        request(app.getHttpServer()).delete(`/api/v1/contacts/${created.id}`),
      ).expect(204);

      await auth(
        request(app.getHttpServer()).delete(`/api/v1/contacts/${created.id}`),
      ).expect(404);
    });
  });

  // â”€â”€ Cross-cutting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  describe('Cross-cutting concerns', () => {
    it('should return structured error for 404', async () => {
      const { body } = await auth(
        request(app.getHttpServer()).get('/api/v1/contacts/nonexistent'),
      ).expect(404);

      expect(body).toHaveProperty('statusCode', 404);
      expect(body).toHaveProperty('message');
    });

    it('should return structured error for validation failure', async () => {
      const { body } = await auth(
        request(app.getHttpServer())
          .post('/api/v1/contacts')
          .send({ name: 123 }),
      ).expect(400);

      expect(body).toHaveProperty('statusCode', 400);
      expect(body).toHaveProperty('message');
      expect(Array.isArray(body.message)).toBe(true);
    });

    it('created contact should appear in list', async () => {
      await auth(
        request(app.getHttpServer())
          .post('/api/v1/contacts')
          .send({ name: 'Integration Test' }),
      ).expect(201);

      const { body } = await auth(
        request(app.getHttpServer()).get('/api/v1/contacts'),
      ).expect(200);

      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(
        body.data.some((c: { name: string }) => c.name === 'Integration Test'),
      ).toBe(true);
    });

    it('updated contact should reflect in GET by id', async () => {
      const { body: created } = await auth(
        request(app.getHttpServer())
          .post('/api/v1/contacts')
          .send({ name: 'Before' }),
      ).expect(201);

      await auth(
        request(app.getHttpServer())
          .patch(`/api/v1/contacts/${created.id}`)
          .send({ name: 'After' }),
      ).expect(200);

      const { body } = await auth(
        request(app.getHttpServer()).get(`/api/v1/contacts/${created.id}`),
      ).expect(200);

      expect(body.name).toBe('After');
    });

    it('deleted contact should not appear in list', async () => {
      const { body: created } = await auth(
        request(app.getHttpServer())
          .post('/api/v1/contacts')
          .send({ name: 'ToDelete' }),
      ).expect(201);

      await auth(
        request(app.getHttpServer()).delete(`/api/v1/contacts/${created.id}`),
      ).expect(204);

      const { body: list } = await auth(
        request(app.getHttpServer()).get('/api/v1/contacts'),
      ).expect(200);

      expect(list.data).toHaveLength(0);
    });
  });
});
