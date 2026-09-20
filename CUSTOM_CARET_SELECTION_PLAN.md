# Custom caret, cursor, and selection plan

Status: planning only; implementation is not authorized or started.

Recorded: 20 September 2026.

Proposed feature flag: `customCaretSelection`, disabled by default. This follows
the repository convention for major features. The existing experimental
cross-Block selection preference remains separate until an implementation phase
proves that the two can safely share one interaction controller.

## Executive recommendation

Do not begin by removing the browser's editing machinery. Begin with a hybrid
system in which:

1. Model positions and selection sets are authoritative.
2. The primary local caret retains a real browser selection and focused editing
   host for text input, IME, virtual keyboards, clipboard, spellcheck, dictation,
   and assistive technology.
3. The native caret and selection paint may be hidden only after runtime and
   behavioral checks pass; custom HTML/SVG layers render their visual replacement.
4. Secondary local carets and remote user/AI presence are model-only and custom
   rendered. A browser document exposes only one portable native selection, so it
   cannot represent these reliably.
5. Native visuals remain the fallback, either for the entire editor or for a
   specific Block/input session. Fallback must be immediate and must not change
   document data.

This approach delivers multiple cursors and rich effects without taking on the
entire responsibility for operating-system text input in the first release. A
fully custom input path based on `EditContext` may be investigated later, but it
is not a portable baseline and must not be required for ordinary editing.

In this document, **caret** means the insertion position in content; **caret
visual** includes a bar, block, underscore, slanted mark, sprite, or animation;
**pointer cursor** means the mouse/pen pointer icon; and **selection** means one
or more model ranges. Keeping these terms distinct will avoid conflating CSS
`cursor` with the insertion caret.

## Goals

- Render multiple local, remote-user, and AI-client carets and selections.
- Support bar, block, underscore, slanted, animated, and theme-specific caret
  visuals, including a C64-style blinking block cursor.
- Render selection effects with SVG where appropriate, including animated
  outlines, fills, underlines, masks, and per-participant colours.
- Derive caret appearance from the text/annotation style at its logical position.
- Allow Block-type-specific selection rendering and navigation into non-text
  Blocks such as images and video.
- Expose a bounded, testable extension API for user-programmable caret,
  navigation, and selection presentation.
- Preserve accurate model positions through editing, projection, transclusion,
  layout changes, and eventual concurrent changes.
- Keep native caret/selection behavior available when custom behavior is
  unsupported, unreliable, inaccessible, or too expensive.

## Non-goals for the first implementation

- A collaboration transport, identity service, CRDT, or operational-transform
  implementation. This feature can define presence/update contracts but cannot
  make remote edits safe by itself.
- Persisting live cursors or selections in document/workspace JSON.
- Executing arbitrary JavaScript embedded in a saved document. Programmable
  behavior must come from trusted runtime registrations; saved data may select a
  registered behavior and supply validated data only.
- Replacing password-field, CodeMirror, iframe, browser chrome, or opaque-widget
  selection behavior.
- Perfectly reproducing every platform's word, sentence, bidi, and vertical
  navigation rules in the first milestone.
- Hiding mobile selection handles or system menus at all costs. If the browser
  does not expose safe control, the editor must use native presentation.

## Current codebase assessment

The converted codebase already contains much of the model and rendering
foundation, but the browser selection is still the primary source for ordinary
local editing.

### Reusable foundations

- `src/block-tree/types.ts` defines occurrence-aware `ViewPosition`,
  `InlineBoundary`, `TextSelectionItem`, and `SelectionSet`. Positions distinguish
  canonical content from a rendered occurrence, which is essential for
  transclusion and multiple views.
- `src/runtime/selections.ts` owns primary and secondary selections and maps
  their endpoints through inline replacement. `addCaret` and
  `MultiSelectionEditor` already demonstrate same-Block multi-caret transactions.
- `src/rendering/standoff-editor-view.tsx` already draws model-owned selections
  in an SVG layer and measures DOM `Range` fragments. The annotation decoration
  machinery can be generalized rather than replaced.
- `src/runtime/cross-block-selection.ts` and `src/input/cross-block-input.ts`
  already implement an experimental model-owned range across separate editing
  hosts, local SVG highlights, pointer hit-testing, autoscroll, keyboard
  extension, an off-screen input bridge, and safe structural barriers.
- `src/runtime/mounts.ts` supplies occurrence-local adapters between model
  boundaries and DOM points. `src/runtime/measurements.ts` supplies block and
  native-selection geometry.
- `src/input/gateway.ts` centralizes `beforeinput`, input, selection change,
  composition, clipboard, pointer, and keyboard handling. This is the correct
  integration boundary for input ownership and fallback changes.
