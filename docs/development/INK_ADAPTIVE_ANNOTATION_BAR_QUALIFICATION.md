# Ink adaptive annotation bar — qualification

Implemented 2026-10-25 against `MUTABLE_INK_ADAPTIVE_ANNOTATION_TOOLBAR_FEATURE_BRIEF.md`.

## Behaviour

The annotation bar remains within its Document view. Compact-shell Flint uses a fixed annotation-bar row below its application tabs, with a separate retained Document-content scrollport; standalone Ink windows already place the bar outside the content scrollport. Legacy-shell Flint retains scoped sticky positioning. Detached Documents measure their existing Save/Return strip so the sticky bar sits below it. Document page tabs retain ordinary scrolling behaviour. No Window Manager lifecycle or persistence format changed.

The right-hand presentation selector offers **Auto, Expanded, Compact and Hidden**:

- **Auto** starts Compact in ordinary Flint tabs, tiled panes and ordinary detached windows. A maximised Flint application still contains ordinary tabs, so maximising Flint alone does not expand their bars.
- Native full-screen Documents resolve Expanded. Maximised standalone Documents expand when their own bar is at least **960 CSS pixels** wide, and remain expanded until it falls below **880 pixels**. Width changes settle for **120 ms**; height-only and hidden zero-width notifications are ignored.
- **Expanded** reuses the existing full annotation controls. **Compact** keeps paragraph/heading style, bold, italic, underline and More accessible. At narrow widths, toolset selection, caret modes, spotlight and margin controls remain in More. Existing action handlers, selection bookmarks and enable/disable rules are reused.
- **Hidden** leaves a native, keyboard-accessible reveal button and the policy selector. Reveal opens Compact and focuses its style selector.
- Flint Reading density, Block Focus, Sentence Focus and Reading Spotlight do not hide the bar. Visibility follows the selected annotation-bar policy; Hidden is an explicit choice. This corrects the initial interpretation of the brief, following the user's clarification that loaded Documents must display the bar by default.

Only the policy is stored, in `localStorage['mutable.ink.annotation-bar.v1']`, following existing Mutable/Flint local UI-preference conventions. It is shared across open Documents and browser tabs, validated on load, and restored for newly mounted Documents. Storage denial leaves current-session controls usable. Resizing never persists the resolved state.

The existing default-enabled `compactEditorChrome` flag continues to gate this adaptive presentation. Its disabled path keeps the full legacy controls. No new feature default, Document property or workspace schema was introduced.

## Fit and interaction findings

The 960-pixel threshold was checked against the actual complete bar: it wraps without horizontal overflow into **132 pixels of height** in the qualification fixture. It is a threshold for this toolbar, not a browser-wide breakpoint. At **280 pixels**, the style picker, three formatting buttons, More and policy selector all fit within the Document pane. Additional controls use the existing owned popup.

Browser checks and visual inspection corrected layering issues: the old Flint app-tab padding exposed a strip of scrolling text above the sticky bar, retained editor text could cover the detached Save/Return strip, and Block handles could paint over the bar. Document content now contains its own stacking layers. Empty Expanded status space is suppressed. Insets for document content and page tabs remain intact. Native fullscreen popups retain their application-surface registration while their DOM is placed inside the fullscreen element; fullscreen transitions dismiss transient menus.

Observation is limited to the bar, the detached command strip and presentation attributes on ancestors. There are no cell measurements, document/repository scans, serialization, history operations or Save requests in policy resolution. Observers, listeners and pending resize timers are released on disposal.

## Qualification

- Latest scrolling correction: **71 tests passed** across annotation-bar policy, compact toolbar, Flint compact shell, caret modes, host transfer and product detachment. The initial broader implementation run passed 62 tests, including E1.3 detachment and cross-block selection.
- Additional annotation/grouping suite: **28 passed, 2 failed**. Both failures independently reproduce at unchanged baseline **`1df5176`**: `collects only Control-held gestures, excludes early release, and keeps static highlights`, for both compact settings, expects two SVG matches but receives four. They are not new toolbar regressions.
- Reactive TypeScript check and `git diff --check` passed.
- **44 real Chrome checks passed**, using an isolated WorkspaceSession and an in-memory copy of *The Masque of the Red Death*. Covered long-document scrolling, pointer formatting, keyboard reveal, saved overrides, saved Reading-density loading and visibility across caret-focus changes, 280-pixel fit, unclipped overflow, actual Detach/Return, maximisation/restoration, tiling, native fullscreen, fullscreen overflow and ordinary page-tab positioning. The retained editor mount and annotation-bar DOM survive transfer. Presentation changes produce zero repository snapshots, commits or content revisions; no browser exceptions occurred.

