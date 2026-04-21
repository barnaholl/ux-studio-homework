# Throttling Module

## Overview

Rate limiting using `@nestjs/throttler` with a Redis-backed storage adapter. The guard is registered as a global `APP_GUARD` and identifies users by their JWT `sub` claim (authenticated) or IP address (anonymous).

## Files

| File | Role |
|------|------|
| `user-aware-throttler.guard.ts` | Extends ThrottlerGuard; overrides `getTracker()` |
| `redis-throttler.storage.ts` | Implements ThrottlerStorage using Redis |
| `throttler/` | Module registered in AppModule |

## UserAwareThrottlerGuard

Overrides `getTracker(req)`:

```
1. If req.user?.sub exists → return 'user:{sub}'
2. Else if IP available    → return IP address
3. Else                    → return 'unknown'
```

This ensures authenticated users share a rate limit bucket across IPs (prevents limit bypass by changing IP).

## RedisThrottlerStorage

Implements `ThrottlerStorage` with two Redis keys per tracker+throttler combination:

| Key pattern | Value | Description |
|-------------|-------|-------------|
| `throttle:{key}:{throttler}` | hit count | Incremented per request; EX = TTL |
| `throttle:block:{key}:{throttler}` | `'1'` | Set when `totalHits >= limit`; EX = blockDuration |

`increment()` returns `{ totalHits, timeToExpire, isBlocked, timeToBlockExpire }`.

## Test Override Pattern

In unit and e2e tests, override the ThrottlerStorage provider to bypass rate limiting:

```ts
.overrideProvider(ThrottlerStorage)
.useValue({
  increment: async () => ({
    totalHits: 1,
    timeToExpire: 60000,
    isBlocked: false,
    timeToBlockExpire: 0,
  }),
})
```

## Test Coverage

- `user-aware-throttler.guard.spec.ts`: user.sub → `user:{id}`, no user → IP, no IP → `'unknown'`, user without sub → IP
- `redis-throttler.storage.spec.ts`: first hit, already blocked, hits exceed limit → block key set