- `src/input/graphemes.ts` uses `Intl.Segmenter` when available, and existing
  editing paths already avoid deleting part of a grapheme cluster.
- Focus, Block selection, overlays, history bookmarks, local decorations, and
  stable occurrence identity already have dedicated services. The new feature
  should integrate with them instead of creating a second editor state graph.

### Current constraints and correctness gaps

- The native DOM selection is still read in `selectionchange` and restored with
  DOM `Range` operations. A custom visual cannot be treated as proof that input
  will target the same model boundary.
- The Selection API specifies one portable range for a document. Native
  multi-range behavior is not a cross-browser basis for multiple cursors.
- Standoff coordinates count Unicode code points because each text Cell contains
  one code point. Browser text-node offsets use UTF-16 code units. Current
  conversion generally bridges this with code-point counting, but every new
  adapter must preserve that distinction explicitly.
- A user-visible “character” is normally an extended grapheme cluster. Multiple
  code-point Cells may form one visual character, so cursor stops, deletion, and
  selection snapping must be grapheme-aware even though stored offsets remain
  Cell/code-point boundaries.
- `InlineBoundary.affinity` exists, but current selections normally use `after`.
  Wrapped lines and bidi boundaries can have two visual caret positions for one
  logical offset. The custom geometry contract needs explicit visual affinity,
  writing direction, and preferred inline coordinate.
- `restoreBoundary` currently maps Cell boundaries through child-node positions.
  Geometry works because Standoff text is rendered as one span per Cell, but
  this creates a large DOM and makes naive per-Cell hit-testing or measurement
  expensive in long paragraphs.
- `inlinePointAt` has an O(number of rendered Cells) geometry fallback. It is
  acceptable for an experimental drag fallback but not for every pointer move in
  long text.
- Selection SVG measurement calls `Range.getClientRects()`, which can force
  layout. Selection, annotations, search results, remote presence, resize, and
  scroll must not each trigger independent measurement passes.
- PlainText Blocks use `<textarea>` UTF-16 selection offsets and whole-field
  synchronization. They require a separate adapter and are not ready for shared
  concurrent editing.
- Cross-Block selection currently treats media and structural boundaries as
  barriers. Entering/selecting non-text Blocks needs a position type and behavior
  contract rather than inventing text offsets for those Blocks.
- Selection bookmarks are not yet comprehensively restored through undo/redo and
  all structural remounts. Custom visuals would make stale endpoints more
  noticeable but would not fix them automatically.

## Core invariants

1. The model position is authoritative; DOM nodes and rectangles are disposable
   projections.
2. Every position identifies a view and occurrence as well as canonical content.
   A remote participant must not accidentally appear in every transclusion.
3. Text ranges are directional and half-open. Rendering may normalize start/end,
   but input and collapse behavior retain anchor/head direction.
4. Stored text boundaries remain Cell/code-point indices for compatibility.
   Navigation and destructive editing snap to grapheme boundaries.
5. A native selection is an input/accessibility bridge for the primary local
   selection, not the store for all selections.
6. Secondary and remote cursors never steal DOM focus, replace the native
   selection, open a keyboard, or mutate the document merely by moving.
7. Presence is ephemeral, rate-limited, and revision-tagged. It is not document
   history.
8. Layout measurement never writes document state and never creates undo entries.
9. Blink/animation frames update paint properties only; they never remeasure
   text geometry.
10. A custom mode can fall back to native mode without converting or losing the
    logical selection.
11. Opaque widgets retain their own input and selection policy unless they
    explicitly implement the custom position/geometry contract.
12. No saved-document value can inject executable caret behavior in the public
    hosted version or any other runtime.

## Proposed architecture

### 1. Generalized selection domain

Extend the existing selection concepts rather than introducing a parallel
cursor store. The likely direction is a tagged union:

```ts
type EditorPosition =
  | { kind: "text"; viewId: ViewId; contentKey: ContentKey;
      occurrenceKey: NodeKey; boundary: InlineBoundary;
      visualAffinity?: "upstream" | "downstream" }
  | { kind: "block"; viewId: ViewId; occurrenceKey: NodeKey;
      edge: "before" | "inside" | "after"; port?: string };

type EditorSelectionItem =
  | { kind: "text"; id: string; anchor: EditorPosition; head: EditorPosition }
  | { kind: "block"; id: string; anchor: EditorPosition; head: EditorPosition };
```

The exact type names are deferred, but text and Block positions must not be
interchangeable. Each item also needs ephemeral presentation metadata outside
the document model:

- participant/session ID and local/remote/AI role;
- primary/secondary status;
- label and colour token;
- last confirmed document revision or operation clock;
- idle/active/composing state;
- requested behavior/theme ID;
- optional preferred visual X coordinate for vertical movement.

