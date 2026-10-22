# Scry boundary movement: investigation and correction

> **Presentation update — 22 October 2026:** Purple bracket pseudo-elements have been replaced with a pale purple source-range highlight (`#e5d2f5`). `src/features/autocomplete/source-highlight.ts` uses CSS Custom Highlights and two existing inline boundary endpoints; it does not insert characters, wrap cells, measure layout, change native selection or touch repository state. Existing boundary shortcuts now adjust the highlighted range. Trigger syntax and explicit Keep literal brackets remain available. An empty range has no highlighted characters. This presentation requires browser CSS Custom Highlight support (qualified in Chrome); no DOM-mutating fallback was introduced.
>
> Validation: 32 autocomplete tests passed, client TypeScript passed, and 94 real Chrome interaction checks passed with no browser exceptions. Tests cover two-endpoint bounded work, unchanged DOM/text/native selection, range updates, independent-owner cleanup and existing no-snapshot/no-commit boundary movement. Browser checks verify highlight colour, source text, cancellation, source editing and existing linking/window lifecycle workflows. [Screenshot](scry-highlight-qualification/purple-source-highlight.png), [browser results](scry-highlight-qualification/browser-results.json), [unit results](scry-highlight-qualification/tests.txt). The investigation below records the earlier bracket presentation and performance fix; its boundary-only persistence guarantees still apply.


22 October 2026. Investigated the reported stall in *The Masque of the Red Death*, then implemented the user's clarification: moving a selection boundary is transient interaction state, not a Document edit.

## Finding

The previous implementation was wrong. `changeBoundary` removed and reinserted both delimiter pairs, making four text replacements inside `TreeCommands.transaction`. That general transaction snapshots the entire repository. Its pending draft disables `replaceInlineRange`'s incremental path, causing each replacement to clone the graph, prune unreachable records, diff the graph and run full planning/validation. The final commit then publishes an actual content change and creates history.

This was introduced by the Scry implementation, not an established baseline failure. The prior bounded-work assertion covered ordinary source typing, not boundary gestures. The previous browser fixture checked correct results in a 660-character Document without asserting the cost of boundary movement.

Relevant code: [transaction and inline replacement](../../src/block-tree/commands.ts), [repository planning](../../src/block-tree/repository.ts). The corrected [boundary controller](../../src/features/autocomplete/index.tsx) no longer calls those mutation paths.

## Reproduction and measured results

Used real WorkspaceSession, Flint, retained editor components, and Chrome keyboard events. Loaded the existing native fixture `vaults/imported/documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink` into memory without modifying or saving the file. The fixture contains 51 Blocks and 15,745 text characters; the mounted source paragraph had 926 cells. The repository contained 15,802 content records and 15,802 placements.

Performed four boundary gestures and two ordinary source edits, with an isolated in-memory Entity resolver. This was a bounded reproduction, not load testing. A browser CPU profile was captured for the first movement.

| Closing-boundary movement | Before, synchronous handler | After, synchronous handler |
|---|---:|---:|
| Right one word | 1,441.4 ms | 6.7 ms |
| Left one word | 1,416.9 ms | 1.4 ms |
| Right one character | 1,436.0 ms | 1.2 ms |
| Left one character | 1,374.8 ms | 1.3 ms |

Every baseline movement performed one explicit repository snapshot, four graph-pruning passes, four graph diffs and one repository commit. The code path additionally clones the graph within replacement and planning. Chrome reported a long task of roughly 1.4 seconds for each gesture. Ordinary source edits in that baseline took about 7 ms through the incremental replacement path.

After the correction, all four movements performed **zero snapshots, zero pruning/diff passes and zero commits**. Repository revision and occurrence cell identities remained unchanged. No long task was recorded for those gestures. The first movement builds the affected paragraph's segmentation cache; subsequent movements reuse it.

These are synchronous handler measurements, not guaranteed input-to-display latency. The raw two-frame counter includes CDP/profiler setup for the first gesture and is not used for the table. The small source-typing samples varied between runs and do not establish a general typing-performance improvement. A UI stall was reproduced; a browser timeout dialog was not required or reproduced. More loaded resources would make the former repository-wide work more expensive.

Following-source mode still schedules one debounced, cancellable Entity query when the selected phrase changes. That asynchronous query is expected; the reproduced synchronous stall occurred in repository mutation/planning before it. Boundary movement no longer emits repository changes that could invalidate inventories or saved-resource consumers.

## Correction

