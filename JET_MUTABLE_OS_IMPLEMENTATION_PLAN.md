# Jet — Mutable OS implementation plan

**Status:** proposed for review; planning only.  
**Basis:** `JET_MUTABLE_OS_PLANNING_BRIEF.md`, supplied Jet mockup, and audit of the current reactive implementation on 29 September 2026.  
**Scope:** a Window-hosted knowledge application assembled from existing Blocks and services, plus a bounded Markdown editing experiment. No feature implementation is authorized by this document.

## 1. Recommendation

Build Jet around one existing Mutable repository/editor and ordinary Documents. Reuse core Windows, tab rows/panels, text editing, standoff annotations, structural commands, identity materialization and persistence. Keep the vault navigation, three-column layout, document-opening policy and contextual panel selection in Jet.

Two proofs must precede the full application:

1. Render a canonical Document through a tab reference, edit it, close the tab/application and save/reopen without copying, moving or losing its data.
2. Qualify inline Markdown syntax visibility against real browser editing. Existing concealment is useful evidence, but does **not** establish a complete syntax-aware caret/selection contract.

The audit also found that a reactive `GraphViewBlock` and a universal `ApplicationBlock` do not currently exist. Do not present these as ready-made capabilities. Add one Jet application Block and, if the graph stage is approved, one small reusable graph-view Block. Do not introduce an application framework or graph database.

Use a `jet` feature flag **enabled by default** when implementation is approved, following the user's standing policy. Markdown visibility remains subject to its qualification gate; a failed proof must be reported rather than silently shipping an incomplete Contextual mode.

### Are there any showstoppers?

No confirmed showstopper was found for the Window-hosted vault, tabs, native Documents, properties, links and backlinks. This is a source audit, not a successful execution of the proposed proofs.

**Contextual Markdown is the potential blocker:** if correct concealed-syntax editing requires a replacement selection engine or substantial core reconstruction, stop that track and review scope. Jet's knowledge-workspace track can proceed independently after an explicit decision; a Visible-only prototype would not satisfy the Contextual requirement.

**Whole-Document tab persistence is a prerequisite:** references and identity materialization exist, but ownership, shared definitions and the actual save paths must be qualified together. Failure of that proof blocks the proposed tab strategy until a bounded alternative is demonstrated.

The composite application host, live backlink projection and generic graph view are missing capabilities with concrete bounded proposals, not fundamental blockers. Their scope should remain visible during review.

## 2. Repository audit: what exists and what does not

The repository still uses Codex/Speedy names. “Mutable” below describes the requested product architecture; no broad rename is proposed. Active reactive code is the authority. Classes and services under legacy `src/blocks`, `src/components` and `src/library/original` are not automatically usable in the current application.

