# Scry interaction restoration — qualification addendum

22 October 2026. Corrective pass against `SCRY_INTERACTION_RESTORATION_FEATURE_BRIEF.md`; starting revision `8a83b23`. This supersedes the bracket-trigger and cancellation behaviour described in the earlier [autocomplete qualification](AUTOCOMPLETE_WORKSTATION_QUALIFICATION.md).

## Delivered behaviour

- `[[...]]` resolves an Entity, replaces the enclosed phrase with its canonical name and annotates its GUID. `((...))` preserves the enclosed wording exactly, including whitespace, and annotates the chosen Entity GUID. Neither performs Document/Block lookup. Empty round mentions are rejected without discarding the interaction. Existing `@`, slash commands and selected-text colon workflows remain available.
- Invocation wraps a selection, captures only the next word, or inserts an empty pair before whitespace/at Block end. The first opening keystroke preserves selected text while awaiting the second. Pre-existing opening characters are not silently adopted as invocation delimiters.
- Source text, search query, query-following mode and candidate GUID are separate state. Independent query edits never replace authored text. Resume following source is explicit. Source edits and cancellation use native text operations.
- All eight requested Control boundary shortcuts operate on the active occurrence, with word segmentation and grapheme-aware character movement. The bindings are registered for the interaction, checked for conflicts and released on exit. Query-field navigation remains native.
- Document insertion, character/word deletion, paste and ordinary selection movement stay within the bracket interior. Structural insertion is suppressed. Control+A invokes reviewed annotation within Scry; outside Scry it keeps its normal meaning. Command+A in the source selects only the interior; in the query it remains native Select All. Copy does not cancel.
- Escape, X, Cancel and outside-range pointer dismissal remove owned delimiters while preserving inner edits. Keep literal brackets is explicit. Delimiter ownership uses occurrence cell identities, not a text search for matching punctuation. Invalidated sources cannot commit; cleanup refuses to guess when delimiter identities have been destroyed externally.
- The popup anchors at the range start and clamps to its application surface/visible viewport. Invalidated geometry is measured once per scheduled frame; source/popup resizing, owner geometry, scrolling and visual-viewport changes invalidate placement. No cell sweep was added.
- Bracket entry now renders the existing Link Entity Reference component directly in the anchored shell. Its live source bookmark, bracket policy, canonical search, creation, alias editing, reviewed occurrences and recovery guards serve one interface. Mention linking never automatically creates an alias. See the merger follow-up below.
- Confirmation is one native Undo unit. Reviewed batch annotation and delimiter removal also form one unit, with rollback on failure. Source tab changes, minimization and activation of another window terminate the contextual operation without disposing the retained editing session.

The existing default-enabled feature flag, canonical ownership, persistence formats and manual Save conventions are unchanged. No Document creation, Block lookup, Dossier, Osmosis, new tag semantics or load testing was added.

## Qualification evidence

| Check | Result |
|---|---|
| Client and server TypeScript | Pass; [log](scry-qualification/typecheck.txt) |
| Focused regression suites | 168 passed; two established baseline failures, across 17 files; [log](scry-qualification/tests.txt) |
| Actual Flint Scry browser fixture | All **68 checks passed**; see [named checks and results](scry-qualification/browser-results.json) and [active popup screenshot](scry-qualification/scry-active.png) |
| Final source-selection/routing checks | **43 passed**; overlaps the consolidated suites; [log](scry-qualification/final-tests.txt) |
| Existing autocomplete browser suite | All 18 checks passed; [results](scry-qualification/legacy-browser-results.json) |

Browser qualification uses real WorkspaceSession, Flint, retained Document editors, popup and Entity-tool components, with Chrome input events and isolated in-memory Entity services. It exercises selected phrases, next-word capture, canonical replacement, all eight boundary controls, Unicode combining marks/emoji, free typing, query independence/resumption, cancellation, one-step Undo, stale responses, reviewed batches, creation/alias handoff, source paste/copy, keyboard-created selections, application/tab lifecycle, viewport resizing and page scale 1.25. Entity creation and alias mutations are fixture operations, not writes to a user's Cavern. No user Document is saved.

