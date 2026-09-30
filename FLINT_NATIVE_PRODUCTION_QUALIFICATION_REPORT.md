# Flint native Save/Open — production integration qualification

**30 September 2026. Approved bounded integration implemented; ready for review. Stop before Stage C.**

Flint now opens canonical `.mutable.json` resources and saves native/Markdown pairs through the real document server. Standalone Markdown is an explicit import into a new native candidate. No Workspace schema, global enrollment catalog, ownership model or general persistence framework was introduced.

## User-facing path

The new `nativeDocumentPersistence` feature defaults **on**, alongside Flint. Open Flint and choose **Files**:

1. Enter a server folder and use **List files**. Select a `.mutable.json` file and choose **Open native**. For standalone `.md`, choose **Import Markdown** instead.
2. For a first save, enter a `.mutable.json` filename and choose **Save Document**. The Markdown counterpart uses the same basename in the same directory. Subsequent saves use that resource's existing binding, regardless of tab or Window.
3. **Retry / Recover** resumes the captured generation after interruption. **Compare Markdown** shows external text and the current native projection; **Keep Mutable** requires the reviewed external hash and preserves the displaced file.

The existing public-server read-only policy is unchanged. Writable qualification used an isolated private Node store. A private development server can enable its existing writable mode with `SPEEDY_PUBLIC_HOSTED_VERSION=0`; this does not change the hosted default. Rebuild/restart the server to load the new routes. The existing long-running localhost backend was observed still serving the previous build (the native route returned 404); it was left running, rather than restarting the shared dev stack during review. Browser downloads are not represented as paired saves.

## Implementation and ownership

The accepted codec/admission, bounded Markdown exporter/importer and resource coordinator were promoted into [`src/persistence`](src/persistence). Existing B1/B2 qualification imports are compatibility exports of those same implementations; there is no parallel native codec or graph model.

[`native-session.ts`](src/persistence/native-session.ts) supplies one session service and one enrolled coordinator per canonical resource. Flint receives only narrow file actions/status through its [host capability](src/feature-api/document-application.ts). It receives no repository, arbitrary editor or filesystem capability.

Native Open validates the envelope and admits through B1.2's non-owning `resourceRegistration`. Existing matching identity is reused only without content/location ambiguity. A missing or conflicting source fails explicitly. A Flint tab remains a transient occurrence; membership, closing a tab and closing a Window neither establish ownership nor cancel publication.

Locations reuse `{folder, filename}` and existing `document-store` registrations. IDs are decoded from native resources, never derived from paths. Choosing a first-save name does not alter identity. Relocation of an established binding is deliberately not implemented: another path for an already bound identity conflicts. A rejected first destination with no publication can be corrected without creating another resource. Independently opening an unpaired native file under a different filename still reads its embedded canonical ID.

[`native-document-store.mjs`](server/native-document-store.mjs) adds `/api/native/list`, `/open`, `/save`, `/recover` and `/compare`. Native data bypasses the legacy tree validator, metadata injection, tree indexer and History writer. The server independently checks that Markdown matches export of the supplied native generation/profile/link mapping. No native data is converted through a tree DTO.

The server build bundles the route's existing graph/codec dependencies, following the project's existing bundled-server-module approach. Optional OS locking failure disables native publication explicitly; it does not make the entire legacy/read-only server fail at import time.

## Baselines, publication and recovery

The caller supplies native/Markdown hashes and its confirmed generation from Open or its own successful Save. The server checks these against current files and receipt evidence under a managed publication lock. A newer server receipt cannot silently refresh a stale client's overwrite permission. A failed save/open leaves that client's original baseline intact.

Open additionally verifies that its native baseline hashes the exact bytes being returned. A concurrent replacement between reading the resource and sampling the baseline produces a retryable Open conflict, rather than granting permission for newer bytes that the client never received.

B2's immutable capture, native-first publication, intent/receipt, inode preservation and exact-generation recovery remain in use. There is no two-file atomicity claim. The client distinguishes Save blocked, Canonical saved/Markdown pending, Confirmation pending, and Saved with newer edits still dirty. Confirming one resource does not acknowledge another resource or Workspace presentation state.

A lost response is retried with the same generation and bytes. The server resumes its pending intent or verifies its completed receipt; it rejects another generation or altered retry bytes. HTTP errors distinguish confirmed pre-publication rejection from a potentially started publication. This lets an unused first destination be corrected while keeping an uncertain operation recoverable.

Whole-session unload warns for unsaved native candidates, dirty bound resources and pending operations. Closing occurrences releases views but leaves resource-owned work intact. Already staged server operations and durable evidence survive process termination.

Outside edits are conflicts, even when Markdown is newer. Compare/Keep Mutable permits only a freshly checked external Markdown hash; it never grants permission to overwrite a changed native resource. A conflicting partly published generation remains blocked and its external/displaced/staged files remain preserved. No automatic reconciliation, force-overwrite or archive pruning was added.

## Guards retained

