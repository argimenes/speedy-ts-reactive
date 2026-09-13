# Standoff property styling migration

Inventory and plan recorded 12 September 2026, before this styling implementation.
Status: first 22-schema appearance pass implemented and verified. Five grouped,
plugin, or embedded-editor schemas and the separate interaction workflows remain
open; this is not a claim of complete Standoff parity.

## Decision: grouped effects deferred by user request

The discussion of `style/blur`, `style/flip` and `style/mirror` concluded with an
explicit decision to document the approach but **not implement it for now**,
because of editing and performance regression risks. This supersedes the earlier
request to start grouped rendering. No wrapper implementation or caret refactor
was made during that investigation. Resume only after renewed user authorization.

### Preferred approach and layout compromise

The original schemas use `wrap.cssClass`; `wrapRange()` in `src/library/svg.ts`
moves range Cells into a DIV styled `display: inline-block`. The important part is
the shared visual box, not the DIV tag: an inline-block SPAN could serve the same
purpose. Blur filters the range as a group; flip reflects it vertically, while
mirror reflects it horizontally. Per-character transforms are not equivalent.

Preserving the paragraph's existing line layout is desirable, but the agreed
compromise is a renderer-managed grouped object. It occupies one atomic box in
the surrounding inline flow and may move to the next line as a unit. Long text
can wrap inside that box, depending on sizing and word-break rules, but existing
paragraph line breaks are not guaranteed to survive. Mirroring reflects the
whole multiline rectangle horizontally; vertical flipping also reverses the
visual order of its internal lines. This is not an annotation-length limit.
A configurable length limit may be considered later; none is currently chosen.

Alternatives discussed, not selected for implementation:

- A separate transformed/filtered visual copy preserves the editable Cell tree,
  but needs synchronized layout, hidden original paint, hit-testing, selection,
  accessibility and IME handling.
- Transforming individual Cells fits the flat renderer but does not reproduce
  a whole-range mirror or reliable group-filter composition.
- SVG/canvas text rendering offers control at the cost of substantially more
  layout and editing infrastructure.
- Per-line fragment transforms could preserve flow as a later alternative mode,
  but have different semantics from transforming the complete passage.

### Risk assessment

The standoff data model need not change: Cell identity, annotation IDs/inclusive
ranges, serialization and history remain the authoritative representation.
The changes are nevertheless substantial at the rendering/input boundary:

- `standoff-editor-view.tsx` uses direct flow children for caret restoration,
  boundary lookup, pointer hit-testing and range geometry.
- `annotation-monitor.tsx` anchors using a direct child at the range start.
- Moving Cells into wrappers without adapting these assumptions risks caret
  jumps, wrong selections, misplaced decorations and monitor positions.
- Imperative reparenting can conflict with Solid's DOM ownership. A future
  implementation must preserve stable Cell nodes and avoid remounting ordinary
  paragraphs or adding full-document work to typing.
- Partially crossing effect ranges cannot both be represented as simple nested
  wrappers. Fragmenting them changes whole-range transform semantics. A proposed
  conservative fallback is to leave conflicting group effects unapplied with a
  notice, but this policy still requires agreement before implementation.

### Staged plan for a future authorized implementation

1. Make Cell lookup wrapper-aware without adding wrappers or changing appearance.
   Verify caret capture/restoration, pointer and keyboard selection, annotation
   geometry and monitor placement against the existing flat renderer.
2. Introduce renderer-owned grouped wrappers behind an experimental switch,
   restricted to paragraphs with these effects. Preserve the flat fast path for
   all other paragraphs; do not port imperative wrap/unwrap wholesale.
3. Resolve identical/nested/crossing effect composition and cross-Block segment
   semantics explicitly. Shared annotation identity does not imply wrapping
   multiple Block containers into one visual object.
4. Verify insert/delete, Enter splits/joins, range resize/delete, undo/redo,
   save/load, inline images, cross-Block selection/replacement, native clipboard,
   IME and transformed hit-testing in Chrome on macOS. Test short/multiline
   groups, stable Cell identity, cleanup, and long-document typing performance
   against a pre-change baseline before considering general release.

Current behaviour stays unchanged: the toolbar can create and save these
annotations, but their grouped visual effects remain deferred. No experimental
switch, overlap fallback, length limit, or wrapper-aware refactor is implemented
by this documentation update. No runtime tests were necessary for this update.

## Source map and census