| Jet concern | Current evidence | Recommended use / actual gap |
| --- | --- | --- |
| Window host | [WindowView](src/rendering/core-block-views.tsx), [Window application guide](docs/development/CREATING_WINDOW_APPLICATIONS.md) | Reuse `window-block` movement, resizing, focus and authored geometry. Put Jet controls inside its content. No nested document Windows. Canonical Window has no implemented maximize control; mockup window buttons are not a mandate to add one. |
| Application lifetime | [BlockRuntime](src/feature-api/index.ts), [capability adapter](src/application/feature-capabilities.tsx) | Existing hosted Block applications own fields and disposal. However, `mountWidget` installs **opaque-widget** input policy and exposes no child-rendering capability. A composite application containing live editors needs a narrow host-owned child slot and container mount; it cannot simply wrap its editors in an opaque widget. |
| Tabs | `TabRowView` / `TabPanelView` in [core views](src/rendering/core-block-views.tsx) | Registered `tab-row-block`, `tab-block` and document aliases; active panel mounts through `BlockOutlet`. Reuse them. Per-tab close controls, activation notification and robust text-focus restoration need a bounded adaptation, not new tab state alongside existing tab state. |
| Documents | [core registration](src/rendering/register-core-views.ts), [Document container](src/rendering/container-block-view.tsx) | Ordinary `document-block`, existing standoff/plain text and optional Document formats. Formatting bars are currently attached to Document Window hosts; Jet must reuse a core-rendered, active-document-scoped toolbar rather than nest a Window or invent formatting commands. |
| Shared content | [commands](src/block-tree/commands.ts), [projection](src/block-tree/projection.ts), [identity](src/block-tree/identity.test.ts) | `transclude` adds a reference placement pointing to the same content key; `unlink` removes a reference. Projections distinguish occurrences and detect cycles. Prove whole-Document use in Jet and persistence before relying on it. |
| Persisted Document identity | [workspace manifest/materialization](src/reactive-editor/workspace-manifest.ts), [workspace opening](src/application/workspace-open.ts) | Stable Document identities, repeated-document materialization and conflicting-identity rejection already exist. Reuse their supported save/load paths. Do not persist private NodeKeys/content keys as public links. |
| Document reference UI | [DocumentReferenceView](src/rendering/document-reference-view.tsx) | This is an **unavailable-document placeholder with Retry/Relink**, not a live transclusion renderer. Live tabs should use reference placements, not this placeholder as an embedding API. |
| References and annotations | [standoff schemas](src/rendering/standoff-styles.ts), [linked annotations](src/runtime/linked-annotations.ts), [clipboard remapping](src/block-tree/clipboard.ts) | `codex/block-reference` already carries a Block ID in `value`, has an underline effect, and is recognized by identity remapping/history. Generic linked annotations share definition identity across segments. Document title lookup, link activation and unresolved/ambiguous target UX are missing application behavior. |
| Backlink queries | [historical index](src/history/index.ts), [historical queries](src/history/query.ts), linked annotation segment lookup | Relationship extraction precedents exist, but no ready-made live Vault backlink service was found. Historical indexes are tied to exact historical state; Jet must not enable History or misuse a historical index as its live store. |
| Graph | [legacy Graph data helper](src/library/graph.ts), graph endpoints in [server](server/index.ts), [active registration](src/rendering/register-core-views.ts) | Legacy graph data and server entity graphs exist. No registered reactive GraphData/GraphView Block was found. Neither legacy database endpoints nor old graph viewers constitute a ready live Document graph. |
| Search | [TextSearch](src/runtime/text-search.ts), [worker/matching](src/runtime/search-worker.ts) | Existing cancellable, revision-aware text matching, context and reveal ranges. Traversal stops at nested Document boundaries. A Vault query must enumerate member Documents and aggregate/deduplicate results; searching the Jet root is insufficient. |
| Properties | Authored metadata, block/standoff properties; [annotation contributions](src/runtime/annotation-contributions.ts), [Entity property UI](src/features/entity-references/property-details.tsx) | Storage/commands exist; there is no general ready-made Document property sheet. Entity details are feature-specific. A small typed Document property form can use existing metadata commands without copying Entity UI or adding YAML storage. |
| Storage browser | [document browser](src/demo/document-browser.tsx), [document store](server/document-store.ts) | List/load/save JSON and existing local Workspace operations. The document-store router is not a complete folder/document CRUD filesystem service. V1 logical folders avoid requiring one. |
| Syntax concealment | [StandoffEditorView](src/rendering/standoff-editor-view.tsx), [Show/Hide](src/runtime/show-hide-projection.ts), [CSS](src/index.css) | Existing `style/show-hide` conceals Cells with `display:none`; Superposition also has specialized hidden-source rendering. Neither proves arbitrary Markdown syntax editing. Reuse lessons, not their feature-specific policy. |

### Structural vocabulary audit

