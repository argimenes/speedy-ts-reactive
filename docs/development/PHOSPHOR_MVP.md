# Phosphor MVP

Open **Mutable → Open Phosphor**, or `/phosphor` on the running development server. The new `phosphor` feature flag defaults to `true`; existing feature defaults are unchanged. Start client and native services with `npm run dev`.

File offers a blank screen and three works: **Letter**, **ASCII scene**, and **Concrete poem**. Save `.ink` to a directory relative to the existing managed document store. Open creates another native window. Canonical entity search/create requires a saved Document in a Cavern; saving requests the existing SQLite index refresh.

## Ownership and integration

- `src/application/phosphor.tsx`: native Document/window creation, application capability adapter, atomic Ink edits/history, native save/open, Cavern and canonical Entity service integration.
- `src/features/phosphor/model.ts`: one `phosphor-screen-block` owns cell geometry. Its ordinary `standoff-editor-block` child owns text, character identities and native inclusive standoff ranges. Spatial mode stores complete rows, including trailing spaces and empty rows. Prose stores only hard returns; wrapping is a projection. Unsafe narrowing/overflow is refused.
- `src/features/phosphor/view.tsx`: Solid DOM cell projection, textarea input/IME/clipboard, caret and selections, writing, drawing, semantics and controls. Rows are virtualised; there are no glyph meshes or rasterised editing surfaces.
- `src/features/phosphor/material.ts`: one decorative DOM-aligned orthographic scene per visible Phosphor view. Reuses Flint's scene, lighting scheduler and Probe PMREM environment; the only Flint change is an optional material-registry factory with the existing factory as default. Dark clearcoat surfaces and shallow emissive bronze borders have no camera navigation, global bloom or continuous render loop. DOM text is not physically refracted/reflected.

Reduced effects, reduced motion, forced colours and WebGL failure retain DOM editing. Unknown Screen versions, glyph encodings, invalid characters and unsupported child structures show a preservation notice rather than converting the Document.

## Apple II character identity

`glyphs.ts` is the repertoire and historical code map. The picker contains 95 printable ASCII characters and, in its Apple II tab, the 32 Enhanced IIe MouseText slots `$40–$5F` plus the checkerboard cursor. It follows the supplied early Enhanced IIe reference: `$46/$47` are the two running-man halves. It does not silently substitute the later IIgs return/title-bar variants.

Normal letters remain ordinary ASCII in native `text-cell` records. MouseText uses Unicode scalar identities with the bundled Apple bitmap outlines; surrogate pairs still occupy **one** Ink cell. Two Apple logos use the font author's documented private assignments: solid Apple `U+F813`, open Apple `U+F812`. The separate cursor uses the font's `U+E07F`. The Screen stores `glyphEncoding: "apple2-unicode-v1"` to identify this convention. It does not store raw video-memory bytes, shift state, inverse-code duplicates, emoji substitutes or control characters as text.

`decodeScreenByte(byte, alternate)` is an explicit, tested video-memory mapping, not an import mode or heuristic applied to pasted text. `$00–$3F` map to inverse characters; with the standard set `$40–$7F` map to flashing counterparts; with ALTCHARSET `$40–$5F` map to MouseText and `$60–$7F` to inverse lowercase/cursor. High-bit normal forms decode to the same printable identities. Firmware control streams would need a separate explicit decoder; this MVP does not pretend to import them.

Authored INVERSE, BLINK and UNDERLINE are independent native standoff properties. MouseText names such as “inverse check mark” describe a particular historical bitmap, not an implicit authored INVERSE property. Semantic display adds underline/inverse by set union; selection has its own temporary colour and never changes authored attributes. Reduced motion disables the blink animation without deleting its property.

The unmodified **Print Char 21** and **PR Number 3** fonts reproduce Apple II bitmap shapes. The DOM uses whole source-pixel scales where space permits, 7×8 cell geometry in 40-column mode, and the half-width 80-column aspect. Font kerning and ligatures are disabled. Resizing never changes logical cell coordinates. Browser zoom or fractional operating-system scaling may still introduce antialiasing.

Copy/paste provides normal `text/plain` plus Phosphor MIME data for exact attribute/semantic ranges and rectangular patterns. Plain text retains actual scalar values, including private glyphs; other applications need a compatible font to display their original shapes. Plain-text transfers cannot preserve attributes. Unsupported graphemes become one `?` with a notice, avoiding invisible cell shifts. We do not translate arbitrary Unicode into a vaguely similar Apple character.

Font attribution: **Kreative Korporation / Kreative Software, Rebecca G. Bettencourt**. Both fonts are bundled without alteration under the [included Free Use License](../../src/features/phosphor/assets/APPLE-FONT-LICENSE.txt). They are not relicensed under the repository's code license.

Primary references:

- [Apple Developer Technical Support, Mouse Technical Note #6](https://mirrors.apple2.org.za/apple.cabi.net/FAQs.and.INFO/A2.TECH.NOTES.ETC/A2.CLASSIC.TNTS/mouse006.html): alternate-set behaviour and the change to the running-man slots.
- [Kreative's Apple II fonts](https://www.kreativekorp.com/software/fonts/apple2/) and [MouseText code map](https://www.kreativekorp.com/charset/map/mousetext/): bitmap fonts, code-to-scalar map and private assignments.
- [Unicode legacy box-drawing mapping analysis](https://www.unicode.org/L2/L2025/25037-legacy-box-drawing-disunification.pdf): why generic modern block shapes can misrepresent historical cell edges. Phosphor uses the original Apple-specific outlines, not system-font approximations.

## Semantics and bounded MVP choices

Entity ranges use `codex/entity-reference` with canonical IDs from the existing Entity service. Tags use ordinary native `codex/tag` ranges and mirror their values into the Document's existing indexed `metadata.tags`. `metadata.phosphorIndexedTags` tracks that mirror so removal does not erase independently existing Document tags. Both remain saved/indexed when invisible. Screen registration is a container; only its **input mount** is opaque, so knowledge traversal still reaches the text child.

The screen offers Pencil, Pick, Eraser, Line, Rectangle, Filled rectangle, rectangular Select/Move, copy/cut/paste and Stamp. A stroke is one Ink history transaction and rejects concurrent revisions. Spatial Insert refuses to displace a nonblank or annotated row end. Width-changing replacements are limited to prose. Screen text is bounded to 100,000 cells; there are no layers, script runtime, authored colours or extra machine repertoires.

## Focused checks

```sh
npm run typecheck
npm run build
npx vitest run src/features/phosphor/model.test.ts src/features/phosphor/glyphs.test.ts src/knowledge-sqlite/phosphor-projection.test.tsx
node scripts/check-phosphor-browser.mjs
```

The browser script uses local Google Chrome, an isolated temporary native store and its SQLite service. It covers actual typing/pointers, tools, MouseText cell counts/font proportions, clipboard patterns, history, canonical entities, native saves, a fresh browser reopen and forced-colour fallback. Screenshots/results are written to ignored `artifacts/phosphor/`. The integration test checks native admission and actual SQLite standoff/FTS rows, including private and supplementary glyphs. No unrelated Flint stress suite is needed.
