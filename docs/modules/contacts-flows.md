# Contacts Flows

Detailed flow diagrams for the three main contact mutation flows: **Add**, **Edit**, and **Delete**.

---

## Add Flow

**Components involved**: `ContactsPage` → `AddContactModal` → `ContactForm`  
**Hooks involved**: `useStageAvatar`, `useCreateContact`, `useCommitAvatar`

### Step-by-step

```
User clicks "Add contact" button / FAB
  └─▶ AddContactModal opens (isOpen=true)
        └─▶ ContactForm renders with empty defaults

User selects an avatar file
  └─▶ ContactForm: onChange on <input type="file">
        └─▶ setAvatarFile(file)           ← local preview via URL.createObjectURL
        └─▶ stageAvatar.mutateAsync(file) ← fired immediately (fire-and-forget)
              └─▶ POST /avatars/stage (multipart)
              └─▶ returns { stageId }
              └─▶ stageId stored in AddContactModal via stagingPromise ref

User submits the form
  └─▶ ContactForm calls onSubmit(formData)
  └─▶ AddContactModal.handleSubmit:
        1. createContact.mutateAsync(formData)
             └─▶ POST /contacts (optimistic: temp id inserted in cache)
             └─▶ returns { id: newContactId }
        2. if (stageId):
             commitAvatar.mutateAsync({ contactId: newContactId, stageId })
               └─▶ POST /contacts/:id/avatar/commit { stageId }
               └─▶ DB updated with final avatarUrl
        3. addToast({ message: 'Contact added', type: 'success' })
        4. onClose() → modal closes

On error at any step:
  └─▶ addToast({ message: error.message, type: 'error' })
  └─▶ optimistic snapshot restored by useCreateContact.onError
```

### Avatar staging detail

Staging fires **before** the form is submitted so the upload latency is hidden. If the user cancels the modal, the staged S3 object is abandoned (the backend has a nightly cleanup job for orphaned staged objects).

---

## Edit Flow

**Components involved**: `ContactsPage` → `EditContactModal` → `ContactForm`  
**Hooks involved**: `useStageAvatar`, `useUpdateContact`, `useCommitAvatar`, `useDeleteContact` (for avatar removal)

### Step-by-step

```
User clicks a contact row / "Edit" in context menu
  └─▶ setEditContact(contact) → EditContactModal opens

EditContactModal:
  └─▶ ContactForm renders with defaultValues populated from contact
  └─▶ existingAvatar = contact.avatarUrl (shows current avatar thumbnail)

User optionally changes avatar:
  ├─ Select new file:
  │    └─▶ stageAvatar.mutateAsync(file) → stores Promise in stagingPromise ref
  └─ Remove existing:
       └─▶ avatarFile set to null  ← flag; no API call yet

User submits:
  └─▶ EditContactModal.handleSubmit:
        1. updateContact.mutateAsync({ id, ...formData })
             └─▶ PATCH /contacts/:id (optimistic: cache updated immediately)
        2a. if (stagingPromise resolves to stageId):
              commitAvatar.mutateAsync({ contactId: id, stageId })
        2b. else if (avatarFile === null):
              DELETE /contacts/:id/avatar  ← clears avatarUrl in DB
        3. onClose() → modal closes, cache invalidated
```

### Form dirty guard

The `ContactForm` submit button is enabled only when:

```ts
isDirty || avatarFile !== null || avatarRemoved
```

This prevents a no-op submit when the user opens the edit form and immediately clicks save.

---

## Delete Flow

**Components involved**: `ContactsPage`  
**Hooks involved**: `useDeleteContact`, `useRestoreContact`

### Step-by-step

```
User clicks "Delete" in context menu
  └─▶ deleteContact.mutate(contactId)
        └─▶ onMutate: contact removed from cache immediately (optimistic)
        └─▶ DELETE /contacts/:id
        └─▶ onSettled: invalidate contacts query

Simultaneously:
  └─▶ addToast({
        message: 'Contact deleted',
        type: 'success',
        duration: 5000,
        undoAction: () => restoreContact.mutate(contactId),
      })

If user clicks "Undo" within 5 seconds:
  └─▶ restoreContact.mutate(contactId)
        └─▶ POST /contacts/:id/restore
        └─▶ Contact re-appears in list
        └─▶ Toast dismissed

If user does not undo:
  └─▶ Toast auto-dismisses; deletion is permanent
  └─▶ Backend purge job hard-deletes the record after the soft-delete grace period
```

### 404 handling

`useDeleteContact` treats a **404** response as success — the contact is already gone (e.g. deleted from another session), so there is no need to surface an error to the user.