The current occurrence-keyed store is efficient for local rendering, but remote
and cross-Block selections need a participant-oriented index as well. Maintain
both derived indexes rather than repeatedly scanning every participant for every
Block.

### 2. Position and geometry adapters

Add a formal adapter to `MountHandle` (or a sibling registry) for each Block that
participates:

- model position to DOM boundary;
- DOM boundary to model position;
- viewport point to model position;
- collapsed caret rectangle and direction;
- range fragments clipped to the Block surface;
- style context immediately before/after the caret;
- supported entry ports and navigation policy for non-text Blocks;
- a layout generation token used to invalidate cached geometry.

For Standoff text, derive caret geometry from a collapsed `Range` where reliable,
then fall back to adjacent grapheme/Cell rectangles for empty ranges, line ends,
empty paragraphs, and inline atoms. Do not insert measurement sentinels into the
editable DOM during ordinary input unless a browser-specific spike proves there
is no safer option.

Point hit-testing should use the browser's caret-position API when it resolves
inside the actual target mount. The fallback should cache line buckets and use a
binary/limited search, not scan every Cell on each pointer move.

All geometry reads should run in one animation-frame read phase. DOM/SVG writes
should follow in a separate phase. Cache by mount generation, inline revision,
style/layout generation, zoom/device-pixel ratio, and relevant scroll container.
Invalidate for:

- text or annotation/style changes;
- font loading and variable-font changes;
- resize, wrapping-width changes, and writing-mode changes;
- inline image load/resize;
- zoom and device-pixel-ratio changes;
- transforms or surface replacement;
- visibility/virtualization transitions.

Pure scrolling normally translates an existing local geometry snapshot; it
should not remeasure glyphs unless clipping or a transformed ancestor requires it.

### 3. Input ownership modes

Use explicit modes selected per editor and, when needed, per active Block:

#### Mode A — Native fallback

The existing browser caret and selection remain visible and authoritative for
interaction. Model selection continues to mirror native changes. Custom remote
presence may still be shown if it does not obscure local native selection.

#### Mode B — Native styled

Use interoperable CSS such as `caret-color` and `::selection` for modest theming.
This provides low-risk colour changes but cannot provide arbitrary SVG shapes,
multiple carets, or reliable block/slanted/animated caret behavior.

#### Mode C — Hybrid custom visual (recommended target)

Keep the real native selection in the focused `contenteditable`/`textarea`, but
make its caret and selection paint transparent only after capability and behavior
checks pass. Render the primary local caret/selection plus all secondary/remote
items in overlay layers.

The native range must continue to track the primary local item before input,
composition, clipboard, accessibility, or browser commands run. A mismatch,
unexpected DOM mutation, lost focus, unsupported composition sequence, or failed
geometry round trip triggers Mode A for that session.

#### Mode D — EditContext/custom input experiment

Investigate `EditContext` only after Mode C is reliable. It can let an application
own rendering while participating more directly in platform text input, but the
application becomes responsible for selection state, character bounds, control
bounds, composition geometry, navigation, and more. It is not available broadly
enough to be the sole input path. A hidden textarea bridge remains a last-resort
compatibility technique, not the preferred general architecture, because focus,
mobile keyboard, composition-window placement, and accessibility can diverge
from visible content.

### 4. Rendering layers

Keep rendering occurrence-local and composited with the existing Standoff
surface:

1. background highlights and low-priority search decorations;
2. custom text-selection effects;
3. editable text/inline atoms;
4. foreground annotations;
5. caret visuals, labels, and remote participant badges;
6. interactive Block handles/overlays.

Caret and selection layers use `pointer-events: none`; interaction resolves
against actual Blocks. Use HTML/CSS for simple carets and labels, SVG for range
geometry and arbitrary effects. CSS Custom Highlights may be an optional fast
path for simple fills/text decorations, but they support a deliberately limited
property set and cannot replace SVG animation/effect requirements. They also
remain DOM-Range based, so they do not remove boundary-mapping work.

The C64 cursor can be implemented as a rectangle sized to the following grapheme
advance (or a stable `ch`/line-height fallback), with opacity stepped at a theme
rate. Text inversion under a block cursor may use a controlled blend mode or a
clipped duplicate glyph. The latter needs explicit tests for ligatures, colour
fonts, transforms, and high-contrast mode before adoption.

A slanted caret should use model/computed style context (`font-style`, writing
direction, vertical writing, and relevant annotation runs). Do not infer its
model position from the angle. When an exact italic angle is unavailable, use a
theme-configured visual angle and treat it as presentation only.

