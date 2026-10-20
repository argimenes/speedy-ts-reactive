# Mutable Window Manager: application surfaces

**Architecture specification — A0 and A1 accepted; approved B implemented and qualified, awaiting acceptance; D0, C and later capabilities remain unapproved.** Companion to the revised [MWM plan](MUTABLE_WINDOW_MANAGER_PLAN.md), prepared 20 October 2026 against `d0faa4c` and the working tree. This document executes the investigation requested by `MUTABLE_WINDOW_MANAGER_PLANNING_ADDENDUM.md`; APIs and behaviour changes below describe the longer-term design; A0 ownership/layering and A1 activation/lifecycle are approved. The initial planning investigation changed no application code and ran no tests. Approved A0 implementation and executed checks are recorded separately in the [qualification report](MUTABLE_WINDOW_MANAGER_A0_QUALIFICATION.md); the [A1 qualification report](MUTABLE_WINDOW_MANAGER_A1_QUALIFICATION.md) records the subsequent implementation and evidence. The source audit below is historical; capabilities beyond B remain proposals. The [B qualification report](MUTABLE_WINDOW_MANAGER_B_QUALIFICATION.md) records retained hosts, floating interactions and tool positioning infrastructure; it does not implement the later docking/promotion designs below.

## 1. Findings and application-surface inventory

**Recommendation:** one central index of surface ownership and policy, with application-scoped capability facades. Reuse existing view sessions and `OverlayService` for content. Desktop windows receive window operations; tools receive only the capabilities they need; embedded panels remain ordinary application layout. Shared focus/layer coordination does not imply a shared component implementation.

The addendum calls its example “Linked Entity Reference”. The current component's visible name is **Link Entity Reference**, registered as `entity-search`. It combines lookup, linking selected text, creating an Entity, editing its name/aliases, candidate review and recovery. It is not simply an inspector of an already selected Entity. Its conditional modal ARIA declaration and global outside-click handling make it a hybrid, best migrated to an explicitly **modeless application tool**.

“Ink” here denotes the source editor occurrence. It may be inside a standalone document window or a Flint tab. Its tool owner must be resolved from that occurrence to the actual hosting app instance and desktop window, never guessed from a shared Document ID.

| Actual surface and source | Current owner, physical host and behaviour | Proposed disposition |
|---|---|---|
| Desktop application/document windows: [WindowView](src/rendering/core-block-views.tsx), [Flint registration](src/application/document-application-capabilities.tsx), [Thesis](src/application/thesis.tsx) | Workspace wrapper; shared window chrome with local metadata geometry/z. Flint may contain several editor occurrences; Thesis has its own draft editor | MWM desktop specialization; one app/window ownership adapter per live instance |
| Link Entity Reference: [registration](src/features/entity-references/index.tsx), [open/choose](src/features/entity-references/entity-search.ts), [view](src/features/entity-references/search-view.tsx), [styles](src/features/entity-references/entity-search.css) | Feature contribution; overlay owner is a source NodeKey. [ContributedPanels](src/rendering/contributed-panels.tsx) filters by projection and renders into a body Portal. View implements floating drag/resize, search and mutation state; final CSS z-index is 11000 | Scope-managed modeless tool with central owner-group layer and focus lease. Keep domain state local; no desktop WindowId |
| Entities in Document: [list controller](src/features/entity-references/document-entity-list.ts), [list view](src/features/entity-references/list-view.tsx) | Same contribution host when floating; draggable/resizable dialog with `aria-modal=false`, Escape close and resize clamp. Controller owns source and inventory; shared contents also serve embedded Entity backlinks | Floating shell is a scoped tool; embedded `EntityListContents` stays app-local. Do not create two inventories |
| Annotation monitor: [monitor](src/rendering/annotation-monitor.tsx) | Body Portal per projection; starts near range/overlay anchor, clamps on resize/scroll, drag changes to manual position; owns annotation controls and errors | Scope-managed inspector with anchored/floating placement adapter; existing domain controls retained |
| Entity property details: [details](src/features/entity-references/property-details.tsx) | Read-only fieldset rendered inside annotation details; reads reference ID and compatible cached Entity name | App-local content, not a separate surface. No current independent “Edit Entity” dialog here |
| Compact formatting/overflow controls: [compact toolbar](src/rendering/compact-toolbar.tsx) | Toolbar inside editor chrome; popup in body Portal, anchor reposition on scroll/resize; outside click/Escape close. Explicitly nonmodal, Tab may leave | Ordinary owner-scoped overlay lease, no desktop cycling, tiling or persistence. Toolbar itself remains local |
| Editor context menu: [block-context-menu](src/rendering/block-context-menu.tsx), [overlays](src/runtime/overlays.ts) | Runtime owner/return bookmark, portal menu and ephemeral placement | Lightweight overlay; parent surface and central dismissal/focus routing |
| Flint Explorer, document tabs, Properties and link lenses: [shell](src/features/flint/shell.tsx) | In Flint's DOM/layout; internal navigation and document state. Entity backlink view occupies a context pane | App-local layout. MWM manages the outer frame only; optional future detachment requires an app adapter |
| Native-reference backlinks and picker: [backlinks](src/features/flint/backlinks-view.tsx), [knowledge view](src/features/flint/knowledge-view.tsx) | App-local query/results and inline “Choose reference Document” dialog; picker closes on Escape, no workspace backdrop | Panels remain local; picker may take a focus/dismissal lease if needed, without becoming a window |
| Flint Storage and recovery: [storage sheet](src/features/flint/storage-sheet.tsx) | Inline app backdrop/dialog, local busy/error state, initial focus, partial Tab trap and `aria-modal=true`; invokes explicit native file operations | App/window-owned dialog; add explicit blocking scope and tested focus containment. No new save flow |
| Shell document chooser/save operations: [document dialog](src/demo/document-dialog.tsx) | Body Portal, local form and focus handling; shell supplies action | Dialog lease scoped by invocation: workspace operations can be workspace-modal; a document/app operation should identify its owner |
| Entity rename and alias edits: [search view](src/features/entity-references/search-view.tsx) | Controls within the Entity tool; immediate Entity service operations, local request/retry state | Keep local. A future confirmation dialog would be a child surface, not a separate Entity editor invented for this migration |
| Find/history and transient editor layers: [ReactiveViewLayers](src/rendering/reactive-tree-view.tsx), [block history](src/rendering/block-history.tsx) | Projection-owned overlays with different focus/interaction requirements | Adapt only shared ownership/layer/focus concerns; classify blocking individually |
| Sticky draft versus saved sticky window: [sticky notes runtime](src/runtime/sticky-notes.ts), [sticky view](src/rendering/sticky-note.tsx) | Draft is transient editing state; saved floating window uses window rendering | Draft tool gets owner lifecycle; durable window follows desktop rules. Neither implies user pinning |

