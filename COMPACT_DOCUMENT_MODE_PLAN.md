# Laptop density and Compact Document Mode plan

Status: approved implementation plan, updated 21 September 2026.

## Outcome and scope

Codex can recover a useful amount of laptop screen space through small CSS and
layout changes rather than global scaling. The recommended design has two parts:

1. **General responsive density improvements** apply to ordinary Document windows:
   modestly shorter permanent chrome, tighter Page and Block spacing, slightly
   calmer heading sizes, and margin lanes that narrow earlier as the Document
   window becomes narrower.
2. **Compact Document Mode** is an explicit, always-available window presentation
   toggle. It collapses both margin lanes regardless of window width, retains
   narrow structural indicators beside the main text, and exposes the existing
   margin drawer for reading or editing the hidden content.

This is a presentation feature. It must not change Block or margin semantics,
Document serialization, annotation ranges, editor commands, undo history, window
management, or toolbar architecture. It should reuse the margin registration,
drawer, focus-restoration, resize, and container-query machinery already present.

Because this is a substantial new presentation mode, implementation should add a
`compactDocumentMode` feature flag in `src/configuration.ts`, disabled by default
during rollout following `AGENTS.md`. The mode's on/off state is separate from
that rollout flag.

The application-toolbar inventory in this plan follows the pre-server-hosting UI
baseline (`d046665^`, commit `04c27fe`). Vercel/server-local button variants are
outside this feature and must not influence layout abstractions, scope or tests.

## 1. Relevant current implementation

| Area | Current implementation and useful seam |
| --- | --- |
| Workspace/application chrome | `src/demo/workspace-demo.tsx` renders `.workspace-demo__toolbar`; `src/demo/workspace-demo.css` positions it at the top and reserves 52px above the sample window, or 48px in the canonical workspace. The pre-hosting file/document actions are the functional baseline. |
| Sample Document window | `DemoSession` owns window state, size, title bar, `ResizeObserver`, margin entries, collapsed state and drawer state. `.workspace-demo__windowbar` is 30px high. |
| Canonical Document window | `WindowView` in `src/rendering/core-block-views.tsx` owns equivalent state for `document-window-block`. `.reactive-window__header` contains the title and window controls; 24px controls plus 8px vertical padding make its effective height about 40px. |
| Formatting chrome | `DocumentStyleBar` and `src/rendering/document-style-bar.css` now provide one fixed 40px desktop row. Compact mode must not become another formatting toolset. The 24px `DocumentStatusBar` is already below the scrollable document. |
| Page tabs | `TabRowView` renders `.reactive-tabs__labels`. Workspace CSS gives it a 40px minimum, 16px text and wrapping; buttons use 8px vertical and 12px horizontal padding in `src/index.css`. |
| Page layout | Workspace Pages use `padding: 24px var(--margin-column) 90px`; the pageless flow uses the same values. `--margin-column` begins as `clamp(145px, 16vw, 235px)`. A 900px Document-container query reduces it to `clamp(92px, 13cqi, 125px)`. |
| Paragraph layout | `.reactive-page__main > * + *` adds 8px between Blocks. Workspace standoff surfaces add 2px top/4px bottom padding and use a 1.6em minimum. Text flow inherits ordinary 16px text and uses `line-height: 1.65`. |
| Heading appearance | `src/rendering/appearance.ts` maps H1/H2/H3/H4 to 3rem/2.5rem/2rem/1.5rem, and sets line-height equal to the same absolute size. These are inline styles, so responsive CSS cannot reliably adjust them without changing the appearance adapter. |
| Margin placement | `RelationBlock` in `src/rendering/block-outlet.tsx` recognizes `leftMargin` and `rightMargin`, registers `DocumentMarginEntry { ownerKey, relationKey, side, name }`, and renders the relation beside its owner. Workspace CSS gives each relation `calc(var(--margin-column) - 24px)` and places it 20px beyond the main Block. |
| Existing margin collapse | Both window hosts observe their own width. At 730px outer width, `marginsCollapsed` becomes true; the matching 700px content query hides margin relations and narrows Page padding. A counted `Margins` button appears in `DocumentStyleBar`. Opening it moves the one live relation occurrence into `DocumentMarginDrawer`; it does not duplicate content. |
| Focus during collapse | Both hosts already capture native/inline selection when a focused margin is collapsed, open the drawer, and restore focus. This is the critical behavior to preserve when compact mode is toggled manually. |
| Minimap | `PageMinimap` measures Block/text anchors using mounts, `getBoundingClientRect`, a `ResizeObserver`, captured scroll, visual viewport events and animation-frame coalescing. Its rail sits 32px from the main text on the selected side. This is a useful measurement precedent for margin indicators, not a reason to put margins into the minimap service. |
| Block controls | Block-selection handles occupy a 17×24px target at `left: -19px` from each selectable Block. Compact gutters and margin indicators must leave this handle usable. |
| Window sizing | The sample window defaults near 1200×760; canonical windows default to 840×620. Documents currently stop at 560×240, or 602px wide when a minimap lane is active. Resize previews are local; committed size is persisted only where already intended. Compact mode must not alter that contract. |

