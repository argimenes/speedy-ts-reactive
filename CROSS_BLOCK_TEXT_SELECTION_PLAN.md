# Cross-Block text selection and formatting

Update: the subsequent editing/linked-annotation implementation supersedes the
historical mutation guards and semantic deferral below. See
[CROSS_BLOCK_EDITING_MIGRATION.md](CROSS_BLOCK_EDITING_MIGRATION.md) for current
behavior, completed phases, verification and remaining limits.

Status: selection/formatting milestone implemented, opt-in and default-off.
See checkpoint 2 for verification and remaining release gates.
Latest preference behavior (checkpoint 5): explicit opt-in/opt-out is remembered
in this browser across reloads and document changes; the selection itself is not.
Recorded: 13 September 2026.
Implementation authorized by the subsequent “Execute” request.

## Decision and value

Cross-paragraph text selection has broad everyday value: Block boundaries should
not prevent a user from selecting a passage. It also supplies the foundation for
formatting, copying, and eventually replacing text across paragraphs.

The agreed incremental approach is:

1. Implement cross-Block text selection without replacing the whole editor.
2. Apply ordinary styles as independent Block-local standoff properties in one
   user operation. Shared annotation identity is unnecessary for this use case.
3. Defer linked, multi-range semantic annotations until a concrete use case
   justifies their persistence, monitor, and lifecycle complexity.

A semantic annotation spanning paragraphs could eventually have one logical ID,
type, value, metadata and attributes, with individually identified Block-local
ranges. This is preferable to unrelated semantic records or global document
character offsets. Shared data would live once at document level; local ranges
would reference it. This is a future design direction, NOT an approved schema
migration. No group IDs, document annotation store, or monitor redesign are needed
for the first implementation.

The major cost is interaction correctness, not drawing highlights. Once selection
crosses paragraphs, users reasonably expect typing and Backspace to replace it.
Selection plus formatting is an intermediate milestone, not a complete text-editing
experience. Unsupported mutations must be explicitly blocked, never silently
applied to only the first or last Block.

## Current code evidence

- `src/block-tree/types.ts`: `ViewPosition` already includes content identity,
  occurrence identity, and a Cell boundary with affinity. A `TextSelectionItem` has
  two such endpoints; the type can express distinct Blocks, but current consumers
  cannot safely process them.
- `src/runtime/selections.ts`: selection sets are keyed by occurrence;
  `setPrimary` creates both endpoints in one content record. `mapContentEdit`
  checks the anchor content and maps both endpoints together. It must not be used
  unchanged for cross-content endpoints.
- `src/input/gateway.ts`: selection-change capture resolves the anchor's mount
  and captures a single local range. Cross-Block gestures need two independently
  resolved endpoints and explicit document ordering.
- `src/rendering/standoff-editor-view.tsx`: each text flow is separately editable;
  selection capture checks that the anchor is in the flow but converts both
  endpoints against that flow. An external head must not be interpreted as a
  local offset. Native selection across these surfaces needs browser validation.
- `src/input/multi-selection-editor.ts`: replacement explicitly rejects
  cross-content multi-editing. Preserve this guard until structural editing is
  deliberately implemented.
- `src/rendering/document-style-bar.tsx`: captures one local range and appends a
  property to one Block. It needs a shared multi-Block formatting action, not a
  second parallel toolbar implementation.
- `src/runtime/block-selection.ts`, `src/runtime/block-clipboard.ts` and
  `src/rendering/block-selection.tsx`: whole-Block selection/clipboard is a separate
  interaction. Its handle shortcuts and internal clipboard must remain unchanged.
- Existing inline/split performance suites protect the recent large-document
  typing improvements. Cross-Block selection must not add document-wide work to
  the ordinary single-Block keypress path.

## Initial scope and invariants

- One contiguous text selection, with direction preserved, in one view and one
  active text stream. Keep existing same-Block multi-caret support separate.
- Start with consecutive Standoff text Blocks in the same ordinary parent list.
  Treat media, unsupported Blocks, nested-list boundaries, page/tab boundaries,
  margins and separate views as barriers. Do not silently skip them. Broader
  logical reading order can be a later explicit extension.
- No crossing into inactive tabs or owned margin relations. A margin can retain
  its own local selection without becoming part of the main-text stream.
