# React Query Hooks

All TanStack Query v5 hooks used by the frontend. Split across two files.

---

## `useContacts.ts`

**File**: `frontend/src/hooks/useContacts.ts`

### Constants

```ts
const PAGE_SIZE = 50;
```

### `buildQueryKey(filters)`

Builds a stable TanStack Query key array from the active filter set (`search`, `sortBy`, `favouritesOnly`). Used by all contact mutations to target the correct cache entries for invalidation / optimistic updates.

---

### `useContacts(filters)`

Infinite scroll via `useInfiniteQuery`.

- **Cursor-based pagination**: each page response includes a `nextCursor`; `getNextPageParam` returns it (or `undefined` to stop).
- **`queryFn`**: calls `GET /contacts?search=…&sortBy=…&favouritesOnly=…&cursor=…&limit=50`.
- **`staleTime`**: 30 seconds — avoids redundant refetches during rapid navigation.

---

### `useContact(id)`

Fetches a single contact by ID. Used by `EditContactModal` to get fresh data before opening the form.

---

### `useCreateContact(filters)`

Mutation: `POST /contacts`.

**Optimistic behaviour**:
1. `onMutate`: generates a temporary `id` (negative timestamp), inserts the new contact at the top of the infinite query cache (snapshot stored for rollback).
2. `onError`: restores the snapshot.
3. `onSettled`: invalidates the contacts query so the server data replaces the optimistic entry.

---

### `useUpdateContact(filters)`

Mutation: `PATCH /contacts/:id`.

**Optimistic behaviour**:
1. `onMutate`: applies the patch to the matching contact in every page of the infinite cache.
2. `onError`: restores the snapshot.
3. `onSettled`: invalidates the contacts query.

---

### `useDeleteContact(filters)`

Mutation: `DELETE /contacts/:id`.

- Treats **404** as success (contact already gone).
- Removes the contact from the local cache immediately on `onMutate`.
- `onSettled`: invalidates.

---

### `useRestoreContact(filters)`

Mutation: `POST /contacts/:id/restore`.

Used by the undo action in the delete toast. On success, re-inserts the contact and invalidates.

---

### `useToggleFavourite(filters)`

Mutation: `PATCH /contacts/:id` with `{ favourite: !current }`.

**Optimistic behaviour**: flips `favourite` in the cached contact immediately; rolls back on error.

---

### `useStageAvatar()`

Mutation: `POST /avatars/stage` with `multipart/form-data`.

- `retry: 2` — retries up to twice on network failure.
- Returns `{ stageId: string }` — used by the commit endpoints.
- Called immediately when the user selects a file in `ContactForm` or `ProfileModal` (fire-and-forget; the `stageId` is stored in component state).

---

### `useCommitAvatar()`

Mutation: `POST /contacts/:id/avatar/commit` with `{ stageId }`.

Finalises the staged avatar for a contact. Called after `createContact` or `updateContact` succeeds.

---

## `useUser.ts`

**File**: `frontend/src/hooks/useUser.ts`

Re-exports `useStageAvatar` from `useContacts.ts` for use in `ProfileModal`.

---

### `useUpdateProfile()`

Mutation: `PATCH /users/me` with profile fields (`displayName`, `phone`).

On success calls `refreshUser()` from `AuthContext` to sync the global user state.

---

### `useCommitUserAvatar()`

Mutation: `POST /users/me/avatar/commit` with `{ stageId }`.

Commits a staged avatar for the authenticated user's profile. On success calls `refreshUser()`.

---

### `useRemoveUserAvatar()`

Mutation: `DELETE /users/me/avatar`.

Removes the user's avatar. On success calls `refreshUser()`.

---

### `useDeleteProfile()`

Mutation: `DELETE /users/me`.

Permanently deletes the user account and all associated data (contacts, avatars). On success calls `logout()` from `AuthContext`, redirecting to the login page.
