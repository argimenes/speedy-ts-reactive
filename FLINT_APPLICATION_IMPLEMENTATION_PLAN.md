# Flint Application Implementation Plan

**1 October 2026 — planning for review; F1 is not implemented or authorized by this document.**

Flint should now become a coherent place to read, write and follow knowledge relationships. Its native Document, vault, occurrence and query foundations already exist. The recommended next slice is **F1 — Flint workspace shell and context**, combining the supplied material identity with a useful Library → Document → Context arrangement. It moves existing capabilities into an intelligible application rather than adding another infrastructure prerequisite.

## 1. Close the Native Knowledge programme

P1–P5 and the [bounded responsiveness correction](NATIVE_KNOWLEDGE_P5_RESPONSIVENESS_REPORT.md) are accepted as completing the Native Knowledge infrastructure programme needed for current Flint development.

| Composition | Accepted state |
| --- | --- |
| `nativeKnowledge:true` | Default loaded-resource Facts-backed C2/C3 provider. |
| `nativeKnowledgeSaved:false` | Normal production setting. The implemented saved pipeline remains available by explicit opt-in/qualification. |
| `nativeKnowledge:false` | Retained legacy loaded-provider rollback. |

Do not remove saved coverage, enable it by default, or resume optimisation through this application plan. The remaining 1,000-resource saved-result activation delay is a **known performance limitation, not a blocker to Flint development**. The corrected runs took 16.6–20.1 seconds; repeated conservative discovery dominated wall time, while diagnostic native admission was approximately 235 ms. A future unchanged-filesystem-evidence investigation is recorded only, not proposed as work in F1–F4.

Keep the existing first-use result-publication long-task watchpoint, global arbitrary structural admission, very-large-Block editing cost, Solid development projection enumeration regression and legacy constructor-owner-cache lifetime caveat. None is made an application prerequisite. Preserve the completed reports as evidence rather than reopening their gates.

This plan is the current Flint application roadmap. Earlier [Jet/Flint](JET_MUTABLE_OS_IMPLEMENTATION_PLAN.md), [Stage C](FLINT_STAGE_C_IMPLEMENTATION_PLAN.md) and post-C3 planning documents remain historical architecture/context; their old “not yet implemented” status text does not describe today's production surface.

## 2. Inspected production baseline

Inspection covered the current source, feature contracts, existing qualification tests, supplied icon master and the accepted [two-Window browser capture](artifacts/native-knowledge-p5-correction/c3-browser/two-window-backlinks.png). That capture is prior qualification evidence, not a new browser run for this planning task. No product code or rollout switch changed during planning.