No new autocomplete or tooltip component is required. Existing/future suggestions and hints use the lightweight overlay path when they need coordination; native browser title tooltips need no registration. An app fieldset, row, button, tab or ordinary panel does not enter the central surface index merely because it is interactive.

## 2. Ownership, containment and scope lifecycle

Compare the viable registry options:

| Option | Benefit | Cost |
|---|---|---|
| Central registry owns every component and local layout | Single place to inspect everything | Couples MWM to forms, docking and text state; too much churn and a second content system |
| Independent local surface managers behind a common API | App autonomy | Cross-app activation, portal cleanup and modal stacks require reconciliation; conflicting ordering writers remain possible |
| **Central policy metadata index, scoped handles, app-owned sessions** | One cross-app authority, small per-surface records, local content remains local | Requires lease adapters and precise lifecycle notifications; selected |

The selected design is a hierarchical *policy* registry, not a new reactive tree of domain data. Scope handles are views into that registry, not independently authoritative registries. Existing overlay descriptors own the panel session; their adapter registers metadata and mirrors approved transitions. There is one writer for order and one writer for each app's content.

Four relations must remain distinct:

- **Ownership:** app instance/window responsible for closing, suspending and guarding the tool.
- **Visual containment:** actual DOM host, clip boundary and coordinate space. A body Portal does not make a tool shell-owned.
- **Resource identity:** Document, Block, Entity and revision/occurrence references used by the app. Two views of one Document are separate tool owners.
- **Focus ancestry:** the chain used for command routing and return focus. A menu opened from a tool returns to that tool before its editor; it need not sit beneath that editor in the DOM.

```text
WorkspaceSession / one MWM policy index
├─ Flint app instance F1 — desktop Window W1
│  ├─ editor occurrence V1 (Ink), displaying Document D1
│  │  └─ Entity tool S1 [owned by F1/W1; source V1]
│  │     ├─ menu S2 [parent/focus ancestor S1; ephemeral]
│  │     └─ optional confirmation S3 [parent S1; blocks W1]
│  ├─ editor occurrence V2 (another tab, possibly also D1)
│  └─ Explorer / Backlinks / Properties [local DOM, no SurfaceIds]
├─ standalone Ink app instance I2 — desktop Window W2
│  └─ occurrence V3 → D1 [different owner despite shared content]
└─ Thesis instance T1 — desktop Window W3
   └─ Proposition draft [related to source V1, not owned by W1]

Physical hosts:
  shell normal plane: owner groups W1, W2, W3
  W1 group: frame + portal tool hosts + local overlay/modal hosts
  shell modal plane: workspace modal and its descendants only
```

A one-window app has one scope initially. If an app later owns multiple windows, tools still specify exactly one owner window; application-modal scope can block that app's set of windows. Child editor occurrences are bindings within the app scope, not new apps. Presentation workspaces and the canonical session are separate identities: switching arrangements affects visibility; leaving the session disposes its scopes.