The two failing Entity-candidate assertions expect exactly two repository snapshots; actual count remains zero. They are the same failures independently reproduced in the previous qualification at `b52051b` ([baseline evidence](autocomplete-qualification/baseline-tests.txt)). They are distinct from the accepted historical Window Manager thirteen-failure baseline. This pass ran the affected suites, not the entire historical regression inventory. No newly failing targeted assertion remains.

The native transaction test additionally verifies that a deliberately thrown failure leaves both text and annotations unchanged. Bounded-work tests verify ordinary completion handling reads at most the affected Block and one cell, and active bracket editing does not snapshot the repository or traverse unrelated Documents.

### Typing diagnostics

The existing real-Flint typing fixture measured 40 alternating edits on a 499-character paragraph in an eight-paragraph Document. Enabled: handler median **8.5 ms**, p95 **19.6 ms**; disabled: **10.2 / 17.5 ms**. Both recorded zero repository snapshots, Save-status reads, service requests and worker starts, and restored the original text. Logs: [enabled](scry-qualification/typing-enabled.txt), [disabled](scry-qualification/typing-disabled.txt).

The earlier accepted enabled sample was **7.0 / 10.5 ms**. These headless samples vary, and the disabled run overlapped test-run startup; they do **not** establish absence of a user-visible latency regression. The higher tail timing remains a measurement limitation, while the bounded-work assertions pass. No performance optimization or load scenario was undertaken.

## Narrow integration fixes

1. Cross-Block selection previously consumed Control+Shift+arrows before InputGateway. Its existing routing now offers active completion controls first and cancels the competing selection gesture only when completion handles the event. Same-Block selections can invoke Scry through that routing; unsupported cross-Block selections are not expanded into a Scry source.
2. The native annotation batch previously committed directly to the repository, outside a surrounding text-command transaction. A small staging adapter now joins a prepared annotation batch when it precedes text edits in that transaction. Standalone batch commits retain their existing path. This prevents annotation loss and gives reviewed Scry operations atomic Undo and rollback.

Neither change introduces a new ownership or persistence framework.

## Bounded restrictions and remaining qualification limits

- Scry operates on one plain-text occurrence. Source insertion is limited to 1,000 UTF-16 units, matching existing replacement limits. Boundary expansion refuses overlong phrases, existing Entity-reference overlaps and Blocks containing inline objects. Pasted newlines become spaces; Enter does not split the source Block.
- The former separate compact-popup/held-source handoff has been superseded by the merger below. Source editing and boundary adjustment remain available in the shared LER interaction. Pending canonical operations temporarily prevent source changes and preserve close/retry guards.
- Document IME composition exits optional Scry mode **keeping literal brackets**, so composition can proceed without rewriting its DOM. Composition-start/end cancellation is browser-tested with synthetic events; operating-system IME candidate windows remain a manual qualification item.
- Browser copy/paste checks use browser clipboard events with isolated DataTransfer data; the operating-system clipboard is not overwritten. Page-scale testing exercises the visual viewport, not every platform's Chrome toolbar zoom setting.
- Development runs exposed and resolved the shortcut collision and batch transaction defect above. A cold-start typing-browser attempt timed out, and a highly concurrent test run timed out while importing the editor; the bounded-worker regression run passed all non-baseline assertions. The typing-browser retry completed. Intermediate fixture assertions were corrected to wait for native selection commands, candidate refresh and the first positioning frame. The recorded final browser runs completed without JavaScript exceptions.

This corrective pass stops here. Advanced Entity/resource features remain outside its scope.

## Window presentation follow-up

Scry now defaults to a **720 × 300 CSS-pixel landscape panel**, with separately scrolling query/tools and candidate columns. Its initial top-left aligns with the opening brackets' X coordinate and sits **20 pixels below the source line**. Available application/viewport space constrains the rectangle; where possible, limited space below the source reduces panel height rather than moving it over the text.

The header supports pointer dragging and keyboard movement; the bottom-right grip supports pointer and keyboard resizing. Both reuse the existing WindowGeometry controller, including cancellation. A manually chosen position and size survive subsequent typing/search updates. No geometry is saved to the Document or workspace.

