# Document Formats — implementation review

Implemented 28 September 2026. Ready for visual and behavioural review; no second-phase format commands implemented.

## Try the formats

Refresh the main application, then choose **Workspace → New Document in Format**. The submenu contains all nine formats; Framed Document opens the Illuminated Manuscript template. **Workspace → New Document** still creates the ordinary blank Page Document. Hosts using the older toolbar receive a compact format select instead.

`documentFormats` is **enabled by default**. Disabling it hides the additional creation UI and uses ordinary Document rendering while retaining authored metadata and all child Blocks. Existing untagged Documents are not converted.

## Architecture and authored data

Every format remains a `document-block` in the existing repository/projection, with ordinary owned children. Creation uses `workspaceOpen` and its existing Desktop, Canvas and Spatial insertion routing, identity allocation and command transaction. No new persistence envelope, input pipeline, editor instance, observers or template registry were introduced.

New Documents carry a small metadata value, for example:

```json
{
  "documentFormat": {
    "version": 1,
    "format": "framed",
    "template": "illuminated-manuscript",
    "theme": "parchment"
  }
}
```

This sits alongside the existing `documentId`, `folder` and `filename` metadata. Format describes the arrangement; template identifies the starting composition; theme identifies its visual treatment. The initial definitions are a bounded list, not an extensible registry. Unknown format names and future metadata versions fall back to ordinary rendering without rewriting the data.

The application selects a small Document styling adapter at core-view registration. `ContainerBlockView` retains mounting, focus, relations and child rendering; its only additions are optional styling and a content wrapper. Core rendering does not import the format feature. The adapter reads projection metadata and delegates all editing to existing views. Presentation state has no additional disposable resources.

Window geometry remains ordinary authored Window metadata. The factory supplies initial sizes, and opening a standalone formatted server Document uses those initial defaults. Reopening a saved workspace retains its saved Window geometry. Compact Document behavior and existing Page structure were not changed.

## Implemented arrangements

Screenshots include sample writing entered by the browser qualification script. That sample writing is not automatically inserted into new Documents; template headings, letter prompts and the manuscript's opening sentence are editable starting content.

| Format | Existing Block arrangement and appearance | Review image |
| --- | --- | --- |
| Page Document | Document → one empty standoff text Block. Existing default layout and 840 × 620 Window. | [Page](artifacts/document-formats/page.png) |
| Simple Document | Document → one empty standoff text Block. White single column, system type, reduced paper apparatus; 640 × 520 Window. | [Simple](artifacts/document-formats/simple.png) |
| Sticky Note | Document → one empty standoff text Block. Warm yellow paper in an existing plain 340 × 340 Window, without the full Document toolbar/minimum width. It is a Document format, not a new StickyNoteBlock type. | [Sticky Note](artifacts/document-formats/sticky-note.png) |
| Journal | Heading Block plus ordinary `container-block` containing the writing Blocks. Cream paper, red margin guide and continuous 32px rules in the writing area. Enter continues using ordinary sibling text Blocks. | [Journal](artifacts/document-formats/journal.png) |
| Diary | Editable date heading plus entry Block. Date is captured at creation; rose-tinted paper and an understated heading rule. | [Diary](artifacts/document-formats/diary.png) |
| Letter | Six text Blocks: date, recipient/address, salutation, body, sign-off and signature. Ivory paper, correspondence spacing and right-aligned date. | [Letter](artifacts/document-formats/letter.png) |
| Card | Heading plus content Block in a 580 × 380 Document Window. Cream index-card treatment with a restrained red edge and heading rule. | [Card](artifacts/document-formats/card.png) |
| Notebook | Existing `document-tab-row-block` with three `document-tab-block` children: Notes, Ideas and References. Each contains a heading and writing Block. Sage tabs, cream paper and a bound edge. Only the active section mounts. | [Notebook](artifacts/document-formats/notebook.png) |
| Framed Document | Ordinary text children inside a view-only scrolling content wrapper. The initial template uses a static authored SVG border and CSS parchment surface; neither is editable DOM content. The border stays stationary while text scrolls. | [Manuscript](artifacts/document-formats/framed.png) |

Additional evidence: [creation menu](artifacts/document-formats/creation-menu.png), [manuscript after scrolling](artifacts/document-formats/framed-scrolled.png), [small Window](artifacts/document-formats/framed-small.png), [Canvas](artifacts/document-formats/framed-canvas.png).

The manuscript frame uses nine-slice SVG borders so its edge thickness remains bounded when a Window changes size. Generic Framed layout is independent of the illuminated template: its scrolling content wrapper is selected by format; the decoration is selected by template/theme. No manuscript-specific structural Block was added.

## Qualification

- **22 focused tests passed** across Document formats, workspace opening, application startup and system-menu navigation. All nine formats were created, edited through inline commands, serialized and materialized again in Desktop and Canvas. Saved identities, format metadata, text, structure and geometry survived round-trip.
- **39 real Chrome checks passed**, exercising native typing and JSON save/reopen for every format; creation submenu/default Page; full paper height; small Sticky Window; Notebook section switching and active-only mounting; Journal paragraph entry; stationary manuscript frame, inner scrolling and minimum Window size; Canvas editing; and disabled-feature data preservation with ordinary rendering. See [browser results](artifacts/document-formats/browser-results.json).
- Client TypeScript check and production Vite build passed. Vite retains its existing warning about chunks larger than 500 kB.
- Tests use isolated in-memory sessions and JSON persistence materialization, not writes to the user's server Documents. The existing application-startup suite also exercises the local Workspace save/open picker path with a file-handle stub.
- The local `.env.local` enables Spatial. The startup suite's existing Canvas opt-out case assumes Spatial is off, so focused tests were run with `VITE_SPATIAL_WORKSPACE=0`; no existing feature default or local environment file was changed.

Reproduce with Node 22 or later:

```sh
VITE_SPATIAL_WORKSPACE=0 npx vitest run src/application/document-formats.test.ts src/application/workspace-open.test.tsx src/demo/application-startup.test.tsx src/demo/codex-system-bar.test.tsx
node scripts/check-document-formats-browser.mjs
npx tsc --noEmit --project tsconfig.reactive.json
npm run build:client
```

The browser script expects the existing dev application at `http://localhost:3000/`; `FORMATS_URL`, `FORMATS_ARTIFACTS` and `CHROME_BIN` can override the defaults.

## Limits and next review

These are initial arrangements, not specialized applications. Diary dates and Letter fields are editable text, not protected semantic fields. Notebook starts with three sections and uses existing tab behavior; new section-management commands and persistence of the last viewed tab are not added. Journal rules suit ordinary continuous writing; unusually large text or media may not follow the ruling. Letter and heading treatments currently follow the initial Block positions, so arbitrary reordering can change their visual role.

Sticky Note deliberately uses existing plain Window chrome. Card retains normal Document chrome and its existing minimum width. There is no new compact-mode policy, Page conversion, print pagination or format-switching command. No comprehensive viewport/theme matrix, new Spatial-specific qualification or cross-browser campaign was undertaken for this layout pass.

Before the later context-menu pass, review the paper treatments and starting content, decide which structural roles need explicit metadata when users rearrange a Letter, and choose the minimum Notebook section operations. Theme/template switching should preserve existing content and be specified separately. No broader framework is a prerequisite for reviewing these prototypes.
