/* eslint-disable prettier/prettier */
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { Job } from 'bullmq';
import * as fs from 'fs/promises';
import { AvatarProcessor, AvatarJobData } from './avatar.processor';
import { S3Service } from '../s3/s3.service';
import { REDIS_CLIENT } from '../redis/redis.module';

jest.mock('sharp', () => {
  const resized = Buffer.from('resized');
  return jest.fn().mockReturnValue({
    resize: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(resized),
  });
});

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

const USER_ID = 'user-123';
const STAGE_ID = 'stage-456';
const TMP_PATH = '/tmp/avatar-user-123-stage-456';
const FAKE_BUFFER = Buffer.from('fake-image');

const makeJob = (data: AvatarJobData) =>
  ({ data } as unknown as Job<AvatarJobData>);

describe('AvatarProcessor', () => {
  let processor: AvatarProcessor;
  let s3: jest.Mocked<Pick<S3Service, 'upload'>>;
  let redis: Record<string, jest.Mock>;

  beforeEach(async () => {
    jest.clearAllMocks();
    (fs.readFile as jest.Mock).mockResolvedValue(FAKE_BUFFER);
    (fs.unlink as jest.Mock).mockResolvedValue(undefined);

    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      zadd: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvatarProcessor,
        {
          provide: S3Service,
          useValue: { upload: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: REDIS_CLIENT, useValue: redis },
        {
          provide: PinoLogger,
          useValue: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            setContext: jest.fn(),
          },
        },
      ],
    }).compile();

    processor = module.get(AvatarProcessor);
    s3 = module.get(S3Service);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should resize both sizes, upload to S3, and mark Redis key as ready', async () => {
      await processor.process(
        makeJob({ userId: USER_ID, stageId: STAGE_ID, tmpPath: TMP_PATH }),
      );

      expect(s3.upload).toHaveBeenCalledTimes(2);
      expect(s3.upload).toHaveBeenCalledWith(
        `avatars/${USER_ID}/${STAGE_ID}-40.webp`,
        expect.any(Buffer),
        'image/webp',
      );
      expect(s3.upload).toHaveBeenCalledWith(
        `avatars/${USER_ID}/${STAGE_ID}-120.webp`,
        expect.any(Buffer),
        'image/webp',
      );

      expect(redis.set).toHaveBeenCalledWith(
        `avatar:staged:${USER_ID}:${STAGE_ID}`,
        '1',
        'EX',
        1800,
      );
      expect(redis.zadd).toHaveBeenCalledWith(
        'avatar:staged:pending',
        expect.any(Number),
        `${USER_ID}/${STAGE_ID}`,
      );

      expect(fs.unlink).toHaveBeenCalledWith(TMP_PATH);
    });

    it('should return early without uploading when temp file does not exist', async () => {
      (fs.readFile as jest.Mock).mockRejectedValueOnce(new Error('ENOENT'));

      await processor.process(
        makeJob({ userId: USER_ID, stageId: STAGE_ID, tmpPath: TMP_PATH }),
      );

      expect(s3.upload).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('should rethrow and NOT delete temp file when S3 upload fails (so BullMQ can retry)', async () => {
      (s3.upload as jest.Mock).mockRejectedValueOnce(new Error('S3 error'));

      await expect(
        processor.process(
          makeJob({ userId: USER_ID, stageId: STAGE_ID, tmpPath: TMP_PATH }),
        ),
      ).rejects.toThrow('S3 error');

      // Temp file must survive so the retry attempt can read it
      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });
});