### 5. Multiple cursors and collaboration readiness

Only the primary local caret owns native focus and OS text input. Secondary
local carets reuse the existing transactional multi-selection editor where all
targets are safely supported. Editing across different contents/Blocks requires
explicit operation maps and structural semantics; drawing such carets must not
imply that editing them is already safe.

Remote user and AI-client cursors are presence records:

```ts
type PresenceSelection = {
  participantId: string;
  viewId: ViewId;
  anchor: EditorPosition;
  head: EditorPosition;
  basedOnRevision: string;
  sequence: number;
  display?: { label?: string; colourToken?: string; behaviorId?: string };
};
```

The eventual collaboration layer must transform/rebase these endpoints through
accepted edits or mark them stale. Out-of-order presence packets are discarded
by participant sequence. When a target occurrence is hidden, virtualized,
deleted, or not present in the recipient's view, retain at most a bounded logical
record and render nothing. Presence updates should be coalesced to animation
frames and should not enter repository history.

AI cursors use the same presence contract and permissions as users; they should
not receive a privileged route into mutation APIs. An AI edit is a normal,
validated document operation, separate from its cursor movement.

### 6. Non-text Block positions

Define Block-selection and entry behavior by capability instead of pretending
that images/video contain text offsets. A Block adapter may expose:

- `before`, `inside`, and `after` logical stops;
- named internal ports such as image caption, video timeline, code editor, or
  alt-text editor;
- an atomic selection outline/overlay;
- pointer hit zones;
- arrow, Tab, Enter, and Escape transitions;
- whether drag selection may cross the Block, select it atomically, or stop.

Initial policy recommendation:

- inline images remain one atomic inline Cell with before/after caret stops;
- standalone images/video can be selected as Blocks and outlined, but entering
  their controls requires an explicit action;
- opaque widgets and iframes are barriers until they register an adapter;
- captions or other text children participate through their own text mounts;
- browser media controls keep native pointer/keyboard behavior while entered.

Selection rendering can be Block-specific, but selection meaning must remain
predictable. A visual effect must never silently broaden a text operation to an
entire media Block.

### 7. Programmable behavior API

Expose trusted registrations with declarative results and bounded hooks. A
possible shape is:

```ts
interface CaretSelectionBehavior {
  id: string;
  caret(context: CaretVisualContext): CaretVisual;
  selection(context: SelectionVisualContext): SelectionVisual;
  block?(context: BlockSelectionContext): BlockSelectionVisual;
  navigation?(request: NavigationRequest): NavigationDecision | undefined;
}
```

Constraints:

- visual hooks are pure for a supplied snapshot and cannot write the repository;
- no synchronous DOM reads inside hooks; measured geometry is supplied;
- return values are validated, size/count bounded, and reduced-motion aware;
- navigation results must resolve to validated model positions;
- behaviors are registered by trusted application/plugin code;
- document JSON stores only behavior IDs and serializable validated options;
- unknown/failed/slow behaviors fall back to the default visual;
- public-hosted documents cannot load or evaluate behavior source code;
- accessibility names, contrast fallbacks, and animation-disable behavior are
  mandatory parts of a custom theme contract.

Start with presentation hooks only. Programmable navigation or edit interception
should be a later capability because mistakes can corrupt selection semantics or
make the editor inaccessible.

## Accuracy analysis

Custom rendering can improve clarity but cannot be allowed to reduce endpoint
accuracy. Every supported layout needs round-trip tests:

```text
model position -> DOM boundary -> caret rectangle -> hit-test point -> model position
```

The result must equal the original position or an explicitly allowed equivalent
affinity at a wrap/bidi boundary.

Required fixtures include:

- ASCII, supplementary-plane characters, combining marks, variation selectors,
  emoji modifiers, ZWJ families, flags, and CR/LF combinations;
- ligatures, kerning, proportional and monospace fonts, synthetic and real
  italics, variable fonts, and delayed web-font loading;
- LTR, RTL, mixed bidi runs, neutral punctuation, and both selection directions;
- wrapped lines, empty paragraphs, line starts/ends, trailing spaces, tabs, and
  whitespace-only Blocks;
- inline images and other atomic Cells;
- CSS zoom, browser zoom, high device-pixel ratio, transforms, rotation/skew,
  vertical writing, and nested scrolling containers;
- shared content rendered in multiple views and occurrences;
- hidden/inactive tabs, minimized windows, remounts, and virtualization;
- pointer, touch, pen, keyboard, screen-reader, dictation, and IME movement.

Specific risks:

- Browser hit tests may be pinned to the active editing host, as already observed
  by the cross-Block prototype. Always verify the returned occurrence.