The current TypeScript runtime registers **27** schemas in
[`StandoffEditorBlock.getStandoffSchemas`](src/blocks/standoff-editor-block.ts).
[`StandoffProperty.applyStyling`](src/library/standoff-property.ts) applies Cell
classes, wraps ranges, invokes SVG renderers, and runs schema initializers;
`removeStyling` and `destroy` own the reverse paths. Original CSS lives in
[`src/assets/codex.css`](src/assets/codex.css). Geometry lives in
[`src/library/svg.ts`](src/library/svg.ts); clock behavior lives in
[`src/library/plugins/clock.ts`](src/library/plugins/clock.ts).

The new read-only [`audit script`](scripts/audit-standoff-properties.mjs) scans
those registrations and `standoffProperties` arrays in saved JSON. Run
`node scripts/audit-standoff-properties.mjs` (optional arguments select stores).
The census found 16 types in 37 local sample JSON files and **75 types in 2,388
JSON files** in the user's existing `../codex-data/data` store. Counts include
saved deleted/client-only records; they describe stored tokens, not active
rendering. `data/usher.json` failed JSON parsing and was left untouched.

The older AMD/JavaScript archive under `src/library/original` contains additional
schemas (for example `tags/style.js`, `tags/tei.js`, and `parts/text-add.js`). It is
not imported by the TypeScript runtime. Persisted tokens from that archive must
be recorded and preserved, not treated as if the current 27-schema registry
already implements them. This pass does not port the entire archived application.

## All current registered schemas

Line numbers refer to the original retained schema source at this checkpoint.
Colours for semantic references come from their schema, never their `value`
(which is usually an entity/reference ID).