| Markdown input | Actual reusable representation | V1 policy |
| --- | --- | --- |
| `# ` through `###### ` | Standoff text Block + existing `block/font/size` heading properties | Existing heading tokens are h1–h4; support those first. Leave h5/h6 literal unless a specific heading extension is approved. |
| `> ` | Existing `container-block` with text children and a small quote presentation property | No registered QuoteBlock found. Prefer one reusable quote treatment over a new Block type solely for Jet. |
| `- ` / `* ` list gestures | `indented-list-block` with ordinary text children | Existing list is a generic container with `role=list`, not a complete Markdown list-item engine. Prove continuation/outdent/empty-item exit. Ordered/task/nested lists are deferred unless the existing behavior makes a small addition straightforward. |
| Fenced code | `code-mirror-block` | Current reactive view is a textarea fallback explicitly awaiting CodeMirror migration. Reuse that honest capability; do not promise syntax highlighting. |
| Pipe tables | `table-block` → `table-row-block` → `table-cell-block` → text Blocks; grid aliases also exist | Convert a complete simple header/separator/body construct on explicit conversion or a safe completion boundary. Do not repeatedly restructure an incomplete table during typing. |
| `![alt](url)` | `image-block` or existing inline image support | Initially a standalone image Block, with existing URL validation and ordinary alt metadata. No attachment subsystem. |

## 3. Application composition and ownership

Proposed logical structure:

```text
Workspace
├── existing canonical Document owners (remain in place)
├── existing workspace-object-bank-block
│   └── container-block — Jet vault record / newly created Documents
│       └── DocumentBlocks created in this vault
└── WindowBlock
    └── jet-application-block
        ├── Vault navigation (Jet UI over membership metadata)
        ├── TabRowBlock
        │   ├── TabBlock → reference placement → canonical Document A
        │   └── TabBlock → reference placement → canonical Document B
        └── Context UI + optional generic GraphViewBlock
```

This diagram distinguishes structural Blocks from UI regions; every button, breadcrumb and backlink row need not become an authored Block. The vault container remains owned by the Workspace, outside the application Window. Closing a Window therefore cannot make its Documents unreachable. The existing object bank also supplies a core access path if Jet is unavailable; it is not a hidden duplicate editor. Reuse the one existing bank rather than inventing another bank ownership rule.

For existing Documents, vault membership is an association by stable identity. Adding membership or opening a tab must not change their existing parent. Newly created Documents may be owned by the vault container. There must be one canonical content record per loaded Document identity, even if Desktop and Jet display different occurrences.

**Recommended V1 vault:** one logical collection in the current loaded Workspace. Store a small versioned membership/folder record on the ordinary vault container: vault ID; folders with stable ID, parent ID and name; member Document IDs and folder IDs; and soft-deleted membership. Titles remain on the Documents, not duplicated as independent catalog truth. Open/active tab identity and UI widths are application state; do not put them inside Document content.

Create/rename/select/search operate on these loaded members. “Delete” initially means undoable removal to the vault's trash, preserving the underlying Document and other occurrences. Empty folders may be removed; nonempty folders must first have members moved or restored. Permanent deletion of server files and bulk recursive deletion are outside V1. The mockup's Recent/Starred/Home affordances may be omitted until they have defined behavior.

### Document tabs and persistence

Use authored `TabBlock` wrappers with reference placements for the initial proof. A tab ID is distinct from its target Document ID; open deduplicates by target identity within that Jet instance. Closing removes the tab/reference, never its canonical owner. Tab title is derived from Document title; if the existing tab renderer needs `metadata.name`, treat it as a synchronized display cache, not a second title authority.

Existing reference commands are a promising mechanism, **not proof that every save path is suitable**. Test both local Workspace materialization and server Workspace manifests for repeated Documents, identity conflicts and linked definitions. The legacy tree format can expand repeated content; standalone exports have loss constraints. Do not route Jet through the portable-codec spike or change the Workspace format opportunistically. If tab references cannot round-trip through the supported path, stop at the proof gate and report the exact failure. A transient host-rendered occurrence slot is the fallback to evaluate, not permission to introduce a second editor/repository.

