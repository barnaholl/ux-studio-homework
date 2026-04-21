# Prisma Module

## Overview

Wraps Prisma Client in a NestJS service with lifecycle management.

## Files

| File | Role |
|------|------|
| `prisma/prisma.service.ts` | Extends PrismaClient; connects on init, disconnects on destroy |
| `prisma/prisma.module.ts` | @Global() module exporting PrismaService |
| `prisma/schema.prisma` | Database schema |
| `prisma/migrations/` | Migration history |
| `prisma/seed*.ts` | Seed scripts |

## Schema

### User

| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| email | String | @unique |
| passwordHash | String | bcrypt 12 rounds |
| displayName | String? | |
| phone | String? | |
| avatarUrl | String? | CDN URL |
| theme | String | default "system" |
| createdAt | DateTime | |
| updatedAt | DateTime | @updatedAt |

Relations: `contacts[]`, `refreshTokens[]`

### Contact

| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| name | String? | |
| phone | String? | |
| email | String? | |
| sortName | String | default "" — computed as (name\|email\|phone).toLowerCase() |
| avatarUrl | String? | |
| isFavourite | Boolean | default false |
| createdAt | DateTime | |
| updatedAt | DateTime | @updatedAt |
| deletedAt | DateTime? | null = active; non-null = soft-deleted |
| userId | String | FK → User (cascade delete) |

Indexes:
- `@@index([userId, deletedAt, sortName])` — list queries sorted by name
- `@@index([userId, deletedAt, createdAt])` — list queries sorted by date

### RefreshToken

| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| tokenHash | String | @unique — SHA-256 hex of raw token |
| familyId | String | UUID; groups tokens in a rotation family |
| expiresAt | DateTime | |
| createdAt | DateTime | |
| userId | String | FK → User (cascade delete) |

Indexes: `@@index([userId])`, `@@index([familyId])`

## Database

Development/test: SQLite (`file:./dev.db`). E2E tests use isolated databases:
- `app.e2e-spec.ts` → `test.db`
- `contacts.e2e-spec.ts` → `test-contacts.db`

Production target: PostgreSQL (migration-compatible).

## Usage

`PrismaModule` is `@Global()`, so it does not need to be imported in each feature module.