- Store anchor/head as occurrence-aware Cell boundaries, not DOM nodes, UTF-16
  offsets, or document-wide character offsets. Derive ordered, half-open local
  segments; convert to inclusive standoff endpoints only when creating properties.
- Keep selection ephemeral. Ordinary formatting uses existing persisted property
  records with fresh IDs; no saved-document schema change.
- Empty paragraphs may be traversed but receive no zero-length style property.
  Inline images remain atomic Cells; do not flatten them into alt text. Validate
  highlighting and applicable styles without changing their payloads.
- Content edits remap only endpoints belonging to the edited content. Structural
  edits either provide explicit maps or invalidate the cross-Block selection
  safely; never apply a stale selection to another Block.
- For an initial cross-Block selection, unrelated structural commands should
  clear/invalidate it before proceeding, or decline with a clear message.
  Do not silently broaden their targets to every selected paragraph.
- Annotation actions are atomic and undoable. Selecting/highlighting alone never
  mutates the repository or creates history entries.

## Implementation phases and acceptance gates

### P0 — Baseline and browser feasibility

- [x] Re-read this plan, current worktree diff, and referenced code before editing.
- [x] Re-run focused selection, clipboard, toolbar, inline and split tests;
  record commands and results rather than assuming earlier results still hold.
- [ ] Measure selection capture/highlighting on small and long-document fixtures.
- [ ] Prototype pointer drag and Shift+arrow across separate editable surfaces in
  Chrome and Safari; check Firefox where available. Record browser availability.
- [x] Choose native selection with controlled capture only if it reliably works;
  otherwise use model-owned selection and local overlays. Do not restructure all
  contenteditables merely to make browser selection span them.

Gate: evidence-backed interaction strategy, baseline metrics, fixtures, and a
default-off experimental switch before cross-Block behavior reaches normal users.

### P1 — Selection model and pure range resolution

- [x] Add an occurrence-aware, view/stream-scoped cross-Block selection service
  alongside existing selection services. Reuse endpoint types, not unsafe local
  selection mutation methods.
- [x] Implement ordering, directional normalization, local segment derivation,
  barrier validation, empty-Block behavior and stale endpoint rejection.
- [x] Define explicit ownership transitions between local text, cross-Block text,
  whole-Block selection, and toolbar focus; avoid two simultaneously active
  mutation targets. Toolbar focus retains the text selection bookmark.
- [x] Revised conservative lifecycle: invalidate before external edits rather than
  mapping unverified endpoints; also invalidate on hidden tabs, removed occurrences,
  document switches and disposal. Authoritative edit maps remain deferred.
- [x] Unit-test forward/reverse ranges, 2 and many Blocks, Unicode Cell indices,
  inline atoms, empty paragraphs, barriers, repeated content in different views,
  and invalidated selections.

Gate: model tests pass; no UI activation or persistence change; single-Block
selection and editing paths remain unchanged.

### P2 — Safe pointer/keyboard selection and highlighting

- [x] Route two-endpoint capture through the service. Fix local capture so a head
  outside its flow cannot become a bogus local range.
- [x] Add drag selection, document-scroller autoscroll, reverse dragging, and
  Shift+Left/Right/Up/Down extension across supported boundaries. Preserve anchor
  and preferred horizontal coordinate; use the binding registry for key actions.
- [x] Render only affected local highlights; support Escape, collapse to an
  endpoint, and ordinary click-to-caret without stale overlays or focus jumps.
- [x] Preserve selections through toolbar pointer/keyboard focus and colour input.
- [x] While experimental, intercept unsupported cross-Block typing, replacement,
  Enter, Delete/Backspace, cut/paste, composition and native beforeinput mutations.
  Explain the limitation accessibly and offer a safe collapse/cancel path. Guard
  browser Edit-menu actions as well as keydown. Do not route them to Block clipboard.
- [x] Make text copy either explicitly unavailable with feedback or implement it
  only as an independently tested, documented follow-up; never copy just one
  endpoint's stale local selection. External paste remains outside initial scope.
- [ ] Exercise browser IME behavior before exposing this experimental milestone;
  cancelling keydown alone is not a sufficient mutation guard.

Gate: browser tests demonstrate accurate highlights, boundaries, focus and safety;
no unintended document mutation through keyboard, native clipboard or IME paths.

### P3 — Cross-Block ordinary formatting