Lifecycle tests must cover closing the whole Window, deleting its source owner, restoring undo, and opening the same Document elsewhere. Structural editing of shared/transcluded content has existing restrictions; preserve them and report their user-visible limits rather than quietly detaching a copy.

### Small capability additions

Keep these as application adapters capturing core privately:

- Vault catalog snapshot and bounded create/rename/membership/trash operations, restricted to this vault.
- Open/select/close a Document tab by stable ID; active Document accessor and focus/reveal action.
- A core-rendered child slot for the application's declared tab/graph children, and a **container** mount for the composite application. No arbitrary Block/DOM lookup API or opaque-widget ancestor intercepting Document input.
- A core-rendered formatting/status area scoped to the active Document, preserving existing target/range capture and toolbar commands.
- Read-only reference/search projections and existing property mutation commands.

Jet receives no `ReactiveEditor`, repository escape hatch, global service locator or unrestricted parent traversal. Native controls retain native input; child editors retain their ordinary mounts. These additions are concrete host composition needs, not speculative registry entries. Fixed three-column CSS with collapsible side panels suffices; arbitrary pane splitting is deferred.

## 4. References, backlinks, graph, properties and search

### Native document links

Prefer the existing `codex/block-reference` annotation: `value` is the target Document root's **authored Block ID**. Where `metadata.documentId` differs from root Block ID, resolve through an explicit identity mapping; never assume equality. Optional source/resource metadata must follow the existing external-target conventions when needed, without treating experimental external-resolution gates as a completed loader.

`[[The Raven]]` is lookup notation. On completion, resolve against vault members: unique match binds; ambiguous titles require a choice; missing targets remain visibly unresolved literal notation with an explicit resolve/create action. No automatic arbitrary choice and no silent creation on every incomplete token. Rename preserves the bound ID. Existing visible link text may remain as authored; a tooltip can show the current target title. Editing that label does not silently retarget a resolved reference.

Single-Block references can be ordinary local standoff properties. Shared multi-segment references use the existing linked annotation definition mechanism only when required. Reuse range validation, stale-revision rejection, authored annotation IDs and known-reference clipboard remapping. A `codex/block-reference` underline alone does not supply click navigation; add bounded reference activation with clear keyboard access and preserve ordinary text selection.

### Derived relationship projection

Build a disposable, rebuildable live projection from canonical member Documents' non-deleted semantic annotations, resolving linked definitions. Deduplicate canonical content and mention identities so tab/Desktop occurrences do not multiply backlinks. Presentation reference placements used to open tabs are **not** wiki-link edges.

Each result carries source Document ID, source Block/annotation identity, target Block ID, context and revision evidence. Resolve a current occurrence when navigating; after edits revalidate the range, revealing the source Block if precise text is stale. Preserve dangling links when a target is removed from the vault or unavailable. Keep “outside this vault” distinct from “deleted/unresolved.”

Start with a bounded on-demand scan for the loaded vault and cache by relevant revisions. Recompute changed source Documents and affected linked definitions using existing repository change notifications where practical. Do not serialize a backlink index or rescan all Documents for every caret movement. Backlinks and Graph consume this same projection. Reuse/extract a small pure reference iterator if warranted; do not import historical index lifecycles into Jet.

### Graph gap and minimal response

A minimal **generic** `graph-view-block` is justified if Graph is included: immutable node/edge snapshot, active node ID, selection callback, accessible node buttons/list fallback, and a deterministic local-neighborhood SVG layout. No physics engine, graph editor, graph persistence or database. Jet supplies Document nodes/reference edges and handles navigation; the renderer must know nothing about Jet titles, vaults or Markdown. The first graph shows the active Document and bounded neighbors, with a disclosed limit. It is not an all-vault analytics engine.

A separate GraphDataBlock is unnecessary while the graph is derived. Legacy `Graph` shapes may inform a neutral node/edge type, but importing the legacy object graph or SurrealDB does not save meaningful work here.

### Properties and search

