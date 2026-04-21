import { Injectable, Inject } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

// Atomic INCR + EXPIRE: avoids orphaned keys if the process crashes
// between the two calls, and reduces round trips from 3 to 1.
const INCR_LUA = `
  local key = KEYS[1]
  local ttl = tonumber(ARGV[1])
  local hits = redis.call('INCR', key)
  if hits == 1 then
    redis.call('EXPIRE', key, ttl)
  end
  local remaining = redis.call('TTL', key)
  return { hits, remaining }
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _name: string,
  ): Promise<ThrottlerStorageRecord> {
    void _name;
    const ttlSeconds = Math.ceil(ttl / 1000);
    const blockSeconds = Math.ceil(blockDuration / 1000);

    // Check if blocked
    const blockedTtl = await this.redis.ttl(`throttle:block:${key}`);
    if (blockedTtl > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: blockedTtl * 1000,
        isBlocked: true,
        timeToBlockExpire: blockedTtl * 1000,
      };
    }

    const redisKey = `throttle:${key}`;
    const result = (await this.redis.eval(
      INCR_LUA,
      1,
      redisKey,
      ttlSeconds,
    )) as number[];
    const totalHits = result[0];
    const expireTtl = result[1];

    if (totalHits > limit && blockSeconds > 0) {
      await this.redis.set(`throttle:block:${key}`, '1', 'EX', blockSeconds);
      return {
        totalHits,
        timeToExpire: expireTtl * 1000,
        isBlocked: true,
        timeToBlockExpire: blockSeconds * 1000,
      };
    }

    return {
      totalHits,
      timeToExpire: expireTtl * 1000,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
