import { RedisThrottlerStorage } from './redis-throttler.storage';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Test, TestingModule } from '@nestjs/testing';

describe('RedisThrottlerStorage', () => {
  let storage: RedisThrottlerStorage;
  let redis: Record<string, jest.Mock>;

  beforeEach(async () => {
    redis = {
      ttl: jest.fn().mockResolvedValue(-2),
      eval: jest.fn().mockResolvedValue([1, 60]),
      set: jest.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisThrottlerStorage,
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    storage = module.get(RedisThrottlerStorage);
  });

  it('should be defined', () => {
    expect(storage).toBeDefined();
  });

  describe('increment', () => {
    it('should increment and return record on first hit', async () => {
      const result = await storage.increment('key', 60000, 10, 0, 'default');

      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'throttle:key',
        60,
      );
      expect(result).toEqual({
        totalHits: 1,
        timeToExpire: 60000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
    });

    it('should return blocked=true when already blocked', async () => {
      redis.ttl.mockResolvedValue(30);

      const result = await storage.increment('key', 60000, 10, 0, 'default');

      expect(redis.ttl).toHaveBeenCalledWith('throttle:block:key');
      expect(redis.eval).not.toHaveBeenCalled();
      expect(result).toEqual({
        totalHits: 11,
        timeToExpire: 30000,
        isBlocked: true,
        timeToBlockExpire: 30000,
      });
    });

    it('should set block key when hits exceed limit', async () => {
      redis.eval.mockResolvedValue([11, 55]);

      const result = await storage.increment(
        'key',
        60000,
        10,
        120000,
        'default',
      );

      expect(redis.set).toHaveBeenCalledWith(
        'throttle:block:key',
        '1',
        'EX',
        120,
      );
      expect(result.isBlocked).toBe(true);
      expect(result.timeToBlockExpire).toBe(120000);
    });

    it('should not set block key when blockDuration is 0', async () => {
      redis.eval.mockResolvedValue([11, 55]);

      const result = await storage.increment('key', 60000, 10, 0, 'default');

      expect(redis.set).not.toHaveBeenCalled();
      expect(result.isBlocked).toBe(false);
    });

    it('should ceil ttl from ms to seconds', async () => {
      await storage.increment('key', 1500, 10, 0, 'default');

      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'throttle:key',
        2,
      );
    });
  });
});
