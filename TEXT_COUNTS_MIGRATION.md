# Block, Page and Document text counts

Implemented as session-only derived data; no saved-document schema changes.

## UI and inclusion rules

The document toolbar has a compact word-count summary. Expand it for words,
characters, and characters without whitespace at all three scopes. Block/Page
follow the focused Block; no focused text or Page shows a dash rather than a
misleading zero. Block counts exclude descendants. Page/Document totals include
main-text descendants, all Pages (mounted or not), and all tab alternatives.
Margins, sticky notes, owned attachments and media do not contribute to totals.
Text Blocks inside those excluded sections still have their own Block count.
Repeated/transcluded Blocks count per document occurrence, using one shared cache.
Inline images separate words but contribute no characters. Paragraph separators
are not counted. Inclusion options and selection counts are deferred.

Words use Intl.Segmenter word-like segments; characters use grapheme clusters
(including combined accents/emoji), not annotation Cell or UTF-16 offsets.
Where Intl.Segmenter is unavailable the worker falls back to Unicode word matching
and code-point characters. No worker support/failure displays Counts unavailable;
it never switches expensive counting back onto the editing thread.

## Performance design

- A 300ms trailing debounce keeps counts eventually consistent after a typing
  pause; Updating indicates pending work.
- Change subscriptions record dirty content keys only; they never snapshot,
  export, serialize or segment the document during a keystroke.
- Text assembly visits only changed Blocks and yields every 2,048 inline Cells.
  Grapheme and word segmentation run in a dedicated Web Worker.
- Count deltas update cached Page/Document totals. Structural edits rebuild scope
  memberships from Block edges only; unchanged text is not re-segmented.
- Generation checks discard stale asynchronous results. Undo/redo uses the same
  invalidation path. Closing the toolbar terminates the worker and subscription.

This avoids synchronous counting on keypress, not all resource usage. Initial
loading and large structural edits still require background work; very large
Blocks may take longer to refresh counts without delaying text insertion.

## Verification / resume checkpoint

- Five count tests pass: Unicode, scope exclusions/inactive Pages, changed-Block
  caching, cross-Block replacement/undo, stale result rejection.
- A 300-Block fixture verifies two edits cause zero synchronous count calls and
  zero snapshots, followed by exactly one Block recount and correct undo/redo.
- Existing inline and split performance suites pass (13 tests), including the
  25k-character no-snapshot typing invariant.
- Toolbar, cross-selection and demo integration suites pass (25 tests).
- Chrome 153 worker/UI smoke verifies document totals on load (15 words), after
  cross-Block replacement (5) and undo (15). Existing selection/IME checks pass.
- Typecheck and production client/server builds pass; Vite emits a worker asset.

Commands: `npx vitest run --no-cache src/runtime/document-counts.test.ts
src/block-tree/inline-performance.test.ts src/block-tree/split-performance.test.ts`,
`CROSS_IMPLEMENTED=1 node scripts/check-cross-block-selection.mjs`,
`npm run typecheck`, `npm run build`.

Completed implementation is uncommitted. Next optional work: user-selectable
inclusion rules, selected-text counts, and larger real-document profiling. No
claim of zero CPU/memory cost or a timing comparison against a pre-change build.