- Collapsed ranges can report no rectangle or an unintuitive rectangle at empty
  lines and line wraps.
- Italic glyph ink can extend outside its advance rectangle. The caret tracks the
  logical advance/boundary, not the visible ink edge.
- Bidi movement is visual while stored offsets are logical. An offset alone is
  insufficient to restore the same visible side at ambiguous boundaries.
- Selection rectangles may be split or ordered differently by engine. Rendering
  must normalize fragments without joining distinct visual lines.
- Native spellcheck/autocorrect may replace a range that differs from the current
  model selection. `beforeinput.getTargetRanges()` should be consumed where
  available and verified against the mount.
- During non-cancelable composition events, DOM reconciliation remains necessary.
  Never move the hidden/native primary selection merely to animate a visual.

## Performance analysis and budgets

The recent 25k-character model benchmark reports approximately 3.84 ms per edit,
but that excludes full browser layout/paint. The existing 20-paragraph
cross-selection measurement reports roughly 0.2–0.3 ms p95 for model updates,
also excluding full paint. These are useful baselines, not proof that custom
geometry is cheap.

Likely costs are:

- forced layout from `getClientRects()`/`getBoundingClientRect()`;
- O(Cell count) hit-testing in long Standoff paragraphs;
- rebuilding annotation, search, selection, and cursor SVG paths together;
- many SVG nodes for many ranges, lines, or participants;
- remote-presence update bursts;
- font/image loading, resize, zoom, and scroll invalidation;
- per-caret blinking timers or JavaScript animation;
- retaining geometry for offscreen or virtualized content.

Performance rules:

- Ordinary typing with one local caret performs no document-wide scan and no
  geometry work for offscreen Blocks.
- One shared scheduler batches all caret, selection, annotation, and search
  geometry reads per frame.
- Blink uses CSS animation or one shared clock and never measures layout.
- Remote updates are last-value-wins per participant and painted at most once per
  frame. Add a lower background rate when the tab is hidden.
- Only visible affected occurrences render geometry. Intersection visibility is
  an optimization, never a reason to discard logical presence.
- Cache ranges/line fragments until a relevant layout generation changes.
- Put a configurable cap on simultaneously rendered remote labels/effects;
  degrade excess participants to simpler marks rather than dropping endpoints.
- Prefer one path containing multiple subpaths over one DOM/SVG node per Cell.
- Never serialize selections, take repository snapshots, or create revisions on
  pointer movement or presence receipt.

P0 must record real-browser baselines before setting hard gates. Provisional
release targets are:

- no more than 10% regression in existing ordinary typing/split benchmark p95;
- local caret visual updated in the same animation frame as the model/DOM commit
  during normal load;
- pointer-drag frames stay within the device's frame budget for the agreed
  maximum visible ranges/participants;
- memory and DOM/SVG node counts are bounded by visible content, not total
  document size;
- native fallback activates instead of repeatedly missing frames or serving a
  stale visual.

The exact device classes, document fixtures, participant count, and thresholds
must be fixed from measurements before P1 implementation is accepted.

## Browser, mobile, and accessibility strategy

### Capability detection

Do not choose a mode from the user-agent string. Probe APIs and behavior:

- Selection/Range creation, direction/`extend`, and collapsed-range geometry;
- `caretPositionFromPoint` and the legacy `caretRangeFromPoint` fallback;
- `beforeinput`, cancelability, `inputType`, and target ranges;
- composition event ordering and DOM mutation behavior;
- `Intl.Segmenter`;
- `ResizeObserver`, `IntersectionObserver`, `VisualViewport`, and font events;
- CSS Custom Highlight support if that optional renderer is selected;
- `EditContext` only for the later experimental mode.

API presence is not enough. Run a small non-destructive behavioral probe once per
browser session for boundary restoration and geometry. Record only capability
results, not user text.

### Mobile complications

Mobile qualification is a release gate, not a desktop follow-up:

- native touch handles, loupe/magnifier, context menus, and long-press selection
  may not be fully suppressible without also damaging editing;
- focusing a hidden or transparent input can move/zoom the viewport or place the
  IME candidate window at the wrong location;
- virtual keyboards resize or overlay the visual viewport differently;
- autocorrect, predictive text, handwriting, swipe input, dictation, emoji, and
  CJK IMEs can use composition/replacement sequences not represented by keydown;
- touch drag selection needs larger hit targets and must coexist with scrolling;
- screen rotation, safe areas, pinch zoom, and browser toolbar changes invalidate
  geometry;
- hardware keyboards on tablets exercise desktop navigation with mobile layout.

If native handles remain visible while custom selection is active, prefer native
selection paint for that device/session rather than showing two disagreeing UIs.
The initial custom-primary-caret release may reasonably be desktop-only while
remote presence remains available on mobile, provided that this is capability
based and documented.

