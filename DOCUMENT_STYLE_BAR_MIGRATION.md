# Document annotation toolbar — 13 September 2026

The original DocumentWindowBlock embeds `components/style-bar.tsx`. Its paragraph
indent buttons call UniverseBlock.addOrIncreaseIndentBlockProperty and
addOrDecreaseIndentBlockProperty: increment/decrement `block/indent`, rendered as
20px margin-left per level. They do NOT invoke structural list commands.
DocumentBlock's separate Tab / Shift-Tab bindings call indentBlock/deindentBlock.
Those structural bindings remain a separate migration; this change does not
replace native Tab navigation or nest any Blocks.

The converted toolbar previously exposed only bold/italics and wrote fixed indent
values 1/0. Its annotation/property arrays contained Solid store proxies; sending
those into structuredClone-based commands could throw DataCloneError. The shared
DocumentStyleBar now unwraps existing data before committing commands, preserves
inclusive Cell selection endpoints (including reversed/Unicode selections), and
restores the range after formatting. Colour inputs capture selection before focus
moves. Collapsed ranges produce a message rather than whole-paragraph annotations.

The toolbar is used by both the demo document window and rendered
`document-window-block` occurrences; ordinary WindowBlock is unchanged. Targets
are restricted to text Blocks in that toolbar's scope. All 15 canonical `style/*`
schemas are represented, plus text/colour and text/background-colour with colour
pickers. Each action adds a UUID-backed annotation over the selection. Reapplying
an identical active annotation is a no-op; it never deletes annotations. Unknown
fields and other annotations survive. Clear formatting retains semantic references.

Blur, flip and mirror are exposed and serialize correctly, but their range-wrapper
rendering remains deferred as documented in the standoff styling migration; this
toolbar work does not claim to implement those visual wrappers. Semantic reference,
clock-animation and micro-document actions are not style annotations and are not
added as formatting buttons.

Paragraph indentation increments/decrements repeatedly, clamps at zero rather
than introducing negative margins, preserves other properties, and uses canonical
commands for undo/redo and persistence. No tree membership changes occur.

Verification includes catalogue completeness, per-style inclusive ranges and IDs,
colour-picker focus retention, empty selections, repeated apply, semantic-reference
preservation, 20px indentation increments, undo and unchanged tree structure.

Results: four new toolbar tests pass; typecheck and client/server build pass.
`node scripts/check-document-style-bar.mjs` passes against Chrome with real pointer
clicks on all 17 style/colour controls, selected inclusive ranges, repeated paragraph
indent/outdent and undo. Full suite: 124 pass, two context-menu tests fail because
their synthetic contextmenu events use default button 0, whereas the checkpoint
binding catalogue matches unmodified secondary-button contextmenu. Binding/menu
source and those tests are unchanged in this toolbar task; the interrupted binding
migration still needs its own completion/verification pass.
