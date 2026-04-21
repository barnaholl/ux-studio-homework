# Contacts App

A full-stack contact management application built as a realistic production-grade demo. It covers the full CRUD lifecycle - add, edit, delete with undo, avatar upload, favourites, search and sort — with a NestJS API, React 19 frontend, and a solid test suite across unit, integration, and E2E layers.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)
- [Design Decisions](#design-decisions)
- [Trade-offs & Scaling Notes](#trade-offs--scaling-notes)
- [Deeper Documentation](#deeper-documentation)

---

## Features

| Feature | Detail |
|---|---|
| **Add contact** | Name, phone, email, and avatar — any combination valid, including avatar only. Appears instantly via optimistic UI. |
| **Edit contact** | Change any field. Save button disabled until a real change is detected. |
| **Delete with undo** | Soft-delete with a 5-second undo toast; hard-delete is scheduled via BullMQ after the window closes. |
| **Avatar upload** | Async two-step pipeline: `POST /avatars/stage` returns a `stageId` in ~10 ms while a BullMQ worker resizes (40 px + 120 px WebP) and uploads to S3 in the background. Commit is a single DB write once processing completes. |
| **Favourites** | Toggle via context menu; filter list to starred contacts only. |
| **Search** | Debounced (300 ms), server-side filter via `sortName` index. |
| **Sort** | Newest / oldest / A→Z / Z→A, all server-side via composite indexes. |
| **Infinite scroll** | Cursor-based pagination; next page loads automatically as the sentinel enters the viewport. |
| **Profile** | Update display name, phone, avatar; or permanently delete the account (two-step confirm). |
| **Auth** | JWT access tokens (15 min) + opaque refresh tokens (7 days) with single-use rotation and family-based theft detection. |
| **Dark / light mode** | Manual toggle persisted in `localStorage`. |
| **Responsive** | Desktop two-panel layout, mobile single-column with FAB. |
| **Accessible** | Keyboard navigation on the contact list, focus traps in modals, `aria-live` announcements. |

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend framework | React | 19 |
| Build tool | Vite | 8 |
| Language | TypeScript | 6 |
| Styling | Tailwind CSS | 4 |
| Animations | Framer Motion | 12 |
| Data fetching | TanStack Query (optimistic CRUD) | 5 |
| Forms | React Hook Form + Zod | 7 / 4 |
| Backend framework | NestJS | 11 |
| ORM | Prisma | 5 |
| Database (dev) | SQLite | — |
| Queue | BullMQ + Redis | 5 / 7 |
| Image processing | Sharp (WebP resize, two sizes) | 0.34 |
| Object storage | DigitalOcean Spaces (AWS SDK v3) | 3 |
| Structured logging | nestjs-pino | 4 |
| Rate limiting | @nestjs/throttler + Redis storage | 6 |
| Frontend tests | Vitest + Testing Library | 4 |
| Backend tests | Jest + Supertest | 30 |

---

## Architecture

```
┌─────────────────────────────────┐
│          Browser (React)        │
│  TanStack Query · React Router  │
│  Framer Motion · Tailwind CSS   │
└──────────────┬──────────────────┘
               │ HTTP (axios)  REST /api/v1
               ▼
┌─────────────────────────────────┐
│         NestJS API              │
│  Auth · Contacts · Avatar       │
│  Users · Throttler              │
└────┬─────────────┬──────────────┘
     │             │
     ▼             ▼
┌─────────┐  ┌────────────────────┐
│ SQLite  │  │  Redis 7           │
│ (Prisma)│  │  · JWT blacklist   │
│         │  │  · contacts cache  │
│ Users   │  │  · staged avatars  │
│Contacts │  │  · rate limit      │
│Tokens   │  │  · BullMQ queues   │
└─────────┘  └────────────────────┘
                      │
                      ▼ BullMQ worker
             ┌────────────────────┐
             │  DigitalOcean      │
             │  Spaces (S3)       │
             │  WebP 40px/120px   │
             └────────────────────┘
```

See [`docs/architecture/overview.md`](docs/architecture/overview.md) for a detailed breakdown of every component, caching strategy, and the request lifecycle.

---

## Prerequisites

**Minimum (SQLite, no cloud storage):**
- Node.js ≥ 20
- npm ≥ 10
- Docker (for Redis) or a local Redis 7 install

**Full (with avatar uploads):**
- All of the above, plus an S3-compatible bucket (DigitalOcean Spaces, MinIO, AWS S3)

---

## Environment Variables

### Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` before the first run.

| Variable | Required | Example | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | `file:./dev.db` | SQLite file path (relative to `backend/`). Resolves to `backend/prisma/dev.db`. |
| `JWT_SECRET` | Yes | *(random string)* | Signs JWT access tokens. Use a strong value in production. |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Full Redis connection URL. Used by BullMQ and ioredis. |
| `REDIS_HOST` | Yes | `localhost` | Redis hostname (used by ThrottlerModule separately). |
| `REDIS_PORT` | Yes | `6379` | Redis port. |
| `PORT` | No | `3000` | Port the NestJS server listens on. |
| `NODE_ENV` | No | `development` | `production` enables the JWT_SECRET startup guard. |
| `LOG_LEVEL` | No | `debug` | Pino log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`. |
| `CORS_ORIGINS` | No | `http://localhost:5173` | Comma-separated allowed origins. |
| `DO_SPACES_REGION` | No* | `ams3` | DigitalOcean Spaces region. |
| `DO_SPACES_ENDPOINT` | No* | `https://ams3.digitaloceanspaces.com` | Spaces endpoint URL. |
| `DO_SPACES_BUCKET` | No* | `my-bucket` | Bucket name. |
| `DO_SPACES_KEY` | No* | *(access key)* | DO API access key. |
| `DO_SPACES_SECRET` | No* | *(secret key)* | DO API secret key. |

> \* Avatar upload endpoints return 500 when S3 credentials are absent. All other features work without them.

### Frontend (`frontend/.env`)

| Variable | Required | Example | Description |
|---|---|---|---|
| `VITE_API_URL` | Yes | `http://localhost:3000` | Backend base URL. No trailing slash. The Vite dev proxy rewrites `/api/*`, `/auth/*`, `/users/*` to add the `/api/v1` prefix before forwarding here. |

---

## Local Setup

Two paths are available: **Docker Compose** (closest to production) or **native Node.js** (faster iteration).

### Option A — Docker Compose

Builds and starts all three services (Redis, backend, frontend) with a single command:

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend (nginx) | http://localhost |
| Backend API | http://localhost:3000 |
| Swagger UI | http://localhost:3000/api/docs |

> The Docker setup uses `docker-dev-secret-change-in-prod` as `JWT_SECRET`. Override it by setting `JWT_SECRET` in `backend/.env` before building.

> **Demo note:** DigitalOcean Spaces credentials are already set in `docker-compose.yml` so avatar uploads work out of the box. These credentials are intentionally included for the review period and will be revoked afterwards.

---

### Option B — Native Node.js

#### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/contacts-app.git
cd contacts-app
npm install --prefix backend
npm install --prefix frontend
```

#### 2. Start Redis

```bash
docker compose up -d redis
```

#### 3. Configure environment variables

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and set the required variables:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | `file:./dev.db` (default; resolves to `backend/prisma/dev.db`) |
| `JWT_SECRET` | Yes | Any random string for local dev |
| `REDIS_URL` | Yes | `redis://localhost:6379` |
| `DO_SPACES_KEY` | No* | Leave empty to skip avatar uploads |
| `DO_SPACES_SECRET` | No* | |
| `DO_SPACES_BUCKET` | No* | |
| `DO_SPACES_REGION` | No* | Default: `ams3` |

> *Avatar upload endpoints return 500 when S3 is not configured. All other features work without it.

> **Demo note:** DigitalOcean Spaces credentials are included in `docker-compose.yml` for the review period. To enable avatar uploads in native mode, copy those values into the corresponding `DO_SPACES_*` fields in your `backend/.env`.

The frontend reads a single variable:

```bash
# frontend/.env
VITE_API_URL=http://localhost:3000
```

#### 4. Set up the database

```bash
cd backend
npx prisma migrate dev
npx prisma db seed          # seeds 5 realistic contacts (Figma design data)
```

For a large dataset to test pagination and scroll:

```bash
npm run seed:large          # generates 5 000 contacts via @faker-js/faker
```

#### 5. Start the servers

```bash
# Terminal 1 — backend (http://localhost:3000)
npm run dev:backend

# Terminal 2 — frontend (http://localhost:5173)
npm run dev:frontend
```

Swagger UI is available at `http://localhost:3000/api/docs` while the backend is running.

---

## Running Tests

### Backend unit tests

```bash
npm run test:backend          # run all 145 unit tests
npm run test:backend:cov      # with coverage report
```

### Backend E2E tests

The backend E2E suite runs against a real SQLite + Redis stack. Requires Redis to be running.

```bash
cd backend
npm run test:e2e              # 115 tests across all controllers
```

### Frontend component tests

```bash
cd frontend
npm test                      # Vitest, 104 tests across 10 suites
```

---

## Project Structure

```
contacts-app/
├── backend/                  # NestJS API
│   ├── src/
│   │   ├── auth/             # JWT + refresh token auth
│   │   ├── avatar/           # Staged upload pipeline (Sharp resize, S3, Redis staging)
│   │   ├── contacts/         # CRUD, soft-delete, favourites, caching
│   │   ├── users/            # Profile management
│   │   ├── redis/            # Global ioredis client
│   │   ├── s3/               # AWS SDK v3 wrapper
│   │   ├── throttler/        # Redis-backed rate limiter
│   │   ├── prisma/           # PrismaService
│   │   ├── filters/          # Global HTTP exception filter
│   │   └── logger/           # Pino structured logging
│   ├── prisma/
│   │   ├── schema.prisma     # DB schema (User, Contact, RefreshToken)
│   │   ├── seed.ts           # Figma seed (5 contacts)
│   │   ├── seed-large.ts     # Faker seed (5 000 contacts)
│   │   └── migrations/       # Prisma migration history
│   └── test/                 # Supertest E2E specs
├── frontend/                 # React 19 + Vite SPA
│   └── src/
│       ├── pages/            # AuthPage, ContactsPage
│       ├── components/
│       │   ├── contacts/     # AddContactModal, EditContactModal, ContactForm, ContactListItem
│       │   ├── profile/      # ProfileModal
│       │   └── ui/           # Design system primitives (Button, Input, Modal, Toast, etc.)
│       ├── contexts/         # AuthContext (token storage, hydration, refresh)
│       ├── hooks/            # TanStack Query mutations/queries (useContacts, useUser)
│       ├── lib/              # Axios instance (interceptors, token refresh)
│       └── types/            # Shared TypeScript types
├── e2e/                      # Playwright test suite
│   ├── specs/                # Test files (auth, contacts, avatar, profile, …)
│   ├── pages/                # Page Object Models
│   ├── helpers/              # Shared test utilities
│   └── playwright.config.ts
├── docs/
│   ├── architecture/         # System overview, DB schema, ADRs
│   ├── modules/              # Per-module deep-dives
│   └── api-reference.md      # Full REST API reference
└── docker-compose.yml
```

---

## Design Decisions

### Contact form, any single field is enough

The form has no individually required fields. A contact is valid as long as at least one of name, phone, email, or avatar is present. This mirrors how Apple Contacts works — you might save a phone number from a missed call, or an email from a newsletter, and fill in the rest later. The contact list item falls back through `name → email → phone → "No name"` for the primary display line so every record stays identifiable.

### Two-step async avatar upload

When a user selects an image, `POST /avatars/stage` runs immediately. It validates the file by magic bytes (not just the MIME header declared by the browser), writes the raw buffer to a temp file on disk, sets a Redis key `avatar:staged:{userId}:{stageId}` to `pending`, and enqueues a BullMQ job — all in well under 100 ms. It then returns `{ stageId }` to the frontend while the heavy work happens in the background.

The BullMQ worker (`AvatarProcessor`) picks up the job, reads the temp file, resizes to 40 px and 120 px WebP variants via Sharp, uploads both to S3, then flips the Redis key from `pending` to `1`. The temp file is deleted only on success so that BullMQ retries (up to 3 attempts with exponential backoff) can re-read it if S3 is temporarily unavailable.

When the form is submitted, the contact record is saved first, then `POST /contacts/:id/avatar/commit { stageId }` is called. The commit endpoint checks the Redis key: `pending` → 400 "still processing"; missing → 400 "expired"; `1` → DB write and cleanup. From the user's perspective, hitting Save never blocks on image processing: the resize and S3 upload have already been running in the background while they filled in the rest of the form.

This two-phase design also decouples the avatar from the contact save. If the form save fails, the staged images are already in S3 and can be committed on retry. If the avatar commit fails, the contact is still saved and the UI shows a specific "avatar upload failed" toast rather than rolling back the whole form. Orphaned staged images (where the user closed the modal after selecting an image but before submitting) are cleaned up by a scheduled cron job that scans the `avatar:staged:pending` Redis sorted set for entries older than 30 minutes.

### Soft-delete with a 5-second undo window

Deleting a contact sets `deletedAt` and schedules a BullMQ job to hard-delete after 10 seconds. The frontend shows an undo toast during that window. If undo is clicked, a `POST /contacts/:id/restore` call cancels the scheduled purge. Once the job runs, the S3 avatar files are removed before the DB row is deleted.

### Optimistic UI throughout

Every mutation — create, update, delete, toggle favourite — updates the TanStack Query cache immediately before the API call resolves. On error the cache is rolled back to the pre-mutation snapshot. This keeps interactions feeling instantaneous even on slow connections.

### Token architecture: JWT for access, SQL for refresh

Access tokens are stateless and only need revocation on logout, so they are tracked in Redis via a blacklist:{jti} key with TTL equal to the remaining token lifetime, allowing fast lookups and automatic expiry with no cleanup, while refresh tokens require durability, atomic rotation, and user-scoped revocation, so they are stored as SHA-256 hashes in a SQLite RefreshToken table, enabling safe single-use rotation inside a transaction, proper expiry enforcement, and efficient “log out all devices” via userId

### Favourite state: boolean column instead of a join table

The original schema modeled favourites using a separate Favourite join table, which is the standard approach for many-to-many relationships where multiple users can favourite the same entity, but in this system contacts are belongs to exactly one user via userId and is never shared, so this was replaced with a simple isFavourite BOOLEAN NOT NULL DEFAULT false column on Contact, reducing both read and write complexity, since queries no longer require a LEFT JOIN and filtering becomes a straightforward WHERE isFavourite = true, while toggling the state is a single atomic UPDATE scoped by id, userId, and deletedAt.


### Database strategy

The application requires a relational database for core flows like refresh token rotation, so SQLite is used as the default for development due to its zero-setup, single-file nature (file:./prisma/dev.db), allowing any developer or reviewer to get the system running instantly without Docker or external services, while Prisma ensures all queries remain dialect-agnostic; the schema is intentionally written so switching to PostgreSQL in production is a one-line change.

---

## Deeper Documentation

| Document | Contents |
|---|---|
| [`docs/architecture/overview.md`](docs/architecture/overview.md) | System components, request lifecycle, caching strategy |
| [`docs/architecture/database-schema.md`](docs/architecture/database-schema.md) | ER diagram, table definitions, indexes |
| [`docs/architecture/decisions/`](docs/architecture/decisions/) | Architecture Decision Records (ADR-001 through ADR-005) |
| [`docs/modules/auth.md`](docs/modules/auth.md) | JWT strategy, refresh token family rotation, security controls |
| [`docs/modules/contacts.md`](docs/modules/contacts.md) | CRUD, soft-delete, caching, BullMQ purge |
| [`docs/modules/avatar-pipeline.md`](docs/modules/avatar-pipeline.md) | Staged upload path, legacy BullMQ path, S3 key structure |
| [`docs/modules/users.md`](docs/modules/users.md) | Profile CRUD, account deletion, S3 cleanup |
| [`docs/modules/auth-pages.md`](docs/modules/auth-pages.md) | Frontend AuthPage, AuthContext, Axios interceptors |
| [`docs/modules/contacts-page.md`](docs/modules/contacts-page.md) | Contacts page layout, search, sort, infinite scroll, keyboard nav |
| [`docs/modules/contacts-flows.md`](docs/modules/contacts-flows.md) | Add / edit / delete flow diagrams |
| [`docs/modules/profile.md`](docs/modules/profile.md) | Profile modal, avatar change/remove, account deletion |
| [`docs/modules/hooks.md`](docs/modules/hooks.md) | All TanStack Query hooks with optimistic update details |
| [`docs/modules/design-system.md`](docs/modules/design-system.md) | UI primitives, CSS tokens, component prop tables |
| [`docs/modules/redis.md`](docs/modules/redis.md) | Redis key inventory, TTLs, BullMQ setup |
| [`docs/modules/throttling.md`](docs/modules/throttling.md) | Rate limiting, user-aware tracker, Redis storage adapter |
| [`docs/modules/s3.md`](docs/modules/s3.md) | S3Service wrapper, configuration, key structure |
| [`docs/modules/prisma.md`](docs/modules/prisma.md) | PrismaService, schema summary, seed scripts |