### Accessibility and user preferences

- Keep a real focused editing host and native selection semantics in hybrid mode.
- Test VoiceOver, TalkBack, NVDA, and VoiceOver on macOS rather than assuming ARIA
  can replace platform editing semantics.
- Do not announce every remote-cursor movement through a live region. Provide an
  explicit presence summary/navigation command instead.
- Respect `prefers-reduced-motion`, forced colours, high contrast, zoom, and user
  choices to disable blinking or custom visuals.
- Provide a non-blinking, high-contrast fallback caret. Avoid blink intervals or
  flashes that create accessibility risk.
- Ensure selections remain legible when custom fills overlap annotation/search
  layers, and do not rely on colour alone to distinguish participants.
- Native caret browsing and browser find selection must remain distinguishable
  from editor-owned selections.

### Fallback policy

Fallback is a first-class mode, not an error screen. Use native behavior when:

- the flag or user preference is off;
- required mapping/geometry capabilities fail their behavioral probe;
- the active Block lacks an adapter;
- composition, dictation, or accessibility mode is unqualified;
- selection round-trip verification fails;
- native/mobile handles cannot coexist cleanly with hidden paint;
- a custom behavior throws, exceeds its budget, or produces invalid output;
- measured performance exceeds the agreed degradation threshold;
- the editor detects unexpected DOM mutations or stale revision mapping.

Fallback can be editor-wide or scoped to the current Block/input session. It must
restore native `caret-color`/selection paint synchronously, remove only custom
visuals, preserve the logical selection, and produce no document/history change.
A visible diagnostics panel in development builds should explain the selected
mode and fallback reason.

## Risks and mitigations

| Risk | Impact | Mitigation / gate |
| --- | --- | --- |
| Visual caret differs from input target | Wrong character edited | Primary native range synchronization and round-trip assertion; immediate fallback |
| UTF-16/code-point/grapheme mismatch | Split emoji or misplaced endpoint | Explicit conversion utilities; grapheme snapping; Unicode fixture matrix |
| Bidi/wrap affinity loss | Caret restores on wrong visual side | Add visual affinity/direction; browser tests before claiming support |
| Forced synchronous layout | Typing/drag jank | One read/write scheduler, generations and cache; visible-only measurement |
| Large number of remote ranges | Excess SVG/paint/memory | Coalescing, caps, simplified distant visuals, virtualization |
| IME/autocorrect divergence | Lost or duplicated text | Retain native host; reconcile non-cancelable input; composition qualification |
| Mobile handles conflict | Duplicate or unusable selection UI | Device tests and native presentation fallback |
| Accessibility regression | Editor unusable with AT | Preserve native semantics; AT test matrix; user override |
| Non-text Block ambiguity | Destructive operation targets wrong object | Tagged Block positions and capability-specific operations |
| Stale remote presence | Cursor points to wrong content | Revision/sequence tags, operation mapping, stale/hidden state |
| Programmable behavior is slow/unsafe | Jank, corruption, code injection | Trusted registry, declarative bounded output, no document-supplied code |
| Existing decoration layer conflicts | Effects obscure text/controls | Defined stacking/priority contract and overlap tests |

## Phased implementation plan

Implementation must not begin until separately authorized.

### P0 — Baseline, fixtures, and browser feasibility

- [ ] Add the disabled `customCaretSelection` flag only after implementation is
  authorized.
- [ ] Record existing typing, split/join, same-Block selection, cross-Block drag,
  annotation SVG, and long-paragraph hit-test performance in real browsers.
- [ ] Build a no-production-code feasibility fixture for native-paint hiding,
  collapsed-range geometry, C64/slanted visuals, reverse ranges, bidi, graphemes,
  inline images, and empty lines.
- [ ] Test Chrome/Chromium, Firefox, and Safari desktop plus physical iOS/iPadOS
  and Android devices. Record exact browser/OS/input methods.
- [ ] Exercise dead keys, CJK IME, emoji, dictation/autocorrect, virtual and
  hardware keyboards, touch handles, clipboard, spellcheck, and screen readers.
- [ ] Fix quantitative budgets and the supported first-release matrix from the
  measurements.

Gate: choose exact Mode B/C eligibility and fallback rules with evidence. If
primary native paint cannot be hidden reliably, continue with custom secondary/
remote visuals and native primary visuals rather than abandoning the feature.

### P1 — Position contract and geometry service

- [ ] Specify tagged text/Block positions and visual affinity without changing
  saved JSON.
