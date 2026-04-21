# Architecture Overview

---

## System Components

```
┌──────────────────────────────────────────────────────────────────────┐
│                            Browser                                   │
│                                                                      │
│   React 19 + Vite 8                                                  │
│   TanStack Query v5 (cache + optimistic updates)                     │
│   React Router v7 (SPA routing: /login, /)                           │
│   Framer Motion v12 (animations)                                     │
│   Tailwind CSS v4 (design tokens via CSS custom properties)          │
│   Axios (HTTP client with token refresh interceptor)                 │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                    REST  /api/v1  (HTTP + JSON)
                    Cookies: refresh_token (httpOnly)
                              │
┌─────────────────────────────▼────────────────────────────────────────┐
│                        NestJS 11 API                                 │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Auth    │  │ Contacts │  │  Avatar  │  │  Users   │              │
│  │ module   │  │ module   │  │ module   │  │ module   │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │             │             │             │                    │
│  ┌────▼─────────────▼─────────────▼─────────────▼────────────────┐   │
│  │              PrismaService (global)                           │   │
│  └───────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │              RedisModule (global, ioredis)                   │    │
│  └──────────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │              S3Module (global, AWS SDK v3)                   │    │
│  └──────────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │              ThrottlerModule (Redis-backed, APP_GUARD)       │    │
│  └──────────────────────────────────────────────────────────────┘    │
└────────────┬─────────────────────────┬───────────────────────────────┘
             │                         │
             ▼                         ▼
    ┌─────────────────┐      ┌─────────────────────────────────┐
    │   SQLite / PG   │      │  Redis 7                        │
    │                 │      │                                 │
    │  User           │      │  blacklist:{jti}         JWT    │
    │  Contact        │      │  contacts:version:{uid}  cache  │
    │  RefreshToken   │      │  contacts:{uid}:...      cache  │
    └─────────────────┘      │  avatar:staged:{uid}:{id} temp  │
                             │  avatar:staged:pending   set    │
                             │  throttle:{key}:{name}   rate   │
                             │  bull:* queues           BullMQ │
                             └──────────────┬──────────────────┘
                                            │ BullMQ
                                            ▼
                                   ┌─────────────────┐
                                   │  Workers        │
                                   │                 │
                                   │  AvatarProcessor│  → DigitalOcean Spaces
                                   │  ContactPurge   │  → Prisma hard-delete
                                   └─────────────────┘
```

---

## Module Responsibilities

| Module | Controller prefix | Key responsibilities |
|---|---|---|
| **Auth** | `/auth` | Register, login, refresh, logout; JWT + opaque refresh tokens |
| **Contacts** | `/contacts` | CRUD, soft-delete, restore, favourites, Redis caching |
| **Avatar** | `/avatars`, `/contacts/:id/avatar/commit`, `/users/me/avatar` | Staged upload pipeline (stage → commit), avatar cleanup |
| **Users** | `/users/me` | Profile read/update/delete, S3 cleanup on account deletion |
| **Redis** | — | Global `ioredis` client (shared across all modules) |
| **S3** | — | Thin AWS SDK v3 wrapper for DigitalOcean Spaces |
| **Throttler** | — | `APP_GUARD` applying rate limits; user-aware tracker |
| **Prisma** | — | Global `PrismaService` extending `PrismaClient` |
| **Logger** | — | Pino structured logging via `nestjs-pino` |

---

## Request Lifecycle — Authenticated API Call

```
1. Browser sends:
   GET /api/v1/contacts?search=alice&sortBy=name-asc
   Authorization: Bearer <access_token>

2. NestJS GlobalPrefix: api/v1
   ThrottlerGuard (APP_GUARD):
     - extracts req.user.sub (if JWT already decoded) or IP
     - checks Redis throttle:{sub}:{throttler} key
     - blocks with 429 if limit exceeded

3. JwtAuthGuard (applied to controller):
     - verifies JWT signature + expiry
     - checks Redis blacklist:{jti} → 401 if present
     - attaches JwtPayload to req.user

4. ContactsController.findAll(user, query):
     - delegates to ContactsService.findAll(userId, filters)

5. ContactsService.findAll:
     a. Build cache key:
        contacts:{userId}:{version}:{search}:{cursor}:{take}:{favOnly}:{sort}:{order}
        where version = INCR contacts:version:{userId}
     b. Redis GET cache key → cache HIT → return cached JSON
     c. Cache MISS:
        - prisma.contact.findMany({
            where: { userId, deletedAt: null, name: { contains: search } },
            orderBy: { sortName: 'asc' },
            take: take + 1,
            cursor: cursor ? { id: cursor } : undefined,
          })
        - compute nextCursor
        - Redis SET cache key (JSON) EX 300
        - return { data, nextCursor }

6. HttpExceptionFilter: formats any thrown HttpException as { message, statusCode }

7. Response: 200 { data: Contact[], nextCursor: string | null }
```

---

## Caching Strategy

The contacts list uses a **version-based cache invalidation** pattern rather than explicit key deletion. This avoids the distributed cache invalidation race condition where a mutation and a read race for the same key.

