# Containers and reverse surfaces — implementation and qualification

Date: 24 October 2026. Baseline: `fd98c6d`.

Implemented behind the default-enabled `reversibleBlocks` feature flag. Manual Document Save remains unchanged. No new SQLite schema, native file format, background saves or indexing service has been introduced.

## Using the feature

The Block-selection panel provides **Group into Container**, **Dissolve Container**, **Create Reverse**, **Flip**, **Unwrap Reverse** and **Delete Reverse**. The existing forward-slash picker also exposes:

| Command | Result |
| --- | --- |
| `/container group` | Group at least two contiguous sibling Blocks, preserving their order and identities. |
| `/container dissolve` | Promote the container's children in order. If its front has a reverse, offer to unwrap it with the children, or cancel. |
| `/reverse create` | Create the reverse without changing the visible face. |
| `/reverse flip` | Flip the nearest surface; create one first if absent. |
| `/reverse unwrap` | Move reverse content after the whole front owner, preserving identities, then remove the back face. |
| `/reverse delete` | Confirm removal of the reverse; canonical resource attributes remain intact. |

Commands consume their slash invocation in the same structural transaction. Invalid or cancelled commands leave it intact. Explicit Block selection takes precedence over caret targeting. A caret in a grouped front TextBlock creates a reverse for that TextBlock, not its containing passage. Flip from a reverse targets its nearest enclosing surface; explicit Create permits nested surfaces.

Whole-Block selection operations on the sole front owner include its surface, so copy, cut, grouping and deletion carry its reverse. Selecting a child inside a grouped front still targets that child. Deleting a surface with reverse content requires confirmation. The proposed **delete active face** variant is not implemented.

## Structure and retained state

```text
surface-block
  side-block (front)
    original Block or container — original canonical identity
  side-block (back)
    container-block
      resource-information-block (when appropriate)
      ordinary editable metadata/notes Blocks
```

Existing `surface-block`, `side-block` and `container-block` records provide the structure. The passive `resource-information-block` hosts existing supporting viewer controls and a canonical-attributes inspector; its typed Block reference follows normal clipboard identity remapping. Back notes are ordinary editable Blocks. Deleting generated notes or their information Block does not regenerate them on flips or reloads. Mandatory source attributes remain on the original resource.

Both faces remain mounted. The inactive face is inert, hidden and removed from pointer interaction. Face height is natural, animation is 180 ms, and reduced-motion preference disables it. Flip changes occurrence-local presentation only: it makes no repository commit, snapshot, history entry or save request. Focus, inline selection and observed scroller positions are remembered independently per face. Reopening starts on the front, regardless of legacy active-face metadata.

### Initial conversion continuity

The initial parent move now preserves the mounted subtree too; the earlier proposed remount limitation was rejected and has been removed for supported conversions.

- Structural projection rebuilds reuse NodeKeys only when the old and new projections each have one occurrence of that placement. Inline Cell keys remain stable. The ordinary inline-edit path does not perform this reconciliation.
- A rendered Document's `ReactiveViewProvider` owns retained Solid roots. A structural parent supplies a mount slot, rather than disposing the editing/viewer root when its child list changes.
- Synchronous reparenting adopts the existing root. A connected parking element bridges parent removal and insertion. Unclaimed roots are disposed after the structural update; provider disposal disposes every retained root synchronously and exactly once.
- Live DOM moves use `Element.moveBefore` where available. Scroll events identify generic scrollers; explicit viewer viewport markers also preserve programmatic scrolling. Scroll capture is restricted to the affected mounted subtree during structural movement, never ordinary typing or flipping.
- Supporting information resolves its current structural owner instead of capturing the old Solid parent context. This lets an already-mounted resource acquire a new reverse without recreating its viewer.
- Ambiguous shared occurrences, active composition and moving live media on browsers without state-preserving DOM moves are refused before mutation. An explanation appears in the selection panel. This is a restriction, not a silent reconstruction fallback.

This is a change to local Block mounting inside an existing Document view. It does not introduce Document detachment, cross-host transfers, new durable view identities or a replacement Document session store.

## Resource UI inventory and qualification

Previously saved standalone resources use the same renderer presentation. Their structural reverse is created lazily by Create/Flip; rendering alone does not modify the Document. New resource acquisitions use the wrapper before their single insertion transaction. Legacy image/card surfaces retain their existing IDs, annotations and back content, with an idempotent in-memory structural conversion; only explicit Save writes it.