| Surface | Exists now | Missing application work / constraint |
| --- | --- | --- |
| Launch and lifetime | `flint:true`; application registration in [features.ts](src/application/features.ts). Workspace → Open Flint and the toolbar entry in [workspace-demo.tsx](src/demo/workspace-demo.tsx) launch an ordinary Desktop Window. Multiple Windows work. | Launcher text still says Stage A. UI entry is disabled outside Desktop. Do not infer Canvas/Spatial launch support from the underlying command. |
| Canonical editing | [Host adapter](src/application/document-application-capabilities.tsx), [transient view](src/rendering/transient-document-view.tsx): tabs name canonical Documents; each mounted occurrence has its own projection, focus and selection. Core supplies the tab/editor slot. | No independent Flint editor, unrestricted nested application hosting, or native Workspace/session round-trip. The empty-workspace launcher still seeds Notes/Ideas; that existing behaviour is not a finished onboarding design. |
| Vault | [Vault lease](src/application/document-vault.ts), [VaultView](src/features/flint/vault-view.tsx): managed server directory, real nested tree, Open/Refresh, create Document/import, create/rename/move directories and native pairs, recovery/uncertainty/read-only UI. | It is not an arbitrary browser filesystem vault. No deletion/Trash, watcher, cross-vault movement, parallel folder membership or global catalog. |
| Native files | [Native session](src/persistence/native-session.ts), [managed routes](server/native-document-store.mjs): individual native Save/Open, paired Markdown, comparison/conflict/recovery, stable identity and independent binding. | `.mutable.json` remains canonical. `.ink` naming is not production behaviour. The header's Files controls are useful but expose too much operational detail by default. |
| Resource presentation | Vault rows show title, filename, storage state and loaded eligibility. Active Document properties expose title, tags, ID, format, location and status; tag filtering covers loaded Documents. | No resource cards, collection-wide previews, per-resource status inspector or polished welcome view. Active properties must not be mistaken for metadata available for every unopened row. |
| Search | [KnowledgeView](src/features/flint/knowledge-view.tsx), [VaultKnowledge](src/application/vault-knowledge.ts), [Facts provider](src/application/facts-query-provider.ts): title/native text, snippets, Unicode/inline-safe targets, cancellation, incomplete coverage and host-revalidated passage navigation. Loaded Documents need no mounted tab. | No whole-vault default search. Closing a tab does not necessarily unload its Document. “Search open tabs” would therefore be an inaccurate label. |
| References | Valid-selection Document picker, native reference creation/removal with Undo/Redo, outgoing-reference listing and following; identity survives title/path changes. | No unified context inspector, visit trail or general Block-reference authoring UI. Existing C2 UI primarily creates Document targets. |
| Backlinks | [BacklinksPanel](src/features/flint/backlinks-view.tsx), [contract](src/feature-api/backlinks.ts), [Facts adapter](src/application/facts-backlinks.ts): logical mentions, source snippets, coverage/freshness and invoking-Window follow. | A collapsible list in the left rail, not an integrated relationship workspace. The contract carries Document/Block IDs, but Flint currently supplies the active Document root as its target. |
| Entity tooling | [Entity feature](src/features/entity-references/index.tsx): existing annotation search, underline, property details, Entities in Document, mention previews and occurrence navigation. [Local inventory](src/features/entity-references/document-entities.ts) reads native mentions. | Not exposed through `DocumentApplicationInstance`. Search/name enrichment and saved Graph counts use existing Entity endpoints; counts are not trustworthy canonical native-vault totals. No independent Entity authority/page system has been delivered by the Knowledge work. |
| Facts and relationships | [Facts model](src/knowledge/facts.ts) includes Blocks, annotations and Document/Entity mentions. Shared semantics, worker reader, live observation and lifecycle are production code. | Facts are not a public UI repository. A field existing in Facts does not mean a complete Flint query/navigation capability exists for it. No general typed-relation browser or Flint graph view. |
| Visual identity | [Icon master](docs/assets/flint/flint-app-icon-master.png) is present and unchanged. [Flint CSS](src/features/flint/flint.css) provides basic dark chrome, pale Document surface and fixed side columns. | No runtime use of the supplied icon was found. Library, search, reference controls and backlinks share a narrow scrolling column. Properties are always beside the editor. The material identity has not been expressed as a coherent interaction design. |
| Menus/objecthood | Flint owns Files/Save/Close-tab and its feature controls. Generic Block context menus and existing editor commands remain core-owned. | No Flint resource action menu, application eikon behaviour, context trail or relationship map. Legacy graph modules are not a current Flint graph capability. |

The recent correction memoizes vault derivation and preserves equal row identities. Preserve that implementation and [batched result publication](src/features/flint/query-results.tsx) during UI changes; do not rebuild a thousand rows to move a panel.

### Important limits of immediate reuse

- `DocumentApplicationInstance` exposes `tabs`, vault, files, properties, knowledge and backlinks. F1 can work through those capabilities. It must not receive `ReactiveEditor`, repository dictionaries or filesystem access.
- The [Window application guide](docs/development/CREATING_WINDOW_APPLICATIONS.md) and current host expose standard move/resize/minimize/close, not an arbitrary application icon/header slot. Put Flint's identity and commands inside Flint's content shell. Do not hide or replace the core title bar through CSS.
- Native Document editing already carries standoff, Grouping, Entity, margins and Block capabilities. Their supported occurrence/presentation behaviour should remain available, not be reimplemented as Flint widgets. In particular, a generic Flint Window is not automatically a Document Window with its own Compact control.
- The [SurrealDB review](FLINT_SURREALDB_INFRASTRUCTURE_REVIEW.md) remains authoritative about legacy Entity data: preserve existing IDs and provenance; do not equate Entity IDs with Document IDs or promote saved Graph counts to live native truth.

