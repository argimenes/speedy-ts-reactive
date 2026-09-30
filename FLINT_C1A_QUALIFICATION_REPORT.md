# Flint C1a directory discovery and relocation qualification

**C1a is implemented and qualified on the current macOS managed-store host, for review. C1b is not implemented.** The filesystem vault architecture and C1a authorization are accepted; this report does not authorize the vault UI or later Stage C work.

The proof reconstructs directories and native Document locations from files, moves confirmed native/Markdown pairs and nonempty directories, and recovers interrupted moves without creating a new native save generation. Resource IDs, authored native references, native bytes and paired Markdown bytes remain unchanged. No Workspace format, membership catalog, virtual folders or hierarchy database was added.

## Implementation and contract

[NativeVaultStore](server/native-vault-store.mjs) is a bounded managed-store adapter, exposed through the existing [native router](server/native-document-store.mjs). It uses the existing `nativeDocumentPersistence` feature boundary, which remains enabled by default; public-server read-only policy still applies. There are no new Flint buttons or folder UI in C1a.

| Route under `/api/native` | Contract |
| --- | --- |
| `POST /vault/discover` | Selected managed-root-relative `vault`; returns actual folders, native identities/locations, pair status, standalone Markdown, other files, diagnostics, completeness and relevant recovery operations. The query is cancellable. |
| `POST /vault/mkdir` | `vault` and `directory`; exclusively creates a real directory after confinement/collision checks. |
| `POST /vault/relocate` | Idempotent `operationId`, selected `vault`, `kind` (`pair` or `directory`), relative `source`/`destination`, and exact per-resource caller `baselines`. Optional explicit dependency locations retain the existing owned-resource checks. |
| `POST /vault/recover` | Explicit recorded `operationId`; returns `relocated` with binding transitions or `relocation-pending` with the conflict. Recovery does not adopt arbitrary external same-ID files. |

Native identity is decoded through the accepted codec. A scan does not create repository content, editor occurrences or storage registrations. Duplicate IDs, malformed or oversized native files, symlinks, unreadable directories and incomplete traversal are explicit diagnostics. Mutations requiring unique identity refuse an incomplete scan. Empty folders are real entries. The implementation bounds scans/inspection at 10,000 entries and individual inspected files at 20 MiB; it does not claim an atomic filesystem snapshot.

Only confirmed enrolled pairs relocate. Standalone Markdown stays an import source; an unrelated same-stem `.md` is not silently claimed. Unenrolled or externally changed native pairs remain visible but cannot pass relocation preflight. Refreshing directory discovery never updates a live editor's content baseline.

The [resource session](src/persistence/native-session.ts) supplies infrastructure methods for discovery, directory creation, relocation and recovery without exposing arbitrary filesystem access to Flint. A confirmed move updates the existing canonical resource binding and dependency-location association. It does not re-admit/copy the Document, acknowledge dirty edits as saved or alter canonical ownership. Save waits behind that session's relocation; an unresolved move blocks Save. Closing occurrences does not cancel the resource operation. A fresh session can recover the server operation, but must explicitly Open its destination; recovery alone does not attach or refresh a live binding.

## Relocation and recovery protocol

1. Serialize participating production native writers through one managed-root lock outside movable subdirectories. This is deliberately conservative; concurrent publication throughput is not optimized. Preserve the existing per-pair writer behavior inside ordinary Save.
2. Inspect the selected vault, caller hashes/generation/location revision, source type, destinations, pair archives and owned dependencies. Reject occupied destinations, case/Unicode aliases, path escapes, symlinks, pending saves and moves outside the selected vault. Directory moves inspect the bounded subtree, including unrelated ordinary files.
3. Write and sync an immutable version-1 relocation intent at `.mutable-relocations/<operationId>/intent.json`. It records the request, affected resource bindings, source/destination signatures, dependency locations and operation sequence. Signatures include inode/device identity and content hashes, not just names. The journal is operation evidence, not hierarchy authority.
4. Move native file, Markdown and (when needed) the existing pair archive using the native no-replace primitive. A directory move moves the directory itself, including empty descendants and pair archives. Recheck source/destination evidence after each step and at confirmation. Native/Markdown hashes are also checked directly against the caller-reviewed baseline before preparation and at confirmation; freshly observed signatures cannot silently substitute a newer generation. Raced files and late writes through old handles remain on their actual inodes; conflicts stop completion without deleting or overwriting them.
5. For renamed pair filenames, preserve the original active receipt in the operation archive and publish a receipt with the new names. Its content generation/hashes stay unchanged. Historical save intents, captured native/Markdown bytes and existing archives are not rewritten. Directory moves with unchanged basenames retain their receipt contents.
6. Revalidate owned dependencies and final evidence, then write a completion record bound to the intent hash. The binding gains a `locationRevision` derived from the relocation operation, separate from the native save generation. Production Save/Recover enforce it after relocation; old-location requests and rename-away-and-back stale clients fail closed. Existing unmoved-resource baselines remain compatible.

Recovery inspects actual files at both locations and replays only proven steps. The operation is not a two-file atomic rename: intermediate states are explicitly pending and conflicting native Open/Save is blocked. Lost responses replay the same operation; actual process death releases the OS lock but leaves the journal. Unexpected files, changed bytes or ambiguous evidence remain conflicts. Corrupt or incomplete evidence is not automatically repaired or discarded.

