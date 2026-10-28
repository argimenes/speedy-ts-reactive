# LER redesign research and implementation plan

Status: Accepted for implementation with the refinements below. The subsequent user instruction removes the feature flag: the redesign becomes the standard LER path. Feature Two remains out of scope.  
Date: 28 October 2026. Code baseline: `8daadc7`.  
Input: `FEATURE_1_LER_REDESIGN_RESEARCH_BRIEF.md`, with the user's clarification that the effective document contains **only content owned by the active document**.

The redesign should retain the existing entity resolver, native annotation batch, selection services and managed windows. The substantive work is a feature-owned interaction controller, a live document inventory with explicit ownership and invalidation, and a compact view. It does not need a pipeline engine or a new window subsystem.

The fast path remains: open with selected text, select a candidate, press Enter or its displayed number, and link immediately. Inspection and preparing an entity are separate actions. Bulk expansion is an explicit, previewable change to the target collection; it never writes annotations until the user links.

## Findings that determine the design

1. **Two meanings of document search exist today.** LER's `scope: 'document'` restricts canonical lookup through saved indexed references. The separate document inventory reads live annotations, including unsaved links. The new **Document Entities** mode must use the latter and open unfiltered, independently of the graph query. Retain saved document lookup under an explicit label.
2. **Bulk linking already has a suitable commit boundary.** `bindEntityCandidates` prevalidates targets and calls `annotate` once. `LinkedAnnotations.createBatch` builds all operations before one native commit. Reuse it; do not implement a loop of individually committed annotations.
3. **Enter changes meaning today.** When review is enabled, `select` nominates the entity instead of linking. The redesign should remove that implicit switch: Enter/index always means Link in the entity-results context; Shift+Enter means Prepare. Mention-review controls have their own focus context.
4. **Current ranges do not follow edits.** `SearchRange` is a versioned snapshot. Temporary decorations invalidate changed content rather than rebase it. Feature One should retain identity-anchored snapshots with explicit invalidation and refresh, not claim that a generic live bookmark service already exists.
5. **Live counts and live mention strings need different invalidation.** The current entity watcher intentionally ignores ordinary text edits and offset rebasing. That is correct for membership/counts and insufficient for edited mention strings. Add a narrow surface-text channel without turning typing into inventory reconstruction.
6. **Presentation scope is not ownership.** `scopeNodes` follows projected children and relations, including repeated presentations; it stops at nested Documents but does not test canonical ownership. Deduplication alone cannot exclude foreign transclusions.

The repository calls LER **Link Entity Reference**. Retain that product name; “Link Entity Relationship” in the brief does not imply a new relationship-authoring feature.

## Current state audit

### Source map

References identify the current baseline; line numbers will move during implementation.

| Area | Code location and finding |
| --- | --- |
| Registration | [index.tsx](../../src/features/entity-references/index.tsx), lines 10–29: feature, panels, annotation contribution, commands, listing action and underline effect. |
| Invocation and target | [entity-search.ts](../../src/features/entity-references/entity-search.ts), lines 3–20: captures range content/placement identity, inline version, repository revision and source text; `chooseEntity` delegates to `annotate`. |
| Main view and state | [search-view.tsx](../../src/features/entity-references/search-view.tsx), lines 17–174: target, query, resolver, creation/recovery, review and keyboard handling. Lines 175–213 contain controls. |
| Search semantics | [entities.ts](../../src/feature-api/entities.ts), lines 2–13, and [entity-service.ts](../../src/application/entity-service.ts), lines 89–168: independent stream/match/scope; selected-vault lookup; canonical reads and mutations; saved mention evidence. |
| Bulk review | [entity-candidates.ts](../../src/features/entity-references/entity-candidates.ts), lines 8–53 and 69–190: identity deduplication, conflict policy, staged checks, original range, exclusions, search lifecycle and batch binding. [candidates-view.tsx](../../src/features/entity-references/candidates-view.tsx) exposes review controls. |
| Live inventory | [document-entities.ts](../../src/features/entity-references/document-entities.ts), lines 23–68: logical annotation counts, metadata fallback names, occurrence ranges and citation/article block references. |
| Inventory notifications | [document-entity-changes.ts](../../src/application/document-entity-changes.ts), lines 11–132: shared document subscription, reference signature, changed-owner inspection and coalescing. |
| Existing listing | [document-entity-list.ts](../../src/features/entity-references/document-entity-list.ts), lines 65–228 and 231–333: signature cache, canonical names, optional database totals, sorting, preview, concertina focus and range refresh on navigation. |
| Host capability | [annotations.ts](../../src/feature-api/annotations.ts) and [annotation-capabilities.ts](../../src/application/annotation-capabilities.ts), lines 24–149: detached paragraph snapshots, document annotations, target watcher, native mutation, invoking-occurrence panel reuse. |
| Search engine | [text-search.ts](../../src/runtime/text-search.ts), lines 22–139, and [search-matching.ts](../../src/runtime/search-matching.ts): scope traversal, canonical source caches, worker matching, cancellation, Unicode boundary conversion and coverage limits. |
| Ownership | [resource-identity.ts](../../src/block-tree/resource-identity.ts), lines 27–65: structural owner resolution excludes reference placements. Its revision-bound parent index scans repository contents when rebuilt; it is unsuitable as a per-keystroke lookup. |
| Native mutation | [linked-annotations.ts](../../src/runtime/linked-annotations.ts), lines 43–79: validates every range, groups updates by content, creates local or shared identities, commits once. |
| Ranges and decorations | [text-ranges.ts](../../src/runtime/text-ranges.ts), lines 4–35, and [session-decorations.ts](../../src/runtime/session-decorations.ts), lines 7–117: half-open coordinates, strict version validation, temporary collection ownership and changed-content invalidation. |
| Window lifecycle | [panel-session.ts](../../src/runtime/panel-session.ts), [managed-floating-tool.ts](../../src/rendering/managed-floating-tool.ts), and [autocomplete/view.tsx](../../src/features/autocomplete/view.tsx): focus, guarded close, geometry, anchoring and cleanup. |
| Scry integration | [autocomplete/index.tsx](../../src/features/autocomplete/index.tsx), lines 74–137 and 271–303: shared LER body, provisional source, bracket commit/batch adapters, source editing and temporary shortcuts. |
| Flags | [configuration.ts](../../src/configuration.ts), lines 145, 186 and 198; [features.ts](../../src/application/features.ts), lines 32–33: existing autocomplete, SQLite entity and entity-reference defaults are enabled. |

