# Canvas Milestone B — workspace session and persistence

Status: **implemented and qualified; stopped for review before Milestone C.**

Baseline: `06422ef` (`Planning for Canvas workspace`), preserving Milestone A and accepted feature-module Stages 1–5. Scope follows Milestone B of the [approved Canvas plan](CODEX_CANVAS_WORKSPACE_PRESENTATION_PLAN.md).

## Result

Canonical workspace Open now creates an application-owned [WorkspaceSession](src/application/workspace-session.ts). It owns one editor, its existing Desktop projection, presentation state and disposal. The initial split demo retains its explicit Save/Open route; there is no live migration or document reconstruction to change presentations.

`canvasWorkspace` is **false by default** in [configuration](src/configuration.ts). Explicit configuration `{ features: { canvasWorkspace: true } }` enables the bounded state mutations for development/tests. There is no Canvas renderer or presentation-switch UI in B. Saved Canvas or unknown active preferences open on Desktop with an explanation and remain preserved. Compatibility reading/writing works with the flag off.

## Envelope and identity

The additive envelope is `workspaceRoot.metadata.workspacePresentation`. Local files remain self-contained `workspace-block` JSON; server files remain `speedy-workspace` manifest version 1 with separate Document resources. No new endpoint, file, content store or outer format was introduced.

The [envelope validator and state](src/reactive-editor/workspace-presentation.ts) implement version 1 directory entries, the Desktop `legacy-tree` marker, Canvas camera/bounds/order and optional visual background metadata. Authored Desktop Window geometry stays in the existing Window metadata; Canvas bounds are independent.

- Directory identities, target identities and placement identities must be nonempty; directory and placement IDs must be unique.
- Targets are workspace Block IDs or stable Document IDs. Unknown target kinds make the envelope opaque rather than being guessed.
- Each Canvas placement must reference a directory entry; one occurrence per directory object is supported.
- Coordinates must be finite and within ±1 billion; sizes are 1–1 million local units; zoom is 0.05–16; order is an integer within ±1 billion. These are storage validation bounds, not a settled gesture/UI zoom range.
- Unknown fields and unknown presentation entries survive validation, state edits and local/server serialization.
- Invalid or unsupported envelopes remain opaque and read-only. Saving retains their raw data; Desktop displays a fallback explanation. A legacy workspace does not acquire presentation metadata simply by opening or saving.

Resolution walks the workspace-owned tree, stopping at Document roots. Block IDs inside Documents cannot accidentally become workspace-object anchors. Shared Document occurrences resolve to one canonical content record and their existing placement keys. Missing or ambiguous anchors are reported without removing directory entries or bounds. Runtime content/placement keys are resolution results only and are never added to the serialized directory.

Initially resolved targets are pinned for the session: removing an object and inserting a different object with the same authored ID reports `replaced`, rather than silently rebinding a saved placement. Undo restoring the original content identity resolves normally. A missing Document can still resolve when its resource becomes available. Directory discovery, missing-ID allocation and visual placeholders remain C/D work.

## State, save and lifetime

Presentation state has its own revision and saved revision, separate from repository transactions and text undo. Camera/bounds setters validate and clone their inputs. No-op updates do not increment the revision; callers cannot mutate live state through returned data. B's initialization method accepts a caller-supplied directory/layout and refuses to overwrite an existing Canvas; it does not derive a layout.

The [persistence service](src/reactive-editor/persistence.ts) attaches only the state's `capture`/`markSaved` capability. Both canonical local writes and server bundles synchronously capture repository and presentation revisions before asynchronous work. The captured sidecar is merged into the encoded root; the loaded root metadata remains the original snapshot, not a second live layout authority. Application workspace exports now use this capture path. Low-level `editor.encodeWorkspace()` remains the repository codec and does not independently read session layout state.

Successful saves acknowledge only the revisions actually captured. Newer content and newer layout remain independently dirty; the canonical host shows **Unsaved changes** for either. Focus bookmarks remain local-export data and change neither dirty clock nor undo. Layout-only changes leave Document payload hashes and repository revision unchanged.