## 3. Product model and design language

### The user's objects

A vault is the physical collection. A Document is a meaningful native object with stable identity, title, authored tags, content and relationships. A Block is an addressable part of native content, not automatically an independently stored resource. An Entity is a distinct referent, not automatically a Document. A reference is an authored relationship; a backlink is its derived incoming view. A navigation trail is what this Window visited, not an authored relationship.

Filesystem location, canonical identity, semantic tags and relation evidence must stay distinguishable. A folder rename does not change the object. A title edit does not move its files. A missing label does not destroy identity. A stale or incomplete query cannot establish absence.

Use the cave metaphor to organize the experience without renaming familiar controls into a puzzle:

| Metaphor | Concrete application meaning | Boundary |
| --- | --- | --- |
| Cave | A bounded place of work: the selected vault. | Keep the familiar **Vault** label and real directory hierarchy. |
| Chamber | The current Document and its context. | No new authored container or virtual folder. |
| Passage | A native reference linking source to target. | Direction and cited evidence must be visible. |
| Track | This Window's sequence of successful visits. | Session presentation state, no canonical History entry. |
| Trace | A particular mention/range that provides evidence. | Preserve linked-mention identity and native coordinates. |

### Material identity

Build on the supplied flint arrowhead: charcoal, mineral grey, chalk/ivory, restrained ochre and a cool mineral accent. Provisional role tokens, not a final contrast-certified palette: coal `#171918`, stone `#292D2A`, chalk `#EEE6D7`, ochre `#BD9560`, mineral `#96B8C6`. Test actual pairings, muted text and focus contrast during F1.

- **Surfaces/chrome:** quiet matte surfaces, clear depth and restrained facet-like edges. Hierarchy comes from spacing, typography and function, not distressed textures or animated cave scenery.
- **Typography:** a restrained serif for Flint's name and major contextual headings; a legible system sans for controls and metadata. Preserve authored Document fonts, sizes and formatting. Do not recolour annotations or impose a shell font over editable text.
- **Icons/eikons:** preserve the master. Produce a legible small mark derivative during F1; use the complete artwork in the welcome surface. Resource representations combine type, title and state with a clear action. Buttons keep familiar labelled symbols; cave drawings must not replace understandable commands.
- **Colour semantics:** distinguish active location, navigable reference, focus and warning/error. Never encode state/direction by colour alone. Unknown and incomplete must remain visible rather than receiving a reassuring “empty” appearance.
- **Menus:** a small Flint application menu, with resource actions attached to the resource they affect. Recovery/conflict tasks remain reachable and urgent failures remain visible even when advanced controls are closed.
- **Search/context:** results show what was found and where; backlinks show why two resources are connected. Paths and IDs support disambiguation without dominating every row.
- **Graph:** stable, directed passages with inspectable traces; no decorative force simulation.

**Image resources:** use the supplied Flint master as the current identity source. No additional artwork is required to approve this plan. If implementation needs new imagery, textures, illustrations or an icon variant that cannot be derived cleanly from that master, ask the user for the required image resources before sourcing or generating them. Do not treat speculative artwork acquisition as an F1 prerequisite. No images were created or modified during this planning work.

Objecthood begins with predictable representations: selecting a resource reveals its information/actions; opening it invokes the existing host; its identity remains stable across alternate representations. The Flint mark can open Flint's own application menu. Neither behaviour requires a Mutable desktop eikon framework or drag-and-drop transport.

## 4. Recommended application stages

These are visible product increments, not a new feasibility ladder. Review each usable slice in the actual application. Use semantic gates only for genuinely new selection/navigation authority, not for changing spacing, colours or panel arrangement.

### F1 — Flint workspace shell and context

**Visible gain:** a recognizable Flint workspace with a clear place to browse, write, search and inspect relationships. This combines the visual foundation and the first useful layout; there is no preliminary “design infrastructure” stage.