- [x] Create one formatting command accepting validated local segments; use it
  from toolbar actions and applicable existing style bindings.
- [x] Add a separate property per non-empty segment, with fresh identity and
  existing exact-duplicate behavior. Do not alter semantic annotations or metadata.
- [x] Apply all changes in one transaction; restore the cross-Block selection
  afterward. Validate every segment before committing any changes.
- [x] Cover all currently supported style/colour tools. Keep paragraph indentation,
  alignment and structural list nesting distinct from text range formatting.
- [x] Do not extend the current whole-Block Clear Formatting implementation to a
  partial cross-Block range. Either implement range-aware style subtraction with
  property splitting and preserved outside portions, or disable that action for
  cross-Block selections with an explanation until tested.
- [x] Verify exact selected Cell coverage, boundary cases, existing overlapping
  properties, undo/redo, transaction rollback, save/load and local monitor behavior.

Gate: normal styles work across selected paragraphs without linked IDs or schema
changes. Selection-plus-formatting may be demonstrated experimentally, with its
editing limitations explicitly recorded; do not claim full text-editing parity.

### P4 — Integration, performance and release decision

- [x] Run typecheck, client/server builds and full tests; compare with the baseline.
- [x] Extend browser smoke checks for pointer and keyboard selection, formatting,
  toolbar focus retention, unsupported-operation guards and document scrolling.
- [ ] Compare measured large-document drag responsiveness, ordinary typing and
  paragraph-split latency with P0. No document snapshots on pointer movement;
  no full-document scan or layout per ordinary keypress. Set quantitative regression
  tolerances from P0 measurements and record them before claiming success.
- [x] Verify existing Block selection/drag/clipboard and same-Block text clipboard,
  annotation monitor, margin creation and tab interactions remain intact.
- [x] Record tested browsers and any unavailable browser/IME checks explicitly.
- [ ] Decide with the user whether to expose the limited milestone or keep it
  experimental until replacement semantics are implemented. Document limitations.

Gate: evidence-backed handoff, known limitations, and an explicit release decision.

### Deferred follow-up — Full cross-Block text editing

Not part of initial selection/formatting implementation. Before enabling normal
replacement, specify suffix/prefix joining, surviving Block identity, paragraph
styles, owned margins, empty paragraphs, annotation splitting/mapping, inline atoms,
Enter, deletion, IME, text cut/copy/paste, and undo/caret restoration. Reject or
explicitly handle structural barriers. External/rich paste needs separate scope.

### Deferred follow-up — Linked semantic annotations

Require a concrete passage-level semantic use case first. Then design shared IDs,
local range IDs, legacy import/export, partial copy semantics, split/join, whole
versus segment deletion and monitor UI. Default recommendation: ranges travel with
their Blocks when moved; they may become discontinuous rather than automatically
including newly intervening text. This remains a design proposal, not current code.

## Progress and interruption protocol

This file is the authoritative resumable checklist for this feature. Update it
after each coherent work slice and before an intentional pause. Also add a short
checkpoint to `RESTRUCTURE_PROGRESS.md` when a phase starts, passes, or blocks.
Do not rely on conversation history as the only record.

For every checkpoint record:

```text
Date / phase:
Completed checklist items:
Changed files and purpose:
Verification commands, results, browser versions and artifact paths:
Known failures: baseline versus newly introduced:
Incomplete work / active processes (PID or session, purpose, ownership):
Exact next action:
Decisions or user input still needed:
Commit identifier if committed; otherwise explicitly uncommitted:
```

On resumption: read the latest checkpoint and git status/diff; reconcile files
with the checklist; inspect partial edits and relevant test output; rerun any
uncertain checks. Never mark a phase complete merely because code exists. Preserve
user edits and existing dev servers; do not reset the worktree or commit without
a request. Prefer small phase-sized changes and the experimental switch for
rollback rather than reverting unrelated work.

### Checkpoint 0 — 13 September 2026

- Completed: agreed value/scope analysis, current-code inspection, staged plan,
  acceptance gates, and interruption protocol. P0–P4 are all pending.
- Changed this turn: this plan and the linked entry in `RESTRUCTURE_PROGRESS.md`.
  No runtime changes or schema changes for this feature.