The canonical local-file handler previously marked the completion-time repository revision saved. It now acknowledges its original owner and capture after the writer succeeds. Cancellation/failure does not acknowledge a capture. Foreign, repeated or disposed capture acknowledgements are ignored. Disposal invalidates pending server completions; disposal during bundle construction prevents starting the HTTP request. An HTTP request already sent is not claimed to be cancelled or rolled back.

Existing server resource locations, hashes, create-only/overwrite handling, missing-resource recovery and History restrictions remain in place. Saving to another server filename retains the existing document identities/resources. Local Save As UI and the presentation menu are not introduced in B; the later explicit Save As action must use this same capture path and the existing browser writer's `saveAs` option.

## Qualification

**76 tests passed across 12 suites**, plus `npm run typecheck`, `npm run build` (client and server), and `git diff --check`, using Node 22.12.0.

The focused test command was:

```sh
npm test -- \
  src/application/workspace-session.test.ts \
  src/reactive-editor/workspace-presentation.test.ts \
  src/reactive-editor/persistence.test.ts \
  src/reactive-editor/workspace-manifest.test.ts \
  src/reactive-editor/local-workspace.test.ts \
  src/demo/workspace-demo.test.tsx \
  src/demo/public-hosted-version.test.tsx \
  src/demo/workspace-background.test.tsx \
  src/features/compact-document/workspace.test.tsx \
  src/features/compact-document/window.test.tsx \
  src/runtime/local-coordinates.test.ts \
  server/workspace-store.test.ts \
  --maxWorkers=2 --minWorkers=1
```

Coverage includes:

- Legacy open/save without added presentation metadata; default-off behavior; valid/unknown/malformed envelopes; unknown fields; duplicate IDs/occurrences, invalid geometry and invalid directory references.
- Local and server materialization round-trips retaining Canvas data, Desktop metadata and shared Document identity. Milestone A's conflicting local-identity rejection tests also pass.
- Missing/ambiguous/internal anchors, identity reuse after deletion, and restoration through undo.
- Layout-only dirty state without repository writes, Document hash changes or text undo; focus export without authored edits.
- Consistent snapshots before asynchronous hashing and writes; independent newer content/layout revisions; double-submit prevention, write errors and disposal races.
- Actual canonical host local-file flow with a delayed writable handle: the first write contains the captured text and opaque envelope; a later edit remains unsaved; the next write clears it; a failed write leaves it dirty.
- Existing canonical server Open/Save, split-demo local export, background/focus behavior, Compact expanded-width restoration, and coordinate helper regressions.
- Real HTTP/filesystem server save/reload, including an unsupported presentation envelope retained in root metadata, plus existing resource conflict/path/read-only checks.

Host/component qualification used **jsdom**, with mocked browser file handles. HTTP storage tests used a real temporary server and filesystem. No new real-browser run or typing benchmark was performed in B: it adds no editing, coordinate, input or rendering path. Milestone A's browser results remain the scaled-editing evidence and must not be presented as a new B run. Build output included the existing browser-mapping age and large-chunk warnings, with no build failure.

## Constraints carried into C/D

No new architectural requirement emerged and no milestone revision is required. The existing coordinate and Window host seams remain unchanged. There are no new observers, polling, feature input dispatch, layout registry or generalized plugin interfaces. Object resolution is performed at load and on explicit request, not subscribed to every keystroke.

C must retain this session/editor/projection while changing rendered roots; resolve before mounting; prevent rendering one projected occurrence twice or simultaneously mounting an ancestor and its descendant. It must derive only a missing layout and avoid replacing an intentionally empty one. Any directory identity allocation must happen as an explicit initialization step, not during ordinary save or load.

D remains responsible for gesture cancellation, committing layout at gesture completion, camera controls, object actions, media/app qualification and physical removal. Prefer an existing suitable inline Block application; Counter remains a fallback only. Reverse derivation remains separately reviewable E. History/persistence extraction and Text Superposition remain outside this work.

**Stop here for review before Milestone C.**
