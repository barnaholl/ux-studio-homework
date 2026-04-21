import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

const USER_ID = 'user-1';

const mockUser = {
  id: USER_ID,
  email: 'test@example.com',
  displayName: 'Test User',
  phone: null,
  avatarUrl: null,
  theme: 'system',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              update: jest.fn(),
              delete: jest.fn().mockResolvedValue(undefined),
            },
          },
        },
        {
          provide: S3Service,
          useValue: {
            listByPrefix: jest.fn().mockResolvedValue([]),
            delete: jest.fn().mockResolvedValue(undefined),
          },
        },
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

    service = module.get(UsersService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── findMe ─────────────────────────────────────────────────
  describe('findMe', () => {
    it('should return user profile', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.findMe(USER_ID);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
        select: expect.objectContaining({
          id: true,
          email: true,
          displayName: true,
          theme: true,
        }),
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findMe('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not select passwordHash', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await service.findMe(USER_ID);

      const select = (prisma.user.findUnique as jest.Mock).mock.calls[0][0]
        .select;
      expect(select).not.toHaveProperty('passwordHash');
    });
  });

  // ── updateMe ───────────────────────────────────────────────
  describe('updateMe', () => {
    it('should update and return the user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      const updated = { ...mockUser, displayName: 'New Name' };
      (prisma.user.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.updateMe(USER_ID, {
        displayName: 'New Name',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { displayName: 'New Name' },
        select: expect.objectContaining({ id: true }),
      });
      expect(result.displayName).toBe('New Name');
    });

    it('should throw NotFoundException when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateMe('nonexistent', { displayName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update theme', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      const updated = { ...mockUser, theme: 'dark' };
      (prisma.user.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.updateMe(USER_ID, { theme: 'dark' });

      expect(result.theme).toBe('dark');
    });
  });

  // ── updateAvatar ───────────────────────────────────────────
  describe('updateAvatar', () => {
    it('should update avatarUrl and return user', async () => {
      const updated = { ...mockUser, avatarUrl: 'https://cdn/avatar' };
      (prisma.user.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.updateAvatar(USER_ID, 'https://cdn/avatar');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { avatarUrl: 'https://cdn/avatar' },
        select: expect.objectContaining({ id: true }),
      });
      expect(result.avatarUrl).toBe('https://cdn/avatar');
    });
  });

  // ── deleteMe ───────────────────────────────────────────────
  describe('deleteMe', () => {
    it('should delete all S3 prefixes and hard-delete the user', async () => {
      const s3 = module.get(S3Service);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (s3.listByPrefix as jest.Mock).mockResolvedValue([
        { key: 'avatars/contacts/user-1/contact1-40.webp' },
        { key: 'avatars/contacts/user-1/contact1-120.webp' },
      ]);

      await service.deleteMe(USER_ID);

      // 3 prefixes: contacts, users, tmp
      expect(s3.listByPrefix).toHaveBeenCalledTimes(3);
      expect(s3.listByPrefix).toHaveBeenCalledWith(
        `avatars/contacts/${USER_ID}`,
      );
      expect(s3.listByPrefix).toHaveBeenCalledWith(`avatars/users/${USER_ID}`);
      expect(s3.listByPrefix).toHaveBeenCalledWith(`avatars/tmp/${USER_ID}`);
      // S3 delete called for each object found (2 per prefix × 3 prefixes = 6)
      expect(s3.delete).toHaveBeenCalledTimes(6);
      // User hard-deleted from DB
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: USER_ID },
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteMe('nonexistent')).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('should proceed gracefully when S3 prefix has no objects', async () => {
      const s3 = module.get(S3Service);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (s3.listByPrefix as jest.Mock).mockResolvedValue([]);

      await service.deleteMe(USER_ID);

      expect(s3.delete).not.toHaveBeenCalled();
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: USER_ID },
      });
    });
  });
});
