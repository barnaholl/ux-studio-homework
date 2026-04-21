# Auth Module

## Overview

Handles user registration, login, token refresh, and logout. Implements a two-token strategy: short-lived JWT access tokens and long-lived opaque refresh tokens with family-based rotation.

## Files

| File | Role |
|------|------|
| `auth.service.ts` | Core auth logic — register, login, refresh, logout, issueTokens |
| `auth.controller.ts` | HTTP routes — POST /auth/register, /auth/login, /auth/refresh, /auth/logout |
| `auth.module.ts` | Module definition, imports JwtModule, PassportModule |
| `strategies/` | Passport strategies (jwt, local) |
| `guards/` | JwtAuthGuard, LocalAuthGuard |
| `dto/` | RegisterDto, LoginDto |
| `decorators/` | @CurrentUser() |

## Token Design

### Access Token (JWT)
- **Expiry**: 15 minutes
- **Algorithm**: HS256
- **Payload**: `{ sub: userId, email, jti: UUID }`
- **Revocation**: Redis `blacklist:{jti}` key with TTL = remaining token lifetime

### Refresh Token (opaque)
- **Raw**: 48 random bytes as hex string (96 chars)
- **Stored**: SHA-256 hash of raw token (64 hex chars) in `RefreshToken` table
- **Expiry**: 7 days
- **Transport**: `httpOnly`, `sameSite: strict`, `path: /` cookie named `refresh_token`
- **Family**: Each login/register creates a new UUID `familyId`. Refresh carries it forward. Token reuse (known-stolen token) triggers `deleteMany({ familyId })` to revoke all tokens in the family.

## Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/auth/register` | None | Create account; returns access token + sets refresh cookie |
| POST | `/auth/login` | None | Authenticate; returns access token + sets refresh cookie |
| POST | `/auth/refresh` | Refresh cookie | Rotate refresh token; returns new access token |
| POST | `/auth/logout` | JWT | Blacklist access token jti; clear refresh cookie |

## refresh() Flow

```
1. Extract raw token from cookie
2. Hash raw token → SHA-256
3. Prisma transaction: findUnique(tokenHash)
   ├── not_found → return { status: 'not_found' } (cannot revoke — no familyId)
   ├── expired   → deleteMany({ familyId }) (revoke family) → return { status: 'expired' }
   └── ok        → delete old record → create new record (same familyId) → return { status: 'ok', ... }
4. not_found | expired → throw UnauthorizedException (clear cookie)
5. ok → issueTokens(user, familyId) → return access token
```

## Security Controls

- Passwords hashed with bcrypt (12 rounds)
- Anti-enumeration: `register` returns 409 only on unique constraint violation, not email lookup
- Refresh cookie: `httpOnly`, `secure` in production, `sameSite: strict`
- Refresh token reuse detection via familyId
- Access token revocation via Redis blacklist with exact TTL

## Test Coverage

- `auth.service.spec.ts`: 27 tests — register (conflict, success), login (not found, wrong password, success), refresh (not_found, expired → family revoke, ok + familyId carry-forward, family NOT revoked on not_found), logout (blacklist jti with correct TTL), issueTokens (raw hex 96 chars, stored hash 64 chars)
- `auth.controller.spec.ts`: 13 tests — register, login, refresh, logout, cookie shape, absent cookies → UnauthorizedException