Expose title and a small chosen set of ordinary metadata fields using typed native controls and existing commands. Show unsupported properties read-only and preserve them. The Entity panel is not a generic property form; no YAML/frontmatter storage is added.

Search titles directly, and reuse `TextSearch` per canonical member Document for text/context. Inactive tabs need not mount an editor to search their canonical content/projection. Use one aggregate request cancellation/generation token, a disclosed result limit and revision revalidation. Opening a hit activates the Document then reveals the current Block/range. Search is limited to the loaded vault; do not promise full-disk indexing or silently load an entire server store.

## 5. Hybrid Markdown: representation and correctness contract

### Recommended proof representation

Keep recognized inline delimiters as ordinary authored Cells, with a small versioned syntax association linking their ranges to the existing semantic annotation ID. Semantic standoff properties remain authoritative for formatting/references. Syntax associations describe one supported textual spelling and the delimiter/auxiliary-source runs; they are not a second independently editable AST or document model.

For a URL link, association includes label, punctuation and URL-source runs. For a wiki link, its semantic annotation stores the resolved stable target, independent of displayed title. Initially recognize only a bounded subset: `**bold**`, `*italic*`, `~~strike~~`, `[label](url)` and `[[title]]`, with defined escaping and conservative handling of unmatched/nested constructs. Explicitly exclude CommonMark completeness. Unsupported/ambiguous syntax remains literal, and unsupported Mutable semantics remain fully usable.

Why retain Cells for the proof: existing persistence, undo and offset/range machinery can preserve actual typed source, and disabling Jet leaves readable syntax plus native annotations. Synthetic generated delimiters could avoid hidden authored characters but would require new editable synthetic positions and materialization rules; that is not a cheaper assumption. If the retained-Cell approach needs extensive core changes, report the blocker rather than switching to a second editor.

### One transaction, one authority

- Markdown-first: on a supported completion trigger, validate the current Block revision and atomically update text, semantic properties and syntax associations. Incomplete text remains ordinary text.
- Mutable-first: the ordinary semantic formatting command is authoritative. For representable ranges in a Jet-enabled Document, an explicit bounded adapter associates/inserts delimiters in that same undo transaction. Do not maintain agreement through asynchronous reciprocal observers.
- Visible delimiter edits: reconcile only affected owned syntax associations. Changing a valid spelling updates its mapped semantics; breaking/removing its delimiter pair removes that association and its specifically owned formatting in the same transaction. Preserve unrelated/manual annotations, including overlapping ones. Invalid intermediate strings remain literal; do not repeatedly “repair” the user's typing.
- Bound link labels remain labels through rename/edit. Retargeting is an explicit link edit or a newly completed unresolved token, not a title-based rewrite of all links.
- For overlaps or formatting without a safe Markdown spelling, retain Mutable semantics and decline synthetic source generation. Do not flatten annotations or downgrade Blocks to fit Markdown.
- Undo/redo restores the complete source/semantic/syntax change, including marker offsets. Pasting/cloning remaps association IDs only for copied semantic properties, using the existing narrow remapping approach.

A small deterministic per-text-Block scanner is sufficient. Scan changed Blocks at completion/paste/formatting boundaries; no full-document parser on caret movement, background reparsing loop or general event middleware. The exact command integration is a proof item: current core commands must be able to publish one compound change without a second history entry or recursion. Composition input bypasses recognition until commit.

### Visibility is a general editor problem

Current inline content is decoded by Unicode code point (`[...text]`), standoff endpoints are inclusive, and editing ranges are commonly half-open. Native text offsets are UTF-16; grapheme boundaries protect user-visible movement. `pointBoundary`, `restoreBoundary`, `inlinePointAt`, `inlineBoundary`, clipboard extraction and measurement all participate. Several paths index `flow.children` or derive positions from child text lengths. Hiding text can leave invisible stops even when child indices still exist.