### Controls and capabilities

Primary means always visible in the compact instrument. Contextual means shown for the active task or selected entity. Inspector means disclosed details. Settings means a secondary preference/action. Diagnostic means coverage, error or recovery information.

| Existing control or capability | Current behavior | Proposed placement |
| --- | --- | --- |
| Window title, Cancel/close, drag, resize and keyboard geometry | Standalone managed floating window; embedded LER uses Scry's shell | Primary title/close; retain shell geometry controls and focus priority |
| Target text and highlight | Independent source text; stale selection warning | Primary one-line source excerpt and target count; full source in inspector |
| Start/end character/word controls | Eight buttons in disclosure; single plain-text Block eligibility | Contextual source inspector, preserving explicit adjustments |
| Entity search field | Initialized from target; editable independently; 1,000-character limit | Primary query with visible Command/Edit state |
| Resume following source | Scry query can become independent and resume following | Contextual action; source-following state remains explicit |
| Stream All/Name/Alias/Mention | Chooses evidence fields | Primary compact Field chip; menu contains all values |
| Match Partial/Exact | Independent string comparison | Primary compact Match chip |
| Scope Vault/Current Document | Document membership comes from saved references | Primary Scope chip; rename existing choice “Saved document” |
| Local blend/session/day/week | Scry-only sources combining live fallback names, recent uses and/or vault lookup | Scope menu with separate labels; preserve invocation defaults |
| Clear usage history | Clears session and local preference history | Settings menu; no document persistence |
| Refresh candidates | Explicit cache bypass/retry | Contextual refresh icon with accessible name |
| Resolving/count/coverage status | Partial canonical results can precede saved mention results | Primary short status; detailed coverage remains diagnostic |
| Coverage details and errors | Saved-data warnings, partial results, unresolved service | Diagnostic disclosure; blocking errors remain visible |
| Ten entity results per page and current row | Name, UUID, up to three evidence strings, 0–9 index | Primary dense rows; name, index, short evidence/count only |
| Link | Immediate unless mention review is enabled | Primary single selected-row action and row activation; always explicit Link semantics |
| Details/aliases | Fetches canonical identity and aliases without linking | Inspector via Right Arrow or Details action |
| Replace & Link | One plain-text range; native replacement and annotation | Contextual action; unavailable for expanded multi-range collection |
| Previous/next entity page | Ten-row pages | Compact footer buttons; preserve numbered page-local indexing |
| Create Entity/canonical-name form | Separate editable name; explicit Create and link even if matches exist | Contextual command opens creation subview |
| Creation progress, retry receipt, recovery | Not created / creating / unconfirmed / created but not linked / linked; bind new selection | Diagnostic recovery subview; preserve operation identity and guarded close |
| Rename preferred name | Canonical write with expected revision | Inspector |
| Add/edit/remove alias; clear alias input | Explicit canonical writes, independent of document annotations | Inspector |
| Find other occurrences / enable review | Opens mention-query panel; currently changes selection into nomination | Contextual review subview with visible target collection |
| Mention query | Separate from entity query; defaults from source for one range | Existing advanced review only; never visible by default |
| Container/Page/Document mention scope | Search scope, including documented fallbacks | Review settings; document option becomes owned-content scope |
| Match case / Whole words / Regex | Literal search by default; regex disables whole words | Review settings; retain all existing controls |
| Highlights toggle | Transient candidate overlay | Review settings |
| Select all eligible / none / undo exclusion | Across all pages; select-all requires complete exact coverage | Review toolbar; preserve exclusions and incomplete-coverage gate |
| Candidate checkbox, original badge, conflict reason, context, breadcrumb | Manual review of each logical target | Review rows |
| Reveal / occurrence selector | Navigate repeated presentations | Review rows/inspector; no mutation |
| Previous/next mentions | 25-row review pages | Review footer |
| Nominated entity and Bind selected mentions | Explicit reviewed batch | Prepared-entity chip and explicit Link N action |
| External authorities | Scry context: provider/query/search/cancel, staging, reconciliation and explicit identity import | Contextual inspector; retain existing availability |
| Wikidata/GND staging controls | Existing local conflict matching, record link, GND limitation, retry receipt | Preserve in authority subview; no automatic external search |
| Keep literal brackets | Available in applicable non-provisional Scry mode | Contextual source action with existing eligibility |
| Shortcut help | Permanent verbose footer text | Short footer plus Help/command menu using registered labels |
| Separate Entities in Document listing | Local and DB totals, sorting, previews, concertina focus/navigation | Preserve existing entry point and capabilities; share inventory data, not its UI controller |

### State and data flow

The normal command captures the editor selection before focus moves. `openEntitySearch` records `entityRanges`, `entityRevision` and `entityQuery`; in this object, `entityQuery` is actually the captured source text. The view's separate `query` signal is the editable entity query. `EntityCandidates.state.query` is a third string. These distinctions exist but their naming and lifecycle do not enforce an immutable origin: boundary adjustment replaces `target`, and Scry updates it from its evolving source.

Resolver changes debounce for 200 ms, cancel superseded requests and reset pagination/current row. The service caps a result at 100 distinct entities and 50 evidence items per entity. All combines canonical lookup with a later saved-mention lookup; coverage can be incomplete. The view refetches the chosen canonical entity before binding. Database identity writes are independent of native document Undo.

Scry defaults to Local blend; ordinary LER defaults to Vault. Local blend currently filters fallback annotation/history names by the entity query; it is not an exhaustive unfiltered Document Entities browser. Stream does not currently control that local filtering. Preserve this as a named legacy source recipe rather than treating it as the new document contract.