The two window render sites are existing presentation integrations. They should
share a small compact-mode controller/component, but this feature does not need a
new host abstraction or general window manager.

## 2. Current sources of wasted space

### Permanent vertical bands

The current desktop/laptop stack is approximately:

| Band or reserve | Current | Proposed | Approximate recovery |
| --- | ---: | ---: | ---: |
| Workspace/application top reserve | 48–52px | 38–40px | 10–14px |
| Sample Document title bar | 30px | 28px | 2px |
| Canonical Document title bar | ~40px | 32px | ~8px |
| Formatting toolbar | 40px | 36px | 4px |
| Page tab bar, one line | 40px | 32px | 8px |
| Footer/status | 24px | 22px | 2px |
| Page top padding before first Block | 24px | 18px | 6px to first content |

The permanent bands inside a typical sample Document consume about 134px before
Page padding (30 + 40 + 40 + 24). The canonical equivalent is about 144px because
its title bar is taller. Including the application top reserve and Page top
padding, the first Block begins roughly 206–220px below the viewport top.

The proposal recovers about **28–34px of document viewport** from permanent bands,
plus about **6px before the first Block**. This is a useful but intentionally
modest 34–40px improvement. Exact results must be measured in a real browser at
100% and 200% zoom; font metrics, borders and browser chrome make CSS arithmetic
an estimate rather than acceptance evidence.

The tab bar can currently wrap, making the cost larger than 40px. General density
work should keep its height to one line and use horizontal scrolling or an
overflow treatment for excess Pages. A second tab row would defeat the recovered
space. Designing a new Page-management system is outside scope.

### Document content and horizontal lanes

On a 1280-CSS-pixel laptop viewport, the sample workspace reserves 225px around
the Document window. A roughly 1055px window can therefore retain the large
`16vw` margin token: about 205px on each side, leaving only about 645px for main
content before scrollbars and other lanes. The existing 900px container breakpoint
does not activate soon enough for that common case.

Other conspicuous costs are:

- 90px Page bottom padding, which is generous for an editing viewport;
- 8px between every top-level Page child, plus 6px standoff-surface vertical
  padding per text Block;
- H1 at 48px and H2 at 40px with line-height fixed to exactly the font size;
- 8×12px Page-tab button padding and 16px labels;
- 14px padding around canonical window content in addition to Page padding;
- fixed full-width margin lanes even when they contain only a short note;
- sticky tabs occupying a separate 143px workspace lane in the sample UI. Sticky
  tabs are not Document margins; changing their placement is a separate feature.

The ordinary body text is not the problem. Keep its effective size at 16px (15px
would also be acceptable after visual review) and use spacing/gutters to recover
area.

