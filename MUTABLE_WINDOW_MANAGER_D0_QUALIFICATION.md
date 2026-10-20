# Mutable Window Manager — D0 qualification

Date: 20 October 2026. Base: `a62c2f4` (accepted Milestone B).

D0 is implemented for review. C, D1, E and later milestones have not been started. The existing default-enabled `mutableWindowManager` flag remains the gate, with exclusive legacy behavior when disabled. Upgrading a file remains an explicit action even when the feature is enabled.

## Result and scope

D0 introduces durable identities and a validated, versioned persistence boundary for the existing floating desktop. It adds an explicit **Upgrade Workspace and Save as…** operation to both Local and Server menus. Loading a legacy file neither upgrades it nor writes it. Ordinary Save preserves a legacy session's format until a successful explicit upgrade.

The two containers follow the approved plan:

| Path | Container | Document content | Save behavior |
|---|---|---|---|
| Legacy local | Raw `workspace-block` JSON tree | Embedded | Existing self-contained Save |
| Legacy server | `speedy-workspace`, `schemaVersion: 1` | External | Existing explicit coordinated Document/Workspace bundle Save |
| Managed local | `speedy-local-workspace`, `schemaVersion: 2`, `workspaceId`, `root` | Embedded | Self-contained capture of current canonical content and layout |
| Managed server | `speedy-workspace`, `schemaVersion: 2`, `workspaceId`, `documents`, `root` | External references | Layout/reference Save only; `documents` write array must be empty |

All filenames remain `.json`. No `.desktop`, `.canvas` or `.world` extensions, automatic migrations, background saves or Markdown sidecars were introduced. Existing native-resource destination restrictions remain enforced.

## Implemented contract

The shared client/server codec is `src/persistence/managed-desktop.ts`. The surrounding `workspacePresentation` envelope remains version 1. Its Desktop entry is `version: 2`, `kind: "managed-windows"`; existing Canvas and Spatial entries are retained.

| Field | Meaning and validation |
|---|---|
| `views[].restoreKey` | UUID with a `view-` namespace; durable identity of this anchored view, not a resource or runtime projection |
| `views[].anchorBlockId` | Durable ID of the existing shell wrapper; unique and unambiguous within the captured tree |
| `views[].appId` | Anchor adapter: Ink, Flint, Thesis, Phosphor or generic viewer |
| `views[].descriptorVersion` | Version of the application descriptor; only supported version 1 is loadable |
| `views[].persistence` | `anchor`: D0 restores an existing canonical wrapper, without serializing application session state |
| `views[].resources` | Scoped resource references; current Document references use the workspace scope and Document identity |
| `windows[].restoreKey` | UUID with a separate `window-` namespace; distinct from view, Block, Document and Workspace identities |
| `windows[].view` | Exactly one existing view descriptor; no duplicate ownership or orphan descriptors |
| `windows[].bounds` | Finite normal floating bounds: `x`, `y`, `width`, `height`; positive bounded dimensions |
| `windows[].layer` | `normal` or `pinned` |
| `windows[].state` | `normal`, `minimized`, `maximized` or `closed` intent |
| `layout.kind` | `floating`; tiled/tabbed/docked layouts are rejected |
| `layout.normalOrder`, `layout.pinnedOrder` | Relative ordering with exactly one membership per window, in its declared layer |

Missing wrapper IDs are allocated into a detached explicit Save capture. A session cache keeps those allocations stable across cancelled or failed Save attempts. Successful Save establishes the managed format; preparing a capture alone does not. Loading managed data reuses persisted restore keys across newly allocated runtime projections.

Managed layout is authoritative on load. One adapter projects bounds, state, pinning, relative order and closed visibility into the existing wrapper bridge before mounting. Historical wrapper geometry does not override the managed descriptor. Explicit Save captures current central registry ranks where registered; it does not persist runtime WindowIds, MRU lists, active focus, modal stacks or ownership leases.

Unknown JSON extension fields survive at the supported container, presentation, descriptor, bounds and resource levels. Unknown application versions and unsupported container/layout versions are refused rather than reinterpreted. Restore IDs are checked against Block, Document and Workspace identities. Repeated Document occurrences continue to use the existing identity materializer; conflicting content copies are rejected.

## Save and failure boundaries

**Explicit upgrade:** Local upgrade asks for a new JSON file and refuses a nonempty existing target. Server upgrade forces create-only semantics and the browser requires a new name; it does not offer Replace for that operation. The original file and live editing repository remain unchanged during preparation, cancellation or failure. No Document identity is assigned to a live repository as part of the new managed Save path.

