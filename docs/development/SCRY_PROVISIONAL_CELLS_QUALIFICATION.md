# Scry provisional character cells — implementation and qualification

23 October 2026. Implementation baseline: `ba32f41`. Feature: `scryProvisionalCells`, enabled by default. No persistence schema changes or background saves.

## Final interpretation of the brief

The user's later clarification supersedes the cancellation rule in `MUTABLE_SCRY_PROVISIONAL_CELLS_FEATURE_BRIEF.md`:

| Action | Document result |
| --- | --- |
| Type `[[Flo]]`, then cancel | Plain `Flo`, no Entity reference |
| Type `((Flo))`, then cancel | Plain `Flo`, no Entity reference |
| Select Florence in square-bracket mode | `Florence` and its Entity reference |
| Select Florence in parentheses mode | Authored `Flo` and its Entity reference |
| Move boundaries, then cancel without changing text | No content action; existing history unchanged |

The brackets in those examples are temporary presentation cells. They are never canonical Cell records and never enter saved content. Source edits remain provisional until linking or cancellation. Independent LER query edits do not replace the authored phrase. Finishing with changed text creates one Document action; successful linking combines text and annotation in that action. Undo does not delete a newly created canonical Entity.

Document Undo/Redo is suspended at the shared repository history authority while the draft exists. Window-layout history is unaffected. Save offers cancellation that keeps the phrase, or continuation in Scry. The user must invoke Save again after finishing; no save is queued.

## Phase A — feasibility verdict and implementation seam

**Viable with local adaptations to the existing cell presentation and input paths.** A separate bracket DOM writer is unnecessary and would violate the existing child-index assumptions.

| Existing boundary | Adaptation |
| --- | --- |
| [DirectCharacterCells](../../src/rendering/direct-character-cells.ts) | Accept tagged provisional presentations through the same reconciliation owner. Temporary cells have `data-provisional-cell`, not a canonical `data-inline-key`. |
| [Solid renderer and mount](../../src/rendering/standoff-editor-view.tsx) | Both rendering paths consume one coherent sequence. Map capture, restore, hit testing, boundary positions and annotation geometry between presented, draft and canonical coordinates. |
| [ProvisionalCells](../../src/features/autocomplete/provisional-cells.ts) | Occurrence-local cell sequence, stable temporary identities, source-cell provenance, edit log, logical boundaries and text generation. Owns neither repository records nor DOM nodes. |
| [Autocomplete coordinator](../../src/features/autocomplete/index.tsx) | Own the draft, trigger recognition, history lease, source-version checks, cancellation and final linking. |
| [InputGateway](../../src/input/gateway.ts) | Delegate provisional input, clipboard and composition to the active occurrence; suppress canonical reconciliation for its draft. |
| [TreeCommands](../../src/block-tree/commands.ts) | Validate and publish the completed local edit log and annotation in one bounded batch. Capture reviewed annotation operations without a repository transaction draft. |

Previously, rendered children and canonical inline arrays were interchangeable by index. They are no longer interchangeable during Scry. The presentation adapter retains explicit forward/reverse coordinate mappings and canonical-cell provenance; persistence and native annotation operations still receive canonical coordinates only. LER receives the provisional phrase separately, rather than treating its offsets as already committed annotation ranges.

The existing shared annotation fragment measurements remain in use. Draft changes invalidate the affected TextBlock's measurement. No new whole-Document geometry sweep or parallel renderer was introduced. Browser IME changes are reconciled by the existing renderer owner before applying composed text to the draft.

## Phase B — presentation and coordinate gate

Passed for DirectCharacterCells and the Solid fallback. The bounded real-Flint fixture reads *The Masque of the Red Death* into an isolated workspace: 926 cells in the selected paragraph, 15,791 content records and placements. It never saves the fixture.

