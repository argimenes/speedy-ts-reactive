# Compact toolbar and footer

Implemented as a bounded presentation change. `compactEditorChrome` is **true by
default**, as requested; set it to `false` in `ReactiveEditorConfiguration.features`
to use the previous wrapping layout.

## Scope and baseline

The functional inventory is `04c27fe` (`d046665^`), immediately before the hosting
feature. Git comparison confirmed the formatting toolbar/count component and
canonical window were unchanged by that feature. Vercel/server-local controls,
file routing, the hosting flag and save/load behavior are untouched. Integration
uses the two pre-existing desktop `DocumentStyleBar` call sites, without a new
host abstraction or any hosting-specific requirements.

The earlier planning document proposed a larger extraction. The user's subsequent
scope instruction supersedes that proposal: existing command handlers, shortcut
routing, annotation services and canonical mutations remain in place.

## Behavior

- One 40px desktop toolbar row with Typography, Annotations and Visual effects.
  Switch through the named native picker, previous/next buttons or picker-only
  wheel gestures. Wheel bursts advance once and zoom gestures pass through.
- Commands that do not fit move into More. The same panel provides existing Find,
  Entities and Timer actions, contextual Block tools, and the experimental
  cross-Block preference. Linked creation and Resume appear for a relevant range.
- Colour and fill use a panel with the original explicit Apply controls and drafts.
  Deferred Blur/Flip/Mirror rendering remains deferred and is identified in help.
- Selected toolset is window-local, survives minimize/restore, and never writes to
  the document/history. Existing keyboard command availability is unaffected by
  which toolset is displayed. No new shortcut defaults or command registry added.
- One 24px footer owns the existing count component/worker, with details opening
  upward. Narrow footers prioritize Document count; the disclosure retains all
  counts. Count rules and debounce remain unchanged. Focus in another window
  cannot supply this footer's Block count.
- Existing feedback/history issues appear in the footer with expandable text.
  Coarse-pointer chrome uses a larger fixed row. Native form fields, labelled
  controls, keyboard navigation and Escape provide gesture-free access.

## Validation checkpoint

Before the user requested that further testing stop:

- Typecheck and client/server build passed at an earlier implementation checkpoint.
- Targeted formatting/selection/entity/tab/history suites passed; formatting parity
  was checked with both compact and previous presentations.
- Six new compact-chrome tests passed, covering window-local state, worker lifetime,
  hidden-toolset shortcuts, wheel bursts and colour drafts.
- The full suite reported 515 passing tests, two context-menu failures and a
  filesystem worker URL suite-load failure. These were not fixed or conclusively
  baseline-verified in this task.
- The browser check exercised all 17 style/colour operations, fixed toolbar/footer
  heights, overflow, native selection and the count worker, then exposed premature
  dismissal when clicking the linked-annotation disclosure. The dismissal handler
  was corrected to tolerate transient body focus.

**The final edits have not been retested**, per user instruction. The browser
script and tests remain available for the next verification pass. No production
browser verification or final performance result is claimed.