The existing listing counts linked segments once by `annotationId`, ordinary properties by content plus property ID, and repeated presentations once while retaining multiple preview ranges. Citation/article block references are also counted. Invalid text offsets are excluded from preview ranges **after** identity counting, so current totals can include references without navigable text. Canonical name loading uses a source-authorized listing endpoint; `get` uses the less restrictive selected-vault lookup path. Copying the listing's name-loader policy would unnecessarily require saving a new document before full canonical enrichment.

With Window Manager, `watchTarget` allows unrelated commits to advance the revision fence while target-content or ancestor changes invalidate the target. Without that capability, ordinary intervening commits close the unresolved tool. Window Manager also reuses an existing LER for the same document occurrence; older guide statements about always closing the previous panel are not a complete description of this baseline.

### Coverage boundaries

| Source | What it includes | What it must not imply |
| --- | --- | --- |
| Vault Name/Alias | Canonical selected-vault knowledge | Document membership or local occurrence counts |
| Vault Mention / All mention evidence | Saved indexed mentions | Current unsaved document text |
| Current Document resolver scope | Saved resource membership combined with the selected stream/match | All entities in the current live document |
| Live inventory | Current entity annotations plus supported block references | Unlinked matching text, canonical alias completeness or exhaustive valid ranges |
| Scoped mention search | Supported text sources, with annotation eligibility per range | Guaranteed full coverage when adapters or result limits exclude content |
| Recent usage | Session/local preference entries | Entity membership, annotation counts or identity authority |

## Proposed interaction specification

### Command and text editing modes

An explicitly opened LER starts in **Command** mode with focus in the candidate list and the initial query displayed in an editable field. Up/Down selects; Enter links; 0–9 links the corresponding row. A visible **Edit query** action, F2, clicking the query, or tabbing into it enters **Edit** mode. An unassigned printable character automatically enters query editing and inserts that character, replacing the initial selected query on the first handoff. Reserved operators and numbered result shortcuts retain command meanings. F2, Tab and pointer editing remain available.

Inside the query, all ordinary text, punctuation, numeric input, caret movement, select-all, word deletion, clipboard and input Undo remain native. Up/Down may navigate suggestions; Enter links the active candidate, except during composition. Escape leaves editing, retains the query and returns to Command mode. The next Escape closes the instrument. Clicking the close button always requests close directly, subject to existing in-flight write guards.

The compact body also runs in the existing inline Scry shell. **Inline source editing is a distinct focus mode**, not a reason to intercept source punctuation as LER commands. Opening through a bracket trigger retains source focus and existing mention-versus-autocomplete semantics; explicitly focusing the LER candidates enters Command mode. This preserves the existing source-editing fast path while making explicit LER invocation command-first. An active label distinguishes “Editing source”, “Editing query” and “Commands”.

Do not install a document-wide punctuation handler. Dispatch only within the focused instrument's command context, after checking composition, modifiers, native controls and geometry controls. Pointer hover may change visual emphasis but must not silently alter a keyboard-selected identity immediately before a link.

### Search dimensions and Document Entities

Keep **Source/Scope**, **Field** and **Match** independent. Optional entity-type filtering is deferred. The visible chips report actual active values; opening a menu never changes a value until selection.

- Vault and Saved document keep existing resolver semantics and invocation defaults.
- **Document Entities** is a new live source. First entry shows every owned linked entity with an empty local filter, even if the graph query is “Liszt”. Preserve the graph query for return. The one visible query field switches between `B.graphQuery` and `B.documentFilter`; this is still entity discovery, not mention-query C.
- Within Document Entities, Field choices Name, Alias, Mention or All apply to cached canonical names, canonical aliases, and linked surface strings respectively. Match retains Exact/Partial semantics. No unlinked text search occurs.
- Show totals for the full owned document and, when filtering, “N of M entities”. Sort by descending logical linked occurrences, then canonical display name, then entity ID. Keep selection by ID while data updates, never by a recycled row index.
- Recent scopes remain available where currently supported. Do not silently reinterpret “This session” as document membership.
- Entity-type filtering is deferred. `#` is ordinary query text, not an active command; there is no Type chip.

### Linking, inspection and preparing

**Enter/index in entity results** resolves and validates the candidate, then links the current accepted collection in one action. Initially that collection is A. There is no compulsory confirmation. If the collection has been expanded, the footer says “Enter links N ranges”; the preview and count are already present. Empty, stale or unreviewed collections block linking with a concrete reason. Never fall back from an empty expanded collection to A.

**Right Arrow** in Command mode opens the selected entity inspector. It reads details and does not prepare, link, rename or create anything. Left Arrow/Escape closes that inspector and restores the selected result.

**Shift+Enter / Prepare entity** resolves the selected entity and stores a prepared identity without annotating. The prepared chip offers Review source matches, Link accepted ranges and Clear preparation. This works with no selection as a discovery-only session. Changing query B does not silently retarget the prepared entity; preparing another result is explicit. Enter on another entity result links that displayed identity, while Link on the prepared chip uses the prepared identity. Both destinations are named in their action labels.

Expose Prepare entity in the `/` command interface. Reserve `|` for Feature Two; it must not create a panel, silently link, or pretend to launch composition in Feature One.

### Source expansion and existing advanced review

In Command mode, Ctrl+A (and Command+A on macOS) runs **Expand original selection**. It uses the immutable text expression captured from A, never B. The first invocation creates a temporary preview and opens review. Repeating it selects all eligible matches across pages only if coverage is complete; it does not broaden scope progressively or persist anything. Inputs always retain native select-all.

Default expansion rules are literal, case-insensitive, whole-word matching in the owned document, within a single Block/text run. Whole-word checking is appropriate when the expression has word-like edges; punctuation-only or partial-token selections use explicit literal substring mode displayed in the preview. No normalization of accents, whitespace or punctuation is implicit. Match-case and word-boundary choices are adjustable and recorded. The existing advanced review's case-insensitive default remains its own behavior; do not silently change it when adding this new command.