| Transition | Required effects |
|---|---|
| Creating → visible active/inactive | Register owner before child; assign lease generation; mount; report ready; focus only if activation token is current |
| Active ↔ inactive | Reorder entire owner group; tool may remain visible behind the active group. Dismiss ephemeral menus. Do not cancel a modeless task merely because another app gained focus |
| Owner tab hidden / minimized / inactive workspace → suspended | Record reason set, hide/inert all dependent hosts, release capture/anchor observers and effective modal/input leases; retain stateful sessions where hosts support it. Abort optional reads or generation-gate their publication. Do not cancel dispatched domain writes by pretending they never happened |
| Suspended → visible | Clear only the resolved reason; validate resources/targets and mount generation, recompute invalid geometry, then restore visibility. Never focus unless explicitly activated. Reacquire modality only if scope is eligible |
| Presentation host unmount requested | Retain a qualified host or run guards before unmount. If state cannot survive, refuse/defer the transition with a reason. Current `Show` unmounting is not a preservation mechanism |
| Any live state → closing | Freeze new child opens; collect child/app guards before mutation; cancellation leaves all members intact. Commit child-first disposal, invalidate async/focus tokens, release overlays, then close owner |
| Unexpected unmount/disposal | Revoke leases and pending focus immediately; clear previews/subscriptions; ignore late UI publication. Do not fabricate a recoverable tool draft after it has been destroyed |
| Crash/reload → new scope | Restore only explicit, validated durable descriptors. No modal stack, captured text range or pending linking request is revived |

Minimize/restore is not close/reopen. Until B proves retained hosts, A1 must guard transitions that would lose dirty or uncertain task state. A workspace-modal operation prevents workspace switching until resolved; an owner-local modal can be suspended with its owner, and cannot trap focus in a hidden group.

## 3. Contract sketches and invariants

Illustrative interfaces only. IDs are opaque runtime values; `ResourceRef`, `Rect`, `ViewInstanceId` and `WindowId` come from the main plan. A source binding is deliberately app-owned and is not a persisted layout range.

```ts
type AppInstanceId = string & { readonly appInstance: unique symbol };
type SurfaceId = string & { readonly surface: unique symbol };
type ScopeId = string & { readonly scope: unique symbol };
type AnchorId = string & { readonly anchor: unique symbol };
type HostId = string & { readonly host: unique symbol };
type BookmarkId = string & { readonly bookmark: unique symbol };
type SurfaceKind = "desktop" | "tool" | "panel" | "dialog" | "overlay";
type Modality = "none" | "window" | "application" | "workspace";

interface SurfaceOwner {
  ownerAppInstanceId: AppInstanceId;
  ownerWindowId: WindowId;
  sourceViewId?: ViewInstanceId; // mounted occurrence, never a Document GUID
  parentSurfaceId?: SurfaceId;  // logical parent; same owner unless explicit transfer
}
interface SurfaceCapabilities {
  movable: boolean; resizable: boolean; dockable: boolean;
  detachable: boolean; pinnable: boolean; modal: boolean;
  closable: boolean; focusable: boolean; persistable: boolean;
}
type ToolPlacement =
  | { mode: "anchored"; anchor: AnchorId; preferred: "below" | "above" | "side";
      offscreen: "hide" | "dismiss"; fallback: "float" | "hide" }
  | { mode: "floating"; space: "owner-client" | "shell-viewport"; bounds: Rect }
  | { mode: "docked"; slot: string; size: number; previousFloating?: Rect };
interface SurfaceDescriptor {
  id: SurfaceId;
  kind: SurfaceKind;
  owner: SurfaceOwner;
  label: string;
  purpose: string;              // e.g. entity-link; scoped reuse, not global type reuse
  capabilities: SurfaceCapabilities;
  modality: Modality;
  dismissal: "explicit" | "outside-and-escape" | "app-guarded";
  placement?: ToolPlacement;   // desktop geometry uses the main window contract
  resources?: readonly ResourceRef[]; // explanatory references; not canonical content
}
interface SurfacePorts {
  requestClose(reason: string): Promise<"allow" | "veto">;
  visibility(visible: boolean, reason: string): void;
  focus(bookmark?: BookmarkId): void; // coordinator arbitrates before invoking
  dispose(): void;
}
interface SurfaceLease {
  id: SurfaceId;
  generation: number;
  ready(host: HostId): void;
  requestFocus(reason: string): void;
  requestPlacement(next: ToolPlacement): Promise<"committed" | "refused">;
  requestClose(reason: string): Promise<"closed" | "veto">;
  release(): void;              // idempotent; generation-specific
}
interface ApplicationSurfaceScope {
  readonly id: ScopeId;
  readonly ownerAppInstanceId: AppInstanceId;
  forWindow(id: WindowId): WindowSurfaceScope;
  requestClose(): Promise<"closed" | "veto">;
}
interface WindowSurfaceScope {
  registerTool(input: Omit<SurfaceDescriptor, "id" | "kind" | "owner"> & {
    sourceViewId: ViewInstanceId; parentSurfaceId?: SurfaceId;
  }, ports: SurfacePorts): SurfaceLease;
  // Lightweight leases need no content factory, restore descriptor or window bounds.
  openOverlay(input: {
    parentSurfaceId: SurfaceId; label: string;
    focusable: boolean; anchor?: AnchorId; dismissOnOutside: boolean;
  }, ports: SurfacePorts): SurfaceLease;
  requestDialog(input: {
    parentSurfaceId: SurfaceId; label: string; modality: Modality;
  }, ports: SurfacePorts): SurfaceLease; // validated scope, not caller-granted privilege
}
interface AnchorPort {
  // Returns shared cached viewport geometry, or explicitly invalid/offscreen state.
  read(id: AnchorId): { rect?: Rect; state: "valid" | "offscreen" | "invalid";
    generation: number };
  subscribe(id: AnchorId, invalidated: () => void): () => void;
  release(id: AnchorId): void;
}
```