**Managed server Save:** The client emits references rather than edited Document payloads. The server independently rejects Document writes in a v2 bundle and verifies referenced files, confined paths and Document identities before staging the Workspace. Unsaved or unregistered resources must be saved separately before they can participate in a managed server manifest. Neither Document nor Proposition Save is invoked by managed Workspace Save.

**Dirty acknowledgement:** Capture retains repository, presentation and visibility revisions. Edits made while I/O is pending remain dirty. Managed server Save acknowledges the captured layout but retains an unsaved-content indication when canonical Document content differs from its confirmed server baseline. This uses Document fingerprints on load/explicit Save, not subscriptions that serialize during typing. A local self-contained Save can acknowledge the content it actually captured. Existing per-Document/native dirty tracking and keyboard Save bindings are untouched. Activation/MRU alone still need not mark the Workspace dirty.

**Overwrite protection:** Server loads return a content hash. Updating an existing managed file requires the matching hash and Workspace identity. Requests are coordinated; two clients using one stale hash cannot both replace different contents. Both legacy server writer routes protect existing managed/future files. Local handle writes inspect the existing file before opening a writable stream, reject future versions and format downgrades, and compare a managed target against its last opened/saved JSON value.

**Malformed and missing data:** Container/version errors, cycles, invalid bounds, incomplete/duplicate memberships, ambiguous anchors, conflicting resource identities and unsupported descriptors fail before replacing the current workspace. Managed server loading refuses missing or identity-mismatched Documents, including anonymous files that would require guessing an identity. Changed content at the correct identity remains a reported load issue. Legacy missing-reference behavior is retained.

**Cancellation and partial failure:** Picker cancellation performs no write and does not acknowledge an upgrade. A failed local stream is aborted. Server Save accepts cancellation signals and checks for stale/disposed requests before acknowledgement. Server staging failures remove incomplete staging files. Existing multi-file legacy saves retain rollback; a rollback failure now returns `partial-save` and identifies the affected files instead of implying that everything was restored.

## Qualification results

| Check | Result |
|---|---|
| `npm run typecheck` | Passed for reactive client and server projects |
| Ten-file persistence/UI/session selection | 102 passed |
| New D0 tests within that selection | 35 passed: 26 codec/client/local-I/O, 7 real-server HTTP/I/O, 2 menu-flow tests |
| Accepted 30-file regression selection | 316 passed, 13 failed; same accepted baseline cases |
| Browser qualification | 20 checks passed in Chrome 155 |
| `git diff --check` | Passed |

The selected test counts overlap; they are not additive totals. No claim is made that the entire repository suite is green.

The targeted selection covers immutable legacy import, stable restore keys, conflicting legacy/managed geometry, closed/minimized intent, current-format unknown fields, future versions, invalid layouts, identity collisions, missing resources, feature-off rejection, local/server content separation, stale acknowledgement, cancellation, local write abortion, server concurrency, downgrade prevention, actual rollback, explicit rollback failure and failed-stage cleanup. A typing regression asserts zero repository snapshots and zero network requests during the edit. This is a bounded-work check, not a latency benchmark.

### Regression comparison

The final comparison uses the exact A0 27-file command plus Block History, Document Interchange and Mutable Clipboard, as in the accepted A1/B comparisons. It reproduces the accepted B totals and failure set:

| File | Existing failures |
|---|---:|
| `src/demo/application-startup.test.tsx` | 6 |
| `src/demo/workspace-demo.test.tsx` | 3 |
| `src/features/timer/timer.test.tsx` | 3 |
| `src/rendering/block-selection.test.tsx` | 1 |

The Block selection drag fixture also reproduces the accepted `dataTransfer.files` unhandled exception. These failures were compared with the accepted B record, not newly fixed or represented as passing. No additional failures appeared in this selection.

### Browser evidence

See [D0 browser evidence](MUTABLE_WINDOW_MANAGER_D0_BROWSER_EVIDENCE.json), produced by `node scripts/qualify-window-manager.mjs --d0` using `src/application/window-manager-d0.browser-fixture.tsx`.

The fixture mounts actual WorkspaceSession and retained window components. Chrome delivers trusted typing and an actual restore-icon click. Checks cover edited local content, cancelled upgrade preparation, successful local write acknowledgement, Save/Open across new runtime sessions, stable restore identities, minimized intent and restoration, future-file protection, managed server client Save/load, retained unsaved external-content indication and cancelled server dispatch.