Conceptual arrangement, not a pixel specification:

```text
Existing Mutable Window title bar / move / resize / minimize / close
┌─────────────────────────────────────────────────────────────────────┐
│ Flint mark · Vault name     Search available Documents     Save  ⋯ │
├─────────────────┬───────────────────────────────┬───────────────────┤
│ Library         │ Existing native Document tabs│ Context           │
│ Folder tree     │ Existing editor + toolbar    │ Backlinks         │
│ Tag filter      │                               │ References        │
│ New / Import    │ Full-fidelity live Document  │ Properties        │
│ Vault actions   │                               │                   │
├─────────────────┴───────────────────────────────┴───────────────────┤
│ Active resource/save status · loaded query coverage · details       │
└─────────────────────────────────────────────────────────────────────┘
```

Search switches the Library rail between Browse and Search; a header control focuses that existing search input. The right Context rail chooses Backlinks, References or Properties for the active Document. Keep literal labels, source snippets and visible coverage. A small root/path breadcrumb and stronger title/state hierarchy make the current object clear.

Scope:

1. Introduce scoped Flint surface/type/spacing/focus tokens and use the supplied identity in the shell and welcome state. Make necessary icon derivatives only; preserve the master.
2. Recompose the existing tree/search/backlinks/reference/properties views. Separate currently bundled search/reference UI as needed without changing their commands or query semantics.
3. Replace the always-prominent Files form with an application-menu entry opening a storage/details sheet. Preserve List/Open/import/first-save destination/compare/recover controls and their current guards. Show save errors, pending publication and read-only state without requiring users to discover that sheet.
4. Make Library and Context independently collapsible inside the application; at narrow Window widths use one selected side panel or a dismissible sheet. Do not mount a second editor for a responsive layout. Keep the core-provided `app.tabs` mounted in one stable location.
5. Give the no-vault and no-active-Document states explicit next actions through existing Open Vault, native Open and New Document-in-vault paths. Existing Notes/Ideas bootstrap Documents remain until a separate onboarding decision; do not silently delete or auto-save them.
6. Provide keyboard access to the mark/menu, Search, context selectors and primary actions. Prefer existing controls and locally scoped routing. No new global shortcut/input layer; preserve editor/native-form shortcuts and IME.
7. Remove obsolete Stage A wording from the Desktop launcher, while retaining its current supported-host restriction.

**Reuse:** every operation comes from the current `DocumentApplicationInstance`, existing provider/host navigation and native file/vault APIs. No new query, storage or ownership contract is required. Panel choice/collapse is Window-local presentation state and need not survive restart.

**Production components:** modify [Flint index](src/features/flint/index.tsx), CSS, `vault-view.tsx`, `knowledge-view.tsx`, `backlinks-view.tsx`; launcher wording in `workspace-demo.tsx`. New Flint-only `shell.tsx`, `application-menu.tsx`, `context-pane.tsx` and identity asset/module are reasonable factoring, not a general panel registry. Keep the host's memoized row model and core tab slot. Scope the currently unqualified `.reactive-document-occurrence` rules to Flint so branding does not leak into other hosts.

**Boundaries:** no repo/native/session/Knowledge changes; no duplication of editors; no generic Window header contribution. Moving controls must preserve valid-selection capture, stale handles, current occurrence and panel focus restoration. An absent optional capability produces an unavailable explanation, not a fabricated action.

**Browser/UI acceptance:** open a real vault, create/save/edit a native Document, search an available unmounted source, follow a backlink, create/remove a reference with Undo, inspect/edit title/tags and recover focus. Exercise two Windows, no vault, empty folder, partial coverage, stale query, read-only and pending/conflict states. Resize the actual Window: panels collapse, the editor remains mounted, margin/drawer and Entity overlay access are not clipped. Check caret, selection, IME and native fields; keyboard Escape returns to the invoker. Capture wide, narrow, welcome and context-open views. Opening/closing a shell panel must not mutate repository revision/History or dispose a Document occurrence. Retain existing stable-row and batched-result checks.

