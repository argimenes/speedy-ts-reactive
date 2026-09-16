# Sticky notes as portable Blocks — design discussion

**Status:** Revised proposal, 16 September 2026. No feature code has been
implemented. A sticky note need not be a technical `DocumentBlock`. When moved
into a regular Document it ceases to be a standalone note resource and becomes
one Block among that Document's children.

## Aim and governing principle

A sticky note should be quick to create, visually small, and yellow, but its
content must remain a real, movable Codex Block. The note must be able to move
between a floating Workspace window and a regular Document without copying its
text, losing annotations, or acquiring an absolute position merely because it
once floated. It should also be possible to extract an embedded note back into
a floating Workspace window.

My recommended distinction is **note content versus its current presentation**:

```text
Workspace / Background
└─ WindowBlock (sticky presentation, window size/position/state)
   └─ StickyNoteBlock (portable yellow card, typography/overflow settings)
      └─ StandoffEditorBlock (text and annotations)

Regular Document / Page / Tab / container
└─ StickyNoteBlock (the same portable card and text)
   └─ StandoffEditorBlock
```

`StickyNoteBlock` is the proposed new view type; “StickyNoteDocument” can remain
a user-facing name, but no new technical Document type is required. The Window
is a removable presentation shell, not part of the note's content identity.
Moving the note into a Document changes its *owner and persistence boundary*;
it should **retain its Block identity** (ID, content, annotations) so the move
is undoable and does not silently turn into a copy. In this precise sense it
loses its separate *Document identity*, which it never needed, but not its
identity as a Block. A nested `DocumentBlock` would instead make search,
ownership, and save behavior unnecessarily ambiguous.

## Window and note appearance

- Reuse the reactive `WindowView` behavior: drag handle, minimize/restore,
  close, focus restoration, keyboard-accessible resize, and saved geometry.
  Select a `sticky-note` presentation variant on an ordinary `window-block`;
  avoid a second window implementation and the Document Window's wide minimum.
- Default to roughly **280 × 280 CSS px**, not a literal CSS `3in` (screen
  density and zoom make that an unreliable physical size). Use a compact
  approximately 28px handle and 8–10px inner padding. Minimum size must leave
  readable text and usable controls; maximum can be viewport-bounded.
- Use a warm pale-yellow body, a slightly deeper yellow handle, dark high-
  contrast control glyphs, and a subtle edge/shadow. Do not recolor text
  selections or annotation highlights indiscriminately.
- No persistent formatting toolbar or row of feature icons. Keep the usual
  window controls in the handle. An ordinary `window-block` already avoids the
  `DocumentStyleBar`; the sticky variant only needs compact styling and sizing.
- Keep the existing standoff editor and its annotation model. Offer formatting
  through its existing key bindings plus a context/selection menu or a shared
  command palette outside the note. The same annotation commands should back
  any later popover; a second miniature toolbar would diverge quickly. Provide
  a discoverable, keyboard-accessible route (e.g. context menu / Shift+F10)
  rather than requiring users to memorise shortcuts.
- A note should default to the ordinary Document body text size. If `+`/`−`
  controls are added, they should be small commands in the handle's overflow
  menu or an external context menu, not permanent extra chrome. The first
  implementation can omit them while preserving the setting contract.