Validation: **74 actual-Flint browser checks passed**, including six new landscape/anchor/drag/resize/position-retention/keyboard checks; **38 focused tests passed**; client TypeScript passed. See [browser results](scry-qualification/window-browser-results.json), [test log](scry-qualification/window-tests.txt), and [landscape screenshot at page scale 1.25](scry-qualification/scry-landscape.png).

## LER merger and bracket activation follow-up

22 October 2026. Implements the subsequent bug report and clarification that LER is the central text-to-Entity interface.

### Changes

- `[[` no longer requires whitespace before it. The first delimiter is inserted and its occurrence identity recorded directly by the interceptor, including collapsed caret input. Activation no longer depends on a later `edited` notification that another input path might omit. Escaped triggers and pre-existing opening punctuation remain literal.
- Entity completion renders **the same `EntitySearch` component as Link Entity Reference**, inside the landscape, draggable/resizable, source-anchored shell. There is no separate Entity candidate UI or Create/Aliases handoff. The normal Link Entity command focuses the existing merged interface for that Document.
- The shared UI provides canonical search, local/recent-use scopes, explicit creation and alias editing, external authorities, and reviewed occurrences. One Entity-service lease owns search and canonical actions; the old completion resolver is suspended. Local Entity inventory watches remain restricted to actual reference changes.
- Source wording and independent query remain separate. Bracket editing updates the current target and disables stale occurrence review; reviewed candidates are rebuilt only when review is explicitly requested. Ordinary source typing does not restart a whole-Document occurrence search.
- **Bracket / target controls and shortcuts** exposes eight clickable movement buttons and the four shortcut pairs below. The section is collapsed initially to leave the search field visible in the short landscape window. Shortcuts operate with focus in the source editor; query fields retain native movement and selection behaviour.

| Edge | Unit | Source-editor shortcut |
|---|---|---|
| Closing brackets | Word | Control + Left / Right |
| Closing brackets | Grapheme/character | Control + Shift + Left / Right |
| Opening brackets | Word | Control + Alt/Option + Left / Right |
| Opening brackets | Grapheme/character | Control + Shift + Alt/Option + Left / Right |

Control means the Control key on macOS, not Command. Left moves the indicated edge backwards; Right moves it forwards. Clickable buttons offer the same operations without modifier combinations. Existing binding remapping/conflict handling remains in place.

### Qualification

- **83 real-Flint browser checks passed**, with no browser exceptions. Added checks cover `[[` after prose, pointer-positioned caret invocation, one shared LER interface, displayed shortcut pairs, one service lease/disposal, normal Entity-command reuse, and closing during a pending canonical read. Existing checks still cover all eight movements, exact round-mention preservation, square canonical replacement, Undo, reviewed batch binding, creation, aliases, cancellation, input routing, retained tabs, minimization, dragging, resizing and viewport/page-scale changes.
- **179 focused tests passed; two established baseline failures remain**, across 19 files. The failures are the same Entity-candidate snapshot-count assertions documented above (expected two, observed zero). No newly failing targeted test remains.
- Configured client TypeScript check passed: `npx tsc --noEmit --project tsconfig.reactive.json`.
- The real-editor bounded-work test now also verifies character-by-character opening without an `edited` callback and invocation adjacent to prose. Existing ordinary-input and active-source checks retain bounded reads and zero repository snapshots.

Evidence: [browser checks](scry-qualification/ler-browser-results.json), [browser log](scry-qualification/ler-browser.txt), [tests](scry-qualification/ler-tests.txt), [typecheck](scry-qualification/ler-typecheck.txt), [merged LER screenshot](scry-qualification/ler-merged.png).

During verification, the merger initially intercepted Command+A in the search field and altered repeated occurrence-selection behaviour. Both were corrected before the final runs. Native query selection and the existing occurrence-review tests now pass. The existing single-occurrence, IME and operating-system clipboard/zoom qualification limitations above still apply. No persistence, manual Save semantics or feature-flag defaults changed; no load testing was performed.