- Actual bracket characters wrap in text flow and move by character or word.
- Existing canonical keys and retained editing elements survive bracket movement.
- Selection capture/restoration accounts for temporary cells; copying excludes markers.
- Emoji graphemes, empty phrases, ends, existing entity annotations and source-boundary constraints are exercised.
- Bracket movement invokes no repository snapshots, commits, transactions or replacement commands.

Evidence: [direct presentation proof](scry-provisional-qualification/direct/presentation-cell-proof.json), [Solid presentation proof](scry-provisional-qualification/solid/presentation-cell-proof.json), [direct screenshot](scry-provisional-qualification/direct/presentation-cell-proof.png).

## Phase C — provisional input, history and Save gate

Passed with actual Flint editing components in both renderers:

- Neither trigger keystroke publishes a canonical edit. A lone opening character becomes ordinary punctuation if the next input does not complete a trigger.
- Source typing, deletion and supported paste change only the local draft. Search follows that draft through the existing LER request lifecycle.
- Native Chromium Japanese IME composition remains provisional, then cancellation keeps the composed phrase.
- Escape keeps the authored text in one action; Undo and Redo restore the appropriate canonical text without markers.
- Shared repository history calls and keyboard shortcuts cannot mutate the history stacks during Scry.
- Document and Workspace Save entry points check Scry before snapshot/capture. Save controls are excluded from outside-click cancellation so a Save attempt cannot silently finish Scry first.
- Flint tab switching, owner minimization and another application launch end the interaction. Actual tab closure retains authored draft text in the canonical Document and releases the history guard.
- A newer source edit blocks stale-draft publication. Cancellation offers explicit discard in favour of newer text, or leaves the draft available for copying.
- Forced feature/workspace disposal always releases the history lease, including stale-source recovery failure.

Each renderer passed 20 input/lifecycle checks. Evidence: [direct input/lifecycle proof](scry-provisional-qualification/input/provisional-input-proof.json), [Solid input/lifecycle proof](scry-provisional-qualification/solid-input/provisional-input-proof.json), [unit checks](../../src/features/autocomplete/provisional-integration.test.ts).

## Phase D — atomic completion and LER gate

Passed. Square brackets commit the selected canonical name; parentheses preserve the final authored phrase. The completion command preserves untouched Cell IDs, rebases overlapping annotations and publishes text plus reference once. Invalid ranges and stale revisions fail before publication. Unchanged text retains its original cells and annotations.

The existing reviewed-mention workflow captures its annotation operations and joins them to the source completion batch. The repository's bounded inline validator permits additional existing annotation-only text owners whose graph and inline membership remain unchanged. Projection updates cover every affected owner. This extension is also covered by existing Entity candidate tests; it eliminates their previous full-snapshot annotation batch route.

The full real-Flint/LER interaction suite passed **105 checks**, including overlapping references, canonical-name replacement, mention preservation, reviewed batches and one-step Undo, create-and-link, explicit aliases, delayed resolver cancellation, pending-operation guards, query/source separation, drag/resize, viewport change, page scale 1.25 and application lifecycle.

Evidence: [browser results](scry-provisional-qualification/browser/results.json), [active window](scry-provisional-qualification/browser/scry-active.png), [above-source placement](scry-provisional-qualification/browser/scry-above-source.png).

Entity resolution and creation use an isolated deterministic service in these browser checks. They demonstrate the actual UI and Document integration, not a new qualification of production database writes. No test Entities or Documents were written to the user's Vault.

## Regression and performance results

The affected regression suite completed with **338 passed and 2 failed** across 33 files. Both failures are in `block-tree/portable-spike/codec.test.ts`, reporting unsupported structural fields. Running that file independently at unmodified `ba32f41` reproduced the same two failures (29 passed, 2 failed). No new failure was identified in this suite. This is a targeted comparison, not a claim that all previously reported project-wide baseline failures were rerun.

