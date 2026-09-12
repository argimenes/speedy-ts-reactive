# Standoff annotation monitor

## Move/resize and keyboard follow-up (12 September 2026)

- Increased start-Cell clearance from 6px to 21px (still viewport-clamped).
- Drag the header to reposition; drag the bottom-right grip to resize. Pointer
  capture supports mouse/touch dragging. Manual movement or resizing pins the
  position for this popup session; selection/scroll no longer reanchors it.
  Resizing the viewport still clamps it. Container queries adapt the columns
  when the monitor itself is narrowed, not just when the viewport is narrow.
- Each annotation row has an independently labelled trash button. It deletes
  that row, preserving a different selected annotation and using existing undo.
- Up/down in the list select and focus annotations; right enters the action
  group. Plain arrows traverse action buttons (left from the first returns to
  the list). Tab/Shift+Tab use native control order; Enter/Space activate buttons.
  Text fields retain native arrows and editing. Shift+left/right still shift by
  one Cell; **Alt/Option+left/right now shift by whole words**, freeing plain
  arrows for navigation. =/− and D/Delete remain expand/contract/delete.
  Each action button has its shortcut printed immediately above it.
- Added tests for navigation versus editing, unselected-row deletion/undo and
  session-only drag/resize. Chrome smoke checks exercise real pointer dragging
  and resizing alongside placement, editing and narrow-viewport checks.

Verification: all 122 tests across 20 suites pass, plus typecheck, client/server
build and the Chrome monitor smoke check.

## Horizontal layout follow-up (12 September 2026)

The monitor is now a 960px-wide responsive, table-like grid. Its annotation list
uses 23% of the available grid width (about 22% of the complete popup including
padding); the other two columns contain range/text/ID/action controls and
metadata/attributes respectively. On smaller screens settings flow below the
main controls, then the whole layout stacks below 440px. Existing keyboard and
form ownership remains unchanged.

Position is measured from the first visual fragment of the selected annotation's
start Cell: 100px left, 6px below. Selection/range changes, document scrolling and
viewport/popup resize update the position. Viewport clamping takes precedence
when that preferred position would clip the window. Empty-list positioning falls
back to the opening caret. Scrolling within the popup does not move it.

A read-only Annotation ID field shows the stored ID, or “Not supplied”; opening
the monitor never generates an ID or mutates document data. Entity annotations
add read-only Entity name / Entity ID fields in the settings column. IDs use the
annotation's reference value; names can come from the original `cache.entity`
shape (`Guid`, `Name`), an embedded `entity`, or `metadata.entity` / `entityName`.
An explicitly mismatched cached entity is ignored. Missing names display
“Entity name not loaded”. This consumes available information only: it does not
add automatic entity fetching or a new entity-picker workflow. The original
`UniverseBlock` loaded names after document load via `DocumentBlock.getEntities`
and assigned `p.cache.entity`; that hydration pipeline remains a separate task.

Verification: 119 tests / 20 suites, typecheck and build. Three added cases cover
column structure/read-only entity fields, missing/mismatched information, unchanged
model state and selection-relative anchoring. The Chrome check now asserts three
desktop columns, list-width proportion, actual visibility, annotation-relative
placement, ID, narrow-screen bounds/no overflow, plus the existing edit/history
and focus assertions. Optional screenshot:
`SCREENSHOT_PATH=/tmp/annotation-monitor-horizontal.png node scripts/check-annotation-monitor.mjs`.

Plan recorded before implementation, 12 September 2026. Scoped conversion complete.

Original sources inspected: sibling `speedy-ts/src/blocks/document-block.ts`
(1441–1453, 1791–1834), `blocks/monitor-block.tsx` (entire component),
`library/standoff-property.ts` (54–175), and `blocks/standoff-editor-block.ts`
(826–858, 1021–1028).

The current original binds Cmd+/ on Mac and Ctrl+/ on Windows, not Ctrl+period.
It lists undeleted annotations containing the Cell left of the caret (or the
right Cell at paragraph start), using inclusive Cell endpoints. The list is
captured on opening; moving an annotation outside the caret does not remove it.
Escape closes and returns focus; Up/Down wrap between items. Left/Right select
the previous/next complete word, Shift+Left/Right move one Cell, = expands the
end, - contracts it, d deletes. Buttons shift by a Cell, expand, contract and
delete, with hover highlighting. Delete marks `isDeleted` rather than removing
the record. The visible Edit button is unwired; cached entity names are optional.
Original word enumeration contains a duplicate-push/two-word linking bug, and
contraction can cross the start boundary. These bugs will not be copied.

