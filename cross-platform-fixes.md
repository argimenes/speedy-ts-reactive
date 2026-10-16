# Cross-Platform Fixes

## Goal

Support building and running the project on Windows, macOS, and Linux without weakening managed-document save, relocation, locking, or recovery guarantees. Platform support must cover the storage behavior as well as compilation; a successful build alone is not sufficient.

## Current Status

- The server TypeScript build previously failed because `server/entity-lookup.test.ts` imported a generated module under `dist`. It now imports the checked-in source module, allowing TypeScript compilation before generated artifacts exist.
- On Windows, `npm run build:server` now passes TypeScript but fails while compiling `server/native-path-move.c`. MinGW does not provide the POSIX APIs used by the helper, including `openat`, `O_DIRECTORY`, `O_NOFOLLOW`, and `fstatat`.
- The existing helper has Apple and Linux implementations. The Apple path uses `renameatx_np(..., RENAME_EXCL)`; the Linux path uses `renameat2(RENAME_NOREPLACE)`. Unsupported hosts fail closed. Linux support also depends on kernel and filesystem support for the no-replace operation.

## Required Storage Guarantees

The platform implementation must preserve these properties; do not substitute an ordinary check-then-rename or copy-delete fallback:

- Resolve managed paths beneath a trusted root and reject symlinks or Windows reparse points during traversal, not only in a separate check before opening.
- Acquire cross-process locks for writers and relocations. An in-process mutex is not an equivalent replacement.
- Publish new files without overwriting a destination created by another writer.
- Move files atomically, without replacement, on the same volume; reject cross-volume moves.
- Flush file contents and the metadata needed for the documented durability guarantee.
- Preserve intent-before-mutation ordering, displaced-file evidence, idempotent recovery, and fail-closed behavior after ambiguous or unsupported operations.

Windows needs handle-based path validation and native locking/rename operations. The implementation should use the strongest supported Windows primitives, validate their behavior on supported filesystems, and document any durability differences rather than claiming unverified parity.

## Implementation Plan

### 1. Define the platform contract

Create a narrow storage-platform interface for operations such as:

- Opening and validating paths relative to a managed root without following links.
- Acquiring and releasing an exclusive cross-process lock.
- Creating a file only if the destination is absent.
- Renaming without replacement and verifying same-volume constraints.
- Flushing files and relevant directory/volume metadata.

Keep logical vault paths in the existing normalized `/` form. Convert to native paths only at filesystem boundaries. Keep journaling and recovery policy above the platform-specific operations.

### 2. Implement platform backends

- Retain the current Apple and Linux primitives behind the interface, with explicit capability checks and clear errors when the required operation is unavailable.
- Add a Windows backend using handle-based traversal, reparse-point rejection, a cross-process lock tied to a stable lock-file handle, and an atomic rename that fails if the destination exists.
- Keep unsupported operations fail-closed. Do not silently skip relocation support or add a weaker JavaScript fallback.

### 3. Remove platform-specific assumptions from callers

Route pair saves, native vault relocation, and SQLite coordination through the platform interface. Replace direct assumptions about `O_NOFOLLOW`, `O_DIRECTORY`, directory `fsync`, and `fs-ext` `flock` where those are not supported. Ensure optional dependency installation cannot silently leave a writable mode without required locking.

Relevant implementation surfaces include [managed-pair.mjs](src/persistence/managed-pair.mjs), [native-vault-store.mjs](server/native-vault-store.mjs), [paths.mjs](src/knowledge-sqlite/paths.mjs), and [vault-scope.mjs](src/knowledge-sqlite/vault-scope.mjs).

### 4. Make build and runtime selection explicit

- Select the backend by supported OS and architecture; report unsupported combinations before starting the server.
- Make native helper output names and process invocation platform-correct, including `.exe` where required.
- Discover or configure the appropriate compiler deliberately. Do not assume a command named `cc` means the same target/runtime on every host.
- Ensure build scripts and tests do not compile a POSIX helper unconditionally on Windows.

The current build path is [build:server](package.json), [build-history-worker.mjs](scripts/build-history-worker.mjs), and [build-relocation-helper.mjs](scripts/build-relocation-helper.mjs).

### 5. Verify native dependencies

Validate install, runtime loading, and supported architectures for `better-sqlite3`, `sharp`, and the replacement locking implementation on every supported OS. Declare the supported Node.js version range in `package.json` and align it with the repository's [.nvmrc](.nvmrc).

### 6. Make tests platform-aware

Keep common protocol and recovery tests shared, and add backend-specific integration tests. Cover:

- Concurrent writers and lock release after process termination.
- Destination collisions, create-only publication, and atomic same-volume moves.
- Symlink and Windows reparse-point rejection, including replacement races.
- Cross-volume behavior and unsupported filesystem capabilities.
- Crash/restart recovery at each journal boundary, preserving all displaced data.
- Case and Unicode-normalization aliases on case-insensitive filesystems.

Replace platform assumptions in tests: `/dev` for cross-device tests, POSIX `chmod` denial, and `SIGKILL`/negative-PID process management need OS-appropriate equivalents. The relocation helper is also compiled by tests such as [native-vault-store.test.mjs](server/native-vault-store.test.mjs), so fixing only the main build script is insufficient.

### 7. Add a CI support matrix

Run dependency installation, client/server builds, core storage tests, and recovery tests on Windows, macOS, and Linux with the declared Node version. Include supported CPU architectures and explicitly state which local filesystems are qualified. Failures should identify missing capabilities rather than silently skipping safety-critical tests.

## Tooling Portability

After core runtime support, update developer scripts that assume a specific host environment. Examples include browser checks with a hard-coded macOS Chrome path, scripts using `/tmp` or Python `fcntl`, and the Bash-only [build.sh](build.sh). These are secondary to storage correctness but should be covered by the same support policy.

## Suggested First Milestone

1. Land the storage-platform contract and route existing Apple/Linux behavior through it without changing semantics.
2. Implement the Windows backend for locking, safe path traversal, no-overwrite publication, and exclusive relocation.
3. Add Windows-specific storage and crash-recovery tests before enabling the Windows build lane as supported.
4. Run the full OS matrix and document any filesystem-specific limitations.
