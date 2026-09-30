# Flint C1b — Vault UI and native properties

**30 September 2026. C1b implemented and qualified; ready for review. C2 has not begun.**

Flint now exposes the accepted filesystem-vault infrastructure through its ordinary application Window. The selected managed directory supplies the tree. Tabs still target canonical Document IDs through independent transient occurrences. No hierarchy, membership, resource-location catalog or Workspace schema was added.

## Delivered workflow

Open **Workspace → Open Flint**, enter a directory relative to the configured native managed store (`.` selects its root), then choose **Open Vault**. **Refresh** rereads the directory. **Close Vault** releases that Window's tree scope without closing its Document tabs.

- Select a folder in the nested tree. **New Document / import** creates and first-saves a native Page Document there, or explicitly imports a discovered standalone Markdown file to a fresh native destination. The original Markdown is retained.
- **Create directory** creates a real subdirectory of the selected folder.
- Select a Document row, then use **Rename / move** to change its filename or parent directory. Select a folder to rename/move that actual directory. Root moves and moves into a directory's own subtree are rejected. These controls call C1a's journalled operations, never unchecked filesystem renames.
- The **Properties** pane edits authored title and tags using ordinary commands and Undo/Redo. Title edits do not rename the pair; pair/directory moves do not rewrite title, tags, content or native references.
- Properties display canonical ID, native format, physical binding and save status. A failed first save leaves a visible unsaved canonical candidate. **Files** lets it choose another first-save filename; the existing colliding resource is preserved.
- Pending relocations offer **Recover relocation**. Native rows with pending paired publication offer resource-specific recovery. Conflicts, malformed/ambiguous identities, incomplete discovery and read-only storage remain visible.

The older **Files** controls remain available for the accepted individual native Save/Open/compare/recovery route. With a vault selected, file operations are confined to that root; explicit vault import requires a fresh destination. They do not create a second folder hierarchy. Before a vault is selected, **Open Documents** lists loaded canonical sources, including the existing starter Documents.

## Architecture and lifetime

| Area | Result |
| --- | --- |
| Tree authority | Bounded C1a directory discovery. Opening a vault does not admit every file. No authored membership, sidecar database or saved folder model. |
| Shared scope | One feature-owned, reference-counted tree read model per normalized root in the editor host. Two Flint Windows share updates and mutation status; each retains independent tabs, projections, focus and selection. |
| Root normalization | Discovery returns the real managed-relative directory spelling, coalescing physical aliases. Overlapping active roots remain conservatively rejected; close their tree scopes before selecting a parent/child root. |
| Refresh | Open, explicit Refresh, browser/Flint Window refocus, before mutations and after completion. Queries are deduplicated and disposable; no watchers or polling. Tree refresh never replaces a live canonical Document or refreshes its persistence baseline. |
| Occurrences | Resolution depends on unique canonical identity, not current tree membership. Refresh, moves and tree filtering do not unmount the live editor. Closing occurrences does not cancel resource-owned Save/relocation. |
| Native properties | `metadata.title` plus bounded `metadata.tags: string[]`: up to 32 unique, trimmed, nonempty tags, each at most 64 characters and one line. Other authored metadata is preserved. Incompatible existing tag payloads are displayed as unavailable for this form rather than coerced. |
| Tag scope | Exact tag filtering across physical folders, initially over opened/available Documents. Unopened resources explicitly make coverage incomplete. No saved searches, schema system or semantic folder assignments. |
| Ordinary typing | Vault tree location/operation observers use a separate storage-change signal. Typing changes status without rebuilding tree rows or capturing a repository snapshot; the mounted UI test asserts both. |
| New Documents | Existing Page factory; one canonical candidate structurally outside the Window. Existing native capture/admission/save rules apply. Candidate tracking supplies unload/legacy-save guards, not a new catalog. |
| Recovery visibility | The UI combines durable operation status with the native session's unresolved operation IDs. A lost response remains recoverable even when the server journal already records completion. Recovery still uses the original resource-owned operation. |
| Missing locations | A complete scan can report a missing/moved location. An incomplete scan reports an unverified location. Neither changes the live binding, discards dirty edits or adopts another same-ID file. |

Tree selection and property drafts are not reset by unrelated save/status updates. Property commands read unwrapped canonical metadata so nested native format and unknown feature values remain cloneable and intact. These are bounded application integration corrections, not changes to the editor's selection pipeline or native wire format.

The only server change beyond C1a is discovery-root spelling normalization. No new native, Workspace, History, ownership, receipt or relocation-journal format was introduced. Existing `flint` and `nativeDocumentPersistence` feature boundaries remain default on.

## Qualification

**435 automated tests passed in 44 files:** the complete 420-test accepted Stage A/B/native/C1a regression set plus 13 real UI/server C1b tests and two disposable tree-scope tests. Typechecking and the client/server build passed. Existing bundle-size and dependency-data warnings remain non-fatal.