**Rollback:** revert the presentation changes; no data migration. Keep the existing `flint` enablement and all Native Knowledge defaults. Do not add a family of per-panel feature flags or change provider rollout to demonstrate the shell.

**Architecture question:** none identified for this scope. A demand for custom core title bars, independently managed tabs or durable session restoration is a scope change, not an F1 prerequisite.

### F2 — Resource browsing as meaningful objects

**Visible gain:** browse by title, native type/format, authored tags and clear availability, with a selected-resource information/action sheet. Users can distinguish “available for search”, “on disk; open to inspect”, “unsaved candidate” and storage trouble. The tree remains the real filesystem hierarchy.

Start with compact resource rows, a selected-object sheet and deliberate resource actions. Keep current selection distinct from the active editing tab. Disambiguate duplicate titles with path, then canonical ID in details. Show title editing separately from **Rename file / Move**. The first actions are Open, Inspect, Edit title/tags where available, Rename/move and existing recovery; no delete/Trash, cross-vault move or implicit rebinding.

A small optional text/type preview may use an already available live Facts summary; it must not mount an editor, capture native state, read Markdown, start saved indexing, or issue a query per row. For unopened resources show only discovery metadata; unavailable tags/format/preview are unknown, not empty. No screenshots, texture generation, fabricated thumbnails or claims of media inventory beyond what discovery currently supplies.

**Reuse / files:** existing `ApplicationVaultDocument`, `ApplicationDocumentProperties`, vault lease/native status and current Facts observations. Extend `vault-view.tsx`; new `resource-row.tsx`, `resource-details.tsx` and a small shared resource presentation model. If selected-resource metadata beyond the active Document is needed, add only a read-only semantic description/action capability to [document-application.ts](src/feature-api/document-application.ts) and its host adapter. A preview adapter reads the current eligible contribution once on explicit inspection; it must not become another observer/index or be required for basic browsing.

**Boundaries:** identity/path/title remain separate; native save and relocation stay resource-owned. No virtual folders or arbitrary metadata schemas. Only existing string-list tags and simple filtering. Search/tag coverage remains loaded/available, including Documents whose tabs have closed. A selected resource is not a new owner or occurrence.

**Browser/UI acceptance:** duplicate titles, title versus filename changes, folder/pair relocation while editing, read-only/unknown states, unloaded tags, dirty live title, two Windows and close/reopen. Inspecting a row must not Open it, set a binding, change History or double extraction. Maintain DOM row identity and bounded publication at the already-tested large fixture sizes; no new infrastructure benchmark campaign.

**Rollback:** remove the resource sheet/compact presentation or its bounded host description method; native data and file paths are unchanged by UI inspection. Actual requested edits/moves remain ordinary existing operations.

**Review question:** only if the desired preview requires unavailable semantics or new persistence. Return that specific gap or ship the row/detail experience without the preview. It does not delay F1 or basic F2.

### F3 — Relationship context and a Window-local trail

**Visible gain:** Backlinks and References become incoming/outgoing views of the current Document, grouped by resource and supported by source text. A user can follow a passage, see the target context, and retrace a visit without losing the other Window's position. Offer **Entities in this Document** through the existing feature.

Keep F3 Document-centred first. Group logical mentions without collapsing distinct authored relationships. Show source/target titles, direction, available snippet, mention count and limitations. Distinguish authored references from navigation history. A trail records at most 30 successful visits per Window; it is neither browser filesystem history nor canonical undo history.

**Reuse / files:** existing backlink result/mention objects, reference handles, `knowledge.activate/followReference` and `backlinks.follow`; `context-pane.tsx`, `backlinks-view.tsx`, extracted reference view, new `relationship-context.tsx` and `navigation-trail.tsx`. If back/forward requires new host support, add opaque Window-scoped visit handles and a narrow revalidated return action to the application contract/host. Never replay an old query token or blindly restore a stale offset. If the original passage cannot be re-established, show that it is unavailable rather than select a nearby passage.