| Type | Schema location | Original styling/behavior | Migration target |
| --- | --- | --- | --- |
| `text/background-colour` | [src/blocks/standoff-editor-block.ts:127](src/blocks/standoff-editor-block.ts#L127) | Cell background from `value` | Value colour |
| `text/colour` | [src/blocks/standoff-editor-block.ts:150](src/blocks/standoff-editor-block.ts#L150) | Cell foreground from `value` | Value colour |
| `cell/micro-document` | [src/blocks/standoff-editor-block.ts:181](src/blocks/standoff-editor-block.ts#L181) | Load a separate document into the start Cell at 0.08 zoom | Deferred: embedded document lifecycle |
| `animation/clock` | [src/blocks/standoff-editor-block.ts:216](src/blocks/standoff-editor-block.ts#L216) | Rotate a wrapped range by 2° every 125 ms | Deferred: range wrapper/plugin lifecycle |
| `style/blur` | [src/blocks/standoff-editor-block.ts:234](src/blocks/standoff-editor-block.ts#L234) | Wrapped range; `filter: blur(4px)` | Deferred: grouped range |
| `style/flip` | [src/blocks/standoff-editor-block.ts:241](src/blocks/standoff-editor-block.ts#L241) | Wrapped range; vertical `scale(1, -1)` | Deferred: grouped range |
| `style/mirror` | [src/blocks/standoff-editor-block.ts:248](src/blocks/standoff-editor-block.ts#L248) | Wrapped range; horizontal `scale(-1, 1)` | Deferred: grouped range |
| `style/superscript` | [src/blocks/standoff-editor-block.ts:255](src/blocks/standoff-editor-block.ts#L255) | `vertical-align: super; font-size: 0.8rem` | Cell CSS |
| `style/subscript` | [src/blocks/standoff-editor-block.ts:262](src/blocks/standoff-editor-block.ts#L262) | `vertical-align: sub; font-size: 0.8rem` | Cell CSS |
| `style/uppercase` | [src/blocks/standoff-editor-block.ts:269](src/blocks/standoff-editor-block.ts#L269) | `text-transform: uppercase` (stored text unchanged) | Cell CSS |
| `style/italics` | [src/blocks/standoff-editor-block.ts:276](src/blocks/standoff-editor-block.ts#L276) | Italic | Cell CSS |
| `style/strikethrough` | [src/blocks/standoff-editor-block.ts:283](src/blocks/standoff-editor-block.ts#L283) | Line-through | Cell CSS; retain `style/strike` alias |
| `style/highlight` | [src/blocks/standoff-editor-block.ts:290](src/blocks/standoff-editor-block.ts#L290) | Pink Cell background | Cell CSS |
| `style/bold` | [src/blocks/standoff-editor-block.ts:297](src/blocks/standoff-editor-block.ts#L297) | Font weight 600 | Cell CSS |
| `style/underline` | [src/blocks/standoff-editor-block.ts:304](src/blocks/standoff-editor-block.ts#L304) | Text underline in the current text colour | Cell CSS |
| `reference/url` | [src/blocks/standoff-editor-block.ts:311](src/blocks/standoff-editor-block.ts#L311) | Blue text underline; declared URL double-click callback | Cell CSS; link activation remains separate |
| `codex/search/highlight` | [src/blocks/standoff-editor-block.ts:324](src/blocks/standoff-editor-block.ts#L324) | Pink temporary search highlight | Cell CSS; search workflow remains separate |
| `codex/block-reference` | [src/blocks/standoff-editor-block.ts:331](src/blocks/standoff-editor-block.ts#L331) | Green SVG underline | SVG |
| `codex/trait-reference` | [src/blocks/standoff-editor-block.ts:349](src/blocks/standoff-editor-block.ts#L349) | Blue SVG underline | SVG |
| `codex/claim-reference` | [src/blocks/standoff-editor-block.ts:367](src/blocks/standoff-editor-block.ts#L367) | Red SVG underline | SVG |
| `codex/meta-relation-reference` | [src/blocks/standoff-editor-block.ts:386](src/blocks/standoff-editor-block.ts#L386) | Orange SVG underline | SVG |
| `codex/time-reference` | [src/blocks/standoff-editor-block.ts:405](src/blocks/standoff-editor-block.ts#L405) | Cyan SVG underline | SVG |
| `codex/entity-reference` | [src/blocks/standoff-editor-block.ts:424](src/blocks/standoff-editor-block.ts#L424) | Purple SVG underline | SVG |
| `style/highlighter` | [src/blocks/standoff-editor-block.ts:446](src/blocks/standoff-editor-block.ts#L446) | Yellow SVG fill with colour-dodge blending | SVG overlay |
| `style/rainbow` | [src/blocks/standoff-editor-block.ts:458](src/blocks/standoff-editor-block.ts#L458) | Seven 2px lanes: red, orange, yellow, green, cyan, blue, purple | SVG |
| `style/rectangle` | [src/blocks/standoff-editor-block.ts:470](src/blocks/standoff-editor-block.ts#L470) | Red 3px outline, 10/10 dashed crawl, 0.5s cycle | SVG + CSS animation |
| `style/spiky` | [src/blocks/standoff-editor-block.ts:482](src/blocks/standoff-editor-block.ts#L482) | Red 3px jagged outline; 4px spikes about every 12px | SVG |

CSS specifics are at `codex.css`:41–56 (basic text/link styles), 364–395
(blur, super/subscript, uppercase, underline, mirror/flip), and 407 (search
highlight). SVG-specific methods are `renderUnderlines`/`renderRainbow` in the
Block and `createUnderline`, `createRainbow`, `drawClippedRectangle`,
`drawAnimatedSelection`, `drawSpikySelection` in `svg.ts`. The apparent reference
`offsetY` arguments (1 or 3) are ignored by the original helper: it uses cached
overlap offsets and a default stroke width of 2 instead. Rainbow colours are
exactly `#ff0000 #ff8000 #ffff00 #00ff00 #00ffff #0000ff #8000ff`.

## Recognizer-only tokens

`src/library/text-processor.ts` also emits these tokens without a corresponding
current Standoff schema:

- `item-number`
- `code`
- `capital`
- `air-quotes`
- `style/strike`
- `style/font/size/large`
- `style/font/size/small`
- `font/family/arial`
- `font/family/mono`
- `font/color`
- `agent`

`animation/spinner` appears in the demo and saved documents, but has no current
schema; it must not be silently equated with the actual `animation/clock` plugin.
`style/color` is a converted-renderer compatibility token; the original uses
`text/colour`. Keep aliases in rendering only, preserving saved type strings.

## Stored property locations

Every token found in each store is listed below with occurrence/file counts and
one representative file. Types such as `block/font/size` here really occur in
`standoffProperties`; this census does not reclassify them as Block properties.

### data

| Stored type | Occurrences | Files | Example |
| --- | ---: | ---: | --- |
| `animation/clock` | 3 | 3 | [data/clock.json](<data/clock.json>) |
| `animation/spinner` | 21 | 21 | [data/20240830.json](<data/20240830.json>) |
| `codex/block-reference` | 36 | 21 | [data/20240830.json](<data/20240830.json>) |
| `codex/entity-reference` | 118 | 27 | [data/20240830.json](<data/20240830.json>) |
| `heading` | 5 | 3 | [data/masque.json](<data/masque.json>) |
| `line-break` | 63 | 3 | [data/masque.json](<data/masque.json>) |
| `list` | 1 | 1 | [data/richtextpaste.json](<data/richtextpaste.json>) |
| `list-item` | 1 | 1 | [data/richtextpaste.json](<data/richtextpaste.json>) |
| `paragraph` | 24 | 2 | [data/masque.json](<data/masque.json>) |
| `style/blur` | 1 | 1 | [data/blur.json](<data/blur.json>) |
| `style/bold` | 58 | 23 | [data/20240830.json](<data/20240830.json>) |
| `style/flip` | 1 | 1 | [data/text1.json](<data/text1.json>) |
| `style/italics` | 147 | 27 | [data/20240830.json](<data/20240830.json>) |
| `style/mirror` | 1 | 1 | [data/text1.json](<data/text1.json>) |
| `style/underline` | 1 | 1 | [data/20240830.json](<data/20240830.json>) |
| `unknown` | 497 | 4 | [data/masque.json](<data/masque.json>) |

### ../codex-data/data

| Stored type | Occurrences | Files | Example |
| --- | ---: | ---: | --- |
| `alignment/center` | 16 | 8 | [../codex-data/data/cellini_autobiography/i-[32e115ba].json](<../codex-data/data/cellini_autobiography/i-[32e115ba].json>) |
| `alignment/justify` | 2 | 2 | [../codex-data/data/michelangelo-letters/1549-05-25-to-lionardo-di-buonarroto-simoni-[9f85990e].json](<../codex-data/data/michelangelo-letters/1549-05-25-to-lionardo-di-buonarroto-simoni-[9f85990e].json>) |
| `alignment/right` | 5 | 4 | [../codex-data/data/misc/leonardo_proem.json](<../codex-data/data/misc/leonardo_proem.json>) |
| `animation/spinner` | 3 | 3 | [../codex-data/data/uploads/20250729_2304.json](<../codex-data/data/uploads/20250729_2304.json>) |
| `attitude/admonition` | 7 | 5 | [../codex-data/data/luca-landucci_diary/1498-03-25-[4fff37ab].json](<../codex-data/data/luca-landucci_diary/1498-03-25-[4fff37ab].json>) |
| `attitude/advice` | 8 | 4 | [../codex-data/data/michelangelo-letters/1523-06-to-lodovico-buonarroti-[219d590e].json](<../codex-data/data/michelangelo-letters/1523-06-to-lodovico-buonarroti-[219d590e].json>) |
| `attitude/belief` | 5 | 5 | [../codex-data/data/luca-landucci_diary/1497-08-17-[e745c5f8].json](<../codex-data/data/luca-landucci_diary/1497-08-17-[e745c5f8].json>) |
| `attitude/consolation` | 3 | 3 | [../codex-data/data/luca-landucci_diary/1497-08-17-[e745c5f8].json](<../codex-data/data/luca-landucci_diary/1497-08-17-[e745c5f8].json>) |
| `attitude/derogatory` | 10 | 4 | [../codex-data/data/luca-landucci_diary/1498-03-25-[4fff37ab].json](<../codex-data/data/luca-landucci_diary/1498-03-25-[4fff37ab].json>) |
| `attitude/distrust` | 3 | 3 | [../codex-data/data/michelangelo-letters/1548-04-07-to-lionardo-di-buonarroto-simoni-[73716cae].json](<../codex-data/data/michelangelo-letters/1548-04-07-to-lionardo-di-buonarroto-simoni-[73716cae].json>) |
| `attitude/explanation` | 5 | 4 | [../codex-data/data/michelangelo-letters/1548-01-to-lionardo-di-buonarroto-simoni-[8a109639].json](<../codex-data/data/michelangelo-letters/1548-01-to-lionardo-di-buonarroto-simoni-[8a109639].json>) |
| `attitude/grief` | 10 | 6 | [../codex-data/data/luca-landucci_diary/1497-08-17-[e745c5f8].json](<../codex-data/data/luca-landucci_diary/1497-08-17-[e745c5f8].json>) |
| `attitude/happiness` | 1 | 1 | [../codex-data/data/michelangelo-letters/1555-03-to-lionardo-di-buonarroto-simoni-[f03ad262].json](<../codex-data/data/michelangelo-letters/1555-03-to-lionardo-di-buonarroto-simoni-[f03ad262].json>) |
| `attitude/irony` | 18 | 2 | [../codex-data/data/michelangelo-letters/1560-09-13-to-the-most-worshipful-lord-cardinal-of-carpi-[6ba2e2ec].json](<../codex-data/data/michelangelo-letters/1560-09-13-to-the-most-worshipful-lord-cardinal-of-carpi-[6ba2e2ec].json>) |
| `attitude/praise` | 4 | 4 | [../codex-data/data/michelangelo-letters/1563-08-21-to-lionardo-di-buonarroto-simoni-[a63630ec].json](<../codex-data/data/michelangelo-letters/1563-08-21-to-lionardo-di-buonarroto-simoni-[a63630ec].json>) |
| `attitude/request` | 3 | 2 | [../codex-data/data/michelangelo-letters/1548-04-07-to-lionardo-di-buonarroto-simoni-[73716cae].json](<../codex-data/data/michelangelo-letters/1548-04-07-to-lionardo-di-buonarroto-simoni-[73716cae].json>) |
| `attitude/sarcasm` | 2 | 1 | [../codex-data/data/michelangelo-letters/1523-06-to-lodovico-buonarroti-[219d590e].json](<../codex-data/data/michelangelo-letters/1523-06-to-lodovico-buonarroti-[219d590e].json>) |
| `attitude/thanks` | 1 | 1 | [../codex-data/data/michelangelo-letters/1548-03-to-lionardo-di-buonarroto-simoni-[d969d1f6].json](<../codex-data/data/michelangelo-letters/1548-03-to-lionardo-di-buonarroto-simoni-[d969d1f6].json>) |
| `autocomplete/highlight` | 6 | 2 | [../codex-data/data/edgar-allan-poe/masque-of-the-red-death-[1c48f303].json](<../codex-data/data/edgar-allan-poe/masque-of-the-red-death-[1c48f303].json>) |
| `block/alignment/right` | 20 | 18 | [../codex-data/data/luca-landucci_diary/translators-preface-[8576831b].json](<../codex-data/data/luca-landucci_diary/translators-preface-[8576831b].json>) |
| `block/font/size` | 141 | 141 | [../codex-data/data/luca-landucci_diary/1507-02-08-[9353314c].json](<../codex-data/data/luca-landucci_diary/1507-02-08-[9353314c].json>) |
| `capital` | 1 | 1 | [../codex-data/data/michelangelo-letters/1554-09-19-to-giorgio-vasari-[0eb2e3ef].json](<../codex-data/data/michelangelo-letters/1554-09-19-to-giorgio-vasari-[0eb2e3ef].json>) |
| `codex/block-reference` | 6 | 3 | [../codex-data/data/uploads/20250729_2304.json](<../codex-data/data/uploads/20250729_2304.json>) |
| `codex/claim-reference` | 484 | 274 | [../codex-data/data/luca-landucci_diary/1462-09-04-[a9d8331f].json](<../codex-data/data/luca-landucci_diary/1462-09-04-[a9d8331f].json>) |
| `codex/document-reference` | 655 | 549 | [../codex-data/data/cellini_autobiography/ii-[8f81877d].json](<../codex-data/data/cellini_autobiography/ii-[8f81877d].json>) |
| `codex/entity-reference` | 35875 | 2298 | [../codex-data/data/cellini_autobiography/i-[32e115ba].json](<../codex-data/data/cellini_autobiography/i-[32e115ba].json>) |
| `codex/meta-relation-reference` | 371 | 163 | [../codex-data/data/cellini_autobiography/iii-[ce7a90de].json](<../codex-data/data/cellini_autobiography/iii-[ce7a90de].json>) |
| `codex/time-reference` | 2472 | 1828 | [../codex-data/data/cellini_autobiography/iii-[ce7a90de].json](<../codex-data/data/cellini_autobiography/iii-[ce7a90de].json>) |
| `codex/trait-reference` | 1267 | 326 | [../codex-data/data/cellini_autobiography/ii-[8f81877d].json](<../codex-data/data/cellini_autobiography/ii-[8f81877d].json>) |
| `concept` | 3 | 3 | [../codex-data/data/luca-landucci_diary/1478-05-03-footnote-1-[ac0bc21c].json](<../codex-data/data/luca-landucci_diary/1478-05-03-footnote-1-[ac0bc21c].json>) |
| `dataPoint` | 24 | 18 | [../codex-data/data/luca-landucci_diary/1477-06-07-[7646586c].json](<../codex-data/data/luca-landucci_diary/1477-06-07-[7646586c].json>) |
| `domain` | 4 | 4 | [../codex-data/data/luca-landucci_diary/1483-04-23-[45961997].json](<../codex-data/data/luca-landucci_diary/1483-04-23-[45961997].json>) |
| `figurative/hyperbole` | 1 | 1 | [../codex-data/data/michelangelo-letters/1557-07-01-to-lionardo-di-buonarroti-simoni-[69f387b8].json](<../codex-data/data/michelangelo-letters/1557-07-01-to-lionardo-di-buonarroti-simoni-[69f387b8].json>) |
| `h3` | 1 | 1 | [../codex-data/data/misc/siloti_memories-of-liszt-and-rubinstein.json](<../codex-data/data/misc/siloti_memories-of-liszt-and-rubinstein.json>) |
| `highlight` | 4 | 2 | [../codex-data/data/michelangelo-letters/1512-09-18-[a1e6a4ab].json](<../codex-data/data/michelangelo-letters/1512-09-18-[a1e6a4ab].json>) |
| `hr` | 1 | 1 | [../codex-data/data/misc/siloti_memories-of-liszt-and-rubinstein.json](<../codex-data/data/misc/siloti_memories-of-liszt-and-rubinstein.json>) |
| `hyphen` | 295 | 223 | [../codex-data/data/luca-landucci_diary/1478-05-08-[79f77555].json](<../codex-data/data/luca-landucci_diary/1478-05-08-[79f77555].json>) |
| `language` | 1707 | 812 | [../codex-data/data/condivi_life-of-michelangelo/chapter-1-[82c0b5b1].json](<../codex-data/data/condivi_life-of-michelangelo/chapter-1-[82c0b5b1].json>) |
| `lemma` | 145 | 14 | [../codex-data/data/luca-landucci_diary/1483-06-21-[f27416a9].json](<../codex-data/data/luca-landucci_diary/1483-06-21-[f27416a9].json>) |
| `lexeme` | 49 | 34 | [../codex-data/data/luca-landucci_diary/1480-05-07-[8bd7a365].json](<../codex-data/data/luca-landucci_diary/1480-05-07-[8bd7a365].json>) |
| `manuscript/line` | 2154 | 342 | [../codex-data/data/luca-landucci_diary/1509-07-22-[aede41f6].json](<../codex-data/data/luca-landucci_diary/1509-07-22-[aede41f6].json>) |
| `metaRelation` | 1 | 1 | [../codex-data/data/misc/landucci_preface.json](<../codex-data/data/misc/landucci_preface.json>) |
| `named-entity/agent` | 39 | 4 | [../codex-data/data/luca-landucci_diary/1500-04-25-[77bc80ef].json](<../codex-data/data/luca-landucci_diary/1500-04-25-[77bc80ef].json>) |
| `page` | 1870 | 1736 | [../codex-data/data/luca-landucci_diary/1471-08-09-[8daa7dcb].json](<../codex-data/data/luca-landucci_diary/1471-08-09-[8daa7dcb].json>) |
| `richards/refer-to` | 2 | 1 | [../codex-data/data/misc/buzzetti_email_2019-08-11.json](<../codex-data/data/misc/buzzetti_email_2019-08-11.json>) |
| `richards/word` | 2 | 1 | [../codex-data/data/misc/buzzetti_email_2019-08-11.json](<../codex-data/data/misc/buzzetti_email_2019-08-11.json>) |
| `salutation` | 14 | 14 | [../codex-data/data/michelangelo-letters/1496-07-02-to-magnificent-lorenzo-[e6337165].json](<../codex-data/data/michelangelo-letters/1496-07-02-to-magnificent-lorenzo-[e6337165].json>) |
| `section` | 4 | 1 | [../codex-data/data/misc/siloti_memories-of-liszt-and-rubinstein.json](<../codex-data/data/misc/siloti_memories-of-liszt-and-rubinstein.json>) |
| `style/bold` | 18 | 8 | [../codex-data/data/luca-landucci_diary/1494-11-08-[ba739374].json](<../codex-data/data/luca-landucci_diary/1494-11-08-[ba739374].json>) |
| `style/highlighter` | 3 | 3 | [../codex-data/data/uploads/20250729_2304.json](<../codex-data/data/uploads/20250729_2304.json>) |
| `style/italics` | 2291 | 1091 | [../codex-data/data/condivi_life-of-michelangelo/chapter-1-[82c0b5b1].json](<../codex-data/data/condivi_life-of-michelangelo/chapter-1-[82c0b5b1].json>) |
| `style/rainbow` | 6 | 6 | [../codex-data/data/luca-landucci_diary/preface-[7f311b38].json](<../codex-data/data/luca-landucci_diary/preface-[7f311b38].json>) |
| `style/rectangle` | 3 | 3 | [../codex-data/data/uploads/20250729_2304.json](<../codex-data/data/uploads/20250729_2304.json>) |
| `style/spiky` | 3 | 3 | [../codex-data/data/uploads/20250729_2304.json](<../codex-data/data/uploads/20250729_2304.json>) |
| `style/superscript` | 1956 | 1669 | [../codex-data/data/luca-landucci_diary/1462-09-04-[a9d8331f].json](<../codex-data/data/luca-landucci_diary/1462-09-04-[a9d8331f].json>) |
| `style/uppercase` | 325 | 192 | [../codex-data/data/luca-landucci_diary/1507-02-08-[9353314c].json](<../codex-data/data/luca-landucci_diary/1507-02-08-[9353314c].json>) |
| `subject` | 16 | 12 | [../codex-data/data/luca-landucci_diary/1471-09-23-[4f667994].json](<../codex-data/data/luca-landucci_diary/1471-09-23-[4f667994].json>) |
| `tei/core/date` | 385 | 365 | [../codex-data/data/luca-landucci_diary/1478-05-19-[8aa24c7e].json](<../codex-data/data/luca-landucci_diary/1478-05-19-[8aa24c7e].json>) |
| `tei/core/item` | 3 | 1 | [../codex-data/data/luca-landucci_diary/1513-04-08-[f49998d1].json](<../codex-data/data/luca-landucci_diary/1513-04-08-[f49998d1].json>) |
| `tei/core/name` | 31 | 6 | [../codex-data/data/luca-landucci_diary/1495-03-05-[35dda5b5].json](<../codex-data/data/luca-landucci_diary/1495-03-05-[35dda5b5].json>) |
| `tei/core/num` | 1 | 1 | [../codex-data/data/luca-landucci_diary/1495-03-05-[35dda5b5].json](<../codex-data/data/luca-landucci_diary/1495-03-05-[35dda5b5].json>) |
| `tei/core/quote` | 3 | 1 | [../codex-data/data/luca-landucci_diary/1505-05-01-footnote-2-[d2d69789].json](<../codex-data/data/luca-landucci_diary/1505-05-01-footnote-2-[d2d69789].json>) |
| `tei/core/unit` | 11 | 4 | [../codex-data/data/michelangelo-letters/1498-08-07-[f3201cc1].json](<../codex-data/data/michelangelo-letters/1498-08-07-[f3201cc1].json>) |
| `tei/textstructure/closer` | 2 | 2 | [../codex-data/data/michelangelo-letters/1560-to-the-cardinal-ridolfo-pio-da-carpi-[843a06d6].json](<../codex-data/data/michelangelo-letters/1560-to-the-cardinal-ridolfo-pio-da-carpi-[843a06d6].json>) |
| `tei/textstructure/dateline` | 42 | 25 | [../codex-data/data/luca-landucci_diary/1495-04-13-[46efd2dc].json](<../codex-data/data/luca-landucci_diary/1495-04-13-[46efd2dc].json>) |
| `tei/textstructure/opener` | 5 | 5 | [../codex-data/data/michelangelo-letters/1512-09-05-to-buonarroto-di-lodovico-simoni-[45a7ea1e].json](<../codex-data/data/michelangelo-letters/1512-09-05-to-buonarroto-di-lodovico-simoni-[45a7ea1e].json>) |
| `tei/textstructure/postscript` | 3 | 3 | [../codex-data/data/michelangelo-letters/1507-01-31-[9d7f3de9].json](<../codex-data/data/michelangelo-letters/1507-01-31-[9d7f3de9].json>) |
| `tei/textstructure/salute` | 45 | 27 | [../codex-data/data/michelangelo-letters/1506-05-02-[b753c72d].json](<../codex-data/data/michelangelo-letters/1506-05-02-[b753c72d].json>) |
| `tei/textstructure/signed` | 15 | 15 | [../codex-data/data/michelangelo-letters/1512-to-lodovico-di-lionardo-di-buonarrota-simoni-[b6dbc607].json](<../codex-data/data/michelangelo-letters/1512-to-lodovico-di-lionardo-di-buonarrota-simoni-[b6dbc607].json>) |
| `text/background-colour` | 1 | 1 | [../codex-data/data/uploads/New Document.json](<../codex-data/data/uploads/New Document.json>) |
| `text/colour` | 3 | 2 | [../codex-data/data/edgar-allan-poe/masque-of-the-red-death-[1c48f303].json](<../codex-data/data/edgar-allan-poe/masque-of-the-red-death-[1c48f303].json>) |
| `text/sentence` | 62 | 3 | [../codex-data/data/michelangelo-letters/1507-02-01-[85506e17].json](<../codex-data/data/michelangelo-letters/1507-02-01-[85506e17].json>) |
| `time` | 21 | 1 | [../codex-data/data/misc/landucci_preface.json](<../codex-data/data/misc/landucci_preface.json>) |
| `underline` | 1 | 1 | [../codex-data/data/luca-landucci_diary/1499-04-26-[e9ebc0f8].json](<../codex-data/data/luca-landucci_diary/1499-04-26-[e9ebc0f8].json>) |
| `valediction` | 9 | 9 | [../codex-data/data/michelangelo-letters/1554-09-19-to-giorgio-vasari-[0eb2e3ef].json](<../codex-data/data/michelangelo-letters/1554-09-19-to-giorgio-vasari-[0eb2e3ef].json>) |

## Conversion sequence and invariants

1. Replace the converted renderer's substring/generic-underline guesses with an
   explicit typed registry. Port colour, typography, pink highlights, URL styling,
   all six semantic underline colours, the exact rainbow palette, and SVG
   highlighter/outline appearance. Keep `style/strike` and `style/color` as aliases.
2. Preserve inclusive endpoints and source type tokens; ignore deleted and invalid
   ranges visually while retaining their JSON. Overlapping Cell decorations
   compose, with deterministic last-property precedence for competing colours.
   Only underline-producing annotations consume SVG lanes; overlapping rainbows
   reserve all seven lanes and nonoverlapping ranges reuse space.
3. Keep text/Cell DOM ownership in Solid. Uppercasing must not change saved text,
   and styles must clear correctly after deletion, range changes, value updates,
   and undo. Unknown/unsupported tokens receive no invented visible decoration.
4. Qualify grouped range wrappers before blur/flip/mirror and clock: the original
   transforms a shared inline-block box (which may wrap internally), not each letter. Crossing ranges need a
   deterministic grouping policy, nesting-aware DOM/caret mapping, and native
   editing/IME/cleanup tests. Clock requires pause/lifetime and serialization
   policy; micro-documents require loaded child-editor ownership and input scope.
5. Keep reference click/entity workflows, annotation creation/recognizers, and
   historical archived schema families separate from appearance. A coloured
   underline is not evidence that the underlying editor workflow is ported.

The first implementation targets the 22 registered schemas that do not require
an embedded editor, a grouped wrapper, or a plugin. Existing per-line SVG
geometry remains subject to further connected multiline contour, bidi, zoom,
and transformed-range qualification; this pass must not claim those are exact
copies of the original wrapped polygon geometry. Honour reduced-motion settings
for the outline animation.

## Verification gates

- [x] Inventory all current schemas and all saved tokens with source/file locations.
- [x] Registry tests cover type lookup/aliases, fixed semantic colours versus IDs,
  overlapping styles, deleted ranges, and lane allocation including rainbows.
- [x] Editing tests verify range movement, value changes, removal/undo, unchanged
  text and JSON types, and clean style removal without changing Cell mounts.
- [x] Real-browser checks verify computed colours, super/subscript/uppercase,
  underlines, exact palette, dashed animation, and wrapped line geometry.
- [x] Typecheck, client/server build, and the full existing regression suite pass.

## First-pass implementation and evidence

The explicit registry and overlapping-underline lane allocator now live in
[`src/rendering/standoff-styles.ts`](src/rendering/standoff-styles.ts).
[`standoff-editor-view.tsx`](src/rendering/standoff-editor-view.tsx) applies Cell
styles reactively and measures the SVG overlays; shape builders live in
[`decorations.ts`](src/rendering/decorations.ts). This replaces the previous
substring-based rendering guesses. Unknown and deferred types stay serialized
without an invented underline. Semantic reference IDs are never used as colours.

The SVG highlighter blends its entire layer with the text using `color-dodge`;
blending individual paths inside an isolated SVG incorrectly obscured the text
and was corrected during the browser check. Rectangle outlines have the original
10/10 dashed, 0.5-second animation, disabled by `prefers-reduced-motion`.

Verification on 12 September 2026:

- `npm test`: **63 tests in 11 suites passed**, including five registry/geometry
  tests and two added mounted-editor tests for reactive style changes, inclusive
  ranges, insertion, removal, undo, stable Cell identity, and retained wire data.
- `npm run typecheck` and `npm run build`: passed for the client and server.
- Chrome loaded a styling fixture through the document browser and real Node
  API in a temporary store. Computed-style/SVG assertions covered the first 22
  schema appearances, exact seven-colour rainbow, fixed reference colours,
  unchanged uppercase source text, hidden deleted/unknown styles, wrapped
  underlines, and reduced-motion animation suppression. The screenshot was
  visually inspected: `/tmp/speedy-standoff-styles.png`.
- Existing document browser, persistence, model/codec, editing, workspace, and
  decoration tests continue to pass. No original stored document was modified
  for this styling verification.

Remaining work: grouped `style/blur`, `style/flip`, and `style/mirror`;
`animation/clock`; `cell/micro-document`; connected multiline outline geometry,
bidi/zoom/transformed ranges; and the separate reference/recognizer workflows.
Current outlines are per-line, and dense overlapping underline lanes can extend
toward the following line. The browser check qualifies the implemented per-line
rendering, not exact parity for these remaining geometry cases.
