# Avatar Pipeline Module

## Overview

Single-path staged avatar upload pipeline. All images are validated by magic bytes, resized to two WebP variants, and stored in S3 (DigitalOcean Spaces).

## Files

| File | Role |
|------|------|
| `avatar.service.ts` | stageAvatar, commitContactAvatar, commitUserAvatar, removeUserAvatar, deleteAvatarFiles, deleteAvatarByUrl |
| `avatar.controller.ts` | HTTP routes: stage, commit (contact + user), delete user avatar |
| `avatar.module.ts` | Module definition |
| `dto/` | CommitAvatarDto |

## Output Sizes

Defined in `AVATAR_SIZES = [40, 120]`. Both variants are always produced as WebP.

## Allowed MIME Types

`image/jpeg`, `image/png`, `image/webp`, `image/gif`

Validation uses `file-type` (magic bytes, not MIME header) to prevent content spoofing. If the detected type is not in the allowed set, a `BadRequestException` is thrown.

## Staged Upload Path (recommended)

```
POST /avatars/stage  (multipart: file)
  └── AvatarService.stageAvatar(userId, buffer, mimetype)
      ├── Validate magic bytes (fromBuffer) → BadRequestException if invalid
      ├── sharp resize → 40px WebP buffer, 120px WebP buffer
      ├── S3 upload: avatars/{userId}/{stageId}-40.webp, avatars/{userId}/{stageId}-120.webp
      ├── Redis: SET avatar:staged:{userId}:{stageId} "1" EX 1800
      ├── Redis: ZADD avatar:staged:pending <timestamp> {userId}:{stageId}
      └── Return { stageId }

POST /contacts/:id/avatar/commit  (JSON: { stageId })
  └── AvatarService.commitContactAvatar(contactId, userId, stageId)
      ├── Redis GET avatar:staged:{userId}:{stageId} → null → BadRequestException
      ├── prisma.contact.findUnique({ id, userId }) → null → NotFoundException
      ├── Delete old avatar if present (deleteAvatarByUrl, fire-and-forget)
      ├── prisma.contact.update({ avatarUrl: CDN_URL/avatars/{userId}/{stageId} })
      ├── Redis DEL avatar:staged:{userId}:{stageId}
      ├── Redis ZREM avatar:staged:pending {userId}:{stageId}
      ├── Redis INCR contacts:version:{userId}
      └── Return { avatarUrl }

POST /users/me/avatar/commit  (JSON: { stageId })
  └── AvatarService.commitUserAvatar(userId, stageId)
      └── Same as above but for user record (no cache invalidation needed)
```

## S3 Key Structure

| Entity | Staged | Committed |
|--------|--------|-----------|
| Contact | `avatars/{userId}/{stageId}-{size}.webp` | `avatars/contacts/{userId}/{contactId}-{size}.webp` |
| User | `avatars/{userId}/{stageId}-{size}.webp` | `avatars/users/{userId}-{size}.webp` |

## File Upload Validation (Controller)

`FileTypeValidator` with `fallbackToMimetype: true` applied at the controller level for all upload endpoints. The `fallbackToMimetype` flag is needed for Jest test compatibility (ESM dynamic import in `file-type` does not work in Jest).

## Test Coverage

- `avatar.controller.spec.ts`: stageAvatar, commitContactAvatar, commitUserAvatar, removeUserAvatar
- `avatar.service.spec.ts`: deleteAvatarFiles (contact type, user type, default type), stageAvatar (happy path, invalid magic bytes, undetectable type), commitContactAvatar (valid, invalid stageId, contact not found, old avatar cleanup), commitUserAvatar (valid, invalid stageId, user not found), removeUserAvatar (has avatar, no avatar → no-op, user not found)