Entity integration initially dispatches the existing Entity-list command against the invoking occurrence through a narrow host action. It keeps the existing feature's panel ownership, async checks, preview and focus lifecycle. Flint does not embed a private `DocumentEntityList` instance or receive annotation/editor internals. Local Document mention counts remain useful when the server's name enrichment fails; saved Graph counts retain their separate provenance and are not used as native backlink totals. Entity creation, Entity pages and a new Entity authority are outside this slice.

**Boundaries:** trail entries own no resource and create no authored History. Navigation revalidates ID/root/Block, revision, binding and current availability through the host. Only explicit reference/property edits create native History entries. Preserve typed identity: a Document reference, Entity mention and generic standoff annotation are not interchangeable edges.

**Browser/UI acceptance:** linked multi-Block mentions, Unicode/inline atoms, title/path changes, source disappearance, edits/Undo branches, stale delayed follow, two-Window Back/Forward and reference creation/removal. Entity command selection must target this Window, restore focus and tolerate unavailable enrichment without affecting native editing. Trail eviction and Window closure dispose only UI state.

**Rollback:** hide/revert the context/trail components and narrow host actions; continue using the accepted lists and navigation. No persistence migration or relationship rewrite.

**Real semantic gate:** new visit replay/Entity host actions require focused occurrence, selection and stale-navigation tests before release. If they need a navigation-engine or Entity-storage redesign, omit that extension and return the concrete issue. Richer existing list presentation can still ship.

### F4 — A Flint relationship map

**Visible gain:** a small, stable map explains *why* the current Document is connected to others. Arrange incoming sources → current Document → outgoing targets; selecting a passage shows its trace/snippet and direction. This is a bounded view of native evidence, not an Obsidian-style whole-vault force graph.

Use HTML resource objects with SVG connectors and a keyboard/list equivalent. Start with one hop, at most 40 visible objects and 80 visible connections, with explicit truncation/coverage. These are presentation budgets inside existing query limits, not claims of full graph coverage. Layout is deterministic; no physics, WebGL or graph database. Group multiple mentions into a labelled connection while retaining the underlying logical mention handles for inspection/navigation.

**Reuse / files:** F3 context model and accepted C2/C3 responses. New Flint-only `relationship-map.tsx`, `relationship-map-model.ts`, scoped map styles and tests. Existing host action handles remain the only route to navigation. The display model is the current query's objects/geometry, not a second repository-wide relationship index.

**Boundaries:** begin with Document reference edges already supported by C2/C3. Do not treat arbitrary annotation values, ownership edges, shared tags or layout proximity as authored references. Entity nodes may be added only from F3's available native mention semantics with distinct identity and no automatic Entity page. Block-level expansion needs an explicit current Block target and qualified host navigation; the presence of Block IDs in a type is not sufficient. It is an extension, not a condition for the initial map.

**Browser/UI acceptance:** A→B and B→A, self-reference, repeated/linked mentions, duplicate titles, missing/unknown targets, stale results, coverage caps and keyboard access. Selecting/laying out the map creates no canonical state or History changes. Following a trace goes through the invoking Window's host and revalidates exactly as the list does. Closing the map cancels work; two maps share existing Facts rather than starting duplicate extraction.

**Rollback:** remove the map view; the same evidence remains accessible through Context lists. No authored graph serialization or layout persistence.

**Review question:** whether a requested new relationship type has an existing authored producer and safe navigation contract. If not, keep it out of the map and request a separate relationship spec. Do not build a universal graph service to fill missing meaning.

## 5. Initial command vocabulary and objecthood

| Command / representation | Owner and placement |
| --- | --- |
| Open Vault, Refresh, New Document, Import Markdown | Flint Library/application menu, delegating to current vault APIs. |
| Save Document; storage status/details | Flint shell invoking canonical resource persistence. Preserve pending/conflict actions. |
| Search available Documents | Flint header/Library; existing loaded C2 search with visible coverage. |
| Inspect resource; Rename file / Move | Flint resource representation, distinct from active Document title edit. |
| Show Context: Backlinks / References / Properties | Flint presentation only; no storage or History effects. |
| Link selection to Document | Flint reference workflow using the existing valid-selection picker and native edit command. |
| Entities in this Document | F3 thin action into existing Entity feature; do not duplicate its annotation model. |
| Back / Forward in trail; Show relationship map | F3/F4 scoped to the invoking Window. |
| Bold, Block insertion, Grouping, margins, annotation editing, Undo/Redo | Existing Mutable editor/feature actions; do not replace these with a parallel Flint command layer. |