Show/Hide and Superposition already use `display:none` in specific cases. They do **not** establish Markdown deletion, clipboard or boundary-affinity semantics. CSS-only concealment is therefore not an accepted implementation.

Prove a small paragraph-local mapping of model boundaries to navigable visible boundaries, with explicit leading/trailing affinity at each concealed run. Preserve model Cell indices and immutable measurement fragments; do not insert an independent selection engine or duplicate measurement observers. Core owns boundary conversion, selection normalization, hit-testing and measurement scheduling; Markdown owns which syntax runs should be visible.

| Concern | Required behavior for the proof |
| --- | --- |
| Hidden | Suppress only owned syntax runs, not arbitrary literal punctuation. Snap/skip invisible stops deterministically. |
| Contextual (preferred default) | Reveal the associated construct when the caret enters its semantic/source region; conceal on leaving. Keep affected syntax revealed throughout noncollapsed selection/drag and composition to avoid changing geometry under an active gesture. |
| Visible | All retained source Cells are ordinary editable text, with semantic formatting still represented by native annotations. |
| Mode switch | Update per-occurrence presentation state and affected inline runs; preserve model selection/affinity. No Document reconstruction, reparsing or authored history entry. |
| Arrows and mouse | Navigate graphemes, map hits near collapsed markers to a defined boundary, and support forward/backward selections across Blocks. No invisible trap or jump to a neighboring annotation. |
| Delete/Backspace | In Visible mode, delimiter edits are literal source edits followed by reconciliation. In Hidden/Contextual content editing, delete the visible character/grapheme first; clean empty constructs atomically. Never accidentally delete invisible markers instead of the intended character. |
| Clipboard | Default plain text is semantic visible content consistently across modes; rich Mutable copy preserves supported semantics/identity. An explicit Copy Markdown emits supported source notation. Existing clipboard currently copies model Cells, so this needs a scoped change—not a CSS side effect. Partial selections must not emit orphan owned delimiters. |
| IME/native controls | Freeze relevant syntax visibility and defer recognition during composition. Preserve composition offsets; menus, property inputs and search fields remain native controls. |
| Annotations/SVG | Keep authored semantic offsets stable through edits and map measurement to rendered fragments. Reuse centralized scheduling and suppress marker-only geometry; verify selected text, Grouping and one Entity annotation. |
| Disposal/absence | Removing the feature restores ordinary full source rendering; text and annotations survive. No stale selection callback, parser job or effect remains. |

Plain typing outside a recognized construct should take the existing fast path apart from a cheap enabled/trigger check. Visibility changes belong to the mounted occurrence, not shared authored Document state; two views may use different modes without rewriting each other's text.

If safe clipboard/selection integration turns into a broad layout or selection rewrite, stop. A Visible-only editing prototype is a useful review artifact, but changing the requested default requires review; it must not be reported as successful Contextual editing.

## 6. Visual interpretation of the mockup

Use the mockup's charcoal surfaces, warm reading text, restrained blue links, fine panel borders, clear document tabs and compact peripheral information. Retain the three-region hierarchy and generous central reading area. Treat the Raven illustration as content in an existing Image Block; acquiring matching artwork is not an architecture prerequisite.

Use existing core Window chrome and Jet's own small header/content toolbar. Breadcrumbs derive from logical vault membership, not a claimed disk path. Backlinks and Properties can be right-panel tabs; Graph can be a bounded region below them. Collapse side regions at narrow widths, keeping navigation accessible. Do not duplicate inactive editors for previews. The mockup's fabricated timestamps, backlink counts, word counts and graph nodes must be replaced by real values or omitted.

A dark Jet shell should not overwrite authored colors/themes in existing Documents. Begin with normal live Document rendering inside the shell, then qualify a narrowly scoped inherited reading palette. Existing explicit Document format themes remain authoritative. No general theme engine or application-header framework is needed.

## 7. Staged implementation and stopping points

Each milestone is independently reviewable. Approval of this plan should not be treated as permission to bypass a failed prerequisite.