| Gate | Evidence/result |
| --- | --- |
| Two Flint Windows | Same physical tree, one canonical resource, independent occurrences; title/tag changes and native editing shared without rebuilding the editor. Closing one occurrence leaves the other intact. |
| Create/save/properties | Real native pair creation in selected folder; title/tag Undo/Redo and fresh native reopening; nested unknown authored payload retained. Failed first-save collisions remain unsaved and can select a fresh destination. |
| Rename/move | UI pair rename/move and directory move preserve saved bytes and generation. Next Save uses the updated binding. A resource containing an external native reference retains its target and exact saved bytes. |
| Editing during relocation | Real Chromium native input while the server pauses between journalled filesystem steps. Both occurrences retain the edit; relocated bytes remain the previously saved generation; subsequent Save publishes the dirty edit at the new location. Closing all initiating Windows does not cancel the operation. |
| Restart/recovery | Actual server SIGKILL during relocation, then visible UI recovery after restart. Fresh repository and restarted server reconstruct the tree and reopen original identity, text, title and tags. Lost completion after a finished server move is independently tested. |
| External filesystem changes | Refresh discovers new directories and duplicate IDs; duplicates cannot open arbitrarily. Missing or unverified locations retain dirty live content and the original binding. C1a stale-client, external-write, confinement, symlink, collision and process-death adversarial tests all rerun. |
| Import | Explicit bounded Markdown import creates a distinct native candidate and preserves source bytes; same-source and existing-destination collisions fail visibly. No authority promotion from newer Markdown. |
| Read-only/dependencies | Read-only tree allows native Open and local editing while storage actions are disabled/rejected. Missing owned-resource dependency blocks Save and does not publish Markdown. No recursive dependency import or Markdown generation was added. |
| Lifecycle/legacy guards | Minimize/restore retains selected tree scope without serializing it; query cancellation/disposal is tested. Stage A source disappearance, independent selection/focus, toolbar scope, IME, Grouping and Entity behavior pass. Workspace/legacy tree bypass protections remain intact. |

Real-browser suites passed **94 checks** total:

- C1b UI/server workflow: **16**.
- Stage A: **28**.
- Native B1/B1.1/B1.2: **23**.
- Consumed Markdown B2: **14**.
- Production native Save/Open: **13**.

Browser suites reported no uncaught runtime exceptions. One parallel B1 screenshot capture timed out; the complete isolated rerun passed. Connection failures during deliberate server death were expected. All stores, servers and browser profiles used for qualification were isolated; the user's managed files and running localhost services were not used or restarted.

## Evidence and reproduction

- [Complete automated results](artifacts/flint-c1b/qualification-results.json), [summary](artifacts/flint-c1b/qualification-summary.json), [typecheck](artifacts/flint-c1b/typecheck.txt), [build](artifacts/flint-c1b/build.txt).
- [C1b browser results](artifacts/flint-c1b/browser/browser-results.json), [two Windows](artifacts/flint-c1b/browser/two-windows-vault.png), [pending recovery](artifacts/flint-c1b/browser/pending-recovery.png), [reopened vault](artifacts/flint-c1b/browser/reopened-vault.png), [reopened native file](artifacts/flint-c1b/browser/reopened.mutable.json).
- [Stage A browser](artifacts/flint-c1b/stage-a-browser), [B1/B1.1/B1.2 browser](artifacts/flint-c1b/b1-browser), [B2 browser](artifacts/flint-c1b/b2-browser), [production Save/Open browser](artifacts/flint-c1b/production-regression).
- [UI/server qualification](src/application/flint-vault.test.tsx), [scope qualification](src/application/document-vault.test.ts), [reproducible browser workflow](scripts/check-flint-c1b-browser.mjs).

Run `npm run typecheck`, `npm run build`, then `node scripts/check-flint-c1b-browser.mjs` for the isolated real-browser workflow. It requires the previously qualified native relocation helper and Chrome; `CHROME_BIN` can select the executable. The automated JSON results name every regression file.

## Retained boundaries

C1b does not restore native Documents through Workspace persistence. After a fresh launch, select the vault directory and explicitly open its files; the directory supplies the hierarchy. A resource outside the selected vault requires opening its containing vault, not an implicit move or copy. Selected root/folder/filter state is transient.

External same-ID moves are never silently adopted. Missing evidence, stale baselines, unsupported filesystems, ambiguous identities and recovery conflicts remain explicit failures under C1a. The UI exposes recovery; it does not introduce automatic conflict reconciliation or weaken any no-replace/external-write guarantees. A transport failure with no verifiable server operation remains unresolved rather than granting a new binding.

Tags are an intentionally small native string-list field. Unsupported or unknown native features remain authoritative even when Markdown cannot express them. Pair relocation preserves existing Markdown bytes; incoming exported path links may consequently remain stale. The UI calls this out; no vault-wide link rewriting occurs.

No deletion/Trash, cross-vault moves, filesystem watchers, synchronization, global catalog, archive cleanup, ownership transfer, History redesign, new Workspace format, generalized hosting, C2 search/reference navigation or C3 backlinks implementation was added.

**Stop at C1b review.**