For multiple original ranges, preserve the ranges as one original group. Do not join their text with spaces and pretend the joined string was selected in one Block. Cross-Block A remains directly linkable; automatic expansion is unavailable until the user explicitly chooses a Block-local expression in advanced review. Explain that choice in context. Container/Page narrowing remains available; do not invent Section scope until there is a real structural mapping. Hidden/collapsed owned text is eligible; foreign transclusions and nested Documents are not.

Keep the existing arbitrary mention-query review behind **Review other mention text** after preparing an entity. This is the existing C workflow, not a new downstream instrument. Retain regex, scope, manual checks, exclusions, reveal, partial coverage and bulk commit. User-entered alternate expressions, especially pronouns, begin unchecked and require review. Do not automatically infer that “he”, “him” or another ambiguous form refers to the prepared entity. No linguistic pronoun detector is required: treat arbitrary C queries uniformly as review-required.

Source expansion also remains a preview, not a claim of semantic identity. Literal complete matches may be provisionally checked, but the action label exposes the collection count and the review view allows exclusions before the user commits. Conflicting entity links are excluded; exact same-entity links are shown as already linked and become no-ops. Other annotation types/styles are preserved. Overlapping candidate ranges cannot both be accepted. Never automatically retarget or remove an existing entity annotation.

Boundary adjustments modify a working target derived from A, with an “Adjusted source” label. A remains inspectable and restorable. Expand original always uses A; “Expand adjusted source” is a separate explicit review action. Recovery after a stale source adopts a new working target without erasing the original origin record.

### Back navigation and accessible mouse equivalents

Escape closes the deepest transient menu or inspector first, then exits query editing, then closes LER. Returning from review keeps the target collection and its visible count; **Reset to original** explicitly discards expansion. Escape during composition belongs to the IME. Escape during window move/resize cancels that geometry operation before any LER action. Canonical-write retry receipts retain existing close guards.

Every shortcut has a labeled button or menu equivalent. Tab/Shift+Tab traverse query, mode chips, candidate composite and contextual controls in visual order. Use a listbox for command browsing with one tab stop, stable option IDs and announced selection; place action buttons outside the options. While editing, associate the query combobox with the candidate list using `aria-controls`, `aria-expanded` and `aria-activedescendant`; keep DOM focus in the input. Preserve native editing behavior. See the [W3C combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).

Focus and selection must be visually distinct. After closing an inspector, restore the invoking control; after closing LER, restore the still-valid source or a safe surviving document focus. Use polite, coalesced result/count announcements rather than reading every partial result. These follow the [W3C keyboard interface guidance](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/). Test VoiceOver and NVDA manually; markup alone is not qualification.

## Compact layout proposal

The standalone view currently initializes near 1,100 px wide and 76% of viewport height, with a 480 × 320 minimum. Scry initializes around 75% of viewport width and 560 px high. The redesign target is **560 × 440 CSS px**, constrained to available viewport space; minimum practical width is about 360 px. This is a proposed layout budget, not a measured usability result.

Use roughly 30 px title, 22 px source line, 38 px query, 28 px mode strip, 240 px result viewport and 30 px footer, with remaining space for padding. Graph rows target 24–28 px with one-line name/evidence. Document Entities rows target 34–38 px with a second line of truncated mentions. Fit ten graph rows or approximately six document rows in the default viewport. Keep ten-result pages and number only rendered, actionable page rows; a smaller viewport scrolls those rows within the list. Increase row height for text zoom rather than clipping labels or shrinking type.

```text
Link Entity Reference                         Help  ×
Source: “Liszt”                            1 range
Search entities  [Franz Liszt                    ] Edit
[Vault ▾] [All fields ▾] [Partial ▾]       Commands
0  Franz Liszt                      name match
1  Liszt Society                    alias match
2  ...
                         [Details] [More actions ▾]
10 candidates     ‹ 1 ›     Enter Link · ⇧Enter Prepare
```

```text
Document Entities                         Commands
Filter linked entities [                         ]
[Owned document ▾] [All fields ▾] [Partial ▾]
0  Franz Liszt                                  14
   Liszt · Franz · F. Liszt                  +2 forms
1  Marie d’Agoult                                6
   Marie · Countess d’Agoult
32 entities · 87 linked occurrences       ‹ 1 ›
```

```text
Review source matches                      Back  ×
Original: “Liszt”        Prepared: Franz Liszt
[Owned document] [Ignore case] [Whole words]
☑ Original · Liszt ...
☑ ... Liszt wrote ...                       Reveal
☐ ... Liszt Society ...            existing link
12 accepted · 2 excluded · 1 already linked
[All eligible] [None] [Undo exclusion]   [Link 12]
```

Review and inspector replace the central results area by default. At wider user-resized widths, an optional inspector beside results is acceptable, but it must not become a required second column. UUIDs, complete evidence, aliases, description, type and record provenance belong in the inspector. Source controls, creation and authority import are task subviews. Coverage warnings use a concise badge with details available; creation uncertainty remains visible until resolved.

## Technical plan

### Feature boundary and rollout

Implement the redesign as the standard LER path, without a new feature flag, per the latest user instruction. Preserve existing entity-reference, SQLite and autocomplete switches and their defaults. No document format migration is required.

Introduce a feature-owned `LerSession` controller and a thin compact view. Extract only the state and commands needed by LER. Keep `PanelSession` as lifecycle authority and reuse the existing service and candidate controller. Avoid a generic instrument registry, universal pipeline payload or new history subsystem.

### Separate state contracts

The following is a proposed contract, not a declaration that these APIs already exist:

