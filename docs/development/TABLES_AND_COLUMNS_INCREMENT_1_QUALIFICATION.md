# Tables and columns — Increment 1 qualification

Date: 29 October 2026.

**Status:** Increment 1 correctness gates pass. Structural latency remains a release-qualification limit.

**Scope:** canonical operations and their correctness foundation. Command registration, `/c2`–`/c4`, `/unc`, contextual controls and horizontal-scroll presentation belong to Increment 2. This increment does not add keyboard bindings or change manual saving. `tableLayouts` is enabled by default; disabling it leaves existing tables readable.

## Implemented

[`TableOperations`](../../src/runtime/tables.ts) exposes typed prepare/execute requests for creation/distribution, adjacent cell swaps, row movement, selected-content transfer, row/column insertion, reviewed extraction/removal, and dissolution. Existing table and grid families share the operations without migration. Preparation is mutation-free; revision-bound, single-use receipts execute through one existing canonical transaction. Invocation cleanup uses native inline editing inside that transaction.

Original content, placement and Block identities survive. Dissolution removes only the selected table's direct shells, preserving nested tables, lists, Containers, SurfaceBlock faces and owned relations. Safe removal rejects shared/referenced shells, authored shell data, spans and ragged structures. Referenced empty TextBlocks require extraction. This is an in-memory reference check at explicit removal, not a Vault scan or a typing hook.

Caret bookmarks use occurrence identity and native commit identity/cause. The existing lightweight notifications now expose that information without subscribing to full history-record capture. Both forward execution and Undo/Redo recover the source caret. Durable replay remains canonical; session caret bookmarks are not serialized.

## User refinements qualified

- **Independent cell content:** the real Flint fixture has four vertically flowing Blocks in the first cell and two paragraphs in its neighbour. Unit coverage also exercises Enter splitting a paragraph inside a cell and Tab creating a list there. Counts need not match; this is still one table row.
- **List/task movement:** whole lists and standalone task Blocks, including compound tasks, retain their subtrees and task state. Individual list items remain restricted: moving a bare TextBlock would lose its parent-owned bullet/numbering context. No list conversion or list-editing rewrite was introduced.
- **Content transfer:** its canonical request appends selected child Blocks to a named destination cell, retaining both cell identities. It is separate from a cell swap. Increment 2 must expose “Move selected Blocks to cell…” in contextual controls.
- **Future widths:** optional `metadata.tableColumns = {version: 1, weights: number[]}` round-trips through native save/reload. Insert/remove column keeps weights aligned; swaps leave them in column order. Other metadata survives. Rendering remains equal-width; there is no resize UI.
- **Dissolution:** the operation underlying `/unc` preserves row-major order and nested subtrees. Individual-cell extraction is deferred.

## Browser findings and targeted fixes

Real Chromium exposed two issues not reproduced by tree assertions alone:

1. Solid's same-parent slot reordering disconnected embedded iframes despite retaining the same DOM element. Table operations now temporarily keep affected media roots connected using the browser's state-preserving `moveBefore`, then restore them after synchronous publication. This bounded, table-local step also covers Undo/Redo and failed publication. It does not replace the renderer or Window Manager. Browsers without the required API reject affected live-media operations before mutation.
2. After reparenting, Chromium sometimes normalised a flow-element caret boundary to the start. Restoration verifies the result and, when needed, uses the mount's existing Cell-boundary lookup. No layout measurement or document traversal is added.

The browser assertions verify the same iframe element, `contentWindow`, loaded document and in-frame sentinel through cell swap, row movement, transfer, dissolution and history. These checks cover an isolated local iframe, not every third-party or native viewer.

## Evidence and limitations

**205 tests passed across 11 suites**, covering tables, lists/tasks, reversible surfaces, Scry completion, native persistence, commit capture, Undo storage parity and bounded inline/split work. The final table/notification recheck passed all 39 tests. Reactive and server TypeScript checks pass. See [regression results](evidence/tables-and-columns/increment1-tests.txt), [final targeted checks](evidence/tables-and-columns/increment1-targeted-final.txt) and [type checks](evidence/tables-and-columns/increment1-typecheck.txt).

The sequential real-Flint run uses the annotated native Masque document: initially 15,734 characters, rising to 16,850 with the qualification fixtures. The structural comparison moves a 926-character annotated Block with a nested container. Twelve measured samples per path follow two warmups. These are synchronous command costs, not just the cost of changing a parent pointer.

| Direct-cell renderer measurement | Median | p95 |
| --- | ---: | ---: |
| Typing before table operations | 5.0 ms | 8.8 ms |
| Typing afterward, outside the table | 4.9 ms | 5.8 ms |
| Typing inside a cell | 5.3 ms | 5.9 ms |
| Existing grid conversion | 530.2 ms | 564.1 ms |
| New table creation | 496.4 ms | 570.2 ms |
| New table preflight alone | 0.2 ms | 0.3 ms |

Each typing group contains 40 edits, with **zero snapshots, projection rebuilds or fetch requests**. Accepted structural conversions take one snapshot each. The comparison does not establish a significant structural speedup; both paths remain expensive. No timing here guarantees user-visible latency: this is headless Chromium using real Flint components, and frame/settled timings are separately retained in the [direct-renderer evidence](evidence/tables-and-columns/increment1/increment1.json).

The [Solid-renderer run](evidence/tables-and-columns/increment1-solid/increment1.json) also passed all identity, caret and viewer assertions with no browser exceptions. Typing medians were 11.0 / 10.2 / 10.5 ms before / afterward / inside a cell, again with zero snapshots, projection rebuilds or fetch requests. Table creation measured 490.7 ms versus 519.1 ms for the legacy conversion.

The [browser harness](../../scripts/qualify-tables-browser.mjs) reads a native fixture into an isolated in-memory workspace and never saves it.

The existing Block-selection drag/drop mock failure was reproduced on unchanged HEAD during investigation and remains outside this increment; see the [investigation evidence](evidence/tables-and-columns/baseline-selection.txt).

No specialised structural transaction path has been added. Generic canonical transactions still incur workspace-sized snapshot/planning costs. This increment can establish correctness without qualifying that latency for release. Increment 2 still needs actual typed commands, contextual controls and narrow-pane scrolling; Increment 3 retains interchange, broader viewer/zoom/accessibility coverage and release-scale performance qualification.
