# Redis Module

## Overview

Global Redis client module using `ioredis`. Provides a single Redis connection shared across auth (token blacklist/refresh), avatar (staged keys), contacts (version cache), and throttling.

## Files

| File | Role |
|------|------|
| `redis/redis.module.ts` | @Global() module, injection token, lifecycle management |

## Configuration

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Connection URL (e.g. `redis://localhost:6379`) |

## Injection Token

```ts
export const REDIS_CLIENT = 'REDIS_CLIENT';
```

Inject with:
```ts
@Inject(REDIS_CLIENT) private readonly redis: Redis
```

## Client Options

```ts
new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,  // Required for BullMQ compatibility
})
```

`maxRetriesPerRequest: null` prevents ioredis from throwing on blocked commands and is required when Redis is also used by BullMQ.

## Lifecycle

`onModuleDestroy` calls `redis.quit()` to cleanly close the connection on application shutdown.

## Usage by Module

| Module | Keys Used | TTL |
|--------|-----------|-----|
| Auth | `blacklist:{jti}` | Remaining access token lifetime |
| Avatar | `avatar:staged:{userId}:{stageId}` | 1800s (30 min) |
| Avatar | `avatar:staged:pending` (sorted set) | No TTL (managed by cleanup service) |
| Contacts | `contacts:version:{userId}` | No TTL |
| Contacts | `contacts:{userId}:{version}:...` | 300s (cache entries) |
| Throttler | `throttle:{key}:{throttler}` | Per-window TTL |
| Throttler | `throttle:block:{key}:{throttler}` | Block duration |
