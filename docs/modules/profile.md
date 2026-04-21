# Profile

**File**: `frontend/src/components/profile/ProfileModal.tsx`

Allows the authenticated user to update their display name, phone number, and avatar, or permanently delete their account.

---

## Opening behaviour

When `isOpen` changes from `false` to `true`, `useEffect` calls `reset(defaultValues)` to populate the form with the current user's data. This ensures stale input values from a previous session are discarded.

---

## Form

Built with **React Hook Form v7** + **Zod v4**.

| Field | Validation |
|---|---|
| `displayName` | `z.string().min(1)` |
| `phone` | Optional string |

Email is displayed read-only (cannot be changed via this form).

---

## Avatar flow

Mirrors the contact avatar flow:

### Change avatar
1. User clicks the avatar area → hidden `<input type="file">` is triggered.
2. `onChange`: `setAvatarFile(file)` for local preview + `stageAvatar.mutateAsync(file)` fires immediately.
3. On form submit: if `stagedPath` is set, `useCommitUserAvatar` is called → `POST /users/me/avatar/commit { stagedPath }`.
4. On success: `refreshUser()` syncs the global auth state.

### Remove avatar
1. User clicks "Remove avatar" button → `setAvatarRemoved(true)`.
2. On form submit: if `avatarRemoved` is set, `useRemoveUserAvatar` is called → `DELETE /users/me/avatar`.
3. On success: `refreshUser()`.

---

## Save flow

```
handleSubmit(formData):
  1. updateProfile.mutateAsync(formData)   → PATCH /users/me
  2. if (stagedPath):
       commitUserAvatar.mutateAsync({ stagedPath })
  3. else if (avatarRemoved):
       removeUserAvatar.mutateAsync()
  4. refreshUser()
  5. onClose()
```

---

## Delete account (two-step confirm)

To prevent accidental deletion, the UI uses a two-step confirmation:

1. **Step 1** — User clicks "Delete account" → `confirmDelete` state set to `true`; destructive confirm + cancel buttons appear.
2. **Step 2** — User clicks "Yes, delete" → `useDeleteProfile.mutateAsync()` → `DELETE /users/me` → on success `logout()` is called, redirecting to login.

Clicking "Cancel" in step 2 resets `confirmDelete` to `false`.

---

## Hooks used

| Hook | Action |
|---|---|
| `useUpdateProfile` | `PATCH /users/me` |
| `useStageAvatar` (re-exported from `useUser`) | `POST /avatar/stage` |
| `useCommitUserAvatar` | `POST /users/me/avatar/commit` |
| `useRemoveUserAvatar` | `DELETE /users/me/avatar` |
| `useDeleteProfile` | `DELETE /users/me` |

---

## `data-testid` attributes

| Selector | Element |
|---|---|
| `[data-testid="profile-form"]` | Profile `<form>` |
| `[data-testid="profile-avatar-change-btn"]` | Avatar change button |
| `[data-testid="profile-avatar-remove-btn"]` | Avatar remove button |
| `[data-testid="profile-avatar-file-input"]` | Hidden file `<input>` |
| `[data-testid="profile-display-name-input"]` | Display name `<input>` |
| `[data-testid="profile-phone-input"]` | Phone `<input>` |
| `[data-testid="profile-email-input"]` | Email `<input>` (read-only) |
| `[data-testid="profile-delete-account-btn"]` | Delete account trigger (step 1) |
| `[data-testid="profile-delete-confirm-btn"]` | Confirm delete (step 2) |
| `[data-testid="profile-delete-cancel-btn"]` | Cancel delete (step 2) |
| `[data-testid="profile-cancel-btn"]` | Cancel / close modal |
| `[data-testid="profile-save-btn"]` | Save profile button |