The scope stamps ownership; callers cannot assign another app's owner or an arbitrary z-index. Shell-owned dialogs/menus use a separate shell capability rather than fake app/window IDs. Desktop registration also gets a SurfaceId; its existing WindowId maps one-to-one to that desktop surface. Ordinary tools never get WindowIds.

**Invariants:** live owner before child; no parent cycles; parent/child share session and permitted ownership; exactly one host lease per view; lease disposal cannot remove a newer registration; effective visibility includes all owner/source-tab reasons; only visible eligible surfaces may focus; workspace modality is shell-authorized; MRU/window cycling and desktop layout contain desktop surfaces only. Resource changes do not regenerate surface identities.

Default capabilities are false. Registration must explicitly enable close and focus for an interactive tool; focusless tooltips enable neither. Recommended profiles:

| Profile | Enabled by default within that profile | Explicit opt-in only |
|---|---|---|
| Desktop frame | Existing move/resize/close/focus abilities, subject to app restrictions | Pin/persistence and desktop tile/tab operations under main contract |
| Entity linking tool | Move, resize, close, focus | Dock, detach, pin, modal, persist: disabled |
| Read-only inspector tool | Close, focus; move/resize if its adapter supports them | Dock/detach/persist after app proof; independent pin disabled |
| Embedded panel | None at MWM level | Register only when independent focus/lifecycle/hosting actually needs coordination |
| Dialog | Close, focus; modal permission only for declared blocking operation | Resize/move if appropriate; no tiling/persistence/detach |
| Context menu / autocomplete | Close; focus only if interaction pattern requires it | No move/resize/dock/detach/pin/modal/persist |
| Tooltip | None | Nonfocusable transient lease only if needed for owner-relative layering |

## 4. Layering, portals, keyboard and accessibility

Order normal and pinned **owner groups**, then order surfaces within a group. Conceptually compare `(plane, windowRank, ownerModalDepth, localSurfaceRank)`. Content precedes tools; a tool's popover precedes its parent; an owner-modal backdrop/dialog covers its blocked owner surfaces and its descendants appear above it. Workspace-modal scope is a separate shell plane above normal and pinned groups. A normal app's popup never borrows shell-menu privilege.

Opening Thesis raises its whole normal group above inactive Ink's modeless Entity tool. Pinning Ink explicitly would raise the entire owner group above normal windows; the Entity tool cannot independently request pinning. Owner-modal dialogs do not outrank unrelated pinned groups; workspace-modal dialogs do. Nested modal scopes are ordered centrally, including intersections between application and window scopes.

Use stable group hosts and unclipped portal containers whose stacking context belongs to that group. An alternative implementation can allocate contiguous ranks to sibling frame/tool hosts in one plane; it must preserve the same group ordering. Do not put every application tool into one global “above all windows” plane. Do not transform the shared overlay root; coordinate conversion happens at host ports. Native browser top-layer surfaces require a separately qualified host boundary; ordinary z-index cannot outrank them.