Native picker results are simulated with real browser `File` objects and in-memory handles; this does **not** claim OS picker automation. Server client responses in the browser fixture are in memory. Separate Express HTTP tests use the real server router and temporary files to qualify disk writes, identity checks, concurrent writes, injected I/O failures and rollback. No browser request reaches an application backend or vault.

### Reproduction

```sh
npm run typecheck
npx vitest run \
  src/persistence/managed-desktop.test.ts \
  server/workspace-store-d0.test.ts \
  server/workspace-store.test.ts \
  src/reactive-editor/workspace-manifest.test.ts \
  src/reactive-editor/local-workspace.test.ts \
  src/reactive-editor/workspace-presentation.test.ts \
  src/application/workspace-session.test.ts \
  src/application/workspace-open.test.tsx \
  src/reactive-editor/view-visibility.test.ts \
  src/demo/workspace-d0.test.tsx
node scripts/qualify-window-manager.mjs --d0
```

For the regression command, use the file list in the A0 qualification report and append `src/rendering/block-history.test.tsx`, `src/rendering/document-interchange.test.tsx` and `src/rendering/mutable-clipboard.test.tsx`.

## Architectural decisions and deviations

1. The plan's preferred two-container approach is implemented. Existing v1 formats remain supported; v2 is explicitly selected through upgrade Save As. The existing feature flag gates the capability without automatically upgrading files.
2. The illustrative future layout tree is intentionally reduced to one floating membership/order structure. C/D1 layout trees, shell tabs and named arrangements are not accepted by this D0 implementation.
3. Descriptors use existing canonical wrapper anchors. Full application reopen descriptors, optional caret/scroll preferences and saved Proposition selection are deferred. Scoped Proposition-reference shape is defined at the descriptor boundary, but a container requiring Proposition reopening is refused in D0. No fake Document/Resource identity or filename is created for a Proposition.
4. Missing resources or unsupported applications cause whole-load refusal. Partial restoration, unavailable-app placeholders and retry orchestration are D1 work. Refusal preserves the current editing session and the original file.
5. Managed server saves are layout-only. The pre-existing v1 coordinated Document bundle behavior remains available for legacy sessions and is explicitly distinguished above.
6. Acetate remains a distinct future application concept. This change does not rename Canvas, add an Acetate adapter or conflate their identities.

## Remaining limitations

- Existing native-resource and history-enrolled Workspace Save restrictions remain. D0 does not bypass paired native-resource ownership or add packaging for native Flint/Ink sessions. A workspace that already fails those guards still cannot be upgraded/saved through these tree adapters.
- Unsaved Thesis drafts, undo stacks, source-selection bookmarks, Entity selections, open tools, pending Save receipts and focus/modal ownership are runtime state. They are not captured. A saved Thesis shell reopens its ordinary application entry; D0 does not recover an unsaved draft or the selected saved Proposition. Saving a workspace does not itself destroy that live state.
- A resource without a confirmed server baseline is conservatively treated as having unacknowledged content after a managed server layout Save. Workspace Save is not a substitute for saving that resource.
- Local overwrite checks require a readable File System Access handle. Download fallback retains existing browser behavior and cannot inspect a destination, confirm completion or observe a later download cancellation. No disk-commit guarantee is claimed for that fallback.
- Hash/value preconditions detect changes observed before commit. They are not operating-system locks against unrelated external programs writing between validation and replacement. Server coordination serializes cooperating router requests; crash-proof multi-file transactions and recovery journals remain outside scope.
- Cancellation after a server request has been dispatched cannot promise that the server did not commit. The client does not acknowledge a cancelled result; reopening or Save As resolves an uncertain outcome safely.
- A rollback failure is explicitly reported, not repaired automatically. A failed rollback can leave changed files and a recovery staging file; the affected filenames are returned for inspection.
- Validation rejects non-JSON/cyclic data, depth above 256 and inputs exceeding one million visited JSON values. No scale or load qualification was performed.
- No human OS-picker, Safari/Firefox, physical-device or crash/power-loss test is claimed. No new performance/latency benchmark was run.

Temporary HTTP stores, Chrome profiles, Chrome processes and Vite servers are cleaned up by the tests/runners. Tests, the browser fixture, evidence and this report are retained as review artifacts. No load testing, production-data writes, migrations, deployment, C/D1/E implementation or later milestone work was performed.