## 3. General responsive density improvements

These changes should apply without enabling Compact Document Mode.

### Chrome dimensions

- Reduce the application toolbar's vertical padding from 5px to 3px and buttons
  from `4px 7px` to approximately `3px 6px`. Retain at least a 28–30px pointer
  target and the current horizontal-scroll behavior. Reduce the workspace top
  reserve from 52/48px to about 40px. Only pre-hosting actions are considered.
- Set both Document title-bar variants to a common 28–32px density. Keep window
  drag behavior and controls at least 24px square. The canonical header can move
  from 8px to 4px vertical padding; the sample bar can retain its current 30px or
  use 28px after hit-target review.
- Reduce the formatting row from 40px to 36px on fine-pointer devices by using
  28–30px controls and 2px row padding. Preserve the existing 48px coarse-pointer
  rule. This is a token adjustment to the compact toolbar, not a redesign.
- Reduce one-line Page tabs from 40px to 32px: 14–15px label text, approximately
  `5px 9px` padding, and a 30–32px minimum target. Use horizontal overflow at
  narrow widths rather than wrapping. Keep selected state and keyboard focus clear.
- Reduce the status row from 24px to 22px only if counts and disclosure remain
  legible at 12px. Leave it at 24px if macOS/browser font metrics clip; it is a
  lower-value saving than the title/tab bands.

Coarse-pointer media rules should retain larger targets. High zoom is a layout
constraint, not permission to clip labels; overflow and scrolling must take over.

### Typography and Block rhythm

Change the heading token table in `appearance.ts`, preserving the stored
`block/font/size` values:

| Token | Current | Proposed font size | Proposed line-height |
| --- | ---: | ---: | ---: |
| H1 | 3rem / 48px | 2.5rem / 40px | 1.12 (about 45px) |
| H2 | 2.5rem / 40px | 2rem / 32px | 1.18 (about 38px) |
| H3 | 2rem / 32px | 1.625rem / 26px | 1.24 (about 32px) |
| H4 | 1.5rem / 24px | 1.25rem / 20px | 1.3 (26px) |
| Body | 1rem / 16px | 1rem / 16px | 1.5–1.55 |

Do not modify persisted properties or reinterpret heading levels. Replace the
current `line-height = font-size` behavior with unitless line-height tokens so
heading glyphs are not cramped after reducing margins.

Use a small presentation class or data attribute derived from the existing font
size property so spacing can distinguish headings without querying inline style.
Recommended top/bottom spacing is approximately:

- H1: 14px before, 6px after;
- H2: 12px before, 5px after;
- H3/H4: 9px before, 4px after;
- ordinary adjacent Blocks: 5–6px instead of 8px;
- standoff surface padding: 1px top/2–3px bottom instead of 2px/4px.

Avoid applying both the generic sibling gap and a full heading top margin. Use
one rule with heading-specific adjustment so spacing remains predictable after
drag/reorder. Lists, grids, media and Timer Blocks need visual review before a
blanket selector reduces their separation.

Reduce Page top padding from 24px to 18px and bottom padding from 90px to about
48–56px. Preserve enough bottom space to place the caret and see selection handles
above the status bar. Canonical `.reactive-window__content` padding can fall from
14px to 8–10px for Document windows only; generic floating windows retain 14px.

### Responsive gutter widths

Move the normal gutter calculation fully to the Document window's container and
introduce named tokens rather than viewport `vw` values:

```css
--document-margin-column: clamp(136px, 14cqi, 200px); /* wide */
--document-page-top: 18px;
--document-page-bottom: 52px;
--document-main-side-min: 32px;
```

Recommended progression:

