# Document reconstruction fallback — investigation qualification

21 October 2026. Accepted baseline: E1.3, commit `1ef3de0`.

## Outcome and stopping point

**Investigation complete; production reconstruction fallback is not implemented or enabled.** The brief authorizes stopping before a significant new session-ownership abstraction. Proofs show that existing primitives support opening the same canonical resource and disposing an abandoned candidate, but not atomic replacement of a session, Flint reference, Save route and exact-source Return relationship. The proposed replacement binding and transaction are documented in the [architecture assessment](MUTABLE_WINDOW_MANAGER_RECONSTRUCTION_ASSESSMENT.md).

The separate [E1.4 durable-topology proposal](MUTABLE_WINDOW_MANAGER_E1_4_DURABLE_TOPOLOGY_PROPOSAL.md) covers retained and reconstructed presentations without persisting the mechanism. No Desktop 5 types, schemas, validators, persistence guards or ownership code have changed.

E1.3 remains experimentally accepted within its existing scope. Its sole product change here is replacing **Close without saving** with **Close window**. The existing dialog still explains that closing ends this editing session and retains unsaved canonical edits in the current workspace. Tests and the browser fixture now exercise that label. No close/Save policy changed.

## Proof implementation

All new experimental rendering is under [scripts/e1-reconstruction](scripts/e1-reconstruction/). No production module imports it. The existing finite browser runner has an explicit `--reconstruction-proof` mode.

The proof uses real WorkspaceSession, Flint, DocumentSessionStore, TransientDocumentView, runtime WindowView, standoff editing, PdfBlockView and PDF.js. It creates a candidate using **existing mount and initial-attachment methods**, deliberately leaving the original alive. It does not simulate a successful handover by deleting the original or by modifying the coordinator's private state.

The PDF is the existing deterministic two-page fixture. The browser executes the real PDF.js parser, canvas renderer and text layer. HTTP responses for retained PDF bytes are isolated; no live Vault, ingestion, OCR, Save or external resource service is used. Chrome DevTools Protocol supplies trusted clicks and text input. The PDF selection probe sets the browser Selection explicitly; it is not evidence of an OS-native drag selection or a remapped PDF selection.

## Evidence by guarantee

| Guarantee | Demonstrated | Not demonstrated / necessary follow-up |
|---|---|---|
| Canonical resource identity/content | Candidate references the same content keys. Unsaved standoff edits and committed PDF annotations are visible. Construction causes no canonical revision change, resource duplication or Save. | A committed product reconstruction transaction does not exist yet. |
| Undo | Repository undo updates the candidate through the shared authority. | Per-widget private undo cannot be assumed reusable. |
| Runtime editor identity | Candidate session, ViewId and PDF DOM differ; original stays alive. | Reconstruction does **not** preserve Solid owner, occurrence keys or editing DOM. These remain retained-transfer guarantees only. |
| PDF presentation | Real source runs on page 2 at 125%; candidate opens on page 1 at 100%. | Page/zoom/scroll mapping needs an adapter. A mounted component without its canvas/text layer is not viewer readiness. |
| PDF annotations | Committed canonical annotation appears in candidate data. Original unfinished note remains intact while candidate is prepared. | Candidate has no unfinished note; region/text selection is not restored. Automatic source retirement would lose it. |
| Failure/cancellation primitive | Failed renderer releases its candidate; candidate disposal is idempotent and preserves source. Pending candidate PDF read is aborted without aborting source. | No product Cancel handover or fault-injected publication phase is claimed. |
| Source close primitive | Closing source disposes source but leaves separately attached candidate alive. | Existing methods do not coordinate this with pending replacement publication. A new transaction must prevent late orphan commit. |
| Hosts/Return/capture | Both initial sessions report their own origins. Original slot remains occupied, and a reverse transfer to it rejects. Existing moved-session guard sees no transferred topology. | Initial attachment is not a legitimate shortcut to replacement; Return/origin and capture policy require coordinated binding updates. |
| Cleanup | Three finite create/abort cycles restore projection/session/host counts. Candidate disposal calls projection disposal once. | This is not a load test or proof of repeated successful fallback Detach/Return cycles. |