- [ ] Centralize UTF-16, code-point Cell, and grapheme conversions.
- [ ] Extend mount adapters for model/DOM/point/geometry/style round trips.
- [ ] Add layout generations, shared frame scheduling, cache invalidation, and
  visible-occurrence indexing.
- [ ] Replace linear fallback hit-testing with cached line-aware lookup.
- [ ] Cover transclusion, remounts, stale endpoints, empty Blocks, inline atoms,
  bidi, wrapping, transforms, zoom, and font loading.

Gate: pure adapter/geometry tests and browser round trips pass; no custom caret is
exposed and native editing behavior is unchanged.

### P2 — Primary local caret visual

- [ ] Render a static custom primary caret over same-Block Standoff text.
- [ ] Synchronize it with focus, native selection, model selection, editing,
  undo/redo, scroll, resize, and remount.
- [ ] Add bar, block/C64, underscore, and slanted themes with reduced-motion and
  forced-colour fallbacks.
- [ ] Hide native caret paint only in qualified Mode C sessions.
- [ ] Add mismatch detection and synchronous native fallback.
- [ ] Keep PlainText textarea, opaque widgets, CodeMirror, and unsupported Blocks
  native until their adapters are separately qualified.

Gate: no character/Block targeting mismatches; input/IME/clipboard/accessibility
matrix passes for the declared support set; performance stays within P0 budgets.

### P3 — Custom selections and multiple caret rendering

- [ ] Separate selection geometry from annotation/search geometry while sharing
  one measurement scheduler.
- [ ] Add SVG themes and optional Custom Highlight fast paths for simple styles.
- [ ] Render secondary same-Block carets and selections from existing selection
  sets, including labels and collision handling.
- [ ] Preserve primary native selection internally while custom paint is active.
- [ ] Verify multi-caret typing/cut/paste/undo only where the existing model edit
  contract supports every endpoint; otherwise render read-only secondary carets.
- [ ] Integrate cross-Block ranges without regressing their barriers, clipboard,
  composition guard, or preference behavior.

Gate: custom selection never changes operation targets; visual latency and node
counts remain bounded for the agreed range/cursor limits.

### P4 — Presence and collaboration-facing contracts

- [ ] Add ephemeral participant/presence state and indexes, with no persistence or
  history writes.
- [ ] Render remote user and AI cursors/selections without focus ownership.
- [ ] Coalesce/rate-limit updates and reject stale participant sequences.
- [ ] Define the operation-map/revision interface required from a future
  collaboration engine; until then, invalidate rather than guess after edits.
- [ ] Cover hidden views, transclusions, removed Blocks, document switches,
  disconnection, expiry, and reconnection.

Gate: deterministic presence rendering under reordered/dropped packets and model
changes; no implication that concurrent mutation is implemented.

### P5 — Non-text Blocks

- [ ] Add Block-position adapters and default atomic outline visuals.
- [ ] Implement explicit before/inside/after navigation for images and video.
- [ ] Preserve native media controls and accessibility while inside a Block.
- [ ] Define mixed text/Block range semantics one Block type at a time.
- [ ] Keep opaque/unqualified Blocks as explicit barriers.

Gate: operations have unambiguous targets and keyboard/pointer navigation has an
accessible escape/collapse path.

### P6 — Programmable behaviors

- [ ] Publish a versioned, trusted registration API beginning with pure visuals.
- [ ] Validate and budget output; add failure isolation and diagnostics.
- [ ] Add example default, C64, slanted-italic, remote-user, and animated SVG
  behaviors.
- [ ] Consider navigation hooks only after presentation hooks are stable.
- [ ] Verify that saved documents cannot introduce executable code.

Gate: extension failures fall back without data loss, interaction failure, or
unbounded frame work.

### P7 — Release decision

- [ ] Run the full unit/integration/browser/device/accessibility/performance suite.
- [ ] Compare results with P0 and document every unsupported mode.
- [ ] Conduct a long-session test with typing, composition, remote presence,
  scroll/resize, fonts, media loading, undo/redo, and document/workspace changes.
- [ ] Decide whether to keep the feature experimental, enable selected custom
  visuals by default, or ship only secondary/remote custom cursors.
- [ ] Keep the feature flag default-off unless the user explicitly changes the
  repository policy.

Gate: explicit user release decision and documented fallback/support matrix.

## Verification plan

### Pure/model tests

- Position validation, direction, affinity, normalization, and operation mapping.
- Unicode conversion and grapheme snapping property tests.
- Multiple selections, overlap normalization, participant indexing, revision and
  sequence rejection, expiry, and invalidation.
- Text versus Block position capability validation.
- Programmable behavior output validation and failure isolation.

### DOM/component tests