- Verification: inspected endpoint types, local selection service/capture,
  multi-selection replacement guard and toolbar annotation path. Documentation
  checks only; no new test or browser run is claimed for this planning turn.
- Existing worktree: prior Block clipboard implementation and its docs/tests are
  uncommitted. Preserve them; do not misattribute them to this feature.
- Prior reported baseline (re-run in P0): 15 focused Block selection tests passed;
  typecheck/build and Chrome Block clipboard/drag smoke passed. Last full run
  reported 143 passing tests and two pre-existing context-menu failures before the
  additional platform-default test was added. Do not treat that as a fresh run.
- Active processes started for this feature: none.
- Exact next action when implementation is requested: P0 baseline tests and
  browser feasibility fixture, followed by the interaction strategy checkpoint.
- Pending decisions: browser strategy after P0; release choice after P4. Linked
  semantic annotations and full replacement remain deferred.
- Commit: not committed.

### Checkpoint 1 — 13 September 2026, P0/P1/P2/P3 in progress

- Baseline: focused Block selection, toolbar, inline and split suites passed:
  32 tests, four files, 15.00s total in this run. Existing no-snapshot and stable
  Cell/occurrence performance assertions pass. Baseline timing is diagnostic,
  not a promise of equal wall-clock test duration on a busy machine.
- Browser feasibility: `node scripts/check-cross-block-selection.mjs` on Chrome
  153.0.8010.36. Native drag and Shift+Right remained in the first editing host.
  Chosen strategy: model-owned cross-Block selection with per-Block overlays;
  retain native selection for ordinary local editing. Safari 18.5 is installed;
  Safari interaction/IME tests are not yet run. Firefox not found in /Applications.
- User follow-up explicitly raised bringing forward replacement of built-in
  Selection. Response: bring forward this cross-Block layer, not full native
  caret/IME/accessibility replacement.
- Implemented in new `src/runtime/cross-block-selection.ts` and
  `src/input/cross-block-input.ts`: range resolution/barriers, cached sibling
  stream, model-owned pointer and keyboard handling, autoscroll, local highlights,
  mutation guards and independent style transactions. Toolbar has a default-off
  experimental checkbox; active selected flows are read-only to prevent native
  partial edits. Clear Formatting/layout/tab actions decline cross-Block ranges.
- Integration: editor lifecycle, mount point conversion, local capture head
  validation, binding registry, toolbar, whole-Block selection ownership.
- Safety refinement: until an authoritative structural/inline operation-map
  integration exists, external repository mutations invalidate the cross-Block
  selection before mutation, including text edits, rather than guessing offsets.
  Formatting through this feature retains the selection. Endpoint remapping is
  deferred to full replacement; this is an explicit conservative deviation from
  P1, not an implemented mapping claim.
- Focused new tests: seven pass; typecheck passes. Chrome integration smoke is
  still being debugged/extended; no completed P2/P4 gate claimed yet.
- Still pending: complete browser keyboard/pointer/toolbar/guard checks, long
  document selection measurement and regression checks, full suite/build,
  release decision and final checklist reconciliation.
- Performance acceptance before final measurements: no snapshots/revisions for
  selection, cached sibling stream during a gesture, existing no-snapshot typing
  and split invariants unchanged; Chrome model-update p95 under 50ms for a
  20-paragraph selection in a 300-paragraph fixture. Record actual results; do not
  claim full pointer-to-paint latency from model-only timings.
- Next action: finish `CROSS_IMPLEMENTED=1 node scripts/check-cross-block-selection.mjs`,
  then integration/performance tests and update this checkpoint.
- No document-store writes, commits, browser preference changes or user-server
  shutdowns. Smoke tests own and clean up isolated Chrome processes/profiles.

### Checkpoint 2 — 13 September 2026, experimental milestone handoff

Implemented interaction:

- Check **Cross-Block selection (experimental)** in the document formatting bar.
  It is off by default, session-only, and does not modify saved document data.
- Drag between consecutive text Blocks in the same list, or extend with
  Shift+arrows. Reverse selection and document-edge autoscroll are supported.
  Structural/media boundaries are not silently skipped.
- Apply any existing style/colour toolbar action. Cmd+B/I/U on Apple platforms
  or Ctrl+B/I/U elsewhere applies bold/italic/underline to the cross-Block range.
  Each non-empty local range gets an independent annotation, committed atomically.
