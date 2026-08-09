# Firestore Security Specifications & Red Team Tests

## 1. Data Invariants
- **SavedVideo**:
  - A video document MUST have `userId` matching `request.auth.uid` upon creation.
  - Users cannot spoof another user's `userId` or modification timestamps.
  - Video fields like `topic` must be string bounded in length (max 150 chars).
  - Read access to public videos is allowed for signed-in users or community gallery; updates and deletes are strictly restricted to the owner (`resource.data.userId == request.auth.uid`).
- **UserProfile**:
  - Each user can only write to `/users/{userId}` where `{userId}` equals `request.auth.uid`.

## 2. The Dirty Dozen Test Scenarios
1. **Unauthenticated Write**: Attempt to create a video without auth -> PERMISSION_DENIED.
2. **UserId Spoofing**: Signed in as user `A`, attempt to create a video with `userId: 'B'` -> PERMISSION_DENIED.
3. **Ghost Field Injection**: Attempt to create video with extra unauthorized fields like `isAdmin: true` -> PERMISSION_DENIED.
4. **Over-sized Topic Attack**: Attempt to set `topic` with 2000 characters string -> PERMISSION_DENIED.
5. **Unauthorized Delete**: User `B` attempts to delete User `A`'s video -> PERMISSION_DENIED.
6. **Unauthorized Update**: User `B` attempts to edit User `A`'s video script -> PERMISSION_DENIED.
7. **Profile Impersonation**: User `A` tries to write to `/users/userB` -> PERMISSION_DENIED.
8. **Invalid Timestamp Attack**: Client sends manipulated non-server timestamp -> PERMISSION_DENIED.
9. **Invalid ID Character Injections**: Attempting document path injection like `/videos/../../../admin` -> PERMISSION_DENIED.
10. **Blanket Query Scraping**: Attempting listing without proper query filters -> PERMISSION_DENIED.
11. **Type Mismatch Attack**: Sending integer instead of string array for `script` -> PERMISSION_DENIED.
12. **Immutability Bypass**: Attempting to change `userId` or `createdAt` on update -> PERMISSION_DENIED.