### A — Application composition and identity proof

One ordinary Window, one Jet application Block, one declared tab-row slot, two existing Documents and vault membership outside Window ownership. Implement only the necessary composite host/container capability. Exercise open/edit/close/reopen, same Document in another view, rename, duplicate identity rejection, local/server-manifest round-trip and unknown-feature preservation. Audit toolbar scope and selection restoration.

**Acceptance:** one canonical Document per identity; no reparent/copy on open; no loss on Window close; no nested Window; no editor passed to Jet; no opaque-widget interception of text. **Stop for review** if reference persistence or composite mounting requires substantial core changes.

### B — Markdown inline architecture proof

Start with bold and one wiki reference in an ordinary live Document. Prove transactional recognition and Mutable-first formatting, retained-source association, all three visibility modes and the boundary/clipboard/IME contract above. Include manual delimiter damage, undo and feature disablement. This is the highest-risk milestone; avoid building all parser cases before the mechanism is sound.

**Acceptance:** Contextual editing is reliable in real browsers; toggles do not parse/rebuild Documents; ordinary typing retains its path. Compare the existing typing benchmark before/after in ordinary and active Markdown contexts. **Stop for review before broadening**; report a concrete blocker if a general selection rewrite would be needed.

### C — Useful vault, native references and context

Add logical folders and membership CRUD/trash, existing-Document admission, title/text search, stable wiki lookup/navigation, property form and derived backlinks. Complete bounded tab close/title/focus behavior. Ensure all asynchronous results reject stale context and all scoped services dispose when Jet closes. No filesystem compatibility layer.

**Acceptance:** a small real collection is usable; rename preserves links; closing/deleting a presentation cannot delete shared data; links and search reveal the right current occurrence; backlink counts exclude duplicated presentation occurrences. Review the working shell against the supplied mockup.

### D — Generic graph and structural Markdown subset

Add the reusable graph-view Block over the same relationship projection. Extend proven inline recognition to the remaining supported cases. Add headings, quote treatment, basic unordered lists, textarea code Blocks, simple table conversion and standalone images using existing structural commands. Each structural conversion must be one undoable transaction with a predictable caret destination. Table conversion waits for complete syntax or explicit action.

**Acceptance:** graph nodes navigate; graph/backlinks agree; structural constructs are real editable Blocks; unsupported constructs stay literal and richer Mutable Blocks survive. Defer a construct rather than invent a new subsystem to claim Markdown completeness.

### E — Visual integration and bounded release review

Apply the dark-shell composition, responsive side panels and realistic content. Run focused end-to-end use, feature removal/disablement and persistence checks. Provide center/side-panel screenshots and a reproducible Contextual editing sequence. Document remaining format/Markdown limits. Stop for review; no plugin ecosystem, pane framework or full source view follows automatically.

## 8. Proportionate qualification

Reuse existing tests rather than building a parallel harness:

- Ownership/identity/undo: `src/block-tree/block-tree.test.ts`, `identity.test.ts`, `definition-ownership.test.ts`, and Workspace manifest/opening suites. Add a small Jet fixture for tab unlink versus canonical ownership and repeated-Document persistence.
- Input risk gate: focused standoff editor, grapheme, cross-Block selection, Grouping, clipboard and linked-annotation suites. Add table-driven cases for supported marker boundaries and reconciliation, including combining characters and emoji.
- Browser gate: native typing/caret, arrow navigation, pointer selection across collapsed markers/Blocks, both selection directions, Delete/Backspace, undo/redo, composition, copy/paste and menu/search/property focus. Use Chromium plus one independent browser engine for syntax visibility; record simulated versus real IME evidence honestly. Existing benchmark baseline for input-path changes only.
- Application integration: open the same Document from Jet and Desktop, switch tabs, rename a target, soft-delete membership, navigate a stale backlink/search hit, save/reopen, close the Window, and disable/remove Jet while preserving content. One inexpensive Canvas-scale smoke check for the live host is sufficient; no new Spatial programme.
- Structural conversions: a few representative complete/incomplete constructs, undo and correct focus destination. Graph test covers projection agreement, node activation and empty/dangling states, not force-layout matrices.