Solid Portals retain component ownership while rendering elsewhere, and events can follow the Solid hierarchy. The native gateway and `composedPath()` operate on actual DOM hosts, so resolve registered host elements to SurfaceIds and then to the logical owner. Never rely solely on DOM ancestors or Portal event bubbling for ownership. [Solid Portal documentation](https://docs.solidjs.com/reference/components/portal)

Route a key once: native text/IME handling → focused surface's registered commands → eligible parent/application commands → shell commands. The bridge should reuse existing input ownership, not install another text gateway. Shell activation recognition must respect composition, modal eligibility, native fields and already handled events. Keep Command/Control-Shift-P for Thesis as previously agreed; do not add OS/browser-conflicting defaults for tool operations. A tool does not interpret Enter typed in an unrelated app.

Escape closes/cancels the innermost eligible transient surface only; consume the event so it cannot also close its tool and owner. The app defines whether pending work allows cancellation. Return focus follows the logical parent chain, with mount generation, current activation token and current modal eligibility checked *at execution time*. If focus has moved to Thesis, a late Entity lookup or queued tool close cannot restore Ink's caret. Clicking a source text cell keeps the browser's clicked caret; explicit “return to source” may restore a still-valid bookmark.

Workspace-modal dialogs require actual background inertness, initial focus, contained Tab/Shift-Tab, accessible names, a close/cancel path and valid focus return. Their owned popup roots must be inside the permitted interactive/accessibility subtree. `aria-modal` alone does not implement modality. [WAI modal-dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)

For a window-local blocking dialog, keep its window background inert and trap ordinary dialog tabbing while active, but allow explicit shell activation of another app. Do not mark the whole page `aria-modal=true` while unrelated apps remain available. Inactive owner-modal scopes cannot redirect focus from another app. Application-modal scope applies the same rule to that app's windows. This needs keyboard and screen-reader qualification, not just ARIA inspection.

For a future multi-window app, application modality leases blocking covers on each affected owner group and redirects activation of any blocked app window to the dialog's hosting group. It does not combine unrelated windows into a global modal plane. The initial one-window adapters need no multi-window app layout implementation.

The Entity workflow should be a named modeless dialog/tool region with no modal claim or unconditional focus trap; preserve native field navigation and provide a visible return-to-source control. Docked variants use an appropriately named region. Floating and docked accessibility reading order must be qualified with the physical host: visually placing a Portal beside content does not establish semantic reading order. Current `document.querySelector('[role="dialog"]')` presentation gates must eventually consume explicit blocking/lifecycle policy, without relaxing existing safeguards before adapters are qualified.

## 5. Anchoring, floating and docking

**Anchored:** an app supplies a stable AnchorId for a mounted occurrence and cell range, Block or element. App code owns range validity; the geometry service owns coordinate measurement. Viewport CSS pixels are the shell interchange space; owner-local coordinates and canvas/spatial transforms require explicit host conversion. A cached rectangle from one occurrence is not valid for a second rendering of the same Block.

Prefer beside/below the anchor, flip above/other side on collision, then clamp inside the available visual viewport/work area. Avoid covering selected text and essential action controls where space permits. Measure tool size and anchor in a read phase, then write placement once. On narrow screens use a bounded panel with reachable controls, not an offscreen minimum-width rectangle.

Subscribe only to relevant scroll ancestors, owner movement/resize, tool size, viewport/zoom/font changes and source reflow dependencies. Reuse valid shared cell/annotation geometry; retain previous results to skip unchanged writes. Coalesce invalidations in one animation frame, but do not hide a full-document scan inside it. Typing must not measure unrelated tools, windows or cells.

If an anchor scrolls offscreen: dismiss a clean ephemeral popup without restoring stale focus; suspend an editing inspector and show an app-local “return to source” affordance. If the anchor is deleted or its version invalidates the binding, disable target actions and request explicit re-selection. Do not silently attach to today's caret. A stateful inspector may explicitly switch to floating to continue recovery; a menu cannot turn itself into a window. Cleanup releases observers, frame requests, mount registrations and anchor leases.

**Floating:** use owner-client coordinates for ordinary tools. They follow parent movement, clamp when the owner/work area changes, may extend beyond the parent's content bounds through a Portal, and remain below later owner groups. A shell-viewport position is an explicit adapter exception, useful while adopting today's Entity UI; it still follows owner visibility and layering. Converting from current viewport coordinates to owner-local coordinates happens once at adoption, not on every render. Initial Entity placement should use available space near the source if practical, falling back to the current centered layout; do not force a large search/candidate form into a tiny selection popup.

**Docked:** the app advertises named slots, widths/minima and responsive policy. The shell does not solve Flint's Explorer/inspector layout. Docking reserves app content space and delegates its rectangle to the same view host. Store prior floating bounds for undock. Neither mode becomes a desktop tile member.

Mode changes must preserve session state, request IDs, dirty fields, selection/candidate review, undo, focus and scroll. Transaction: validate capability/slot → defer during composition or incompatible modal/write state → capture focus → prepare destination → verify geometry/host readiness → commit placement and ownership lease → restore eligible focus; on failure retain source. Prefer the same mounted tool host with changed geometry. If real reparenting is required, prove it preserves DOM and Solid ownership; app session extraction alone does not preserve IME, native selection or undo. No docking affordance ships until this is proven. Advanced Entity docking remains optional after B; its current wide, two-column candidate layout is a real minimum-size constraint.

Persistence covers only app-validated slot/width/last-floating preferences in a later manual Save Workspace contract. It never serializes a live anchor, linking selection, pending Entity write or document contents.

## 6. Link Entity Reference: current trace and proposed integration

### Current invocation and state

1. [Bindings](src/features/entity-references/bindings.ts) register `Ctrl+;` then `R` for `entity.open` / `cross.entity`; the annotation contribution also opens the panel from selected ranges. `Ctrl+;` then `L` opens the separate Entity listing. Candidate review has its own primary-modifier/Shift-A opener and guarded selection commands.
2. `openEntitySearch` accepts selected cell ranges, snapshots content/placement keys and versions, records the repository revision and joins selected text for the initial query. With a collapsed caret it can open empty for candidate search; it does not infer the word at the caret. It does not assume a selected existing Entity.
3. [Annotation capabilities](src/application/annotation-capabilities.ts), `openPanel`, closes every overlay of the same type **in that editor**, regardless of source occurrence. It reads the source mount rectangle, clears cross-text selection and restores the first selected inline range before opening. The preserved target range list still carries all selected segments.
4. [OverlayService](src/runtime/overlays.ts) captures return-focus/selection information and queues focus. [PanelSession](src/runtime/panel-session.ts) registers an opaque-widget mount. `ContributedPanels` renders the feature view in a body Portal. The session API does not expose the overlay anchor to `EntitySearch`.
5. `EntitySearch` centers a large fixed floating form using viewport dimensions; it has local drag/resize signals. It focuses/selects its query input on mount and draws source-target decorations. The final CSS z-index 11000 can escape ordinary window ordering. It does not follow source scrolling as an anchored panel.
6. Search uses a debounce, abortable requests and stale-result guards. The component owns query/match/scope, results, selected Entity, candidate review, rename/alias fields, operation IDs and created-but-not-linked recovery state. `chooseEntity` checks the captured revision and creates `codex/entity-reference` properties; Entity creation and alias/name edits are separate service mutations. Invocation from another feature-enabled editor does not guarantee canonical service access: service resolution uses the source owner, and the UI reports that a bound native Document in a Flint vault is required when that service is unavailable.
7. Escape/close cancel the UI; Enter selects/links according to mode, arrows navigate, and field input/Tab remain native. Its root declares `aria-modal` while neither candidate review nor created-Entity recovery is active, but there is no complete modal containment.
8. [Input gateway](src/input/gateway.ts), `onPointerDown`, dismisses the top overlay without restoring focus when a pointer event resolves outside overlays, unless `allowDocumentInput` is set. Candidate review and created-Entity recovery enable that flag. Thus outside dismissal is not uniform across modes, and it is implemented outside the component.
9. `api.beforeChange` subscribes to repository changes, not just this source Document. Unless the tool itself is editing, an ordinary external change closes it; creating/created states instead invalidate the target and permit recovery. Opening another window through a repository mutation can therefore affect the tool independently of stacking. Revision rejection remains a safety guard, not an ownership model.
10. Cleanup disposes service reads, candidate work and decorations. Existing test sources cover no late annotation after cancellation, uncertain creation retry and recovery, native Tab/numeric input, stale queries and external edits. These tests were read, not run. They do not establish MWM owner-relative stacking or retained-host correctness.

### Proposed ownership and behaviour

Register one tool per `(ownerAppInstanceId, ownerWindowId, sourceViewId, purpose="entity-link")`, with a fresh SurfaceId for each session lifetime. Reopening the same context focuses/reuses it; replacing its target is explicit and guarded if it has pending edits or an uncertain operation. Different source occurrences may have independent tools after A1 qualifies scoped reuse and routing. Do not merely remove the current editor-wide singleton loop without updating outside dismissal, current-overlay routing and cleanup.

The domain adapter retains Entity services, range snapshots, candidates, validation, decorations, undo and cancellation. MWM receives owner identities, lifecycle hooks, source visibility, geometry intent and focus/dismissal policy. It never stores form fields or decides which Entity to link.

| Event | Proposed tool behaviour |
|---|---|
| Source selection changes | Keep the captured target; show its preview. New selection is used only by an explicit retarget/recovery action after validation |
| Source scrolls | Floating form stays owner-relative; source preview follows the editor. A future anchored mode follows/hides according to section 5 |
| Source or tool resizes | Clamp reachable controls, preserve fields and target; do not reset search |
| Focus shifts to Thesis | Lower Ink's owner group, keep the modeless task available; no focus restoration into Ink. Menus dismiss; tool does not implicitly cancel |
| Unrelated repository/window change | Must not cancel or invalidate the target solely for being unrelated. Use relevant change records and app validation; do not weaken revision checks blindly |
| Relevant source edit | Preserve current stale-target safety. A clean lookup can close as today; created/uncertain operation retains recovery state with target actions disabled. No automatic rebinding |
| Ink's document tab hides / owner minimizes / workspace switches | Suspend tool and preview with exact source occurrence; restore only when source is eligible. No focus trap or request completion may reactivate it |
| Owner closes | Run app/tool guards first, then revoke UI/focus tokens and dispose child-first. Related Thesis remains open |
| Crash/reopen workspace | Do not restore this linking workflow or replay creation. Optionally restore only future app layout preferences |

Making this a modeless tool deliberately changes the initial outside-click dismissal: ordinary application switching should retain the task. Offer explicit close/Escape and return-to-source instead. A1 must qualify this visible behaviour change rather than label it an invisible z-index fix.

The broad repository revision guard is a dependency to resolve, not permission to accept stale targets. Prefer transaction metadata that identifies affected content/placements, and revalidate the captured versions at commit. If supporting code cannot distinguish harmless changes safely within A1, retain rejection and flag the Entity/Thesis continuity case incomplete until a separately reviewed correction is ready. No per-keystroke full-document snapshots or inventory scans.

Pending Entity writes require particular care: closing after dispatch cannot undo an Entity already created. Preserve operation identity/outcome while suspended; invalidate late linking callbacks on close. A guard should distinguish undispatched edits, dispatched/uncertain creation and confirmed-created-but-unlinked state, with explicit cancel/recovery choices. Do not replay writes during restore or change existing manual Document saves. An app-owned operation session may be needed before safely allowing owner minimization; this is not MWM persistence.

### Interaction sequence

```mermaid
sequenceDiagram
  participant U as User
  participant Ink as Source editor adapter
  participant Scope as App scope / MWM
  participant Tool as Entity tool session
  U->>Ink: Select text and invoke Entity reference
  Ink->>Ink: Capture ranges, occurrence, versions and return bookmark
  Ink->>Scope: Register/reuse entity-link with actual owner window
  Scope->>Tool: Mount in owner group; grant focus token
  Tool-->>Scope: Ready with host generation
  Scope->>Tool: Focus search if token remains current
  U->>Tool: Search / choose Entity / edit fields
  U->>Scope: Reposition (or dock if a later adapter is approved)
  Scope->>Tool: Prepare and commit placement without recreating session
  U->>Tool: Return to source
  Tool->>Scope: Request source focus
  Scope->>Ink: Restore valid occurrence bookmark
  U->>Scope: Close owning window
  Scope->>Tool: Collect pending-write/edit guard
  Tool-->>Scope: Allow or veto
  Scope->>Scope: On allow, revoke child focus/async leases
  Scope->>Tool: Dispose tool and previews
  Scope->>Ink: Close owner view, keep resource data
```

Opening from an existing annotated Entity can later preselect its ID through a dedicated app command; the present selection-to-link command must not be described as already doing that.

## 7. Future promotion and detachment

Promotion belongs in E, after stable view hosts and durable descriptors. Candidate: a resource-bound Entity inspector/browser with independent browsing value. The current Entity *linking transaction* is source-dependent and not eligible for independent promotion by default. Menus, autocomplete, tooltips, inline property fields and pending confirmation dialogs are ineligible.

| Operation | Identity/state | Ownership after operation | Reverse operation |
|---|---|---|---|
| Detach an eligible inspector while retaining source dependence | Transfer same view/session and one host lease; no duplicate in-flight writes | New desktop window, explicitly dependent on original owner; owner close still guards/closes it | Dock back into valid app slot; refuse if owner gone |
| Promote a self-contained Entity browser | Transfer same view where adapter proves state continuity; stable Entity identity remains unchanged | New app/window owner; source becomes a related navigation reference, not lifecycle owner | Dock transaction changes ownership only after destination readiness |
| Open another browser for the same Entity | New view/session over same Entity, independent focus/scroll; no copy of unsaved form drafts or request tokens | Independent desktop owner | Close second view or explicitly move it; never pretend it is the transferred original |

Promotion must label transfer versus new view; retain pending edits only through an adapter that supports them. For a source-dependent link workflow, a separate read-only “Open Entity in browser” could create a related view while the linking tool remains intact; it must not silently detach the transaction.

Prepare destination bounds in the visible work area → defer composition/modal conflicts → obtain destination host → validate both owners → atomically transfer lease and owner → restore eligible focus. Roll back to source if preparation fails. Preserve the source bookmark as a navigation reference, not an unconditional focus return. Persistence is opt-in for an app-validated browser descriptor after D0/D1; runtime pending writes are excluded. This extends Resource → View → Window → Workspace without creating another Entity or Document.

## 8. Migration and qualification

The main roadmap now includes the foundation in **A0**, full scope focus/lifecycle proof in **A1**, anchor/floating and retained-host work in **B**, durable exclusions/preferences in **D0/D1**, owner integration with desktop tiling in **C**, and optional dock/promotion adapters in **E**. **F** extends the same ownership contracts to approved spatial/multi-display hosts; it must not treat screen/window coordinates as world coordinates.

Adopt metadata and portal layer leases around the existing overlay system first. Then migrate Entity focus/lifecycle and explicitly reviewed dismissal/reuse rules. Preserve the feature's domain validation, request cancellation and manual-save semantics. Only after these qualify should other floating inspectors move to common placement services. Keep Explorer, Backlinks contents, ordinary fields and app tabs local. Retain existing safety gates until their replacements are proven; no blanket removal of dialog detection or host-switch restrictions.

Every milestone remains behind the main default-enabled MWM feature flag with an exclusive legacy path; runtime hot switching between two managers is excluded. Advanced tool docking/promotion requires separately approved capabilities. A0 is broader than desktop-only ordering, but does not include a generic docking framework.

A0's overlap proof must keep the actual tool mounted, for example through the existing created-but-not-linked recovery branch with controlled service fixtures. Its disappearance after a repository change cannot count as correct layering. A1 separately qualifies ordinary lookup continuity and revised dismissal behaviour.

All checks below are **future qualification designs, not tests executed during this planning work**:

| Addendum scenario | Required observable result | Gate |
|---|---|---|
| Ink selection → Entity tool | Correct source occurrence/ranges, source preview retained, visible controls, initial search focus exactly once; cross-Block and collapsed-caret variants | A0 layer proof; A1 domain/focus proof |
| Entity tool visible → open Thesis | Actual overlap/hit test shows Thesis above normal Ink/tool group; no de-maximize; pinned/workspace-modal exceptions intentional. Unrelated launch does not erase target/task or cause late Ink focus | A0 order; A1 continuity/dispatch |
| Anchored tool → scroll/resize Ink | Reposition/flip/clamp or hide/dismiss per policy; no stale cached anchor; only invalidated geometry read; offscreen/source-deleted variants | B; current floating mode remains default |
| Minimize/restore, tab/workspace switch, owner close | Correct suspend reasons; no orphan portal/trap, stale focus or lost uncertain write. Close veto preserves all state; successful close disposes only dependants | A1 guarded lifecycle, B retained-host proof |
| Modal opened from tool | Owner-local versus workspace blocking enforced; nested picker usable; pinned ordering correct; return to invoker only if eligible | A1 |
| Dock/undock eligible tool | Same session/DOM or proven equivalent continuity, query/candidates/dirty fields preserved, no duplicate request, composition deferred, failed destination rolls back | Optional app adapter after B, separately reviewed |
| Promote eligible tool | Transfer has one host/view; duplicate has two views over one resource; ownership after source close and reverse docking match declared policy | E design until approved |
| Autocomplete/context menu | Lightweight lease only; absent from desktop MRU, tile tree and saved layout; closes without stealing focus from newer activation | A0/A1; D0 serialization rejection |
| Nested keyboard/accessibility | One Escape consumes one layer; native input and IME preserved; no modeless trap; modal trap works; named regions and focus return verified with keyboard and assistive technology | A1/B |

Additional targeted checks: two occurrences of the same Document in different apps; reuse in the same occurrence; stale lease disposal; outside pointer in another app; creation result after owner close; workspace change while lookup is pending; no hidden dialog restoring focus; anchor removed during resize; dock slot disappearance; no new inventory/snapshot/layout/network work on unrelated typing.

Use existing Entity tests as domain regression baselines: [search view](src/features/entity-references/search-view.test.tsx), [candidate review](src/features/entity-references/candidates-view.test.tsx), [lifecycle](src/features/entity-references/lifecycle.test.tsx), [Entity listing](src/features/entity-references/document-entity-list.test.tsx). Extend only with meaningful ownership/ordering/lifetime cases after approval. Finite interaction and bounded-work assertions are sufficient here; no load testing is authorised.

## 9. Risks, decisions and hold

| Risk / trade-off | Decision and qualification boundary |
|---|---|
| Over-centralization | Store policy metadata only; app owns content and dock layout. Do not register ordinary controls |
| A second window system | Scope handles delegate to one coordinator; existing OverlayService remains session/content owner through an adapter |
| Focus races / portal ancestry | Generation-tagged leases and native host lookup; replace unguarded return queues only in approved migration |
| Z-index escalation | Owner-group ranks; no app-assigned global priority; test physical overlap, not only computed z |
| Popup positioning cost | Shared geometry, narrow invalidation, read/write phases and cleanup. No whole-document measurement during typing |
| Component remount/state loss | Retained host proof before docking/minimize guarantees; block unsafe transitions meanwhile |
| Keyboard collisions | Reuse binding registry and existing Thesis shortcut, one event owner, no new global tool defaults |
| App-specific docking | Slots/constraints belong to Flint/Ink adapters; desktop tile solver does not lay out app panels |
| Entity's broad revision and singleton assumptions | Treat as explicit A1 integration work with stale-target protection; ownership records alone do not solve it |
| Hidden or closed tools with dispatched writes | Preserve outcome identity while live, guard close, prevent late annotation; never promise cancellation rolls back Entity creation |
| Partial modality accessibility | Qualify owner-scoped interaction separately from whole-page modality; do not infer blocking from `role=dialog` |
| Multiple tool sessions | Scope-aware reuse and source identities before enabling; bounded metadata subscriptions rather than registry scans on typing |
| Retaining tools consumes memory | Suspend optional work while hidden; no unreviewed eviction of dirty sessions |

The original A0 scope is completed and accepted. The subsequently approved A1 adds activation, focus and lifecycle coordination, with the Entity interaction evidence and limits recorded in its qualification report. Docking, promotion, independent Entity browsers and session recovery remain later work.

The user accepted A0 and explicitly approved A1. This supersedes the earlier hold for those two milestones. Common tool chrome, retained desktop hosts, docking, advanced positioning and promotion remain later work requiring separate approval. Mounted, visible and active are distinct view facts. Existing JSON workspace formats and manual Save stay unchanged. Acetate is a distinct future application that may share Canvas infrastructure, not an alias for the Canvas presentation.