| Renderer/family | Supporting content on reverse | Essential front content and qualification |
| --- | --- | --- |
| Video / YouTube / Vimeo | Source/provider/title/technical attributes, editable initial notes | Player and explicit Load/Stop gate where already required. Real-browser iframe continuity, including an already-open standalone iframe and undo; all aliases tested with missing metadata. Existing legacy auto-load policy is unchanged. |
| Image | Source/alt/technical attributes and notes | Image; legacy two-sided content and annotations preserved, idempotent reload tested. |
| Legacy iframe / PDF / YouTube | Source link and embed explanation | Existing frame and restrictions. Browser proof checks the same running iframe document, not just the same outer element. |
| Managed PDF | Capture date, provenance/source, relationships | Open/close, page/zoom/extraction/annotation controls and errors. Real PDF.js page 2, canvas, scroll and single read session survive initial conversion and flips. |
| IIIF manifest/image | Capture/source, rights/attribution, dimensions, relationships | Network disclosure, activation, canvas/navigation and errors. Valid manifest fixture verifies disclosure, no premature activation, reverse attribution and front-side load failure/retry. Both families tested with missing metadata. |
| Captured web article | Source/revision/license, external links, conversion limitations, relationships | Captured article, review/conversion and errors. Existing four renderer tests pass, including sandboxing and no recompilation from unrelated typing; missing-metadata wrapped fixture passes. |
| Citation | Provenance, DOI/export/reference actions, diagnostics and saved-reference results | Citation body and explicit full-text candidate inspection. Valid wrapped citation verifies separation. |
| Academic resource | Source/capture/technical data, retained-original download | Primary resource content, review/import/annotation controls and errors. Valid wrapped ORCID fixture verifies source actions moved; missing-metadata fallback tested. Individual EPUB/OCR/provider acquisition workflows were not all rerun. |
| Web resource | Source/capture, provider diagnostics and supporting notices | Captured preview, optional interactive-content consent and errors. Valid Maps fixture verifies permission survives flips and cancellation loads no iframe. |
| Structured resource | Filename/read-only descriptor | Source/tree/table/diagram viewer and controls/errors. Three existing tests pass, including no reparse or snapshots from unrelated typing; wrapped missing-data fixture passes. |
| HTML/Markdown source | Ancillary resource/link lists | Authored editor, preview and sandbox/error controls. Eleven existing tests pass, including IME, exact history, stale-worker cancellation and bounded typing work; both wrapped fallbacks tested. |

Primary resource content is retained on the front: for example the citation body, social-post author/text and academic resource content. These are distinct from capture provenance and explanatory furniture. Supporting UI cannot silently activate an external resource. Background and Canvas application renderers are outside this Document import template.

## Persistence, copying, search and privacy

- Native serialization and native packages preserve both faces, note content, annotations and canonical attributes. Clipboard materialization preserves surface/side/container structure and uses existing fresh-identity rules.
- Existing passive import policy remains in force for resource formats requiring explicit activation; a packaged resource may reopen as an inactive/opaque resource under that policy. This feature does not bypass it.
- Document Find traverses reverse notes. Navigating a result reveals the enclosing surface(s) without editing the Document. Verified with the real search worker in Flint as well as deterministic tests. No separate vault-wide indexing change was made.
- Semantic HTML, Markdown and text exports emit the front only, with a diagnostic. Public-reader projection excludes reverse text and its entities from public HTML/search/research output. Native packages are deliberately different: they retain private reverse content.
- Unwrap preserves the information Block with its explicit resource reference. Outside its surface it displays source/canonical attributes; application-specific portalled controls remain associated with their original viewer. No filename/title guessing or metadata deletion occurs.
- A front-only surface may remain after reverse deletion/unwrap. It is an ordinary structural wrapper with no additional document spacing.

## Test evidence

The final focused suite covers ten files: reverse surfaces, Mutable clipboard, Block selection, source/structured/article viewers, interchange clipboard, native package resources, publication reader and Workspace demo. **180 passed; 3 established baseline failures**, plus the existing synthetic drag/drop uncaught error described below. TypeScript checking (`tsconfig.reactive.json`) and `git diff --check` passed. Tests include real editor components, both character renderers, retained initial NodeKeys/Cells/DOM/mount generation, exact owner disposal, composition refusal, cancellation, recursive surfaces, grouping/dissolving, whole-owner deletion, native/package round-trips, privacy and hidden-text navigation.

Browser runner: `scripts/check-reverse-surfaces-browser.mjs`. It creates an isolated Chrome profile and Vite server, opens the real Flint application with an in-memory Masque fixture, and cleans up afterward. It does not save or change a Vault.