| Document content width | Ordinary responsive presentation |
| --- | --- |
| Above 1200px | Full margin lanes, 136–200px each. |
| 900–1200px | Narrow lanes, approximately 96–128px each. |
| 700–900px | Minimum useful lanes, approximately 72–96px each; reduce the relation gap from 20px to 12px. |
| Below 700px content / 730px outer | Keep the current automatic collapsed-margin safety behavior and drawer access. |

This improves a MacBook-sized window without requiring mode activation. It also
preserves readable marginalia at intermediate widths rather than abruptly jumping
from 125px lanes to hidden content.

The main text column should remain fluid with a readable target of roughly
60–80 characters per line. Do not enforce a narrow fixed `max-width` that wastes
space when margins collapse. Long tables/media may need the existing full main
width and horizontal overflow rules.

## 4. Compact Document Mode

### State and behavior

Compact Document Mode is window-local, session-only presentation state:

```text
marginsCollapsed = compactDocumentEnabled OR narrowWindow
```

Refactor the current mutable `marginsCollapsed` signal into:

- `compactDocumentEnabled`: toggled by the user;
- `narrowMarginsCollapsed`: updated by the existing ResizeObserver threshold;
- a memo/accessor combining the two for `DocumentMarginContext` and CSS classes.

This is the smallest clean change because `RelationBlock`, registration, drawer
movement and focus restoration already consume a `collapsed` accessor. Toggling
compact mode on should run the same focused-margin transition currently used when
resizing across 730px. Toggling it off closes the drawer and restores normal lanes
when width allows; a still-narrow window remains collapsed.

Do not write this state to Window metadata or Document data in the first version.
It must not dirty a Document, add history, affect save/reload, or propagate between
two windows showing the same Document. A later user preference may remember the
default for new windows, but that is optional follow-up work.

When active, add a class such as `reactive-window--compact-document` at the existing
window root. The class should:

- force margin relations out of their permanent lanes;
- change Page side padding to compact utility lanes (about 32px each, or 58px on
  a side containing the minimap);
- retain the general typography and Block rhythm rather than introduce a second
  set of tiny fonts;
- keep Page tabs, formatting toolbar, footer and application chrome visible;
- leave all editing commands and document navigation available.

This is deliberately not Focus/Zen mode. A future Focus Document option may hide
application and editing chrome, but it should be designed separately after compact
mode establishes a stable presentation contract.

### Always-accessible control

Place the toggle in the **Document window title bar**, immediately before the
minimize/maximize/close group. This location is permanent, independent of the
active formatting toolset, and semantically matches maximize or reading-layout
controls. It also makes per-window ownership obvious in canonical Workspaces.

Use a labelled icon button with:

- `aria-label="Compact document"`;
- `aria-pressed` reflecting the mode;
- a tooltip such as “Compact document: collapse margins and widen text”;
- a clear pressed style that is neutral blue/cyan, not a status colour;
- the same 24–28px target and focus treatment as neighbouring window controls.

The button must stop pointer-down propagation so it never begins window dragging.
In the sample header the existing drag guard already excludes buttons; canonical
controls explicitly stop propagation and the new control should follow that rule.
Do not place the toggle in the formatting toolbar, More menu, application toolbar,
Page tab row, context menu only, or footer.

Illustrative title bar:

```text
Document title · Saved                         [Compact ◫] [−] [□] [×]
```

## 5. Collapsed margin indicators

### Required visual contract

Compact mode must never make marginalia disappear without indication. Render two
low-salience indicator rails beside the main Page column, one per side. Each
registered margin entry produces a vertical segment aligned to its owning main
Block:

```text
      left compact lane       main text                right compact lane
             │       [Block handle] Paragraph...              │
             ┃                      Paragraph...               ┃
             │                                                  │
```

Recommended tokens:

- visual width: 3px;
- minimum segment height: 8px;
- normal colour: muted cyan/blue such as `rgba(38, 133, 153, .42)`;
- hover/focus colour: the same hue at roughly `.8` opacity;
- hit target, if interactive: 10–12px wide without increasing the visible rail;
- no red/orange/yellow/green and no success/error iconography.