This is broadly consistent with the restrained desktop-note pattern: Apple's
Stickies uses a draggable title bar, resizable edges, and a collapsed state,
while text formatting lives in menus rather than a full toolbar. Microsoft
Sticky Notes shows formatting actions in the note, but its small-screen tradeoff
is not necessarily right for Codex's Block/annotation system. See the
[Apple Stickies guide](https://support.apple.com/guide/stickies/welcome/10.3/mac/15.0)
and [Microsoft Sticky Notes guide](https://support.microsoft.com/en-US/Windows/Apps/StickyNotes/create-a-sticky-note).

### What does Close mean?

This is a real product decision, not merely styling. The current reactive
Window close button removes the Window Block. For a quick note, users may
interpret `×` as **hide/close this view**, not delete the note.
My recommendation is that Close parks the note in a retrievable Notes list,
while Delete is a separate confirmed action. Minimize remains an on-screen
icon. That requires a small Workspace note catalogue or a persisted `closed`
window state plus a way to reopen it. If that catalogue is deferred, the first
release should say clearly that Close removes the note and offer Undo. We
should not pretend these are equivalent.

## Moving between floating and embedded forms

The default drop into a regular Document should be **in flow**: a yellow card
in the Page/Tab/Block child list. It then reflows with surrounding text, works
with existing Block selection and document order, and is naturally included in
search, print/export, accessibility order, and the minimap. It can be resized
within the available column and can still be extracted into a floating note.
This is the least surprising meaning of “add a Block anywhere.”

An absolutely positioned note has legitimate uses—especially marginalia and
visual canvases—but it is a *placement mode*, not a property of note content.
If we add it, make it an explicit **Pin to Page** or **Pin to Block** action
after the ordinary in-flow drop. Persist an anchor to a stable placement in
the receiving Document plus an offset in that anchor's coordinate system.
Never persist a viewport `nodeKey` or raw screen coordinates. A Block anchor
can follow its source through reflow; a Page anchor is appropriate for spatial
layouts. If the anchor disappears, fall back to a visible in-flow placement or
an explicit “unanchored” state, never lose the note off-screen. The same note
content can be transcluded elsewhere, so placement geometry must be local to
each occurrence, not shared through the note's content payload. Current
`block/position` is content styling and is not a sound reusable anchor model.

Margin drops should initially target an actual existing margin/container slot
as a normal child where supported. “Float beside this Block” can later use
Block anchoring, with collision and narrow-window rules. A free-floating note
over a text Page raises overlap, zoom, scroll, selection, print, and responsive
layout questions; it should not be the default.

The existing `TreeCommands.move()` can reparent ordinary children within one
repository, but the current drag handle only reorders Blocks against selected
targets in the same parent list. Cross-container/window drop targets, insertion
feedback, and a transfer transaction still need implementation. Do not let the
Window drag gesture itself mean “move content into Document”: dragging the
handle moves the Window; a separate Block drag/extract affordance starts a
structural move. A drop should be atomic and undoable, preserve the card Block's
identity, and reject cycles/unsupported targets.

Moving a standalone card into a Document removes or parks its now-empty source
Window in the same transaction. The card becomes a child of that Document and
is saved in its Document JSON file. Extracting an embedded card moves the same
Block under a new sticky Window in the Workspace; no `DocumentBlock` or new
Document identity is created. A drag from one Document to another, if later
supported, similarly changes which Document owns the Block.

## Filename and persistence

Do not ask for a filename on creation: a standalone note is a Workspace Block,
so it can be serialized **inside the Workspace manifest**, along with its
Window, without introducing a separate note JSON file or a `documentId`.
The note still gets a stable Block ID for moves, undo, and links. A friendly
Window title can derive from its first non-empty line or default to “Sticky
note”; changing that title does not rename a file. Export to a separate file
could be a later explicit action rather than the default save path.

The current Workspace writer externalises `document-block` subtrees but retains
other Workspace Blocks in its manifest, so the standalone shape above fits its
existing boundary. When the note is embedded, it is saved inside the receiving
Document's separate file. A transfer therefore changes **which file contains
the note**; the Workspace and affected Document must be saved consistently.
The canonical loaded Workspace uses one repository and the existing coordinated
Workspace save, which is the sensible first host for this transfer. The older
split demo has separate editor instances and would require extra transfer
coordination; do not imply that a `TreeCommands.move()` can cross repositories.
The current editor also has one repository-wide revision/undo state, not
per-note dirty tracking. Reliable automatic background saving and independent
note recovery are later work. The UI must show unsaved/error status if a write
fails, and closing or moving a note must not silently discard unsaved content.

## Text sizing and the two overflow modes

Put the note's **default text-size adjustment on `StickyNoteBlock`**, not on
the Window or receiving Document. It then travels with the card when embedded or
extracted. The default adjustment is zero, meaning “inherit the host Document
body size”; a standalone note uses the same shared body-size token. If `+`/`−`
are offered, store a bounded step/scale override as one Block-specific
property, rather than baking a pixel size into every Cell. Explicit formatting
on text/ranges still wins where appropriate. Keeping the adjustment relative
also lets the note respect a destination Document's base size. The Window
stores standalone geometry; an embedded note's preferred card size belongs to
the card, with an explicit size conversion when docking/undocking.

I would define a persisted `overflowMode` on the card now, with two intended
values:

| Mode | Behavior | Recommendation |
| --- | --- | --- |
| `scroll` | Fixed/resizable card; text remains editable and scrolls internally when it exceeds the available space. | Ship first, with a visible overflow cue and no lost text. |
| `fit` | Treat the available writing area as a composition constraint; user text insertions that would exceed it are refused or require an explicit enlarge/switch action. | Design and implement separately; never silently truncate or shrink existing text. |

`fit` is substantially harder than setting `overflow: hidden`. The fit depends
on rendered font metrics, wrapping width, inline images, annotations, zoom,
font loading, resize, paste, IME composition, and accessibility text scaling.
A character count cannot implement a physical-space limit. Even if typing is
blocked precisely, resizing a card or changing a font can make *already saved*
content overflow. The safe invariant is **all text remains recoverable**: show
an overflow state and permit scrolling/expansion/switching mode for recovery,
even when new insertions are blocked. Undo/redo must always remain possible.

For `fit`, a future adapter should measure the proposed standoff content at
the actual usable width and typography, intercept all user insertion paths
(typing, paste, drop, IME completion, programmatic commands), and validate
before committing an edit where practical. Re-measure on geometry and font
changes. This can be local to the note editor rather than a whole-tree update,
but it needs robust integration with the input gateway and transaction model.
CSS clipping alone would give the *appearance* of constraint while hiding
content and is not acceptable. Starting with `scroll` keeps the note useful
while leaving a clear extension point for the charming physical constraint.

## Suggested first implementation slice (not authorised by this plan)

1. Add the portable `StickyNoteBlock` wrapper around a normal standoff editor,
   with yellow card styling, compact padding, per-card text scale and `scroll`
   overflow mode.
2. Add a sticky presentation variant of the current ordinary Window with
   compact themed handle, normal controls, resizer and no `DocumentStyleBar`.
3. Create the note as a Workspace-owned Block with a stable Block ID and no
   filename or separate Document root.
4. Allow adding/removing the card as a normal in-flow Block, then build an
   explicit, atomic Workspace-window ↔ Document transfer and drag/drop UI.
5. Test save/load, undo/redo, focus, annotations, text overflow, resizing,
   extraction, failed drops, and unsaved transfer/close behavior.
6. Only after those semantics are stable, add optional anchored placement and
   the `fit` editing policy.

## Decisions to settle together

1. Should `×` close to a retrievable Notes list (my preference), or remove the
   note with Undo in the first release? A parked list adds modest UI and model
   work but is safer.
2. Should a drop into a Document default to an **in-flow yellow card** (my
   preference), with Pin to Page/Block added later? This choice governs what
   drag/drop means and where geometry is stored.
3. Should the first release expose only `scroll` while reserving `fit` in the
   schema, or is strict spatial composition essential for version one?
4. Is Workspace-manifest storage for standalone notes acceptable, with the
   note moving into the receiving Document file when embedded? This is now my
   recommendation and requires no generated note filename.