The [small native helper](server/native-path-move.c) uses directory-relative, no-follow path traversal and exclusive rename. On the qualified macOS host it uses `renameatx_np(..., RENAME_EXCL)` and syncs affected parent directories. It refuses cross-device moves and has no overwriting/copy-delete fallback. The [server build](scripts/build-relocation-helper.mjs) compiles it with the system C compiler; missing helper/locking support blocks relocation. Only macOS behavior was executed and qualified here; the Linux branch is not a portability qualification or additional durability claim.

## Qualification evidence

The [complete regression run](artifacts/flint-c1a/qualification-results.json) passed all 358 accepted Stage A/B1/B1.1/B1.2/B2/production tests plus the first 53 C1a tests: **411 tests across 42 files**. Subsequent [focused qualification](artifacts/flint-c1a/final-focused-results.json) and [binding checks](artifacts/flint-c1a/final-binding-results.json) cover the final additions and changes. The C1a test files contain 62 checks in total; the reports distinguish the full run from later focused runs rather than claiming one aggregate execution.

| Gate | Result and evidence |
| --- | --- |
| Fresh discovery without Workspace or membership data | Passing: nested/empty directories, confirmed pairs, standalone Markdown, duplicate IDs, malformed/oversized files, unreadable folders and cancellation. [Adapter tests](server/native-vault-store.test.mjs). |
| Pair rename and cross-directory move | Passing: exact native/Markdown bytes, canonical ID, reference payloads and generation retained; subsequent ordinary Save works at the new binding. |
| Directory moves | Passing: actual directory inode, unrelated file bytes, empty descendants and archives retained. Owner and owned resource move as independent native pairs with unchanged generations and projections. |
| Historical evidence | Passing: multiple immutable save-generation intents preserved; active receipt changes are separately archived. |
| Restart and recovery | Passing: actual `SIGKILL` at durable intent, after each pair/archive move, during receipt transition, before completion and after completion. Also successful directory recovery and a conflicting external write after process death. [Process tests](server/native-vault-restart.test.mjs). |
| Collision and adversarial filesystem cases | Passing: either public filename/archive collision, occupied directory, case/Unicode aliases, a destination created after JavaScript preflight, source inode replacement, missing source, parent symlink replacement and late open-handle writes. Conflicting bytes survive; no unsafe fallback runs. |
| Stale/concurrent clients | Passing: root-lock exclusion across server processes, pending-operation fencing after process death, stale content baseline, old location and rename-away-and-back rejection. |
| Occurrence independence | Passing: zero and two occurrences, disposal during movement, continued editing, dirty-state preservation, queued Save using the new binding, lost response recovery and explicit fresh-session Open. [Session tests](src/persistence/native-vault-session.test.ts). |
| Dependencies and authority | Passing: missing required owned resource blocks confirmation; no descendant Markdown generation; newer Markdown and external same-ID moves do not become native authority or automatic rebinding. Existing ownership/History/legacy Workspace guards pass regression. |
| Existing production UI | **13 Chrome checks passed**, including real Save/Open, independent occurrences, dirty edits during Save, actual backend restart, partial-publication recovery, explicit Markdown import and Workspace guard. [Results](artifacts/flint-c1a/production-browser/browser-results.json), [screenshot](artifacts/flint-c1a/production-browser/native-save-open.png). This verifies the existing UI; it is not C1b UI qualification. |

[Client/server builds](artifacts/flint-c1a/build.log), [type checks](artifacts/flint-c1a/typecheck.log) and whitespace checks pass. Existing build chunk-size/browser-mapping advisories remain. No editing/input pipeline changed and no typing-performance improvement is claimed. Tests use isolated temporary stores and processes; the user's running localhost servers and Documents were not restarted or moved.

## Remaining boundaries before C1b

- C1b still needs the real vault tree, root selection and explicit storage-operation/recovery controls. The existing Flint proof membership UI has not been replaced in this infrastructure milestone. Same-root versus overlapping active-root presentation policy remains a C1b concern; each C1a operation is confined to its explicitly selected root.
- Case-only/normalization-only renames are explicitly rejected rather than using an unqualified intermediate-name workaround. Cross-vault, cross-filesystem and selected vault-root moves remain unsupported.
- A manually relocated same-ID file is a candidate/conflict, not an automatically adopted binding. General reconciliation of arbitrary external pair/archive movement is not implemented. Refresh reports it; the qualified automatic recovery path is for recorded managed operations.
- Missing helper/locking support, uninspectable subtrees, unresolved ownership dependencies, unenrolled pairs and damaged recovery evidence block the operation. There is no force-overwrite, automatic rollback, archive cleanup or deletion API. A blocked recorded operation must be reviewed/recovered before another relocation begins.
- Native references remain stable because authored bytes do not change. Existing exported path-based Markdown links can become stale after a move; there is no vault-wide link rewrite. Subsequent explicit saves use updated known bindings; this is not a promise of complete Markdown link repair.
- No new Workspace persistence, global catalog, sidecar hierarchy database, filesystem watcher, synchronization, tags UI or search/backlinks implementation was added. Read-only hosts stay read-only. This proof establishes the tested managed-host behavior, not all filesystems, hostile storage administrators or power-loss durability beyond the previously accepted boundary.

**Stop for review here. C1b, C2 and C3 remain unimplemented.**
