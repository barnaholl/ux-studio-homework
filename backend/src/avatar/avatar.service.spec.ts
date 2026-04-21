import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { getQueueToken } from '@nestjs/bullmq';
import * as fs from 'fs/promises';
import { AvatarService } from './avatar.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AVATAR_PROCESS_QUEUE } from './avatar.constants';

// Mock fs/promises before module loads
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

// Mock file-type before module loads
jest.mock('file-type', () => ({
  fromBuffer: jest.fn().mockResolvedValue({ mime: 'image/png', ext: 'png' }),
}));

const CDN_URL = 'https://cdn.example.com/bucket';

const USER_ID = 'abc123';
const CONTACT_ID = 'def456';
const FAKE_BUFFER = Buffer.from('fake-image-data');

describe('AvatarService', () => {
  let service: AvatarService;
  let prisma: PrismaService;
  let s3: S3Service;
  let redis: Record<string, jest.Mock>;
  let avatarQueue: { add: jest.Mock };

  beforeEach(async () => {
    redis = {
      incr: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      zadd: jest.fn().mockResolvedValue(1),
      zrem: jest.fn().mockResolvedValue(1),
    };
    avatarQueue = { add: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvatarService,
        {
          provide: PrismaService,
          useValue: {
            contact: {
              findUnique: jest.fn(),
              update: jest.fn().mockResolvedValue({}),
            },
            user: {
              findUnique: jest.fn(),
              update: jest.fn().mockResolvedValue({}),
            },
          },
        },
        {
          provide: S3Service,
          useValue: {
            upload: jest.fn().mockResolvedValue('https://cdn/key'),
            delete: jest.fn().mockResolvedValue(undefined),
            getCdnUrl: jest.fn().mockReturnValue(CDN_URL),
          },
        },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: getQueueToken(AVATAR_PROCESS_QUEUE), useValue: avatarQueue },
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

    service = module.get(AvatarService);
    prisma = module.get(PrismaService);
    s3 = module.get(S3Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── stageAvatar ────────────────────────────────────────────
  describe('stageAvatar', () => {
    it('should validate magic bytes, write temp file, queue job, set Redis pending key, and return stageId', async () => {
      const result = await service.stageAvatar(
        USER_ID,
        FAKE_BUFFER,
        'image/png',
      );

      expect(result).toHaveProperty('stageId');
      expect(typeof result.stageId).toBe('string');

      // Writes raw buffer to temp file for the processor
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(`avatar-${USER_ID}-`),
        FAKE_BUFFER,
      );

      // Sets Redis key as 'pending' immediately
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining(`avatar:staged:${USER_ID}:`),
        'pending',
        'EX',
        1800,
      );

      // Queues the processing job
      expect(avatarQueue.add).toHaveBeenCalledWith(
        'process',
        expect.objectContaining({ userId: USER_ID, stageId: result.stageId }),
        expect.any(Object),
      );

      // Does NOT upload directly — that is the processor's responsibility
      expect(s3.upload).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when magic bytes are invalid', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fileType = require('file-type') as { fromBuffer: jest.Mock };
      fileType.fromBuffer.mockResolvedValueOnce({
        mime: 'application/pdf',
        ext: 'pdf',
      });

      await expect(
        service.stageAvatar(USER_ID, FAKE_BUFFER, 'image/png'),
      ).rejects.toThrow(BadRequestException);

      expect(avatarQueue.add).not.toHaveBeenCalled();
      expect(s3.upload).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when file type is undetectable', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fileType = require('file-type') as { fromBuffer: jest.Mock };
      fileType.fromBuffer.mockResolvedValueOnce(undefined);

      await expect(
        service.stageAvatar(USER_ID, FAKE_BUFFER, 'image/png'),
      ).rejects.toThrow(BadRequestException);

      expect(avatarQueue.add).not.toHaveBeenCalled();
    });
  });

  // ── commitContactAvatar ────────────────────────────────────
  describe('commitContactAvatar', () => {
    const STAGE_ID = 'test-stage-id';

    it('should commit staged avatar to contact and return avatarUrl', async () => {
      redis.get.mockResolvedValue('1'); // staged key valid
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: CONTACT_ID,
        userId: USER_ID,
        avatarUrl: null,
      });

      const result = await service.commitContactAvatar(
        CONTACT_ID,
        USER_ID,
        STAGE_ID,
      );

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: CONTACT_ID },
        data: { avatarUrl: expect.stringContaining(STAGE_ID) },
      });
      expect(redis.del).toHaveBeenCalledWith(
        `avatar:staged:${USER_ID}:${STAGE_ID}`,
      );
      expect(redis.incr).toHaveBeenCalledWith(`contacts:version:${USER_ID}`);
      expect(result).toHaveProperty('avatarUrl');
    });

    it('should throw BadRequestException when stage ID is invalid or expired', async () => {
      redis.get.mockResolvedValue(null); // not staged

      await expect(
        service.commitContactAvatar(CONTACT_ID, USER_ID, STAGE_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when avatar is still processing', async () => {
      redis.get.mockResolvedValue('pending');

      await expect(
        service.commitContactAvatar(CONTACT_ID, USER_ID, STAGE_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when contact not found or wrong user', async () => {
      redis.get.mockResolvedValue('1');
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.commitContactAvatar(CONTACT_ID, USER_ID, STAGE_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should delete old avatar when contact already has one', async () => {
      redis.get.mockResolvedValue('1');
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: CONTACT_ID,
        userId: USER_ID,
        avatarUrl: `${CDN_URL}/avatars/${USER_ID}/old-stage`,
      });
      const deleteSpy = jest.spyOn(service, 'deleteAvatarByUrl');

      await service.commitContactAvatar(CONTACT_ID, USER_ID, STAGE_ID);

      expect(deleteSpy).toHaveBeenCalledWith(
        `${CDN_URL}/avatars/${USER_ID}/old-stage`,
      );
    });
  });

  // ── commitUserAvatar ───────────────────────────────────────
  describe('commitUserAvatar', () => {
    const STAGE_ID = 'test-stage-id';

    it('should commit staged avatar to user and return avatarUrl', async () => {
      redis.get.mockResolvedValue('1');
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: USER_ID,
        avatarUrl: null,
      });

      const result = await service.commitUserAvatar(USER_ID, STAGE_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { avatarUrl: expect.stringContaining(STAGE_ID) },
      });
      expect(redis.del).toHaveBeenCalledWith(
        `avatar:staged:${USER_ID}:${STAGE_ID}`,
      );
      expect(result).toHaveProperty('avatarUrl');
    });

    it('should throw BadRequestException when stage ID is invalid', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.commitUserAvatar(USER_ID, STAGE_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when avatar is still processing', async () => {
      redis.get.mockResolvedValue('pending');

      await expect(service.commitUserAvatar(USER_ID, STAGE_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when user not found', async () => {
      redis.get.mockResolvedValue('1');
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.commitUserAvatar(USER_ID, STAGE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── removeUserAvatar ───────────────────────────────────────
  describe('removeUserAvatar', () => {
    it('should delete avatar from S3 and clear DB when user has avatar', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: USER_ID,
        avatarUrl: `${CDN_URL}/avatars/${USER_ID}/some-stage`,
      });
      const deleteSpy = jest.spyOn(service, 'deleteAvatarByUrl');

      await service.removeUserAvatar(USER_ID);

      expect(deleteSpy).toHaveBeenCalledWith(
        `${CDN_URL}/avatars/${USER_ID}/some-stage`,
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { avatarUrl: null },
      });
    });

    it('should do nothing when user has no avatar', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: USER_ID,
        avatarUrl: null,
      });

      await service.removeUserAvatar(USER_ID);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.removeUserAvatar(USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