The source range should initially be the **owning main Block's top-to-bottom DOM
range**, not the hidden margin's rendered height. Once collapsed, the marginalia
itself has no stable in-lane layout height; the owner range is cheap, deterministic,
and communicates the structural association requested. A very tall owner is
clamped to its visible Block range, not to the full Page.

For overlapping ranges on the same side, merge intersecting segments into one
segment and expose a count in its accessible label/tooltip, for example “3 right
margin Blocks”. Increase opacity or visual width to at most 5px for a merged
segment; do not introduce colour categories. Adjacent non-overlapping ranges can
remain separate with a 1–2px visual gap.

### Placement and collision rules

Use a 32px compact side lane where no minimap exists:

- the left Block-selection handle stays at its existing `-19px` position;
- place the left margin indicator around 25–28px from the main text edge, outside
  the handle's 17px span;
- place the right indicator at the equivalent distance;
- the Page minimap begins 32px from the main text and occupies 20px. On its active
  side, retain the current 58px Page padding and keep the indicator in the inner
  32px utility lane so it does not overlap the minimap;
- remove the large manicule glyphs while compact; they read as content controls
  and require the full lane.

The indicator layer belongs to `PageView`, because it needs the Page scroll
coordinate system and must exclude entries belonging to other Pages/tabs. Extend
`DocumentMarginPresentation` with an `entries` accessor and an `open(entry?)`
callback, then add a small `DocumentMarginIndicators` component beside
`.reactive-page__main`. Filter entries by the active Page occurrence using projected
ancestry or by confirming that the Page contains the owner's mounted root. Do not
scan or serialize the repository.

Measurement can reuse the proven shape of `PageMinimap`:

1. Resolve the owner through `editor.mounts`.
2. Compare owner and Page/client rectangles and convert them into Page scroll
   coordinates.
3. Observe the Page, main column, scroll owner and owner roots with one
   `ResizeObserver` per mounted indicator component.
4. Coalesce scroll, resize and mutation-driven updates into one animation frame.
5. Ignore hidden, stale, other-Page or zero-size owners.

Do not register these ranges with `MinimapService`; margin existence is structural
Document UI, while the minimap represents configurable navigation/analysis layers.

### Interaction

The required first version should make each merged segment an accessible button
with a visually narrow pseudo-element and a larger transparent hit area. Hover and
focus show a simple tooltip/`title`: “Left margin” or “2 overlapping left margins”.
Clicking opens the **existing** margin drawer and scrolls/focuses the corresponding
margin item. This is a small extension to `DocumentMarginDrawer`, not a new popup.

Give margin drawer items stable DOM IDs based on the occurrence/relation key. The
`open(entry)` callback records a session-only requested entry; after the drawer
mounts, focus or scroll its item into view. Opening a merged segment may reveal all
drawer entries with the first matching item focused and a count in the label.

Keyboard users can reach indicators after the owning Block handle and before Page
navigation controls. Enter/Space opens the drawer; Escape retains the drawer's
current close-and-return behavior. If this interaction proves too noisy during
browser testing, retain non-interactive visual ranges and the counted title-bar/
toolbar Margins control as the accessible path, but do not ship unlabeled hidden
margins.

## 6. Smallest clean implementation

Implement in small, reversible steps:

1. **Introduce density tokens and measurements.** Add CSS custom properties for
   chrome, Page padding, margin widths and Block gaps. Record current geometry in
   both window render sites before changing values.
2. **Apply general chrome density.** Change CSS values only, except for preventing
   Page-tab wrapping. Keep target sizes and coarse-pointer overrides explicit.
3. **Adjust typography/rhythm.** Update `appearance.ts` heading sizes/line-heights
   and expose a heading presentation class. Tighten Page/Block values without
   altering stored properties.