The experiment deliberately records the capture-guard gap **without writing a workspace**. This is not a defect in accepted E1.3: its coordinator still rejects unsupported transfer. The gap appears only if one tries to implement fallback with unrelated initial attachments.

## Capability and lifecycle matrix

“Proposed reconstruction” below is a candidate policy for the next approved implementation. No row marked proposed currently enables fallback.

| Content/state | Current retained strategy | Reconstruction assessment and required policy |
|---|---|---|
| Qualified standoff Document, passive inline/image content | Retained transfer preferred and accepted | No fallback needed. Keep existing identity/selection/undo guarantees. |
| PDF with settled viewer and no local draft | Rejected as opaque/canvas | Proposed first adapter: exact snapshot/asset, page, zoom, viewport and validated selection restoration; await readiness before retirement. Canonical content recreation demonstrated. |
| PDF unfinished note/region/text selection | Rejected | Preserve through an explicit adapter, or explain the particular draft/selection consequence and require a decision. No silent reset. Current local fields are not in canonical state. |
| PDF read/render/extraction in progress | Rejected | Wait or reject with an operation-specific reason. Candidate read can be cancelled safely; that does not authorize cancelling the source operation. |
| Reviewed resource relationship / Claim submission | Unqualified tool/state blocks retained transfer | Reject until settled/reconciled. `ResourceRelationships` owns its own controller and local note/selection; a domain write may outlive client cancellation and is outside Document undo. |
| Web resource static representation | Opaque, rejected | Potential adapter for snapshot, loaded image and viewport; preserve provider/runtime safety and explicit activation policy. Not qualified here. |
| Active web embed / iframe / map | Rejected | Third-party application state and provider leases are not serializable by default. Reject while active; explicit user deactivation/reset can be a separately qualified path. Do not auto-reload an embed. |
| Academic viewer, OCR page, EPUB or bibliography selection | Opaque, rejected | Component-local page, loaded parsing result, selected citations, annotation draft and fragment require an adapter. Busy load/parse/extract/review/export blocks handover. Existing OCR display is not an active OCR-job authority. |
| Structured/IIIF/resource viewers | Opaque, rejected | Require explicit adapters for loading/worker lifetimes, table/tree expansion, zoom and draft state. No generic opaque-widget opt-in. |
| Audio/video playback | Rejected | Do not discard playback, remote player or consent state automatically. A future adapter could preserve supported local media position after explicit pause; unsupported providers reject. |
| Canvas preview | Rejected, including DOM-only preview | Its movable-box positions and drag state are component-local. Reconstructing resets them. Reject until an adapter or explicit reset policy is qualified. No Canvas/Spatial integration introduced. |
| Positioned content and relation/margin islands | Rejected | Coordinate/owner/anchor mapping needs separate qualification. No arbitrary rehosting. |
| Plain/native/source editors and CodeMirror | Rejected | Local undo/composition/selection may differ from canonical history. Require renderer-specific contracts; no universal reconstruction. |
| Application-owned portals, Entity/Thesis tools, modal stacks | Unqualified surfaces/operations block transfer | Remain with their owning app; no promotion or implicit closure. Affected live tools must finish or obtain a qualified participant adapter. Unsaved Thesis drafts are not reconstructible from a Document resource. |
| IME composition, cross-Block selection, pending native Save/receipt, ingestion/export | Existing guards apply | No fallback for an operational block. Composition/receipt/active domain work must settle. Cross-selection remapping must use exact placements and content versions; ambiguity rejects. |
| Unknown custom Block/adapter version | No automatic qualification | Reject with the actual type/unsupported capability. DOM movability or remountability alone is insufficient. |