The reactive TypeScript project passed `tsc --noEmit --project tsconfig.reactive.json`. A final focused rerun passed **76 tests in 7 files**, including feature-disabled legacy input, stale-source recovery, forced disposal and Save from outside the source editor. Logs: [affected suite](scry-provisional-qualification/regression-tests.txt), [final focused tests](scry-provisional-qualification/final-targeted-tests.txt), [independent baseline reproduction](scry-provisional-qualification/baseline-codec-tests.txt), [typecheck](scry-provisional-qualification/typecheck.txt).

Performance evidence includes instrumented Masque interactions and the existing real-Flint typing harness. The harness performs 40 ordinary input/deletion events followed by real Chromium character input and Undo on a 499-character paragraph in an eight-paragraph Document. No load generation was enabled. Both runs recorded **zero snapshots, zero worker starts, zero application-service requests and restored source text**. Real character input and Undo also passed.

| Ordinary typing measurement | Unmodified `ba32f41` | Provisional implementation |
| --- | ---: | ---: |
| Synchronous median / p95 | 5.3 / 8.6 ms | 7.8 / 11.3 ms |
| Microtask-settled median / p95 | 7.5 / 11.1 ms | 11.0 / 18.1 ms |
| Frame median / p95 | 16.7 / 62.5 ms | 19.8 / 132.7 ms |

Evidence: [baseline run](scry-provisional-qualification/typing-head/results.json), [implementation run](scry-provisional-qualification/typing-final/results.json). These were sequential runs in separate isolated browser sessions. An earlier same-code feature-off/on pair measured synchronous medians of 5.4 / 11.3 ms ([off](scry-provisional-qualification/typing-before/results.json), [on](scry-provisional-qualification/typing-after/results.json)), showing substantial run variation.

**Timing parity is not established.** The slower implementation measurements are an unresolved performance qualification concern, distinct from the reproduced codec failures. The profiles include native selection/layout, rendering, cloning and GC; they do not isolate a new cause. The bounded-work checks establish removal of canonical work during Scry, but cannot establish that every input path is faster. Headless frame delays must not be represented as an improvement or as guaranteed interactive latency. No unrelated optimization or load testing was performed.

## Restrictions and remaining limitations

- Draft scope is one plain-text range in one mounted TextBlock, with the existing 1,000-character Scry phrase limit. Multiple editor selections do not start this draft mode. Structural editing, embedded objects and superposition editing are not added by this change; rich paste is reduced to supported plain text inside Scry, and line breaks become spaces.
- Complete bracket syntax pasted outside Scry remains ordinary pasted text. Typed delimiters initiate the provisional interaction.
- The local sequence is rebuilt over the affected TextBlock; it is not an incremental rope. Work is bounded by that Block and its annotations, not unrelated Documents or Vault entries. No claim is made that arbitrarily large single TextBlocks are cost-free.
- Other-view text edits are not merged into an active draft. Explicit recovery prevents overwriting newer canonical text. If the entire workspace is forcibly destroyed, its provisional state is destroyed too; this feature does not introduce crash recovery or autosave.
- Inserted draft text uses the surrounding flow typography. Exact per-cell formatting inheritance for complex styled runs is not separately qualified; canonical annotations are preserved/rebased by the final action.
- Browser evidence is Chromium on macOS, including CDP-driven native composition. Safari, Firefox, every OS IME and assistive-technology combinations were not qualified here. Headless frame timings are not guaranteed user-visible latency.
- The feature flag retains the exclusive legacy path. That path intentionally retains its previous live-edit/highlight semantics; it does not provide provisional-history guarantees.

## Architectural deviations

Cancellation keeps phrase edits, as explicitly clarified by the user after the brief. This is the intentional difference from the brief's original Phase C cancellation gate. The existing Cell renderers, repository history, annotation batching, Save services and LER UI remain the owners of their respective responsibilities. No canonical schema, file extension, persistent temporary-cell representation, automatic save or new session-ownership framework was introduced.