4. **Improve ordinary container responsiveness.** Move margin tokens to the local
   Document container, add the 1200/900/700 progression, and retain the current
   below-700 automatic collapse behavior.
5. **Add window-local compact state.** Split explicit and width-derived state,
   add the title-bar toggle to the existing hosts, and reuse current focus-aware
   collapse/drawer transitions.
6. **Add Page indicator rails.** Expose registered entries through the context,
   measure owner ranges, merge overlaps, and render the two rails only while
   compact/collapsed. Add drawer targeting only after non-interactive geometry is
   stable.
7. **Integrate and tune.** Verify minimap, Block handles, overlays, zoom, coarse
   pointer and actual MacBook-sized viewports; adjust tokens from evidence.

No new editor service, command registration, repository field, toolbar descriptor,
Block type, relation format or persistence migration is needed. A small reusable
function can prevent duplication of the manual-collapse focus transition between
`DemoSession` and `WindowView`; do not broaden it into general window state.

## 7. Risks and regression controls

| Risk | Mitigation |
| --- | --- |
| Focused margin disappears when mode changes | Run the existing capture/open-drawer/restore path for manual toggles as well as resize collapse. Never rely on CSS alone when focus is inside a margin. |
| Relation is mounted twice | Preserve the existing `Show`/drawer transfer: one `BlockOutlet` occurrence at a time. Indicators contain metadata only, never another margin renderer. |
| Indicator points at the wrong Page or transclusion | Use occurrence `NodeKey`, mounted-owner containment and the active Page occurrence. Do not identify by authored Block ID/content key alone. |
| Marker measurements cause typing/layout cost | Observe registered owner roots, batch into animation frames, and measure only while margins are collapsed and the Page is mounted. Do not subscribe to text changes or serialize state. |
| Block handle and left marker overlap | Reserve a 32px utility lane and place the 3px marker outside the existing `left:-19px`, 17px handle span. Smoke-test pointer use at normal zoom and include this in the high-zoom sanity check. |
| Minimap collision | Keep the indicator inside the utility lane and retain 58px padding on the active minimap side. Smoke-test the configured minimap position rather than building a position matrix. |
| Page-tab density makes targets too small | Maintain 30–32px fine-pointer targets and larger coarse-pointer targets; use horizontal overflow instead of wrapping or shrinking text below 14px. |
| Heading changes alter line wrapping or annotation geometry | Keep the change to CSS variables and existing appearance mapping, then visually exercise representative annotated text. Stored annotations remain unchanged. |
| Tighter gaps obscure drag/drop targets | Preserve Block handle size, selected outlines and before/after drop shadows; smoke-test consecutive one-line Blocks. |
| Drawer covers footer or resize handle | Continue using footer-aware bottom offsets; derive top/bottom from chrome tokens rather than the current hard-coded `top:84px`. |
| Overlays anchor incorrectly after density change | Check one representative anchored overlay during browser review. Expand verification only if that check exposes a problem. |
| Responsive and explicit state fight each other | Store width-derived and user-derived signals separately; combine them in one memo. Resizing wide must not turn the user's compact choice off. |
| Compact state dirties or saves the Document | Keep it as a Solid signal in the Window presentation. Assert no revision, dirty state, encoded data or history change. |
| Glass theme loses indicator contrast | Use a CSS token with paper/glass variants and forced-colors fallback; do not hard-code one translucent colour for every background. |

## 8. Tests and acceptance criteria

### Focused automated coverage

- Compact toggling changes only session presentation: repository revision, history,
  encoded data and save state remain unchanged.
- Explicit compact and width-derived collapse remain independent: widening a
  compact window does not expand it, and disabling compact at a narrow width does
  not expose the margins.
- Retain the existing focused margin collapse/drawer/focus test, including native
  or inline selection restoration and a single live margin editor.
- Add only a small interaction assertion that an indicator exposes its registered
  margin through the existing drawer. Do not test individual CSS dimensions.

### Proportionate browser review

