import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import type { JwtPayload } from '../auth/decorators';

const USER_ID = 'user-1';
const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'test@example.com',
  jti: 'jti-1',
  exp: Math.floor(Date.now() / 1000) + 3600,
};

const mockContact = {
  id: 'clx1abc',
  name: 'Jane Doe',
  phone: '+36 1 234 5678',
  email: 'jane.doe@example.com',
  avatarUrl: null,
  userId: USER_ID,
  isFavourite: false,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('ContactsController', () => {
  let controller: ContactsController;
  let service: ContactsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactsController],
      providers: [
        {
          provide: ContactsService,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            addFavourite: jest.fn(),
            removeFavourite: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(ContactsController);
    service = module.get(ContactsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findAll ────────────────────────────────────────────────
  describe('findAll', () => {
    it('should call service.findAll with userId and no optional params', async () => {
      const expected = { data: [mockContact], total: 1, nextCursor: null };
      (service.findAll as jest.Mock).mockResolvedValue(expected);

      const result = await controller.findAll(mockUser);

      expect(service.findAll).toHaveBeenCalledWith(
        USER_ID,
        undefined,
        undefined,
        undefined,
        false,
        'createdAt',
        undefined,
      );
      expect(result).toEqual(expected);
    });

    it('should pass search, cursor, take to service', async () => {
      (service.findAll as jest.Mock).mockResolvedValue({
        data: [],
        total: 0,
        nextCursor: null,
      });

      await controller.findAll(mockUser, 'jane', 'cursor123', '10');

      expect(service.findAll).toHaveBeenCalledWith(
        USER_ID,
        'jane',
        'cursor123',
        10,
        false,
        'createdAt',
        undefined,
      );
    });

    it('should pass undefined for cursor/take when not provided', async () => {
      (service.findAll as jest.Mock).mockResolvedValue({
        data: [],
        total: 0,
        nextCursor: null,
      });

      await controller.findAll(mockUser, 'test');

      expect(service.findAll).toHaveBeenCalledWith(
        USER_ID,
        'test',
        undefined,
        undefined,
        false,
        'createdAt',
        undefined,
      );
    });

    it('should pass favouritesOnly=true when favourites=true', async () => {
      (service.findAll as jest.Mock).mockResolvedValue({
        data: [],
        total: 0,
        nextCursor: null,
      });

      await controller.findAll(
        mockUser,
        undefined,
        undefined,
        undefined,
        'true',
      );

      expect(service.findAll).toHaveBeenCalledWith(
        USER_ID,
        undefined,
        undefined,
        undefined,
        true,
        'createdAt',
        undefined,
      );
    });
  });

  // ── findOne ────────────────────────────────────────────────
  describe('findOne', () => {
    it('should return a contact', async () => {
      (service.findOne as jest.Mock).mockResolvedValue(mockContact);

      const result = await controller.findOne('clx1abc', mockUser);

      expect(service.findOne).toHaveBeenCalledWith('clx1abc', USER_ID);
      expect(result).toEqual(mockContact);
    });

    it('should propagate NotFoundException', async () => {
      (service.findOne as jest.Mock).mockRejectedValue(new NotFoundException());

      await expect(controller.findOne('bad', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── create ─────────────────────────────────────────────────
  describe('create', () => {
    it('should create and return a contact', async () => {
      const dto = { name: 'Jane Doe', phone: '+36 1 234 5678' };
      (service.create as jest.Mock).mockResolvedValue(mockContact);

      const result = await controller.create(dto, mockUser);

      expect(service.create).toHaveBeenCalledWith(dto, USER_ID);
      expect(result).toEqual(mockContact);
    });
  });

  // ── update ─────────────────────────────────────────────────
  describe('update', () => {
    it('should update and return the contact', async () => {
      const updated = { ...mockContact, name: 'Updated' };
      (service.update as jest.Mock).mockResolvedValue(updated);

      const result = await controller.update(
        'clx1abc',
        { name: 'Updated' },
        mockUser,
      );

      expect(service.update).toHaveBeenCalledWith(
        'clx1abc',
        { name: 'Updated' },
        USER_ID,
      );
      expect(result.name).toBe('Updated');
    });

    it('should propagate NotFoundException', async () => {
      (service.update as jest.Mock).mockRejectedValue(new NotFoundException());

      await expect(
        controller.update('bad', { name: 'X' }, mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ─────────────────────────────────────────────────
  describe('remove', () => {
    it('should call service.remove', async () => {
      (service.remove as jest.Mock).mockResolvedValue(undefined);

      await controller.remove('clx1abc', mockUser);

      expect(service.remove).toHaveBeenCalledWith('clx1abc', USER_ID);
    });

    it('should propagate NotFoundException', async () => {
      (service.remove as jest.Mock).mockRejectedValue(new NotFoundException());

      await expect(controller.remove('bad', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── addFavourite ───────────────────────────────────────────
  describe('addFavourite', () => {
    it('should call service.addFavourite', async () => {
      (service.addFavourite as jest.Mock).mockResolvedValue({
        isFavourite: true,
      });

      const result = await controller.addFavourite('clx1abc', mockUser);

      expect(service.addFavourite).toHaveBeenCalledWith('clx1abc', USER_ID);
      expect(result).toEqual({ isFavourite: true });
    });
  });

  // ── removeFavourite ────────────────────────────────────────
  describe('removeFavourite', () => {
    it('should call service.removeFavourite', async () => {
      (service.removeFavourite as jest.Mock).mockResolvedValue({
        isFavourite: false,
      });

      const result = await controller.removeFavourite('clx1abc', mockUser);

      expect(service.removeFavourite).toHaveBeenCalledWith('clx1abc', USER_ID);
      expect(result).toEqual({ isFavourite: false });
    });
  });
});