```ts
type LerState = {
  sessionId: string;
  context: {
    documentContentKey: string;
    documentId?: string;       // absent for a transient document
    viewId: string;
    ownerNodeKey: string;
    vaultContextToken: string; // opaque identity, not a file path
    generation: number;
  };
  origin: {                   // A, immutable for the interaction
    ranges: readonly SearchRange[];
    segmentTexts: readonly string[];
    capturedRevision: number;
    sourceKind: 'selection' | 'scry';
    provisionalSourceId?: string;
  };
  entityQuery: {              // B
    graphQuery: string;
    documentFilter: string;
    source: LerSource;
    field: 'all' | 'name' | 'alias' | 'mention';
    match: 'exact' | 'partial';
  };
  mentionQuery?: {            // C, disclosed existing advanced review
    expressions: readonly string[];
    options: SearchOptions;
    scope: OwnedDocumentSubscope;
    generation: number;
  };
  targets: {
    generation: number;
    origin: 'original' | 'adjusted' | 'expanded' | 'reviewed';
    groups: readonly TargetGroup[];
    matchingRules?: SourceMatchRules;
    coverage: 'complete' | 'partial' | 'pending';
    validatedRevision?: number;
  };
  prepared?: {
    id: string;
    name: string;
    canonicalRevision: number;
    contextGeneration: number;
  };
};
```

`TargetGroup` holds a stable temporary ID, versioned segments, expected text per segment, include/exclude state, conflict classification and current validity. Maintain content-to-group reverse indexes. Multiple segments belonging to one original selection form one logical annotation; each additional occurrence is a separate group. Do not flatten all matches into one shared annotation.

The immutable origin is a record of invocation, not perpetual mutation authority. Working source/targets may change independently. In Scry, A records the initial source or provisional source identity even when no authored range exists. The existing Scry adapter remains responsible for resolving the current draft and completing its atomic source operation. Preparing must not materialize a provisional draft; later linking must revalidate it through that adapter. Never serialize closures or provisional editor objects into a handoff record.

### Owned document membership

Create one adapter-level ownership enumeration shared by inventory and expansion. Start at the active canonical Document and follow owned child/owned-relation placements, excluding reference placements and nested Document roots. Index content keys once per membership generation, including collapsed/unmounted owned content. Repeated references to content already in that owned set remain alternative presentations, not additional ownership or count entries. Resolve presentation keys only for preview/navigation and final native mutation.

Do not infer ownership from DOM ancestry, visible rows, the current focused window, or the location of a shared annotation definition. A shared definition can live on a Workspace while its segments are owned by this Document. Count only owned segments; show a diagnostic for any logical annotation whose other segments lie outside the document, without importing those foreign ranges into expansion.

Unresolvable/ambiguous ownership yields an explicit unavailable/partial result; do not fetch foreign documents or adopt their content. Direct linking of a deliberately selected foreign presentation retains existing explicit-selection semantics, but owned-document expansion from that selection is unavailable with an explanation. It must not smuggle the foreign original into an owned bulk set.

The current `documentAnnotations` method is projection-based. Add a narrow canonical inventory capability rather than exposing `ReactiveEditor` to the feature. Extend text search with an optional owned-content membership constraint or a bounded source provider; apply it **before** source extraction/worker matching. Filtering foreign matches after a complete projected scan would still do unnecessary work and produce misleading coverage.

### Live Document Entities index

Use one leased index per editor session and canonical document identity, shared by LER and the separate listing. Release subscriptions when the last consumer closes. Keep occurrence/view maps separate so duplicate windows do not duplicate counts or change the originating vault.

Index logical links as follows:

| Record | Identity and count |
| --- | --- |
| Shared text annotation | Definition owner identity plus `annotationId`; count once across owned segments/presentations |
| Ordinary text annotation | Owned content identity plus property ID; one count per live annotation |
| Citation/article block reference | Owned content identity plus property ID; one block-reference occurrence |
| Repeated presentation | No additional count; retain reveal locations in the invoking view |
| Deleted reference | No count |
| Dangling or malformed reference | Diagnostic bucket; no fabricated navigable text occurrence |

For legacy properties without IDs, use a session-local fallback with explicit invalidation on property-list replacement; do not persist invented IDs during inventory reads. Separate unresolved entity identity from malformed range: a valid link to an unavailable canonical entity still contributes to linked identity totals and displays an unresolved-name indicator.

Count all valid supported logical links, including the existing block references, and disclose the breakdown: for example “87 linked occurrences: 84 text, 3 block references”. Block references have no invented mention string. Distinct-entity total includes those block-linked entities. The entity inspector shows the breakdown and any invalid-reference diagnostics.

For text links, extract only their linked spans. Deduplicate displayed mention strings by exact Unicode text after assembling a logical multi-segment mention in document order; keep actual source text for filtering and an explicitly spaced display representation across Block boundaries. Do not lowercase the stored surface or collapse case variants into one display item. Show up to three forms plus a remaining-form count, ordered by frequency then deterministic text order. Preserve full strings in the inspector. Counts measure authored links, not matching unlinked text.

Canonical names and aliases are a separate cache keyed by vault context and entity ID. Reuse `get` initially with bounded concurrency and cancellation for missing metadata, or add a bounded bulk lookup on the existing lookup route if measured scale warrants it. Do not call `summaries`/Facts preparation or the source-hash listing endpoint to enable local browsing. Local IDs/counts appear before enrichment. Name/alias filtering shows metadata-loading or incomplete status until required records are available; it cannot report an authoritative zero prematurely. Explicit rename/alias changes invalidate only the affected entity. Refresh revalidates external canonical changes.

### Invalidation and bounded work

Maintain three independently versioned concerns: membership/counts, linked surface text, and occurrence coordinates. Extend the adapter watcher with changed content/property identities rather than forcing every consumer to recollect the document from a signature-only notification.

| Event | Required work | Work excluded |
| --- | --- | --- |
| Type in B | Filter cached rows or issue existing debounced vault lookup | Document traversal, text extraction, membership rebuild, snapshots, layout reads |
| Type outside linked spans | Inspect only affected content's link metadata; mark shifted coordinates stale if needed | Count/name refresh, other-document reads, mention-string extraction |
| Type inside a linked span | Re-extract affected linked spans after the native edit; update those surface entries | Full inventory rebuild or canonical name requests |
| Delete last linked segment / retarget / create reference | Apply affected link/count deltas; enrich newly seen IDs | Rescan unrelated documents or the vault |
| Explicit annotation boundary change | Update affected surface and range entries; preserve identity totals | Refresh every entity summary |
| Structural ownership change | Update affected subtree membership; permit a coalesced document rebuild when the change cannot be localized | Whole-vault discovery or a rebuild for ordinary text edits |
| Undo/redo | Apply the same dependency rules with monotonic session epochs | Trusting a reused inline version after branching history |
| Resize, font, wrapping, zoom or scroll | Invalidate appropriate mounted geometry | Text membership or canonical lookup refresh |
| Close/dispose/context switch | Abort reads/searches, release index lease and decorations; invalidate generation | Late publications or annotations in a new document |