- Escape, an unmodified arrow, a normal click in text, or **Resume text editing**
  leaves cross-Block selection. Shrinking back into one Block restores native
  local selection. Undo/redo bindings from a cross-Block selection collapse it
  safely and use document history.
- Copy/cut/paste, text replacement, Enter and deletion of this text range are
  explicitly guarded. The separate whole-Block clipboard remains available from
  handles. Clear Formatting, paragraph layout and tab creation decline while the
  cross-Block text selection is active. Toolbar colour inputs retain native input.

Verification and fixes:

- Nine focused cross-Block tests pass: scope/barriers, reverse/empty/Unicode
  ranges, all 17 existing style/colour tools, exact inclusive ranges, duplicates,
  rollback, persistence, undo/redo, keyboard guards, toolbar preservation,
  conservative edit invalidation, hidden mounts, inline atoms, semantic data,
  whole-Block ownership and platform formatting/history bindings.
- `CROSS_IMPLEMENTED=1 node scripts/check-cross-block-selection.mjs` passes in
  Chrome 153.0.8010.36: real forward/reverse pointer dragging, Shift+horizontal
  and vertical arrows, highlighting, toolbar clicks, Escape, undo and autoscroll.
  Chrome `Input.insertText` and `Input.imeSetComposition` probes did not mutate the
  canonical document or visible text while the surfaces were read-only.
- Browser testing found and fixed two issues not caught by the model tests:
  read-only text flows needed explicit focusability to keep Escape working;
  vertical hit tests in paragraph padding needed to distinguish a same-line hit
  from movement to the adjacent paragraph. Active flows expose `aria-readonly`.
- `node scripts/check-block-selection.mjs` passes existing real selection,
  native group drag, clipboard shortcuts and cut-all/paste checks.
- Final verification: typecheck and client/server build pass. `npm test` reports
  153 passing tests / 155 total across 25 files, with the same two baseline
  context-menu failures (`Delete Block` item missing and tab menu `ownerKey`
  undefined). All nine new tests pass. `git diff --check` passes.
- Long-document microbenchmark: 300 paragraphs / 20 selected paragraphs / 100
  updates, p95 model-update time approximately 0.2–0.3ms across repeated runs,
  zero repository snapshots,
  zero revisions. Local native capture p95 approximately 0.1ms. These are
  different operations, NOT an improvement ratio or pointer-to-paint benchmark.
  Existing inline/split no-snapshot and identity-preservation tests still pass.

Remaining gates (intentionally not checked off above):

- Native Safari interactions, physical OS IME, screen-reader behavior and Firefox
  compatibility have not been validated. Safari 18.5 is installed; no browser
  preferences were changed. Firefox was not found. Chrome's CDP composition probe
  does not substitute for physical IME testing.
- Full paint-latency measurement on representative long real documents and
  broader browser profiling remain future validation, not completed P0/P4 claims.
- Keep the milestone opt-in; do not silently enable it by default. Obtain the
  user's release decision after they evaluate the selection/formatting behavior.
- Full cross-Block text replacement and linked semantic annotations remain
  deferred. An authoritative operation-map design is required before preserving
  cross-Block selections through external text/structural edits.

Resume instructions: begin with the remaining browser/manual validation and user
feedback, not by rebuilding the selection service. Run the focused test and Chrome
script above, check git status/diff, then update this checkpoint. All implementation
files are listed in checkpoint 1; this feature's test and script are new files.
No commit was made. No persistent process was started for the feature; test-owned
Chrome profiles/processes are cleaned up. The existing Vite/server is left running.

### Checkpoint 3 — drag, click-away and held Shift-arrow follow-up

- User reported dragging would not enter adjacent Blocks, local highlights
  remained after clicking another Block, and held Shift+Left stopped at the first
  character. Added regression coverage for these specific gestures.
- `CrossBlockInput.at` now validates native caret hit tests against the mounted
  Block returned by `elementFromPoint`. If native APIs are missing, return no
  usable point, or stay pinned to the original editing host, the target mount
  computes a local Cell boundary from its rendered Cell rectangles. Both pointer
  directions use this fallback, without flattening or changing document data.
- Text `dragstart` is prevented while a selection gesture is in progress so
  native text drag/drop does not take over that gesture.