## Conversion scope

1. Support requested Ctrl+. plus Ctrl+/ and Cmd+/ compatibility aliases; respect
   native controls, composition and existing event ownership. Open a bounded,
   session-only popup near the caret, with an explicit empty state.
2. Retain the captured list through local edits; show type, inclusive endpoints,
   length and excerpt. Provide keyboard/button actions matching the original,
   safe bounds (minimum one Cell), tombstone deletion and session-only preview.
3. Add working range/value/metadata/attributes fields. JSON object fields are
   validated before an atomic model update; preserve type, IDs and unknown fields.
   This is a requested functional extension, not a claim the legacy Edit worked.
4. Keep operations paragraph-local, reversible and shared-view reactive; avoid
   whole-document snapshots for property edits. Protect stale targets with an
   expected-record check. External model changes (including document undo/redo)
   dismiss the popup so an index cannot silently refer to another annotation.
5. Use existing overlay lifecycle/focus restoration; no saved monitor Block,
   runtime cache serialization, plugin activation or entity-ID lookup is added.
   Preview remains session-only. Outside click dismisses without stealing focus.
6. Test caret boundaries, overlap/deleted filtering, actions, Unicode word/Cell
   coordinates, bounds, JSON validation, unknown-field preservation, history,
   shared views, focus, stale records and native-input exclusions; verify Chrome.

Word movement preserves the original whole-neighbor-word semantics and its
`\b[^\s]+\b` matching, but converts UTF-16 offsets to code-point Cell coordinates.
Schema-specific entity pickers/plugin settings and historical AMD monitors are
outside this pass; opaque attributes remain editable as validated JSON objects.

## Implementation and verification

The popup is implemented in `src/rendering/annotation-monitor.tsx`, registered
through the existing overlay service and rendered in a viewport-bounded Portal.
`TreeCommands.editStandoffProperty` and `block-tree/annotation-commands.ts` apply
validated edits using the existing incremental owner-record path. Original IDs,
unknown fields and property order survive edits; deletion sets `isDeleted`.
The renderer tracks endpoint changes for SVG remeasurement and shows the active
annotation as a session-only gold preview (rather than imperatively flashing
character CSS). Neither popup state nor preview is serialized.

Ctrl+. opens the monitor; Ctrl+/ and Cmd+/ are compatibility aliases on both
platforms. At a boundary it inspects the left Cell, falling back to Cell zero at
the start. Empty/invalid/deleted ranges are excluded. An empty-state message
replaces the original no-op when nothing encompasses the caret. Escape restores
focus/caret; outside pointer input dismisses without restoring focus. On the
panel surface Ctrl/Cmd+Z (Shift for redo) closes the panel and invokes history;
inside fields native text undo and selection keys retain ownership. External
model mutations dismiss the session to prevent stale positional targets; reopen
to inspect changed annotations. Active-list Up/Down wraps, and moved items remain
available until deleted or closed.

The Edit extension exposes inclusive start/end, displayed Cell length, value,
metadata JSON and attributes JSON. Apply is atomic; invalid JSON, arrays/null
instead of objects, out-of-range or reversed endpoints leave the model unchanged.
Type is displayed and ID is preserved rather than exposed as schema-conversion
controls. Unsupported plugin/entity settings are not presented as working pickers.

Qualification: **116 tests / 20 suites**, typecheck and client/server build pass.
Seven monitor regression cases cover overlap and deleted filtering, empty states,
aliases/exclusions, preview/focus, movement outside the initial caret, tombstone
delete/undo, form-field keyboard ownership, JSON validation, bounds, stale targets,
Unicode word coordinates, shared views, unknown fields and serialization/history.
The action test asserts zero repository snapshots. Existing editing, margin,
document-store, background and structural regression suites continue to pass.

Chrome verified real Ctrl+period opening, two overlap rows, focused and bounded
popup, rendered preview, Shift+Right movement, JSON attribute editing, retained
metadata/unknown fields, d deletion, Ctrl+Z undo and source caret focus return.
Repeat with `node scripts/check-annotation-monitor.mjs` against `npm run dev`
(Node 22+, `CHROME_BIN` / `BENCHMARK_URL` overrides supported). The script uses
only an in-memory fixture and removes its isolated temporary Chrome profile.