The existing watcher remains useful for reference membership, but it can rebuild its document signature after genuine reference/structure changes and has no surface-text event. Preserve its no-typing-rescan behavior while adding deltas. Do not subscribe a full `collectDocumentEntities` call to generic document revision changes. For a reference whose source text changes, “immediate” means the next coalesced update after the native edit, without requiring Save or user Refresh; commit validation remains synchronous.

Cache filtered/sorted derivations once per relevant index generation, not per row. Query filtering may scale with the cached entity/forms inventory; ordinary editor typing must scale only with affected text and annotations. Bound or chunk initial hydration so opening the tool does not block typing. No background document save, Markdown sidecar, vault discovery, persistence validation or full snapshot belongs in this path.

### Range lifetime, conflicts and atomic commit

Use existing versioned range snapshots and session decorations as the first implementation. These are conservative anchors: content/placement identity, version, expected source text and a stable group ID establish what was selected. They do not promise automatic tracking through edits.

When content changes, invalidate only target groups indexed to that content and remove their old overlays. An invalid accepted group blocks the entire commit until it is explicitly refreshed/reviewed or excluded. Do not silently drop it. Changes elsewhere advance the session fence without rebuilding the target collection. Structure changes revalidate affected ownership and presentation identities. Refresh recaptures ranges; exclusions transfer only when the same logical target is provably retained, not merely when old numeric offsets coincide. Deleted origins remain in A as historical origin with invalid status.

Before linking: resolve canonical identity in the original vault, assert session/generation currentness, validate all accepted ranges and ownership, compare expected text, classify existing entity overlaps, deduplicate logical targets, and detect overlapping accepted groups. Only then call the shared batch operation with a freshly validated repository revision. Any failure means zero annotation writes. The async entity read occurs before final range validation; never reuse a stale pre-await fence.

Retain the global revision fence at the mutation boundary. A local validity watcher permits a fresh fence only after affected targets have been validated; it is not permission to overwrite the revision on an old `SearchMatchSet`. Reuse source epochs where undo branches can repeat inline versions.

One Undo removes all annotations from the batch, one Redo restores them, and neither rewrites prose. Replace & Link remains its separate single-range operation. Scry provisional completion uses its existing `captureAnnotationBatch`/finish path so draft finalization and reviewed annotations remain one native operation. Native Undo never reverses canonical entity creation, rename, alias edits or authority import. Preserve creation's idempotent retry receipts and created-but-not-linked recovery; do not add cross-store rollback.

The current overlap checks can be quadratic over accepted matches. For larger collections, sort ranges per content and sweep intervals during preflight, while preserving multi-segment grouping. Keep the existing 5,000-preview limit and incomplete-coverage behavior initially; do not label a capped set “all”. A partial set may link individually accepted ranges, but cannot use Select all.

### Geometry and rendering

Reuse `SessionDecorations` and the renderer's shared range-fragment pass. The current [standoff renderer](../../src/rendering/standoff-editor-view.tsx), lines 448–575, caches identical ranges within one measurement pass; that is not a retained document-wide cell geometry cache. [The original renderer](../../src/library/original/modules/speedy/editor-new-2.js), around lines 3055–3092, retains previous/current cell offsets and is the design reference specified by AGENTS.md.

LER must not add independent per-row DOM scans or measurements. Initial layout, source anchoring and annotation previews should share valid occurrence geometry where available. Batch invalidated reads before SVG/DOM writes, retain previous geometry to skip unchanged output, and invalidate on edits/reflow, fonts, resize, transforms and appropriate scrolling coordinate changes. Release removed occurrences. If shared caching requires an extension, keep it in the renderer/measurement service and qualify its cost before increasing preview density. Never substitute an unconditional rAF whole-document sweep.

`SessionDecorations.attachMatches` rebuilds layers today. Avoid calling it on entity-query keystrokes or repainting all candidates when only entity metadata changes. Explicit review toggles may cost proportional to the reviewed collection; typing must not inherit that cost.

## Keyboard conflict matrix

`Primary` means Command on macOS and Control elsewhere. Recommendations are scoped to Command mode unless stated otherwise; native fields, composition, AltGraph and explicit window geometry always take precedence.

