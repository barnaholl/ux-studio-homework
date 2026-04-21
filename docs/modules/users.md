# Users Module

## Overview

Manages the authenticated user's own profile. All endpoints require a valid JWT access token.

## Files

| File | Role |
|------|------|
| `users.service.ts` | findMe, updateMe, updateAvatar, deleteMe |
| `users.controller.ts` | GET/PATCH/DELETE /users/me |
| `users.module.ts` | Module definition |
| `dto/` | UpdateUserDto |

## Field Projection

`USER_SELECT` is a Prisma select object that returns all profile fields **except** `passwordHash`:

```
id, email, displayName, phone, avatarUrl, theme, createdAt, updatedAt
```

## Endpoints

| Method | Route | Auth | Status | Description |
|--------|-------|------|--------|-------------|
| GET | `/users/me` | JWT | 200 | Return own profile |
| PATCH | `/users/me` | JWT | 200 | Update profile fields |
| DELETE | `/users/me` | JWT | 204 | Delete account (cascade) |

Avatar endpoints for users are handled by the Avatar module (`POST /avatars/stage`, `POST /users/me/avatar/commit`).

## deleteMe() Flow

```
1. Find user by ID (throw NotFoundException if not found)
2. List S3 objects under: avatars/contacts/{userId}, avatars/users/{userId}, avatars/tmp/{userId}
3. Delete each object in parallel (fire-and-forget)
4. prisma.user.delete({ where: { id } })
   └── Cascades: deletes all Contacts and RefreshTokens
```

## Security Controls

- `passwordHash` never returned in any response
- All user operations require authenticated user ID from JWT
- Cascade delete ensures no orphaned data remains

## Test Coverage

- `users.service.spec.ts`: findMe (success, not found), updateMe (success, not found), updateAvatar (sets avatarUrl), deleteMe (cleans S3 + hard-deletes, not found, S3 prefix empty → no S3 delete)
- `users.controller.spec.ts`: findMe, updateMe, deleteMe (calls service with userId)
