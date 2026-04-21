import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import type { JwtPayload } from '../auth/decorators';

const USER_ID = 'user-1';
const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'test@example.com',
  jti: 'jti-1',
  exp: Math.floor(Date.now() / 1000) + 3600,
};

const mockProfile = {
  id: USER_ID,
  email: 'test@example.com',
  displayName: 'Test User',
  phone: null,
  avatarUrl: null,
  theme: 'system',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            findMe: jest.fn().mockResolvedValue(mockProfile),
            updateMe: jest.fn(),
            deleteMe: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get(UsersController);
    service = module.get(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findMe ─────────────────────────────────────────────────
  describe('findMe', () => {
    it('should call service.findMe with userId', async () => {
      const result = await controller.findMe(mockUser);

      expect(service.findMe).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual(mockProfile);
    });
  });

  // ── updateMe ───────────────────────────────────────────────
  describe('updateMe', () => {
    it('should call service.updateMe with userId and dto', async () => {
      const updated = { ...mockProfile, displayName: 'Updated' };
      (service.updateMe as jest.Mock).mockResolvedValue(updated);

      const result = await controller.updateMe(mockUser, {
        displayName: 'Updated',
      });

      expect(service.updateMe).toHaveBeenCalledWith(USER_ID, {
        displayName: 'Updated',
      });
      expect(result.displayName).toBe('Updated');
    });
  });

  // ── deleteMe ───────────────────────────────────────────────
  describe('deleteMe', () => {
    it('should call service.deleteMe with userId', async () => {
      await controller.deleteMe(mockUser);

      expect(service.deleteMe).toHaveBeenCalledWith(USER_ID);
    });
  });
});