- The Scry bookmark now uses the actual authored text range, without delimiter cells.
- Visible brackets are CSS pseudo-elements attached to the two existing boundary cells. They introduce no editing nodes, text content, cell indices, persistent annotations or layout reads. They follow their cells through wrapping, scrolling and zoom.
- Boundary changes update only session offsets, the query/preview and caret. They cannot create Document history or dirty-state events because they do not commit content changes.
- Word/grapheme segmentation is cached per occurrence and inline revision, then searched by position. It is discarded on cancellation and invalidated by actual source edits.
- Cancellation and IME exit remove interaction chrome without rewriting authored text. Undo of a confirmed link restores the authored phrase, not transient brackets.
- Explicit **Keep literal brackets** remains an authored operation. Actual source typing, Entity linking and reviewed batch annotation remain normal undoable edits. Typed trigger recognition consumes the first owned opener through the existing incremental input path; it does not use a general transaction.
- Reviewed batch linking no longer needs a text transaction merely to remove delimiters.

The existing Scry flag, canonical ownership and manual Save conventions remain unchanged.

## Qualification

- **92 real-browser checks passed**, including all eight boundary shortcuts leaving authored text and repository revision unchanged; visual pseudo-element presence; linking; creation/aliases; reviewed batches; Undo; query independence; clipboard operations; cancellation/IME exit; drag/resize; viewport/page-scale changes; and retained application/tab lifecycle.
- **146 targeted tests passed**, with the same two established Entity-candidate snapshot-count failures (expected two snapshots, actual zero). No newly failing targeted test remains.
- Client TypeScript passed: `npx tsc --noEmit --project tsconfig.reactive.json`.
- New controller tests assert zero repository snapshots, commits, graph pruning/diffs and Undo entries across every boundary operation. A separate marker test verifies retained cell DOM, unchanged `textContent`, zero geometry reads and complete marker cleanup.
- Native OS IME candidate windows and every browser toolbar-zoom setting remain outside this headless qualification. No user Document was saved.

Evidence: [before measurements](scry-boundary-qualification/before-boundary-results.json), [after measurements](scry-boundary-qualification/after-boundary-results.json), [before CPU profile](scry-boundary-qualification/before-boundary.cpuprofile), [after CPU profile](scry-boundary-qualification/after-boundary.cpuprofile), [browser checks](scry-boundary-qualification/browser-results.json), [test log](scry-boundary-qualification/tests.txt), [typecheck](scry-boundary-qualification/typecheck.txt), [screenshot](scry-boundary-qualification/transient-brackets.png). Reproduction script: [diagnose-scry-boundary-browser.mjs](../../scripts/diagnose-scry-boundary-browser.mjs).

## Default key bindings

Control means the Control key, including on Mac. Option is the Mac name for Alt. User remappings can change registered defaults.

### Source editor

| Binding | Action |
|---|---|
| Control + Left / Right | Move closing boundary one word backwards / forwards. |
| Control + Shift + Left / Right | Move closing boundary one grapheme/character. |
| Control + Option/Alt + Left / Right | Move opening boundary one word. |
| Control + Shift + Option/Alt + Left / Right | Move opening boundary one grapheme/character. |
| Up / Down | Select previous / next Entity result. |
| Enter | Link the selected Entity; when occurrence review is enabled, nominate it for review. |
| Escape | Cancel Scry, subject to pending-operation guards. |
| Control + A | Open/select matching occurrences for review; does not immediately link them. |
| Command + A (Mac) | Select text inside the current source boundaries. |
| Left / Right; Home / End | Move the caret within the source range; Home/End go to its edges. |
| Shift + Left / Right | Extend the text selection within the source range. |
| `:` over selected source text | Focus an independent search query without replacing the phrase. |
| Tab | Leave source-side Scry and continue normal focus traversal. |
| Normal Save / Undo / Redo | Dismiss source-side Scry and pass through to the ordinary command. |

### LER interface

The four boundary shortcut pairs above apply in the source editor; Left/Right/Home/End in text fields retain native navigation. Buttons under **Bracket / target controls and shortcuts** provide the same eight boundary operations.

| Binding | Action |
|---|---|
| Up / Down; Enter; Escape | Navigate Entity results, link/nominate, cancel. |
| Control + A | Review matching occurrences. |
| Command + Shift + A (Mac); Control + Shift + A (Windows/Linux) | Open occurrence review. |
| Command + A in a Mac text field | Native Select All in that field. |
| Control/Command + Backspace | Clear the Entity query outside the occurrence-review panel. |
| Alt + S / M / V | Defined by the LER handler to cycle stream, toggle match mode, and switch Vault/Document scope. On Mac, Option can produce alternate characters, so these letter shortcuts depend on keyboard/browser delivery and were not separately OS-qualified. |
| 0–9 outside text fields | Choose the correspondingly numbered Entity result. |
| Home / End outside text fields | Select first / last result on the current page. |
| Space on a focused review row/checkbox | Toggle inclusion of that occurrence. |
| Tab / Shift + Tab | Traverse controls normally. |

With the window header focused, arrows move the window; with the resize grip focused, arrows resize it. The managed geometry controller uses 10-pixel steps, or 1 pixel with Shift. Enter commits and Escape cancels the geometry operation.
