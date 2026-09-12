# Configurable input bindings

## Findings and implementation plan — 12 September 2026

The original monitor uses `mode`, `trigger.source`, `trigger.match`, and an
`action` containing name, description and handler (`src/blocks/monitor-block.tsx`).
The converted implementation currently has imperative matching in
`src/input/gateway.ts`, `src/rendering/annotation-monitor.tsx`,
`src/rendering/block-context-menu.tsx`, and `src/demo/workspace-documents.ts`.
The workspace style bar already has actions but no shortcut catalogue.

An action must have a stable ID, name, description, category, tags and handler.
A binding associates an action with a structured keyboard, mouse or named custom
trigger. Multiple triggers may invoke one action. Scope determines applicability;
categories/tags only organise discovery. User overrides contain data, never code.
Buttons, hints and dispatch must resolve the same effective bindings.

Product references consulted:
- https://code.visualstudio.com/docs/configure/keybindings — searchable assigned
  and unassigned commands, change/remove/reset, conflicts, context rules and JSON.
- https://www.jetbrains.com/help/idea/configuring-keyboard-and-mouse-shortcuts.html
  — grouped keymap, keyboard/mouse capture, alternatives and conflict warnings.

The proposed browser is a searchable two-pane window: category-grouped actions
and combination badges on the left; description, scope, defaults/current bindings
and editing controls on the right. Recording suspends application dispatch.
Manual modifier/key/mouse/custom controls supplement recording. Conflicts in
overlapping scopes require explicit reassignment; disjoint scopes may reuse keys.
User preferences live in browser-local storage, separately from documents, with
versioned JSON import/export and restore-default operations. Storage failure must
be visible. Import must validate completely before applying; never execute JSON.

## Ordered implementation

1. Document design and inventory (this file).
2. Add typed action registry, indexed matching, conflict rules, persistence and
   custom-event dispatch. Keep context-local handlers out of saved preferences.
3. Migrate monitor commands/navigation/history; editor monitor/margin/paragraph/
   boundary/delete commands; context-menu invocation/navigation; document file
   shortcuts. Register toolbar style actions, including unassigned actions.
4. Add bindings browser, record/manual input, conflict resolution, reset and
   import/export; derive monitor labels from effective bindings.
5. Unit/integration/browser verification and update the progress log.

## Boundaries and safeguards

Ordinary typing, beforeinput, composition, clipboard, native text-field editing,
native Tab/Enter/Space activation and standard file-browser widget navigation
remain native input semantics, not configurable command combinations. Drag/resize
pointer tracking remains a widget gesture implementation, not a shortcut.
Do not migrate the thousands of not-yet-converted legacy actions as if implemented.
No key sequences/chords in the first UI; structured triggers can be extended later.
Keyboard triggers use logical `event.key`, explicit modifiers and case-normalised
letters; Ctrl and Meta are distinct. OS/browser-reserved combinations cannot be
guaranteed and some never reach the page. Mouse capture uses a dedicated area;
context-menu duplicate delivery on macOS must not invoke actions twice.
Annotation/text-field guards and original composition/repeat safeguards remain.
Matching must not scan document content or rebuild projections per keypress.