- Direct character renderer: **17 browser checks passed**, no browser exceptions.
- Solid character renderer: **15 browser checks passed**, no browser exceptions; the later real-search-worker and source-preview checks were run with the direct renderer.
- Real mouse handle/range selection and panel grouping preserve paragraph heights and spacing.
- Real input creates editable back notes. Panel-driven flips restore selection and retain both DOMs.
- Flip-only instrumentation records **zero repository snapshots and zero commits**.
- Nested targeting, natural height, inert hidden face and reduced motion pass.
- Initial iframe conversion and undo retain its running document/token with **zero reloads**.
- Initial conversion of a real open PDF retains page 2, its canvas, viewport scroll and **one total PDF read**; flipping does not reopen it.
- Real Find reveals hidden reverse text without changing document revision.
- An active Markdown preview survives initial conversion and subsequent focus restoration without being switched back to editing mode.

Artifacts: [direct checks](/tmp/reverse-surfaces-retained/reverse-surfaces.json), [direct screenshot](/tmp/reverse-surfaces-retained/reverse-surfaces.png), [Solid checks](/tmp/reverse-surfaces-solid-retained/reverse-surfaces.json). These are local qualification artifacts; the script reproduces them.

### Regression comparison

An isolated archive of unchanged baseline `fd98c6d` reproduced:

1. Block-selection drag/drop test: its synthetic `dataTransfer` lacks `files`, causing `files.length` to throw and the reorder assertion to fail.
2. WorkspaceDemo “records editing and recreates pristine state on reset”: existing toolbar/revision assertion failure.
3. WorkspaceDemo “exposes distinct Workspace controls and opens them with browser-safe chords”: existing empty shortcut-title assertion.

The legacy surface test was updated to assert the newly requested behavior: panel flip, no canonical revision change, and no separate double-click flip mechanism. Its old expectation of a document edit is intentionally obsolete. Legacy-conversion record-count assertions now account for added structural records while checking preservation of original identities.

After the final focus-restoration refinement, all 49 reverse-surface/source-editor tests passed again, and TypeScript checking passed again.

The three failures above are not new regressions. This was a focused comparison, not a claim to have rerun all 13 failures recorded in earlier Window Manager reports. No load testing was performed.

## Keyboard audit and deliberate exclusions

No new default keybindings have been installed. The brief explicitly requires approval of a final mapping before registration; panel and `/` commands are implemented independently.

- The withdrawn reload/find shortcuts remain untouched. [Chrome's official shortcut table](https://support.google.com/chrome/answer/157179?co=GENIE.Platform%3DDesktop&hl=en) does not list the proposed Shift-Y/U/K combinations as ordinary Chrome commands; that alone does not establish OS/IME safety.
- On this Mac, `/System/Applications/Stickies.app/Contents/Info.plist` declares a `Make Sticky` service with uppercase `Y` as its key equivalent, conflicting with the proposed Command-Shift-Y when that service is enabled.
- Control-Shift-U conflicts with Linux Unicode character entry. [GNOME documentation](https://help.gnome.org/gnome-help/tips-specialchars.html.en).
- Mutable's current binding catalog preserves Command/Control-Shift-Z redo, Command/Control-Shift-P Thesis and its existing Control-semicolon chord family. It does not assign the proposed Y/U/K combinations. International layouts, extension shortcuts and native Windows input-method combinations have not been exhaustively qualified.
- Recommendation: keep create/group/dismantle in the `/` picker; choose a separately approved flip binding after native OS testing. The already-established Control-semicolon prefix followed by `r` is an available application-level alternative if a two-stroke command is acceptable. It is a proposal, not an installed or universally certified shortcut.

## Remaining limitations

- Initial movement of a live iframe/video/audio viewer requires a browser implementing state-preserving DOM moves. Unsupported browsers refuse the operation; subsequent flips of existing surfaces still preserve their mounts.
- Conversion of ambiguous shared occurrences is refused rather than conflating sessions. Cyclic structural moves remain rejected by existing tree validation.
- Legacy surfaces with more than two faces remain readable/flippable, but destructive dismantling refuses until the extra faces are handled explicitly.
- Third-party providers, authenticated/DRM playback, every EPUB/OCR format and OS-level IME configuration were not exhaustively browser-tested. The running-iframe and real PDF checks establish local continuity, not a guarantee about external provider behavior.
- There is no active-face deletion variant, automatic metadata regeneration, independently editable canonical metadata mirror, new persistence architecture, background saving or unrelated Window Manager milestone in this change.