```
contacts:version:{userId}   →  integer (incremented on every mutation)

Cache key:
contacts:{userId}:{version}:{search}:{cursor}:{take}:{favouritesOnly}:{sort}:{order}
```

**On read**: fetch version from Redis, construct the full key, check for cached value.  
**On write** (create, update, delete, restore, toggle favourite, remove avatar): `INCR contacts:version:{userId}` atomically bumps the version. Old cache keys are now unreachable — they expire naturally after 300 s. No key deletion required.

This means the cache space grows proportionally to unique query variations within a 5-minute window. For a typical user this is a handful of keys. The natural TTL prevents unbounded growth.

---

## Avatar Pipeline

Two upload paths are supported:

### Staged path (default, recommended)

```
1. POST /avatars/stage (multipart)
   └── Validate magic bytes, resize → 40px + 120px WebP
   └── Upload to: avatars/{userId}/{stageId}-{40|120}.webp
   └── Redis SET avatar:staged:{userId}:{stageId} "1" EX 1800
   └── Return { stageId }

2. (user completes the contact/profile form and submits)

3. POST /contacts/:id/avatar/commit { stageId }
   └── Validate stageId in Redis
   └── Update contact.avatarUrl in DB
   └── Invalidate contacts cache
   └── Return { avatarUrl }
```

The upload happens in the background while the user fills in the form. By the time they submit, the images are already on S3. Commit is an instant DB update.

### Legacy BullMQ path

Used as fallback. Uploads the raw file to a temporary S3 key and enqueues a job. The `AvatarProcessor` worker downloads it, validates, resizes, uploads the final variants, updates the DB, and deletes the temp key.

---

## Database

SQLite in development, PostgreSQL in production. The switch is a single line in `schema.prisma`:

```prisma
// Dev
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }

// Prod — change provider only; all queries, migrations, and transactions work identically
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }
```

See [`database-schema.md`](database-schema.md) for the full ER diagram and table definitions.

See [ADR-003](decisions/ADR-003-sqlite-for-development.md) for the rationale.

---

## Authentication

Two-token strategy:

| Token | Lifetime | Storage | Revocation |
|---|---|---|---|
| Access (JWT, HS256) | 15 min | `localStorage` (client) | Redis blacklist on logout |
| Refresh (opaque, 96-char hex) | 7 days | `httpOnly` cookie | SQL `RefreshToken` row deleted on use; family revoked on reuse detection |

On every refresh, the old token hash is deleted and a new record is inserted in a single `$transaction`. If two concurrent requests race with the same token, one wins and the other gets `401`. Reuse of an already-rotated token triggers revocation of the entire family (`deleteMany({ familyId })`) — defending against stolen token replay.

See [`docs/modules/auth.md`](../modules/auth.md) for the full flow diagram.  
See [ADR-002](decisions/ADR-002-refresh-token-sql-table.md) for the storage decision.

---

## Frontend Architecture

```
src/
├── pages/
│   ├── AuthPage.tsx          Single page for login + register (mode toggle)
│   └── ContactsPage.tsx      Main app shell: list, search, sort, modals
│
├── contexts/
│   └── AuthContext.tsx        Global auth state; hydrates from JWT on mount
│
├── lib/
│   └── api.ts                 Axios instance with:
│                                - Authorization header injection
│                                - 401 → token refresh → retry (once)
│                                - refresh failure → logout
│
├── hooks/
│   ├── useContacts.ts         useContacts (infinite), useCreateContact,
│   │                          useUpdateContact, useDeleteContact,
│   │                          useRestoreContact, useToggleFavourite,
│   │                          useStageAvatar, useCommitAvatar
│   └── useUser.ts             useUpdateProfile, useDeleteProfile,
│                              useCommitUserAvatar, useRemoveUserAvatar
│
└── components/
    ├── contacts/              AddContactModal, EditContactModal, ContactForm,
    │                          ContactListItem, ContactListSkeleton
    ├── profile/               ProfileModal
    └── ui/                    Button, Input, Modal, Toast, Tooltip,
                               Avatar, Skeleton, ContextMenu, IconButton
```

TanStack Query is the single source of truth for server state. All mutations implement full optimistic update / rollback / settle cycles. The Axios interceptor handles token refresh transparently — callers never see a 401 from an expired access token.

---

## URL Routing & Proxy

The frontend Axios client uses short paths (`/api/*`, `/auth/*`, `/users/*`). Both the Vite dev server and the production nginx reverse proxy rewrite these before forwarding to the backend:

| Frontend calls | Proxy rewrites to | Backend listens at |
|---|---|---|
| `/api/contacts/…` | `/api/v1/contacts/…` | `api/v1` global prefix |
| `/api/avatars/stage` | `/api/v1/avatars/stage` | `api/v1` global prefix |
| `/auth/login` | `/api/v1/auth/login` | `api/v1` global prefix |
| `/users/me` | `/api/v1/users/me` | `api/v1` global prefix |

**Development** (`vite.config.ts`): uses Vite's built-in `server.proxy` to rewrite and forward to `http://localhost:3000`.  
**Production** (`nginx.conf`): uses nginx `rewrite` + `proxy_pass` to forward to the backend container.