Physical removal should remove the Jet feature and assembly registration in a disposable copy. Core Documents must remain reachable in their existing owners/object bank; unknown Jet UI data must round-trip. If the generic syntax mapper remains, it must have no provider and no effect on ordinary editing. Removing Graph independently must preserve its unknown authored state and leave text editing functional.

## 9. Direct answers to the brief's fourteen questions

1. **Existing Blocks/services:** the audit table in §2 identifies active implementations and legacy-only precedents for every region.
2. **New Block types:** `jet-application-block`; a small generic `graph-view-block` if Graph proceeds. No new Document/editor type, universal ApplicationBlock hierarchy or GraphDataBlock is required. Quote styling can use an existing container.
3. **Documents inside tabs:** reference placements appear suitable, with canonical ownership outside tabs; §3 and milestone A make identity/persistence a proof rather than an assumption.
4. **Document references:** reuse `codex/block-reference` with authored root Block ID and explicit Document-ID mapping; title notation resolves once and does not become identity.
5. **Backlinks:** derivable from canonical semantic annotations, but a live Vault query/projection is missing. Use a rebuildable revision-aware cache, not a stored Jet index/database.
6. **GraphView consumption:** no active GraphViewBlock exists. A generic bounded renderer can consume the derived reference projection directly; no separate graph data authority.
7. **Inline syntax/standoff relationship:** native semantics are authoritative; retained source Cells have associated owned syntax ranges, maintained atomically.
8. **Safe concealment:** not established by current CSS hiding. It requires the focused boundary-affinity/caret/clipboard proof.
9. **Local/reactive visibility:** yes as the target design—per-occurrence mode plus affected-run state—but qualification must demonstrate it without reparsing or tree reconstruction.
10. **Manual delimiter edits:** reconcile the affected owned association and its semantics in one transaction; preserve unrelated formatting, unmatched literal text and stable link targets.
11. **Structural mappings:** §2 lists actual heading/container/list/code/table/image capabilities and their limits; do not assume QuoteBlock/ListItemBlock or a migrated CodeMirror exists.
12. **Smallest recognizer:** one deterministic per-text-Block scanner for a declared inline subset and small structural completion recognizers. No full Markdown AST, parser ecosystem or CommonMark promise.
13. **Postpone:** all explicit brief exclusions, rich filesystem CRUD, arbitrary pane splits, full Markdown source round-trip, complex graph layout, advanced lists/tables, theme/plugin compatibility and broad Window chrome work.
14. **Tests:** §8 concentrates qualification on the two real risks—identity/ownership and syntax-aware editing—with smaller application and structural smoke tests.

## 10. Decisions recommended for approval

1. One loaded-Workspace logical vault for V1, with canonical Documents outside the application Window and membership deletion distinct from data destruction.
2. Existing reference placements inside existing tab Blocks, contingent on the identity/persistence proof; never copy or move Documents merely to open them.
3. One composite Jet Block with narrowly injected child/editor-host capabilities, not an opaque widget containing editors and not a generalized application framework.
4. Existing `codex/block-reference` semantics; one derived live relationship projection shared by backlinks and a minimal generic graph view.
5. Retained inline source Cells plus syntax associations for the Markdown proof; Mutable semantics remain authoritative and changes are atomic.
6. Contextual as the intended default only after the browser gate; a failed gate requires review, not a hidden fallback or larger editor rewrite.
7. Fixed/collapsible three-region layout and a dark shell; no arbitrary pane splitting or demand to reproduce every mockup affordance.
8. Stage-by-stage review, default-on Jet once approved for implementation, and no persistence redesign, History extraction or unrelated Spatial work within this programme.

**No feature code, runtime configuration or application behavior was changed during this planning pass.**