Use one MacBook-class viewport around 1280×800/832 and one representative smaller
or ordinary Document-window size at normal zoom. Add one high-zoom accessibility
sanity check. In those sessions:

- compare the permanent-band height and visible document area before and after;
- scroll and resize normally, confirming that indicators continue to follow their
  owner Blocks;
- confirm that the left indicator, Block handle and minimap remain separately
  clickable and do not cover text;
- open and close the margin drawer, edit a margin, and check focus restoration;
- sample a heading, Page tabs and one anchored overlay for obvious clipping or
  stale positioning.

There is no required combinatorial matrix across every viewport, zoom, pointer,
theme, margin arrangement, minimap side or overlay. Expand a check only when a
representative case reveals an implementation problem.

Acceptance criteria:

- recover at least **28px of permanent vertical document viewport** on a typical
  laptop layout, excluding Page top-padding gains;
- one-line title/formatting/tab/status bands with no clipped labels;
- body text remains 15–16px and comfortably readable;
- ordinary 1000–1100px Document windows gain meaningful main-column width before
  compact mode is enabled;
- compact mode reduces each margin side to approximately a 32px utility lane (58px
  with minimap), with every margin visibly indicated;
- indicators stay aligned through scroll, resize, heading reflow, tab switch and
  edits that change owner height;
- no marker blocks text selection, Block dragging, minimap interaction or Page
  scrolling;
- no content/history/persistence mutation from density or mode changes;
- no duplicate live margin editor; focus and selection survive collapse/drawer use.

Run the relevant existing margin/window/minimap/selection suites, typecheck and
both builds. Complete the small browser review against the ordinary development
or rebuilt application. Server-hosted button arrangements require no parity
testing for this feature.

## 9. Required implementation versus optional follow-up

### Required

- modest general chrome and Page density tokens;
- single-line, denser Page tabs;
- smaller H1–H4 scale, unitless heading line-height and tighter Block rhythm;
- earlier container-responsive margin narrowing;
- default-off rollout flag;
- window-local Compact Document toggle in the title bar;
- explicit state combined with existing automatic narrow-window collapse;
- 3px muted range indicators for every collapsed margin, with overlap merging;
- counted margin access and reuse of the existing drawer;
- focused state/focus coverage and representative browser smoke checks;
- measured laptop-space recovery.

### Optional after the first reviewable increment

- remember a user's preferred initial compact state in local application settings;
- richer hover previews of margin text;
- filtering the drawer to only the clicked overlapping group;
- user-configurable density values;
- animating lane collapse, if it does not disturb selection or measurements;
- a dot fallback only if range measurement proves too expensive or unstable;
- a separate Focus Document/Zen mode that hides application/editor chrome.

Do not include Focus mode, general window-management changes, toolbar rewrites,
margin data migration, plugin APIs, semantic changes or server-hosting UI work in
this feature.

## 10. Review decisions

The implementation can proceed with the following recommended defaults after
review:

| Decision | Recommended default |
| --- | --- |
| General density | Apply to all Document windows; body text stays 16px. |
| Compact mode default | Off per window; responsive narrowing/collapse still happens automatically. |
| Persistence | Session-only per window in the first version. |
| Control location | Document title bar, before window-state controls. |
| Indicator geometry | Owner Block vertical range, 3px muted cyan, 8px minimum height. |
| Overlap | Merge by side/range; one colour, slightly stronger segment, count in label. |
| Indicator interaction | Click opens existing drawer at the associated item. |
| Compact side lane | 32px normally; retain 58px on an active minimap side. |
| Heading scale | 40/32/26/20px for H1–H4; body remains 16px. |
| Future Focus mode | Explicitly deferred. |

The only product choice likely to alter the first implementation materially is
whether compact mode should be remembered across sessions. Session-only state is
recommended because it is reversible, keeps Documents portable, and avoids adding
preference machinery before the laptop layout has been validated.