Resource overflow menus and keyboard-operable buttons are sufficient initially. Do not add Flint branches to generic Block context-menu code or intercept Control-click/editor gestures to make F1 work. A later selected-Block context contribution needs a specific justified action and the existing selection/overlay lifetime; it is not a prerequisite to resource menus. The Flint mark gets a named application action, not arbitrary physical-object behaviour or a desktop-wide eikon protocol.

## 6. Shared acceptance and delivery discipline

Each slice ends with an ordinary product demonstration and source/test summary, not another architecture feasibility stage. Deliver actual Flint routes and existing feature composition, not a mockup-only prototype.

- Use the existing C1b/C2/C3 and saved-result browser scripts as appropriate, updating selectors to user-visible roles where layout moves them; never weaken their identity/selection assertions.
- Run focused application/lifecycle/selection tests for changed components. Reuse the new row-retention assertion and cancellable `QueryResults`. Do not rerun every repository/codec benchmark for a CSS or panel move.
- Check normal loaded-provider composition and a targeted saved-opt-in smoke test so the qualified implementation is not stranded. Legacy rollback remains available. No stage turns saved coverage on to make search seem more complete.
- Mount the native editor once. Form input, dialogs, Escape, IME and selection restoration must remain ordinary Mutable behaviour. Side-panel clipping/scroll changes require actual margin/drawer/Entity-overlay checks, not just screenshots.
- Preserve unknown authored payloads, native resource identity, ownership, pair recovery and conservative discovery. UI failure cannot authorize file operations or turn uncertainty into absence.
- New application capability is normally available with Flint under the user's default-on convention once its implementation is authorized. Existing rollout defaults do not change. Prefer ordinary source rollback for presentation patches over speculative runtime flag proliferation.

F1 and basic F2 have no identified architectural prerequisite. F3's new navigation action and any F4 Block/Entity expansion are the only places in this proposed sequence where a new semantic contract may need targeted review. Those questions must not freeze the rest of the application.

## 7. Deliberately deferred

Not prerequisites and not implementation tasks in this programme: saved-only Knowledge default rollout or discovery-proof optimisation; SurrealDB repair/ingestion; persistent semantic caching; `.ink`/`.ink.md` migration; arbitrary resource-local admission; watchers/synchronization; a graph database; native Workspace persistence/session restoration; ownership transfer/deletion/Trash; cross-vault moves; complete Markdown/Obsidian filesystem support; standalone artifact formats; independent Entity storage/pages; a complete Mutable desktop/eikon system.

Cavern/3D is later product exploration after the ordinary Flint experience is useful. The cave/chamber/passage vocabulary can inform the 2D experience now; it does not authorize a Three.js environment, additional spatial hosting or a new resource model.

## 8. Concrete F1 recommendation

Approve **F1 — Flint workspace shell and context** as one product slice: supplied Flint identity, scoped material styling, Library Browse/Search, the existing native editing slot, a right-hand Backlinks/References/Properties selector, concise visible save/coverage status, accessible menus and responsive panel collapse. Retain all current native/vault operations in reachable detail controls.

The review demonstration should be: launch Flint on Desktop → open a vault → recognize and open a Document → edit/save ordinary native content → find an available passage → inspect/follow a backlink in Context → return to editing in the same Window → resize without losing the editor or selection. Show the same Document in a second Window and an incomplete/read-only state. This is substantial enough to make Flint visibly and conceptually distinct while relying entirely on accepted foundations.

Proceed next in the order **F1 shell/context → F2 resource experience → F3 richer relationship context/trail → F4 bounded relationship map**, with ordinary product review after each. No F1 implementation, Native Knowledge optimisation or further infrastructure work is authorized by this planning deliverable. **Stop for review of this plan.**