- Ordinary click-away now clears retained local selection sets outside the
  destination Block, even with the experimental feature off. Toolbar/dialog/
  modified clicks retain their existing selection behavior.
- Experimental Shift+Left/Right now owns the entire grapheme-boundary gesture,
  including the local part and repeated keydowns. It no longer depends on native
  extension successfully reaching/reporting an editing-host boundary before
  taking over. Ordinary unmodified caret movement/editing remains native.
- Browser regression fixture includes the original demo's document-tab/PageBlock
  structure, styled heading, aligned paragraphs and margin relations. It forces
  both native caret APIs to remain pinned to the starting Block, verifies forward
  and reverse dragging, and checks that local and cross-Block highlights disappear
  after clicking another Block. Held Shift+Left uses real CDP auto-repeat keydowns.
- The opt-in switch is still required and resets on editor recreation. Asked the
  user which browser they use and whether the switch is enabled; no reply needed
  to implement/test these robustness fixes. Do not claim Safari reproduction.
- Resume: check final verification results below, then investigate any remaining
  user-reported case with their browser/document and switch state. Preserve the
  pending changes; no commit or server restart was requested.
- Final verification: 11 focused cross-Block tests pass; Chrome demo-page/fallback,
  held Shift+Left, click-away, autoscroll and existing cross-selection smoke pass.
  Typecheck/build and whitespace checks pass. Full suite: 155 pass / 157 total;
  only the same two baseline context-menu failures remain. No test processes left
  running; existing user development server untouched. Changes uncommitted.

### Checkpoint 4 — own pointer selection from mouse-down

- User reports the issue persists. Tested the actual running WorkspaceDemo, not
  an injected editor: `ACTUAL_APP=1 node scripts/check-cross-block-selection.mjs`
  physically checks its switch and drags from the left-aligned to right-aligned
  demo paragraph. Chrome selects both. This does not reproduce the user's browser
  failure; browser and enabled-switch state remain important diagnostic details.
- Removed the remaining late takeover from browser pointer selection. When the
  experimental switch is on, primary pointer-down now prevents native selection,
  captures the pointer on the mounted Block root and initializes the model/local
  DOM range. Every drag move updates it, including the initial local portion;
  pointer-up/cancel/disposal releases capture. Toolbar and modified context-menu
  clicks remain separate. Default-off/native editing mode is unchanged.
- This is a targeted robustness change, not a verified claim about the cause in
  the user's browser. Actual-app Chrome smoke, isolated regression smoke, 26
  focused cross/whole-Block selection tests and typecheck pass. Actual-app smoke
  additionally asserts that the connected Block's pointer-capture request was
  accepted (`hasPointerCapture` is true). CDP did not deliver a corresponding
  `gotpointercapture` event to the probe, so event delivery is not asserted.
- Resume from this actual-app probe and get browser/document/switch details if
  the user still sees confinement. Do not repeat unqualified “fixed” claims based
  solely on the fixture. No commit or user-server restart performed.

### Checkpoint 5 — remember the user's opt-in

- User confirmed cross-Block selection works when enabled and agreed to remember
  that choice. The unresolved confinement report was therefore switch state, not
  a reproduced Chrome drag failure.
- Persist only explicit enabled/disabled choices in browser localStorage under
  `speedy.cross-block-selection.enabled.v1`. Every new editor reads the preference,
  covering document changes and page reloads. A fresh/invalid preference defaults
  off. No document DTO, selection ranges, clipboard, or history are persisted here.
- If browser storage is blocked, the toggle still works for the current editor
  and reports that the setting cannot be remembered. Editing/clipboard guards
  are unchanged. Existing live editor instances retain their current toggle until
  changed or recreated; no cross-window broadcast is introduced.
- Added tests for persisted opt-in and opt-out, editor recreation, invalid/blocked
  storage, and no document mutation. The actual-app Chrome probe now reloads with
  opt-in, verifies no selection is restored, and then verifies persisted opt-out.
- This supersedes older checkpoint notes describing the toggle as session-only.
  No commits or server restarts requested; preserve the working tree on resume.
- Verification complete: 13 focused tests, typecheck and client/server build pass.
  Actual-app Chrome reload checks pass for opt-in, opt-out, and non-persistence of
  selected ranges. The reload harness now waits outside the page execution context
  to avoid navigation invalidating its own wait. Changes remain uncommitted.