The relevant lifecycle audit covers `pdf-block-view.tsx`, `pdf/viewer.ts`, `web-resource-view.tsx`, `academic-resource-view.tsx`, `structured-resource-view.tsx`, `resource-relationships.tsx`, `video-block-view.tsx`, `CanvasPreviewView`, session/store/host code and Flint navigation. Several viewer `busy`/draft signals are local and are not exposed through a generic reconstruction participant. Scanning disabled buttons would not be a valid lifecycle API.

Proposed disabled explanations identify the operation: for example, “Finish the PDF text extraction before detaching,” “Finish or clear the PDF annotation draft,” or “Close the active web embed before detaching.” A typed capability decision must distinguish these from “PDF viewer requires reconstruction.” Unexpected retained-transfer errors must never select fallback.

## Qualification results

Full results and comparison data: [MUTABLE_WINDOW_MANAGER_RECONSTRUCTION_EVIDENCE.json](MUTABLE_WINDOW_MANAGER_RECONSTRUCTION_EVIDENCE.json).

| Check | Result |
|---|---|
| New isolated boundary tests | 6 passed |
| E1.1/E1.2/E1.3 targeted selection | 101 passed |
| Combined targeted run | **107 passed, 0 failed**, 8 files |
| Real PDF production-viewer browser proof | **17 passed** |
| E1.3 product browser compatibility, including revised close label | **60 passed** |
| Accepted 41-file regression selection | **433 passed, 13 failed**, plus established synthetic drag/drop error |
| Application client/server and isolated proof TypeScript | Passed |
| Diff validation | Passed |

All 446 regression file/test/status outcomes match the accepted E1.3 evidence, counting duplicate test names. The known failures remain six application-startup, three workspace-demo, three Timer and one block-selection drag/drop case. No baseline failure was suppressed. This is comparison with accepted evidence, not a fresh baseline-checkout execution.

No completed PDF fallback Detach/Return, adapter-preserved transient state, atomic handover cancellation/rollback, fallback focus restoration or successful repeated fallback cycles is claimed. Those required product scenarios remain acceptance gates for the proposed implementation. The unchanged retained path is covered by its 101 targeted tests and 60 browser checks. E1.2/E1.1/D1/C browser artifacts from accepted E1.3 remain baseline evidence; they were not independently rerun in this investigation.

## Reproduction

```sh
npx vitest run --maxWorkers=1 --minWorkers=1 \
  scripts/e1-reconstruction/boundary.test.tsx \
  src/application/document-detachment.test.tsx \
  src/application/document-host-transfers.test.tsx \
  src/application/document-sessions.test.tsx \
  src/runtime/document-counts.test.ts \
  src/application/flint-transient-proof.test.ts \
  src/rendering/cross-block-selection.test.tsx \
  src/rendering/range-rendering.test.tsx
node scripts/qualify-window-manager.mjs --reconstruction-proof
node scripts/qualify-window-manager.mjs --e13
npx tsc --project scripts/e1-reconstruction/tsconfig.json
npm run typecheck
git diff --check
```

Reproduce the regression selection:

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const e = JSON.parse(fs.readFileSync('MUTABLE_WINDOW_MANAGER_RECONSTRUCTION_EVIDENCE.json','utf8'));
const r = spawnSync('npx',['vitest','run','--maxWorkers=1','--minWorkers=1',...e.regression.files],{stdio:'inherit'});
process.exitCode = r.status ?? 1;
JS
```

The finite runner cleans up its Chrome process/profile and Vite server. Proofs dispose candidates/workspaces and restore fetch instrumentation. No production data resources were created. No load testing or latency claims were made.

## Review request

Review the proposed replaceable binding/atomic handover and first PDF adapter before enabling fallback. Separately review the E1.4 durable-topology contract and its unresolved Return-address, arrangement and migration decisions. Work stops here under the brief's explicit architecture-change condition; no E1.4 schema work has begun.
