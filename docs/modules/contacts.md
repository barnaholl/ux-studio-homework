# Contacts Module

## Overview

Full CRUD for contacts with soft-delete, cursor-based pagination, favourites, Redis version-based caching, and BullMQ-based purge scheduling.

## Files

| File | Role |
|------|------|
| `contacts.service.ts` | Business logic — findAll, findOne, create, update, remove, restore, addFavourite, removeFavourite, removeAvatar |
| `contacts.controller.ts` | HTTP routes |
| `contact-purge.processor.ts` | BullMQ processor — hard-deletes soft-deleted contacts after delay |
| `contacts.module.ts` | Module definition |
| `dto/` | CreateContactDto, UpdateContactDto |

## Endpoints

| Method | Route | Auth | Status | Description |
|--------|-------|------|--------|-------------|
| GET | `/contacts` | JWT | 200 | Paginated contact list |
| GET | `/contacts/:id` | JWT | 200 | Single contact |
| POST | `/contacts` | JWT | 201 | Create contact |
| PATCH | `/contacts/:id` | JWT | 200 | Update contact |
| DELETE | `/contacts/:id` | JWT | 200 | Soft-delete (schedules purge) |
| POST | `/contacts/:id/restore` | JWT | 200 | Restore soft-deleted contact |
| DELETE | `/contacts/:id/avatar` | JWT | 204 | Remove contact avatar |
| POST | `/contacts/:id/favourite` | JWT | 200 | Add to favourites |
| DELETE | `/contacts/:id/favourite` | JWT | 200 | Remove from favourites |

## Pagination

Cursor-based. Default `take` = 50 (`PAGE_SIZE`), max = 1000 (`MAX_TAKE`).

Response shape:
```json
{ "data": [...], "nextCursor": "cuid|null" }
```

`nextCursor` is the `id` of the last item in the page, passed as `cursor` in the next request.

## Caching

Redis version-based cache with TTL 300s.

Cache key:
```
contacts:{userId}:{version}:{search}:{cursor}:{take}:{favouritesOnly}:{sort}:{order}
```

Version stored at `contacts:version:{userId}`, incremented with `INCR` on any mutation (create, update, remove, restore, addFavourite, removeFavourite, removeAvatar).

## Soft-Delete + Purge

`remove()`:
1. Find contact (throw 404 if not found, wrong user, or already soft-deleted)
2. Set `deletedAt = now()` via `prisma.contact.update`
3. Schedule BullMQ purge job with `PURGE_DELAY_MS = 10_000` ms delay
4. Invalidate cache

Purge job (`contact-purge.processor.ts`):
- Deletes avatar S3 files for the contact
- `prisma.contact.delete({ where: { id } })`

## create() Validation

Throws `BadRequestException` if all of `name`, `phone`, and `email` are absent/empty. At least one must be provided.

`sortName` is computed as `(name ?? email ?? phone ?? '').toLowerCase()` for consistent sorting.

## Security Controls

- All queries filter by `userId` — users cannot access other users' contacts
- `findOne`, `update`, `remove` all check `deletedAt` — soft-deleted contacts return 404
- `LIST_SELECT` omits `deletedAt`, `sortName`, `userId`, `updatedAt` from responses

## Test Coverage

- `contacts.service.spec.ts`: findAll (cache hit, cache miss, invalidation), findOne (success, wrong user, soft-deleted), create (all fields, name-only, email-only, all-empty → BadRequest), update (success, not found, wrong user), remove (success, not found, wrong user, already soft-deleted, P2025 → NotFoundException, rethrow on other errors), addFavourite, removeFavourite, restore, removeAvatar
- `contacts.controller.spec.ts`: all endpoints delegating to service
