# Cross-Block text selection and formatting

Status: planning complete; implementation NOT STARTED.
Recorded: 13 September 2026.
Current request authorizes analysis and a safe, resumable plan, not code changes.

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

- [ ] Re-read this plan, current worktree diff, and referenced code before editing.
- [ ] Re-run focused selection, clipboard, toolbar, inline and split tests;
  record commands and results rather than assuming earlier results still hold.
- [ ] Measure selection capture/highlighting on small and long-document fixtures.
- [ ] Prototype pointer drag and Shift+arrow across separate editable surfaces in
  Chrome and Safari; check Firefox where available. Record browser availability.
- [ ] Choose native selection with controlled capture only if it reliably works;
  otherwise use model-owned selection and local overlays. Do not restructure all
  contenteditables merely to make browser selection span them.

Gate: evidence-backed interaction strategy, baseline metrics, fixtures, and a
default-off experimental switch before cross-Block behavior reaches normal users.

### P1 — Selection model and pure range resolution

- [ ] Add an occurrence-aware, view/stream-scoped cross-Block selection service
  alongside existing selection services. Reuse endpoint types, not unsafe local
  selection mutation methods.
- [ ] Implement ordering, directional normalization, local segment derivation,
  barrier validation, empty-Block behavior and stale endpoint rejection.
- [ ] Define explicit ownership transitions between local text, cross-Block text,
  whole-Block selection, and toolbar focus; avoid two simultaneously active
  mutation targets. Toolbar focus retains the text selection bookmark.
- [ ] Map content edits per endpoint; invalidate on unsupported structural edits,
  hidden tabs, removed occurrences, document switches and disposal.
- [ ] Unit-test forward/reverse ranges, 2 and many Blocks, Unicode Cell indices,
  inline atoms, empty paragraphs, barriers, repeated content in different views,
  and invalidated selections.

Gate: model tests pass; no UI activation or persistence change; single-Block
selection and editing paths remain unchanged.

### P2 — Safe pointer/keyboard selection and highlighting

- [ ] Route two-endpoint capture through the service. Fix local capture so a head
  outside its flow cannot become a bogus local range.
- [ ] Add drag selection, document-scroller autoscroll, reverse dragging, and
  Shift+Left/Right/Up/Down extension across supported boundaries. Preserve anchor
  and preferred horizontal coordinate; use the binding registry for key actions.
- [ ] Render only affected local highlights; support Escape, collapse to an
  endpoint, and ordinary click-to-caret without stale overlays or focus jumps.
- [ ] Preserve selections through toolbar pointer/keyboard focus and colour input.
- [ ] While experimental, intercept unsupported cross-Block typing, replacement,
  Enter, Delete/Backspace, cut/paste, composition and native beforeinput mutations.
  Explain the limitation accessibly and offer a safe collapse/cancel path. Guard
  browser Edit-menu actions as well as keydown. Do not route them to Block clipboard.
- [ ] Make text copy either explicitly unavailable with feedback or implement it
  only as an independently tested, documented follow-up; never copy just one
  endpoint's stale local selection. External paste remains outside initial scope.
- [ ] Exercise browser IME behavior before exposing this experimental milestone;
  cancelling keydown alone is not a sufficient mutation guard.

Gate: browser tests demonstrate accurate highlights, boundaries, focus and safety;
no unintended document mutation through keyboard, native clipboard or IME paths.

### P3 — Cross-Block ordinary formatting

- [ ] Create one formatting command accepting validated local segments; use it
  from toolbar actions and applicable existing style bindings.
- [ ] Add a separate property per non-empty segment, with fresh identity and
  existing exact-duplicate behavior. Do not alter semantic annotations or metadata.
- [ ] Apply all changes in one transaction; restore the cross-Block selection
  afterward. Validate every segment before committing any changes.
- [ ] Cover all currently supported style/colour tools. Keep paragraph indentation,
  alignment and structural list nesting distinct from text range formatting.
- [ ] Do not extend the current whole-Block Clear Formatting implementation to a
  partial cross-Block range. Either implement range-aware style subtraction with
  property splitting and preserved outside portions, or disable that action for
  cross-Block selections with an explanation until tested.
- [ ] Verify exact selected Cell coverage, boundary cases, existing overlapping
  properties, undo/redo, transaction rollback, save/load and local monitor behavior.

Gate: normal styles work across selected paragraphs without linked IDs or schema
changes. Selection-plus-formatting may be demonstrated experimentally, with its
editing limitations explicitly recorded; do not claim full text-editing parity.

### P4 — Integration, performance and release decision

- [ ] Run typecheck, client/server builds and full tests; compare with the baseline.
- [ ] Extend browser smoke checks for pointer and keyboard selection, formatting,
  toolbar focus retention, unsupported-operation guards and document scrolling.
- [ ] Compare measured large-document drag responsiveness, ordinary typing and
  paragraph-split latency with P0. No document snapshots on pointer movement;
  no full-document scan or layout per ordinary keypress. Set quantitative regression
  tolerances from P0 measurements and record them before claiming success.
- [ ] Verify existing Block selection/drag/clipboard and same-Block text clipboard,
  annotation monitor, margin creation and tab interactions remain intact.
- [ ] Record tested browsers and any unavailable browser/IME checks explicitly.
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