Evidence: [browser results](evidence/annotation-bar/annotation-bar.json), [Compact screenshot](evidence/annotation-bar/annotation-bar.png), [Expanded screenshot](evidence/annotation-bar/expanded.png), and test logs in the same directory. Browser runner: `scripts/check-annotation-bar-browser.mjs`.

## Files and limits

Presentation changes are in `src/rendering/annotation-bar-policy.ts`, `document-style-bar.tsx`, `document-style-bar.css` and `compact-toolbar.tsx`. The scrolling correction also updates Flint shell sizing, the retained host’s scrollport accessor and the transfer destination scroll restoration, without changing session ownership or persistence. The original caret-mode regression checks pass unchanged; caret effects no longer remove toolbar icons or controls.

Chrome 155 on macOS was exercised; Safari, Firefox and physical touch-device interactions were not separately qualified. Native fullscreen checks use the Fullscreen API, not an added fullscreen command. Existing Workspace and Document manual Save semantics are unchanged. Qualification used isolated data and did not save user Documents, restart the server or run load tests. The full repository regression suite was not rerun.

## Follow-up: explicit Flint default

At the user's request, a Flint Document with no saved annotation-bar preference now selects **Compact** as its policy, rather than Auto. Standalone Ink and detached Documents retain Auto as their unset default. A saved explicit choice (including Auto) continues to take precedence across Documents; merely opening a Document does not write or replace the preference. Reading density and caret effects no longer override visibility, as described below. Added a focused regression covering Flint versus Ink defaults, unchanged storage, and reloading explicit Expanded/Auto choices. Follow-up verification: 17 policy/toolbar tests passed; reactive TypeScript and diff checks passed.

## Correction: loaded Documents unexpectedly showed only the reveal handle

The initial implementation conflated Flint's persisted Reading **density** with a mode that should hide editing controls. It also hid the bar for any non-Normal caret effect, before considering even an explicit Compact policy. Consequently, changing the default policy alone did not fix loading under saved Reading density.

Removed those automatic hiding rules and their subscriptions. Reading density and caret effects remain available and unchanged; the annotation bar stays visible unless Hidden was explicitly selected. The browser fixture now starts with Reading density already saved before Flint is created, checks that the loaded bar is visible Compact, and exercises subsequent density and caret-mode changes. Verified 28 targeted tests, 27 Chrome checks, reactive TypeScript and diff checks. No user preferences were reset or rewritten as a migration.

## Correction: scrolling in maximised Flint

The user continued to reproduce the bar scrolling away after a reload. Fresh Chrome tests of the previous implementation did not reproduce that live-session failure, so the earlier single-position sticky check was insufficient evidence for the user’s case. Inspection did find that Flint’s outer viewport CSS depended on the application being a direct child of the window body; retained Block slots and selection wrappers break that assumption.

Flint’s compact-shell Document tab now has an explicit non-scrolling annotation-bar row and a bounded content scroller. The bar no longer depends on sticky positioning through the tab/session hierarchy. Outer application sizing now accommodates the existing wrappers, preventing a second window-content scroller. Document page tabs remain inside the scrolling content. There are no added scroll handlers, geometry scans or content mutations.

The retained host resolves its content scrollport lazily, and transfer completion resolves the destination scrollport after attachment, since an empty return tab does not yet contain that element. An added test checks scroll preservation during Detach, interrupted Return rollback and successful Return, preserving the editor instance.

Focused verification: **71 tests passed** across policy, toolbar, caret modes, Flint shell, host transfer and product detachment. The known grouping baseline failures remain as documented above; no full repository run is claimed. **44 Chrome checks passed**, including 12 real mouse-wheel gestures (down partway, to the bottom and back to the top, in Compact/Expanded and floating/maximised Flint). Each verifies stable bar position, reachable controls and zero outer-window scrolling. The wheel gestures cause zero repository snapshots, commits or revision changes. The fixture now includes the real workspace sizing classes and the long story page; the prior fixture initially selected the shorter Wikipedia page. Native fullscreen resets the headless input viewport, so the runner explicitly restores that viewport before the wheel checks. Reactive TypeScript and diff checks passed. See [maximised scrolling screenshot](evidence/annotation-bar/maximised-scroll.png), [browser log](evidence/annotation-bar/fixed-tab-scroll-browser.txt) and [71-test log](evidence/annotation-bar/fixed-tab-scroll-tests.txt).
