import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getQueueToken } from '@nestjs/bullmq';
import { PinoLogger } from 'nestjs-pino';
import { ContactsService } from './contacts.service';
import { PrismaService } from '../prisma/prisma.service';
import { AvatarService } from '../avatar/avatar.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { CONTACT_PURGE_QUEUE } from './contact-purge.processor';

const USER_ID = 'user-1';

const mockContact = {
  id: 'clx1abc',
  name: 'Jane Doe',
  phone: '+36 1 234 5678',
  email: 'jane.doe@example.com',
  avatarUrl: null,
  isFavourite: false,
  deletedAt: null,
  userId: USER_ID,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('ContactsService', () => {
  let service: ContactsService;
  let prisma: PrismaService;
  let avatarService: AvatarService;
  let redis: { get: jest.Mock; set: jest.Mock; incr: jest.Mock };
  let purgeQueue: { add: jest.Mock };

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn().mockResolvedValue(1),
    };
    purgeQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        {
          provide: PrismaService,
          useValue: {
            contact: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              count: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: AvatarService,
          useValue: {
            deleteAvatarByUrl: jest.fn(),
          },
        },
        {
          provide: REDIS_CLIENT,
          useValue: redis,
        },
        {
          provide: getQueueToken(CONTACT_PURGE_QUEUE),
          useValue: purgeQueue,
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

    service = module.get(ContactsService);
    prisma = module.get(PrismaService);
    avatarService = module.get(AvatarService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── findAll ────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return paginated results with defaults', async () => {
      const data = [mockContact];
      (prisma.contact.findMany as jest.Mock).mockResolvedValue(data);

      const result = await service.findAll(USER_ID);

      expect(prisma.contact.findMany).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ nextCursor: null });
    });

    it('should pass search filter when provided', async () => {
      (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll(USER_ID, 'jane');

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: USER_ID,
            deletedAt: null,
            OR: expect.arrayContaining([{ name: { contains: 'jane' } }]),
          }),
        }),
      );
    });

    it('should pass cursor to Prisma when provided', async () => {
      (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll(USER_ID, undefined, 'cursor123', 10);

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'cursor123' },
          skip: 1,
          take: 10,
        }),
      );
    });

    it('should not include cursor/skip when no cursor provided', async () => {
      (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll(USER_ID);

      const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
      expect(call.cursor).toBeUndefined();
    });

    it('should sanitize NaN take to PAGE_SIZE', async () => {
      (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll(USER_ID, undefined, undefined, NaN);

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it('should cap take at MAX_TAKE (1000)', async () => {
      (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll(USER_ID, undefined, undefined, 9999);

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1000 }),
      );
    });

    it('should clamp take below 1 to 1', async () => {
      (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll(USER_ID, undefined, undefined, -1);

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
    });

    it('should return nextCursor when page is full', async () => {
      const contacts = Array.from({ length: 50 }, (_, i) => ({
        ...mockContact,
        id: `id-${i}`,
      }));
      (prisma.contact.findMany as jest.Mock).mockResolvedValue(contacts);

      const result = await service.findAll(USER_ID);

      expect(result.nextCursor).toBe('id-49');
    });

    it('should return null nextCursor when page is not full', async () => {
      const contacts = [{ ...mockContact }];
      (prisma.contact.findMany as jest.Mock).mockResolvedValue(contacts);

      const result = await service.findAll(USER_ID);

      expect(result.nextCursor).toBeNull();
    });

    it('should use userId-scoped where when search is undefined', async () => {
      (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll(USER_ID);

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID }),
        }),
      );
    });
  });

  // ── findOne ────────────────────────────────────────────────
  describe('findOne', () => {
    it('should return a contact when found', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue(mockContact);

      const result = await service.findOne('clx1abc', USER_ID);

      expect(prisma.contact.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'clx1abc' } }),
      );
      expect(result).toMatchObject({ id: 'clx1abc', name: 'Jane Doe' });
    });

    it('should throw NotFoundException when contact not found', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('nonexistent', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when contact belongs to another user', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue({
        ...mockContact,
        userId: 'other-user',
      });

      await expect(service.findOne('clx1abc', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when contact is soft-deleted', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue({
        ...mockContact,
        deletedAt: new Date(),
      });

      await expect(service.findOne('clx1abc', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── create ─────────────────────────────────────────────────
  describe('create', () => {
    it('should create and return a contact', async () => {
      (prisma.contact.create as jest.Mock).mockResolvedValue(mockContact);

      const dto = {
        name: 'Jane Doe',
        phone: '+36 1 234 5678',
        email: 'jane.doe@example.com',
      };
      const result = await service.create(dto, USER_ID);

      expect(prisma.contact.create).toHaveBeenCalledWith({
        data: {
          ...dto,
          sortName: 'jane doe',
          user: { connect: { id: USER_ID } },
        },
      });
      expect(result).toMatchObject({ id: 'clx1abc', isFavourite: false });
    });

    it('should create a contact without optional fields', async () => {
      const contactMinimal = { ...mockContact, phone: null, email: null };
      (prisma.contact.create as jest.Mock).mockResolvedValue(contactMinimal);

      const result = await service.create({ name: 'Jane Doe' }, USER_ID);

      expect(prisma.contact.create).toHaveBeenCalledWith({
        data: {
          name: 'Jane Doe',
          sortName: 'jane doe',
          user: { connect: { id: USER_ID } },
        },
      });
      expect(result.phone).toBeNull();
      expect(result.email).toBeNull();
    });

    it('should create a contact with email only (no phone)', async () => {
      const contactEmailOnly = { ...mockContact, phone: null };
      (prisma.contact.create as jest.Mock).mockResolvedValue(contactEmailOnly);

      const result = await service.create(
        { name: 'Jane Doe', email: 'jane.doe@example.com' },
        USER_ID,
      );

      expect(prisma.contact.create).toHaveBeenCalledWith({
        data: {
          name: 'Jane Doe',
          email: 'jane.doe@example.com',
          sortName: 'jane doe',
          user: { connect: { id: USER_ID } },
        },
      });
      expect(result.email).toBe('jane.doe@example.com');
    });

    it('should create a contact with no text fields (avatar-only contact)', async () => {
      const emptyContact = {
        ...mockContact,
        name: null,
        phone: null,
        email: null,
      };
      (prisma.contact.create as jest.Mock).mockResolvedValue(emptyContact);

      const result = await service.create({}, USER_ID);

      expect(prisma.contact.create).toHaveBeenCalledWith({
        data: {
          sortName: '',
          user: { connect: { id: USER_ID } },
        },
      });
      expect(result.name).toBeNull();
    });
  });

  // ── update ─────────────────────────────────────────────────
  describe('update', () => {
    it('should update and return the contact', async () => {
      const updated = { ...mockContact, name: 'Updated' };
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue(mockContact);
      (prisma.contact.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.update(
        'clx1abc',
        { name: 'Updated' },
        USER_ID,
      );

      expect(prisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'clx1abc' },
          data: { name: 'Updated', sortName: 'updated' },
        }),
      );
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException when contact not found', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { name: 'X' }, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when contact belongs to another user', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue({
        ...mockContact,
        userId: 'other-user',
      });

      await expect(
        service.update('clx1abc', { name: 'X' }, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException on P2025 during update', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue(mockContact);
      const error = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        { code: 'P2025', clientVersion: '5.0.0' },
      );
      (prisma.contact.update as jest.Mock).mockRejectedValue(error);

      await expect(
        service.update('clx1abc', { name: 'X' }, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should rethrow non-P2025 Prisma errors', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue(mockContact);
      const error = new Prisma.PrismaClientKnownRequestError('Other error', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (prisma.contact.update as jest.Mock).mockRejectedValue(error);

      await expect(
        service.update('clx1abc', { name: 'X' }, USER_ID),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });

    it('should rethrow unknown errors', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue(mockContact);
      (prisma.contact.update as jest.Mock).mockRejectedValue(
        new Error('DB down'),
      );

      await expect(
        service.update('clx1abc', { name: 'X' }, USER_ID),
      ).rejects.toThrow('DB down');
    });
  });

  // ── remove ─────────────────────────────────────────────────
  describe('remove', () => {
    it('should soft-delete the contact', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue(mockContact);
      (prisma.contact.update as jest.Mock).mockResolvedValue(mockContact);

      await service.remove('clx1abc', USER_ID);

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'clx1abc' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should schedule a purge job', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue(mockContact);
      (prisma.contact.update as jest.Mock).mockResolvedValue(mockContact);

      await service.remove('clx1abc', USER_ID);

      expect(purgeQueue.add).toHaveBeenCalledWith(
        'purge-contact',
        { contactId: 'clx1abc', userId: USER_ID },
        expect.objectContaining({ delay: expect.any(Number) }),
      );
    });

    it('should throw NotFoundException when contact not found', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.remove('nonexistent', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when contact belongs to another user', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue({
        ...mockContact,
        userId: 'other-user',
      });

      await expect(service.remove('clx1abc', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when contact is already soft-deleted', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue({
        ...mockContact,
        deletedAt: new Date(),
      });

      await expect(service.remove('clx1abc', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('should rethrow non-P2025 errors', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue(mockContact);
      (prisma.contact.update as jest.Mock).mockRejectedValue(
        new Error('DB down'),
      );

      await expect(service.remove('clx1abc', USER_ID)).rejects.toThrow(
        'DB down',
      );
    });

    it('should throw NotFoundException on P2025 during soft-delete', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue(mockContact);
      const error = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        { code: 'P2025', clientVersion: '5.0.0' },
      );
      (prisma.contact.update as jest.Mock).mockRejectedValue(error);

      await expect(service.remove('clx1abc', USER_ID)).rejects.toThrow(error);
    });
  });

  // ── addFavourite ───────────────────────────────────────────
  describe('addFavourite', () => {
    it('should update isFavourite to true and invalidate cache', async () => {
      (prisma.contact.update as jest.Mock).mockResolvedValue({
        ...mockContact,
        isFavourite: true,
      });

      const result = await service.addFavourite('clx1abc', USER_ID);

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'clx1abc', userId: USER_ID, deletedAt: null },
        data: { isFavourite: true },
      });
      expect(redis.incr).toHaveBeenCalledWith(`contacts:version:${USER_ID}`);
      expect(result).toEqual({ isFavourite: true });
    });

    it('should throw NotFoundException when contact not found, wrong user, or soft-deleted', async () => {
      const p2025 = new Prisma.PrismaClientKnownRequestError(
        'Record to update not found.',
        { code: 'P2025', clientVersion: '0.0.0' },
      );
      (prisma.contact.update as jest.Mock).mockRejectedValue(p2025);

      await expect(
        service.addFavourite('nonexistent', USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── removeFavourite ────────────────────────────────────────
  describe('removeFavourite', () => {
    it('should update isFavourite to false and invalidate cache', async () => {
      (prisma.contact.update as jest.Mock).mockResolvedValue({
        ...mockContact,
        isFavourite: false,
      });

      const result = await service.removeFavourite('clx1abc', USER_ID);

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'clx1abc', userId: USER_ID, deletedAt: null },
        data: { isFavourite: false },
      });
      expect(redis.incr).toHaveBeenCalledWith(`contacts:version:${USER_ID}`);
      expect(result).toEqual({ isFavourite: false });
    });

    it('should throw NotFoundException when contact not found, wrong user, or soft-deleted', async () => {
      const p2025 = new Prisma.PrismaClientKnownRequestError(
        'Record to update not found.',
        { code: 'P2025', clientVersion: '0.0.0' },
      );
      (prisma.contact.update as jest.Mock).mockRejectedValue(p2025);

      await expect(
        service.removeFavourite('nonexistent', USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── findAll (caching) ──────────────────────────────────────
  describe('findAll caching', () => {
    it('should return cached result when available', async () => {
      const cachedContact = {
        ...mockContact,
        createdAt: mockContact.createdAt.toISOString(),
        updatedAt: mockContact.updatedAt.toISOString(),
      };
      const cached = { data: [cachedContact], nextCursor: null };
      redis.get
        .mockResolvedValueOnce('5') // version
        .mockResolvedValueOnce(JSON.stringify(cached)); // cached data

      const result = await service.findAll(USER_ID);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual(cached);
    });

    it('should cache result after fresh query', async () => {
      const data = [mockContact];
      (prisma.contact.findMany as jest.Mock).mockResolvedValue(data);

      await service.findAll(USER_ID);

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining(`contacts:${USER_ID}:`),
        expect.any(String),
        'EX',
        300,
      );
    });

    it('should filter favouritesOnly', async () => {
      (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll(USER_ID, undefined, undefined, 50, true);

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isFavourite: true,
          }),
        }),
      );
    });
  });
});