- Owned external resources retain independent native boundaries and identities. The server validates explicitly located native dependencies, roots, ownership evidence and cycles before confirming an owner. Missing required dependencies block completion. Saving an owner does not recursively generate descendant Markdown.
- Authored owned edges remain the sole ownership authority. Location registration, runtime retention, load order and Flint membership cannot adopt a resource.
- Native registrations still fail legacy tree encoding. Enrolled native sessions also guard legacy Document/Workspace and extended-repository save paths, including legacy-born Documents after first native enrollment. This is conservative: mixed-session tree saving remains unavailable; save native Documents individually.
- Legacy server Document writers reject native envelopes and `.mutable.json` destinations. Workspace bundle/compatibility writers cannot write native destinations. Unaffected legacy stores remain functional.
- Ownership transfer, destructive lifetime actions, general unloading and History graph-2 integration retain their accepted restrictions. Native pair integration rejects migration of an active persistent-History enrollment.
- Hosted read-only checks, path confinement, bounded file/request sizes, regular-file/private-directory checks and symlink rejection protect the managed route. A different resource cannot claim an existing destination even by supplying its current byte hash.

## Acceptance evidence

**358 tests across 39 files passed** in the [complete regression run](artifacts/flint-native-production/qualification-results.json): Stage A/B1/B1.1/B1.2/B2, the new server/client integration, legacy stores, linked annotations/Entity, standoff/cross-Block editing, and existing History/resource gates. A final [focused route/client/B2 publication run](artifacts/flint-native-production/final-route-results.json) passed after optional-lock handling was hardened.

| Gate | Result |
| --- | --- |
| Real Flint UI → server → native/Markdown files → fresh Open | Passing; exact captured native bytes and readable Markdown checked. |
| Two simultaneous Flint Windows | Shared canonical content with independent occurrences. |
| All Windows close during publication | Save completes; edits after capture remain dirty and absent from the saved generation. |
| Zero-occurrence save | Passing through the actual client service/server routes. |
| Stale second client | Rejected despite an advanced durable receipt; retry/Open does not refresh its baseline silently. |
| Lost response / restart | Exact request replay and receipt recovery pass after router restart. |
| Actual server process death during partial publication | Passing browser test: terminate the server after native publication, restart it, use Flint Retry / Recover, verify Markdown completion. |
| External changes / partial conflict | Preserved and blocked; Keep Mutable's reviewed-hash check and conflict-copy preservation pass. |
| Native newer/older than Markdown | Native remains authoritative; standalone Markdown requires explicit candidate import. |
| Owned dependency unavailable | Owner completion rejected; locating B allows A's pair without producing B Markdown. |
| Read-only, unsafe paths, symlinks, identity collision, invalid projection | Rejected; ordinary legacy saves remain passing. |
| Workspace/native and legacy bypass guards | Passing, including the real UI session's Workspace capture rejection. |

Real Chrome checks: **13 production checks**, **23 native regressions**, **28 Stage A regressions**, **14 B2 regressions** — **78 total**. The [production browser sequence](scripts/check-native-production-browser.mjs) creates an isolated temporary document store, real Node server and Vite host; it cleans them up and does not write user Documents. Its server control hooks live only in the qualification host, not in application routes.

Client, server and native qualification type checks pass. Client and server builds pass; existing large-chunk/browser-mapping advisories remain. Whitespace checks pass. The historically documented strict commit-capture enumeration failure remains a baseline finding, not a newly claimed passing test. No new typing-performance improvement is claimed.

Review evidence:

- [UI screenshot](artifacts/flint-native-production/native-save-open.png), [production browser results](artifacts/flint-native-production/browser-results.json).
- [Saved rich native file](artifacts/flint-native-production/saved.mutable.json), [its Markdown counterpart](artifacts/flint-native-production/saved.md).
- [Native browser regressions](artifacts/flint-native-production/regression/native-browser-results.json), [Stage A browser regressions](artifacts/flint-native-production/stage-a/browser-results.json), [B2 browser regressions](artifacts/flint-native-production/b2/browser-results.json).
- [Server integration tests](server/native-document-store.test.mjs), [resource-session tests](src/persistence/native-session.test.ts), [client build](artifacts/flint-native-production/client-build.log), [server build](artifacts/flint-native-production/server-build.log).

## Remaining boundaries

This is the approved managed-server integration, not unrestricted synchronization. Workspace round-trip containing native registrations remains unsupported and guarded. No automatic server-wide identity discovery, binding relocation, native search indexing, broader Markdown grammar, generalized presentation hosting or Stage C functionality was added.

Pair locations use a fixed sibling Markdown name. Existing conflicting Markdown requires Compare/Keep Mutable or another unused first destination. Conflicts after partial publication have no in-place resolution/relocation UX in this release. Private archives are retained, with a bounded archive-entry check; safe cleanup needs separate qualification. Power-loss durability, network filesystems, Windows and browser file-handle pairing are not newly qualified. Arbitrary outside writes after completion are detected on subsequent operations; no permanent filesystem compare-and-swap guarantee is claimed.

No new Workspace/storage contract was required. **Stop for review here. Stage C has not begun.**