| Key | Existing behavior or conflict | Recommendation |
| --- | --- | --- |
| Ctrl+`;`, then `r` | Registered direct/cross-Block entity command | Preserve on all platforms |
| Ctrl+`;`, then `l` | Separate document listing | Preserve |
| Ctrl+`;`, then `a` | Scry selected-text autocomplete | Preserve invocation and source semantics |
| Enter | Links normally, nominates in current review; source completion also consumes it | In entity results always Link; review buttons keep native activation; composition never links |
| 0–9 | Current page-local immediate choice outside fields | Preserve displayed 0-based indices only in command candidate context; native digits in fields/source |
| Up/Down | Candidate navigation; native select behavior; geometry movement | Navigate candidates in command/query context only; controls/geometry take precedence |
| Home/End | Current non-field first/last result; native caret elsewhere | Preserve contextual behavior |
| Right Arrow | Native caret movement, source boundary family, header movement | Inspector only in command candidate context, with no modifiers |
| Left Arrow | Same conflicts | Back from inspector only in command context |
| F2 | New explicit query-edit command; OS may require Fn | Recommend plus visible Edit button and Tab path |
| Escape | Currently closes LER; IME cancel and geometry cancel | Deepest subview/menu, then edit-to-command, then close; existing write guards remain |
| Tab/Shift+Tab | Native traversal and source completion exit | Preserve traversal; no global trap in nonmodal LER |
| Ctrl+A / Primary+A | Existing review/select-all; special workstation Ctrl+A handling runs before field check | Expand A only in command context; remove field interception in redesigned path, including contenteditable and native fields |
| Primary+Shift+A | Registered Find other occurrences; browser tab-search conflicts possible | Keep remappable compatibility binding where delivered; expose Review other mention text in the command interface |
| Space | Candidate checkbox toggle; native button activation/text | Toggle only a focused review row; preserve native behavior elsewhere |
| Ctrl/Meta+Backspace | Current query-clear binding steals native deletion | Clear only in command context; native word/line deletion in inputs; expose Clear query |
| Alt+S/M/V | Current hardcoded stream/match/scope; Option character input conflicts | Move to registered, remappable command-only compatibility actions; never consume in fields |
| `*` | Ordinary punctuation/wildcard expectation; Shift+8 keyboard layout variation | Toggle Exact/Partial immediately in command mode; no implicit regex/wildcard syntax in B |
| `@` | Ordinary query punctuation; source autocomplete trigger | Cycle All/Name/Alias/Mention immediately in command mode; literal in B/source, keeping existing source trigger policy |
| `#` | Literal hashtags/type proposal; no current resolver type filter | Deferred; ordinary printable query text, with no Type command |
| `/` | Existing source slash commands and literal query punctuation | Open LER-local command menu only in command mode; no new pipeline parser |
| `~` | Literal punctuation; dead-key/non-US layout concerns | Cycle scopes immediately with clickable scope chip; use `event.key`, not a physical US key |
| Shift+Enter | Distinct from Enter; can insert line breaks in editable fields | Prepare entity only in command candidate context; button and Prepare entity command equivalent |
| `\|` | Future composition and literal query punctuation | Reserved in Command mode with Help explanation; literal in fields; no Feature Two action |
| Ctrl/Alt/Shift+Left/Right | Existing Scry start/end character/word adjustment; OS conflicts | Retain only in source-edit context; inspector buttons remain accessible alternative |
| Alt/Option+Left/Right | Scry end-word adjustment alternative; ordinary word navigation in fields | Preserve source-only handling; never adjust A from query field |
| Primary+S/Z/Y | Save, native history, provisional Scry interception | Preserve existing routing; no query-clear, link or preparation side effects |

Register actual redesigned actions in the binding registry instead of mixing displayed remappable labels with hardcoded handlers. Use its conflict checks and test the autocomplete handler's precedence as well as LER's handler. Provide no-modifier guards for number/Enter shortcuts so platform/browser combinations are not accidentally treated as links.

## Implementation sequence after approval

| Increment | Concrete changes | Exit condition |
| --- | --- | --- |
| 1. Session and compatibility | Extract A/B/C, working targets, prepared identity, lifecycle and command actions from `search-view`; make the redesign the standard path | Existing invocation/recovery/Scry tests pass; preparation changes no document state |
| 2. Owned live inventory | Add adapter-owned membership, logical link index, surface deltas and bounded canonical metadata cache; connect Document Entities | Unsaved counts/forms, foreign exclusion, repeated-presentation deduplication and bounded-work tests pass |
| 3. Compact command view | Query handoff, active chips, dense results, inspector, command menu, focus/IME handling; reuse shells | Single-action linking, keyboard matrix, accessible mouse paths and viewport checks pass |
| 4. Source expansion and review | Ownership-constrained matching, immutable-origin expansion, temporary groups, exclusions, invalidation and existing batch commit | All-or-nothing validation, one Undo/Redo, ambiguous C review and Scry draft batch checks pass |
| 5. Preserve advanced controls and qualify | Creation/recovery, rename/aliases, authority staging, history scopes, replace-link, boundaries; type filtering deferred | Capability inventory accounted for; browser regressions and real Flint cost comparison pass |

The latest user instruction supersedes the earlier flag requirement. Implement the complete flow directly, without a new feature flag or duplicate legacy view. Enter links accepted ranges; Shift+Enter prepares an entity.

Entity-type filtering is deferred by the implementation authorization: the compact redesign must not depend on it. Its inclusion would extend `EntityResolutionQuery` and the existing SQLite lookup query, with tests proving filtering precedes limits and remains independent of field, match and scope.

## Test and acceptance plan

### Baseline evidence

The following focused command passed on this code baseline: **9 files, 81 tests**. This verifies existing behavior and reuse points; it does not qualify the proposed UI or establish browser typing latency.

```sh
npx vitest run \
  src/features/entity-references/search-view.test.tsx \
  src/features/entity-references/entity-candidates.test.ts \
  src/features/entity-references/candidates-view.test.tsx \
  src/features/entity-references/document-entities.test.ts \
  src/features/entity-references/document-entity-list.test.tsx \
  src/features/entity-references/lifecycle.test.tsx \
  src/application/document-entity-changes.test.ts \
  src/runtime/linked-annotations.test.ts \
  src/runtime/text-search.test.ts
```

These include atomic batch Undo, stale/cancelled target rejection, original/query independence, uncertain creation retry, live listing updates, shared-annotation counts, repeat-presentation deduplication, no inventory work on typing, delayed range resolution and dirty-content search caching. Update tests that expect Enter to nominate: the authorized behavior is immediate linking, with preparation tested separately.

### Required implementation gates

