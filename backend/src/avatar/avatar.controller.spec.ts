import { Test, TestingModule } from '@nestjs/testing';
import { AvatarController } from './avatar.controller';
import { AvatarService } from './avatar.service';
import type { JwtPayload } from '../auth/decorators';

const USER_ID = 'user-1';
const STAGE_ID = '550e8400-e29b-41d4-a716-446655440000';
const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'test@example.com',
  jti: 'jti-1',
  exp: Math.floor(Date.now() / 1000) + 3600,
};

const mockFile: Express.Multer.File = {
  fieldname: 'file',
  originalname: 'avatar.png',
  encoding: '7bit',
  mimetype: 'image/png',
  buffer: Buffer.from('fake-image'),
  size: 10,
  stream: null as any,
  destination: '',
  filename: '',
  path: '',
};

describe('AvatarController', () => {
  let controller: AvatarController;
  let service: AvatarService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AvatarController],
      providers: [
        {
          provide: AvatarService,
          useValue: {
            stageAvatar: jest.fn().mockResolvedValue({ stageId: STAGE_ID }),
            commitContactAvatar: jest.fn().mockResolvedValue({ avatarUrl: 'https://cdn/base' }),
            commitUserAvatar: jest.fn().mockResolvedValue({ avatarUrl: 'https://cdn/base' }),
            removeUserAvatar: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get(AvatarController);
    service = module.get(AvatarService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── stageAvatar ────────────────────────────────────────────
  describe('stageAvatar', () => {
    it('should call service with userId, buffer, and mimetype', async () => {
      const result = await controller.stageAvatar(mockUser, mockFile);

      expect(service.stageAvatar).toHaveBeenCalledWith(
        USER_ID,
        mockFile.buffer,
        'image/png',
      );
      expect(result).toEqual({ stageId: STAGE_ID });
    });
  });

  // ── commitContactAvatar ────────────────────────────────────
  describe('commitContactAvatar', () => {
    it('should call service with contactId, userId, and stageId', async () => {
      const result = await controller.commitContactAvatar(
        'contact-1',
        mockUser,
        { stageId: STAGE_ID },
      );

      expect(service.commitContactAvatar).toHaveBeenCalledWith(
        'contact-1',
        USER_ID,
        STAGE_ID,
      );
      expect(result).toEqual({ avatarUrl: 'https://cdn/base' });
    });
  });

  // ── commitUserAvatar ───────────────────────────────────────
  describe('commitUserAvatar', () => {
    it('should call service with userId and stageId', async () => {
      const result = await controller.commitUserAvatar(mockUser, { stageId: STAGE_ID });

      expect(service.commitUserAvatar).toHaveBeenCalledWith(USER_ID, STAGE_ID);
      expect(result).toEqual({ avatarUrl: 'https://cdn/base' });
    });
  });

  // ── removeUserAvatar ───────────────────────────────────────
  describe('removeUserAvatar', () => {
    it('should call service with userId', async () => {
      await controller.removeUserAvatar(mockUser);

      expect(service.removeUserAvatar).toHaveBeenCalledWith(USER_ID);
    });
  });
});