- Mount adapter capture/restore and remount generation behavior.
- Stable focus/native range while custom visuals update.
- Layer order and interaction with annotations, search, Block selection, menus,
  margins, tabs, windows, and backgrounds.
- No repository revision from cursor/selection/presence movement.
- Fallback restores native presentation without losing the logical selection.

`jsdom` tests are useful for state and event routing but are not evidence for
caret geometry, browser selection, mobile input, layout, or paint performance.

### Real-browser and device tests

- Automated Chromium/Firefox/WebKit checks for pointer, keyboard, selection
  direction, geometry round trips, zoom/scroll, focus, clipboard, and composition
  sequences where automation exposes them.
- Physical-device manual scripts for iOS/iPadOS and Android touch handles,
  keyboards, dictation, autocorrect, viewport movement, and screen readers.
- Desktop screen-reader and high-contrast/reduced-motion checks.
- Screenshots/video plus structured metrics for visual effects; never accept a
  screenshot alone as endpoint-accuracy evidence.

### Performance fixtures

- One 25k-character paragraph at start/middle/end and dense Unicode positions.
- Hundreds of paragraphs with local and cross-Block selections.
- Dense annotations/search decorations plus 1, 10, 50, and the agreed maximum
  visible participants.
- Rapid remote-presence packets, autoscroll drag, zoom, resize, font swap, and
  inline-image load.
- Hidden/virtualized documents and shared content in multiple visible views.

Record script, hardware, browser version, median/p95/max frame and event latency,
layout/style/paint time, memory, and rendered node/path counts.

## Open decisions and concerns

These questions do not block planning, but should be answered before P0 exits:

1. Is the first product priority custom visuals for the primary local caret, or
   collaboration presence (secondary/remote cursors) while leaving the local
   native caret visible? The latter is lower risk.
2. Which physical mobile/browser/accessibility combinations are release blockers?
3. Should a block/C64 cursor cover the next grapheme advance, a fixed monospace
   cell, or a theme-selected width in proportional text?
4. Should remote participants identify a specific occurrence/view only, or may a
   presence intentionally appear in every transclusion of shared content?
5. What maximum visible participant/range count should the first release support?
6. Are programmable behaviors limited to trusted application/plugin authors, or
   must end users configure them through a declarative editor UI? Executable code
   in documents is strongly discouraged.
7. Which non-text Block should be the first proof case: inline image, standalone
   image, or video? Inline image has the clearest existing atomic semantics.
8. Is full custom primary selection on mobile required for the first release, or
   is native local selection plus custom remote presence acceptable there?

## Platform references reviewed

- [Selection API](https://w3c.github.io/selection-api/) — one portable document
  selection/range, direction, `extend`, and `selectionchange` semantics.
- [Input Events Level 2](https://w3c.github.io/input-events/) — `beforeinput`,
  target ranges, cancelability, and composition event behavior.
- [EditContext API](https://w3c.github.io/edit-context/) and the
  [Chrome introduction](https://developer.chrome.com/blog/introducing-editcontext-api)
  — custom rendering/input responsibilities and the need to supply selection and
  character/control geometry.
- [CSS Basic User Interface Level 4](https://drafts.csswg.org/css-ui/) —
  `caret-color` and draft caret presentation controls. Draft properties are not a
  substitute for runtime support testing.
- [CSS Pseudo-Elements Level 4](https://drafts.csswg.org/css-pseudo/) — supported
  highlight pseudo-element styling and its deliberately limited property set.
- [CSS Custom Highlight API](https://www.w3.org/TR/css-highlight-api-1/) —
  arbitrary DOM ranges without DOM wrapper mutation.
- [WebKit's Safari 17.2 notes](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)
  — vendor evidence for Custom Highlights and supported text-decoration effects.
- [WebKit on enhanced editing/input events](https://webkit.org/blog/7358/enhanced-editing-with-input-events/)
  — platform editing controls and the limits of event-based custom editors.

## Resume protocol

When implementation is authorized, start at P0. Re-read this plan, the latest
`CROSS_BLOCK_TEXT_SELECTION_PLAN.md`, `RESTRUCTURE_PROGRESS.md`, current git
status/diff, and the referenced runtime/rendering files. Record baseline commands,
browser/device versions, artifacts, and failures before changing production code.
Do not infer browser support from API presence or replace native behavior before
the fallback path is working.

At every implementation checkpoint record:

```text
Date / phase:
Completed checklist items:
Changed files and purpose:
Feature-flag/default state:
Verification commands, results, browser/device versions and artifacts:
Performance baseline/current comparison:
Fallback modes exercised:
Known failures: baseline versus introduced:
Incomplete work / active processes:
Exact next action:
Decisions or user input still needed:
Commit identifier, or explicitly uncommitted:
```

