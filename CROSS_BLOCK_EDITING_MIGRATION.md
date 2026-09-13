# Cross-Block editing and linked annotations

Status: implemented, with the existing experimental opt-in. No commits requested.

## Rules agreed for this implementation

- Work within the existing contiguous, ordinary-sibling Standoff selection scope.
- One atomic replacement command retains the first Block's identity/layout, its
  unselected prefix, and the last Block's unselected suffix. Fully selected
  intervening paragraphs disappear. Inserted LF/CRLF text creates paragraphs;
  the caret ends immediately after inserted text, before the retained suffix.
- Retain unaffected Cell identities, inline images and annotation fragments.
  Clip/delete only selected annotation ranges; preserve shared annotation IDs.
  New paragraphs and split local annotation fragments get fresh IDs. Inserted
  text does not automatically acquire semantic membership.
- Owned left/right margins from removed paragraphs move to the retained first
  Block if that side is free. Conflicting same-side margins, other attachments,
  child Blocks, opaque relations and shared/transcluded paragraph content cause
  a safe refusal before changes. Do not silently destroy unrelated content.
- Typing, Enter, Backspace/Delete, text cut and plain-text paste share this
  command. Copy uses text/plain with paragraph newlines and U+FFFC for inline
  images (image data is not exported as text). Rich HTML/imported annotations are
  deferred. Empty/missing clipboard payloads must not delete a selection.
- Preserve IME safety: commit composed text once, not on every composition
  update. Browser input integration must be tested before removing safeguards.
- Introduce a root-level `linkedAnnotations` registry in the editor's document
  payload. Each record has a shared ID/type/value/metadata/attributes; local
  standoff properties have their own ID/range plus `annotationId` and a type for
  compatibility. Existing independent style properties remain independent.
- Linked semantic creation is explicit in the toolbar. The monitor shows shared
  identity and all segments, edits shared settings once, and distinguishes
  deleting one segment from deleting the whole annotation. Range movement is
  local to a segment; joining/splitting redistributes segments automatically.
- Save/load and whole-Block clipboard carry definitions and remap copied shared
  identities. Plain-text clipboard intentionally does not carry annotations.
- Orphan shared definitions are retained for undo/reference safety; they are not
  displayed as active annotations. Garbage collection is a separate operation.

## Resumable phases

- [x] Atomic replacement planner + model tests (Unicode, multiline, images,
  annotations, margins, safe refusals, undo/redo, stable untouched Cells).
- [x] Input, clipboard and composition integration + browser tests.
- [x] Shared registry, explicit creation UI, monitor and clipboard integration.
- [x] Persistence/lifecycle tests, existing performance invariants, typecheck,
  builds and full suite; document known failures and remaining limitations.

Checkpoint 0: inspected existing inline replacement, split/join, selection,
monitor and Block clipboard code. Existing user changes (preference persistence
and its tests/docs) are preserved. Next: implement the canonical replacement
planner. No new persistent processes or document-store writes.

## Checkpoint 1 — implemented and verified, 13 September 2026

- Canonical `cross-text-edit.ts` plans structural replacement. Runtime selection
  translates occurrence endpoints and restores a collapsed caret. One history
  entry covers all changed paragraphs. Runtime focus bookmarks are not undo data.
- `CrossBlockInput` focuses a temporary textarea while a cross range is active.
  It accepts browser beforeinput/clipboard/composition events; composition only
  commits at completion. Selected paragraph DOM stays protected from native edits.
- Linked definitions live in the root payload; `annotationId` joins local ranges.
  Rendering resolves shared settings, and the monitor exposes shared identity,
  segment list, shared settings and explicit whole-annotation deletion. Ordinary
  delete/move/resize actions remain local. Block copy carries definitions and
  creates fresh shared IDs; cut preserves IDs when safe. Existing inline clipboard
  copies Cells, not standoff properties, so it does not create dangling references.
- Toolbar controls keep stable space while experimental mode is enabled: changing
  selection must not shift paragraphs underneath a pointer gesture.
- Focused model/input tests: 23/23 pass. Monitor tests: 14/14 pass.
- Full suite before the final monitor test: 167/169 pass. Two existing failures in
  `block-context-menu.test.tsx` remain (synthetic context-menu button mismatch).
  Existing 25k-character typing and structural split performance tests pass.
- Typecheck and client/server production builds pass.
- Chrome 153/macOS smoke passes real pointer and held Shift selection, typing,
  Enter, Backspace, atomic undo, clipboard-event multiline paste/cut, CDP IME
  composition commit, click-away, autoscroll, and demo-page caret fallback.
  A 300-paragraph/20-selected model update measured p95 ~0.2 ms, no snapshots.
  This measures selection, not whole-document structural replacement latency.
- Commands: `npx vitest run --no-cache`, `npm run typecheck`, `npm run build`,
  `CROSS_IMPLEMENTED=1 node scripts/check-cross-block-selection.mjs`, and
  `ACTUAL_APP=1 node scripts/check-cross-block-selection.mjs`.

### Remaining limits / safe next work

Monitor follow-up: linked annotations now have an explicit cross-Block banner
with the distinct Block count and active range count. A scrollable table shows
each Block ID, inclusive endpoints and annotated text, marking the current range.
The excerpt and editing controls are explicitly identified as local-range controls.
Deleted ranges are excluded; multiple linked ranges in one Block are not called
cross-Block. Independent style annotations are not inferred to be linked merely
because they share a type. Monitor tests cover both cases and live range updates.

Physical OS clipboard shortcuts and real IME candidate-window placement still
need a manual Mac check (automated clipboard tests dispatch ClipboardEvents;
composition uses Chrome's input protocol). Other browser engines are unverified.
Only plain text is pasted across Blocks; rich HTML and annotation import remain
deferred. Selection still cannot cross structural/media barriers. Conflicting
attachments cause refusal rather than deletion. Linked semantic type/reference
entry is currently explicit text input, not an entity search dialog. No network
entity lookup is introduced. Orphan shared definitions are retained deliberately.

Disk space briefly produced ENOSPC while writing the Vitest cache; rerunning
without cache and the production build succeeded. No user files were deleted.
If interrupted, resume with the manual browser checks above; implementation and
automated checks are complete, apart from the two documented baseline failures.