| Area | Acceptance and meaningful regression |
| --- | --- |
| Fast path | Selected A + candidate + Enter/index produces one annotation action with no confirmation. Cross-Block original keeps one logical identity. Empty selection can browse/prepare but cannot accidentally link. |
| Input separation | A remains unchanged after B edits, mode switches, boundary adjustment and C review. Expanding “Liszt” after searching “Franz Liszt” matches A. Graph query survives entering unfiltered Document Entities. |
| Live document | Unsaved create/delete/retarget, boundary edits, inside-mention typing, last-segment deletion and Undo/Redo update appropriate rows/totals without Save. Nonmatching canonical names remain browsable. |
| Ownership | Foreign transclusion excluded from inventory and expansion; owned repeated content counted once; collapsed/unmounted owned content included; nested Document excluded; multiple windows do not multiply counts. |
| Mention strings | Repeated strings deduplicate without collapsing case variants; cross-Block logical links assemble deterministically; block-only links show no invented text; invalid ranges and unresolved entity metadata are distinct. |
| Search | Stream/match/scope remain independent; saved and live coverage labels differ; name/alias enrichment failures do not erase local counts; partial metadata cannot masquerade as complete zero results. Optional type filter precedes server limits. |
| Review | Literal punctuation, case, words, Unicode/graphemes, inline media, multi-Block originals, overlapping matches, already-linked and conflicting links, exclusions, undo exclusion, all-pages selection and partial coverage. C pronouns start unchecked. |
| Atomicity | Inject a stale range/ownership change after async entity resolution: zero writes. Large accepted batch: one commit and Undo/Redo entry, one payload update per affected content. All-already-linked is a no-op. |
| Editing while open | Invalidates only affected target groups; old highlights cannot return after toggle/late worker completion. Unrelated edits preserve valid targets and preparation without full scans. |
| Keyboard | Command vs input vs source vs review vs geometry contexts; 0/9 numbering; modifier guards; numeric names; `* @ # / \| ~` literal input; Ctrl/Meta+A; native deletion; remapped bindings; composition Enter/Escape and dead keys. |
| Accessibility | Keyboard-only task completion, visible focus, selected-option announcements, no nested option buttons, mouse equivalents, zoom/small viewport, VoiceOver and NVDA. No unexpected document mutation on blur. |
| Existing capabilities | Create with equal names, separate canonical name, retry same receipt, created-but-not-linked recovery, rename/aliases, Replace & Link, source boundaries, recent history clearing, authority staging and existing GND limits. |
| Lifecycle | Reopen/focus existing LER, close while reads are pending, guarded canonical writes, disposal, document removal, vault switch and Window Manager hide/close. Late work cannot write or repaint. |
| Persistence | Preview/preparation/query changes leave native document, dirty state and history unchanged. Link marks only affected document dirty. Manual Save retains opened filename and Mutable JSON behavior; no sidecars/background saves. |

### Performance qualification

Add counters/spies to real adapter/controller paths, not a reimplementation of their algorithms. Compare an affected Block against fixtures with substantially more unrelated Blocks, annotations, documents and Explorer rows.

- Each B keystroke: **zero** document traversals, annotation-inventory rebuilds, full snapshots and LER layout reads. Cached filtering is permitted; vault requests follow the existing debounce/cancellation policy.
- Ordinary typing outside linked spans: **zero** inventory rebuilds, name requests, surface extraction and unrelated row publications. Changed-Block annotation inspection and range invalidation are permitted.
- Typing within a linked span: extract only affected surfaces; **zero** unrelated entity row publications, canonical requests and whole-document scans. Add a branch-after-Undo case so repeated inline versions cannot reuse stale text.
- Moving an annotation without changing its text: update range validity, not names/counts. Opening/closing a second consumer must share the same document subscription and release it after the last consumer closes.
- Expansion runs only on explicit request/rule change, not on B edits or generic revision notifications. Cancellation prevents obsolete worker publication. Commit costs follow accepted targets and affected contents.
- Geometry tests count layout reads for invalidated mounted occurrences and shared range consumers. No preview implementation may independently measure the same valid range per consumer or sweep all document cells on typing.

Capture a baseline and paired after-change measurements using [benchmark-flint-typing-browser.mjs](../../scripts/benchmark-flint-typing-browser.mjs) on the same fixture, browser and machine. Include LER closed, Document Entities open, review open, editing outside/inside linked spans, many repeated ranges, and 0 versus 1,000 unrelated vault entries. The existing script needs scenario instrumentation for open LER; an unmodified closed-tool run alone cannot qualify these changes. Record handler, queued work, layout reads, request counts and p50/p95 timing distributions. Inspect visible caret/selection/IME behavior in a headed browser. Headless frame timing is diagnostic, not guaranteed input-to-display latency.

After implementation, run `npm run typecheck`, focused suites including new controller/index coverage, relevant autocomplete/provisional-integration tests, and the existing entity/browser/Scry checks. Review browser scripts before use: the entity-selector script exercises canonical creation and needs a disposable fixture vault/service. Do not run that creation check against the user's real vault. Broader checks are driven by actual changed dependencies rather than repeated full-suite runs without a new reason.

## Feature Two handoff

The stable boundary is a leased LER session and a narrow prepared selection descriptor: entity ID/canonical revision, immutable origin identity, current temporary target collection ID/generation, matching rules, document/view identity and original vault-context token. This is a proposal for reuse, not a universal serialized pipeline schema.

A later consumer must acquire an explicit session lease, resolve current targets through the owner, and revalidate before a mutation. Closing the last owner releases decorations, pending reads and temporary ranges. Feature One's controller lives outside transient view subcomponents so inspector/review transitions do not destroy it; no state survives application reload by default. Do not keep a disposed `PanelSession`, DOM node or service closure as a durable payload.

Questions for Feature Two, without designing it:

- Who retains and releases the session if the original LER presentation closes?
- Does the later action consume a snapshot or follow explicit target-collection revisions?
- How are source invalidation, entity retargeting and provisional Scry source lifetimes presented to an earlier stage?
- Which actor owns final commit, cancellation and return focus when another stage holds the preparation?
- Can a prepared entity cross documents/vaults, and what new authority is required if so? Feature One grants none implicitly.

There is no dependency on a carousel, horizontal panel arrangement, composition engine or Feature Two window presentation.

## Review decisions

The plan recommends explicit Command/Edit focus, an unfiltered live Document Entities source alongside preserved saved lookup, case-insensitive source expansion, conservative range invalidation, and Shift+Enter preparation with `|` reserved. Implementation is authorized for all five increments. Keep A, a compact prepared-entity object and the accepted range count visible throughout review. The subsequent instruction explicitly removes the feature flag and makes this the standard LER path. No pipeline handoff infrastructure, broad renderer changes or Window Manager redesign is authorized. Implementation evidence and remaining manual checks are recorded in [LER_REDESIGN_QUALIFICATION.md](LER_REDESIGN_QUALIFICATION.md).
