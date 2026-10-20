# Mutable Window Manager — E1.0 Qualification and Architecture Decision Report

**Date:** 20 October 2026. **Accepted source baseline:** `819788a` (`Window Manager: D1 complete`).

**Scope:** E1.0 — Boundary Proofs only. E1.1 and later batches have not begun.

## Result

**A retained Document editing boundary is viable, but current production tabs and Ink windows are not safe to detach by moving their DOM alone.**

The isolated Chrome experiment passed **41 checks** using production Flint, Document, standoff editor, portal and iframe components. It demonstrated preservation of a first-mounted retained editor's Solid owner, projection, ViewId, occurrence keys, editing DOM, canonical subscription and undo behavior across connected-host moves.

It also reproduced three important failure boundaries:

1. Ordinary Flint tab switching disposes and recreates the Document view.
2. Moving an existing Ink Document's DOM does not transfer its Solid lifetime. Closing the source window unregisters the editor while leaving connected, nonfunctional DOM.
3. Moving an iframe element can reload its inner browsing context despite preserving the element itself.

Native focus, selection and scroll did not survive raw `append` automatically. Explicit restoration worked for the tested standoff selection and scrollport. A production transfer coordinator, host/context rebinding, retained tab integration and resource-scoped commands remain future work.

**Persistence decision:** the existing D1 implementation cannot faithfully restore independently identified internal Document sessions and their hosting topology. Recommend a separately approved Desktop **5** contract, detailed in the [schema-extension proposal](MUTABLE_WINDOW_MANAGER_E1_PERSISTENCE_PROPOSAL.md). No schema has been changed.

## 1. Artifacts and experimental boundaries

| Artifact | Purpose |
|---|---|
| [Browser fixture](scripts/e1-boundary/browser-fixture.tsx) | Finite experiments with real application/editor components, owner probes, exact DOM/projection references and disposal counters |
| [Isolated Chrome runner](scripts/e1-boundary/run-browser.mjs) | Owns a temporary Vite server, Chrome process/profile and CDP input; cleans them up |
| [Browser evidence](MUTABLE_WINDOW_MANAGER_E1_0_BROWSER_EVIDENCE.json) | Check names, browser version, observed failures, identity/disposal metrics and fixture hash |
| [Persistence probes](scripts/e1-boundary/persistence.test.ts) | Seven tests against the unchanged D1 contract and existing local/server serialization paths |
| [Experimental typecheck configuration](scripts/e1-boundary/tsconfig.json) | Checks the isolated fixture/tests and their imported production dependencies |
| [Persistence proposal](MUTABLE_WINDOW_MANAGER_E1_PERSISTENCE_PROPOSAL.md) | Specific versioned extension for review, not implemented types or validators |

No production source file was edited. The earlier [E1 plan](MUTABLE_WINDOW_MANAGER_E1_IMPLEMENTATION_PLAN.md) remains unchanged. No feature flags, production commands, session store, canonical resource rules or persistence formats were introduced.

The browser page imports the experiment explicitly. It uses an isolated repository with two eight-paragraph Documents, one Ink window and a local iframe probe. Fetches are stubbed/blocked; the only recorded application request was the in-memory default-Vault lookup. No backend, production data, Document Save or publication was used.

The experiment temporarily wraps component registrations and editor methods **inside its isolated editor instance**. It observes the existing implementation; it does not patch production modules. Each wrapper records the Solid owner, an instrumentation-local signal and cleanup count, then renders the original registered component.

The retained proof creates a separate real `TransientDocumentView` once under a fixture-owned render root. It then moves **that same mounted subtree**. This demonstrates a viable lifetime boundary; it does **not** claim to have adopted the already-mounted production Flint tab or secretly substitute a newly opened view for detachment.

## 2. Flint session lifetime

### Current ownership chain

The path is:

```text
Flint application Instance
  → active Document tab conditional
    → Target / canonical placement conditional
      → TransientDocumentView
        → new BlockTreeProjection
        → ReactiveViewProvider
        → Document editor subtree + ReactiveViewLayers
```

[document-application-capabilities.tsx](src/application/document-application-capabilities.tsx) renders each tab panel inside `Show(activeTab() === key)`. Its `Target` mounts [TransientDocumentView](src/rendering/transient-document-view.tsx), which creates a new projection and invokes `editor.disposeView(projection)` on cleanup.

The cleanup records a view bookmark before releasing the projection. [editor.ts](src/reactive-editor/editor.ts) then closes projection-scoped interchange/overlays, removes occurrence selection/mount state, clears relevant focus and disposes the projection subscription. The canonical repository remains.

### Demonstrated behavior

| Observation | Browser result |
|---|---|
| Type in tab A with trusted Chrome input | Canonical text changed once through the real standoff editor |
| Select tab B | A's projection disposed once; its one constructor-established repository subscription unsubscribed once |
| Owner and DOM lifetime | Instrumented editor owner cleanup ran; editing DOM disconnected; mount entry disappeared |
| Return to A | New projection object, ViewId, occurrence NodeKey, editor DOM and owner-local state |
| Unsaved canonical text | Preserved |
| Repository undo | Still undid the edit after tab remount |
| Bookmark restoration | Tested selection `{anchor: 3, head: 6}` was restored in the new occurrence |

This is partial state reconstruction, not retained editing continuity. The bookmark currently covers inline/native selection and cross-text endpoints with revision checks, but does not preserve a scrollport or arbitrary component-local state. Preserving canonical undo does not prove that native embedded-editor undo or application-local state survives.

### Recommended boundary

Future E1.1 should establish a Document render lifetime before first mount, outside the active-tab conditional. Tab selection should control visibility/activity and host attachment, not own projection disposal.

Required ownership split:

- Workspace lifetime owns the retained Document render root and its resource/service leases.
- The Document session owns its private projection, occurrence mounts, editor-local state and view-local layers.
- A Flint tab owns membership and tab chrome only.
- A transfer reservation keeps the session alive; removing source membership cannot trigger its final disposer.

This is a recommendation, not an implemented store. Existing production `Instance`, `Target`, `closeTab` and active-tab behavior are unchanged.

## 3. SolidJS host transfer proof

### Positive experiment

The fixture mounts the actual `TransientDocumentView` under one independent Solid render root. Two ordinary connected containers serve as source and destination. Both are in the same browser document.

Before adoption, it records the existing projection object, ViewId, complete occurrence-key set, mount object, Document DOM, all editing cells and all instrumented Document/paragraph owners. The move is a single physical container adoption; it does not call a component factory again.

The final run demonstrated:

- Same projection object and ViewId, with no new projection allocation during adoption.
- Same complete occurrence-key set and registered text mount.
- Same Document DOM and every captured editing-cell element.
- No additional instrumented component invocation or owner cleanup.
- The original projection subscription remained active; no unsubscribe/resubscribe.
- A complete canonical snapshot taken immediately around adoption remained equal.
- A hidden/inert retained view still received an edit made through another view of the same resource.
- Trusted text input after movement modified that same canonical resource exactly once.
- Undo/redo remained attached to the existing repository history.
- Manual rollback after an injected attachment failure restored the same live subtree and text.
- Closing original Flint did not destroy the independently rooted editor; it continued accepting trusted input.

The private projection's final fixture disposer ran exactly once, releasing its component owner, projection registration and projection subscription. The workspace native-service object and canonical resource survived view disposal.

### Focus and scroll are separate obligations

The browser recorded the following immediately after raw adoption:

| Property | Before move | Raw adoption | After explicit restoration |
|---|---|---|---|
| Editor focus | Active | Lost | Restored to the same editing element |
| Inline selection | Anchor 4, head 9 | No selection captured inside the editor | Anchor 4, head 9 |
| Scrollport offset | 80 px | 0 px | 80 px |

Reverse adoption also produced a raw scroll offset of zero. The experiment restored the saved offset explicitly.

Consequently, retaining the DOM is necessary but insufficient. Future transfer must capture current interaction state just before attachment, restore only through a still-current activation/transfer generation, and account for layout changes. This experiment used equal-width hosts and one standoff range; changed-width logical anchors, cross-block ranges, native textarea undo and real IME remain unqualified.

### One disposal authority

For this proof, the fixture's render disposer is the sole owner of the retained private subtree. The current `TransientDocumentView` cleanup disposes its projection underneath that authority. Host container removal is not used as disposal.

For a shared-projection island, the island disposer releases its render tree and mount registrations only. The WorkspaceSession continues to own the shared projection. The experiment verified that distinction.

Future implementation must make this ownership explicit in types and leases. Do not let both a tab and a destination window independently call the final disposer. Do not infer session disposal from a temporary lack of visible host membership.

### What this does not prove

The experiment does not implement atomic registry/layout publication, asynchronous guard serialization, a resource-service lease transfer, portal rebinding or a generic transfer coordinator. Its failure test is a manual reversible DOM-attachment probe. It does not qualify every failure phase in the E1 plan.

The injected owner-local signal is an instrumentation sentinel. Its preservation corroborates retained ownership; it is not a claim that every component's private state field was inspected. Real text, DOM, selection, history, projection and subscription assertions provide the application evidence.

## 4. Ink eligibility decisions

The production Ink path renders through [WindowView and core views](src/rendering/core-block-views.tsx), [BlockOutlet/ChildBlocks](src/rendering/block-outlet.tsx) and the [workspace presentation provider](src/application/workspace-presentation-view.tsx). It commonly uses the workspace projection rather than a private Document projection.

### Existing Ink negative control

The real Ink Document initially used `loaded-workspace` as its ViewId. Moving its Document DOM into another connected container initially preserved the owner and mount. Closing the original Ink window then produced:

```text
owner cleanup count: 1
editor mount registered: false
adopted DOM still connected: true
shared workspace projection still alive: true
```

The remaining DOM was not a functioning retained session. Original declarative ownership still controlled its cleanup. This is a blocker to enabling a naive DOM-only detach action for current Ink views.

### Strategy by rendering path

| Path | Current eligibility | Recommended future strategy |
|---|---|---|
| Ink Document already in an independent desktop window | Already independently hosted. C can change floating/tiled/shell-tab presentation; no resource detach is needed. | Keep the existing window when that is the user's operation. |
| Direct Ink Document beneath an existing window, using shared workspace projection | **Not eligible for live hot adoption today.** Source-close failure demonstrated. | Establish a retained island at initial rendering when preserving existing shared occurrence routes matters. Keep the workspace projection alive; do not dispose it when the island closes. |
| Newly initialized Ink resource view with a unique canonical root/registration | Can be designed for detachment from first mount; not currently integrated. | Prefer a private resource-rooted projection with a workspace-owned render boundary. The private-projection experiment proves the basic lifetime/DOM mechanism. |
| Flint Document projection | Private projection already exists, but its owner is the active-tab conditional. | Retain it from first mount outside that conditional. Do not replace a live projection during Detach. |
| Native/server-backed Document shown through an Ink reference path | Resource resolution and occurrence ancestry add constraints. No transfer-specific browser proof here. | For new qualified sessions, private projection rooted at the uniquely resolved resource. Existing live occurrences require the retained-island lifetime boundary first; no opportunistic conversion. |
| Embedded/nested Document under generic containers or another Document | Parent lifetime and semantic resource ownership must be established. `embed-document-block` itself is a generic container, not proof of a resource session. | Retained island if it has a valid existing occurrence and independently retained lifetime; private projection only at qualified initial construction. Preserve the original resource's semantic owner. |
| Margin/relation/drawer occurrence | Conditional rendering and inherited margin providers can replace subtrees. Not qualified. | Block until the entire relevant retained/context boundary is defined; moving only the visible editor is insufficient. |
| Canvas/Spatial root or occurrence | Out of E1.0/E1 desktop scope. Presentation branches can unmount roots. | Separate host adapter and lifecycle proof; do not convert automatically. |
| Missing, ambiguous or unsupported resource | Ineligible. | Use existing recovery explicitly; never resolve by filename/title or fabricate a new resource. |

### Shared-projection positive control

A separate fixture-owned Ink island was established at its **first mount** over existing workspace projection occurrences. It moved between the connected containers with the same projection, NodeKeys, owner and editing DOM, accepted trusted text input, and disposed its rendering without disposing the shared projection.

This demonstrates the retained-island mechanism. It does not demonstrate retroactively moving a Solid owner out of the production window hierarchy. No such owner-adoption API or safe migration has been established here.

## 5. Application ownership audit

| Area | Current dependency | Required future change or restriction |
|---|---|---|
| Flint navigation | [document-application-navigation.ts](src/application/document-application-navigation.ts) maps application NodeKey to an `openDocument(id)` closure; registration ends with `Instance`. Default opening deduplicates by Document ID. | Resolve an explicitly targeted live session's current host. Keep ordinary reuse separate from creating another view. A source-app closure cannot remain the detached view's navigation authority. |
| Save keyboard routing | [shell.tsx](src/features/flint/shell.tsx) captures Cmd/Ctrl-S and checks `shell.contains(event.target)`. | A moved editor outside that shell loses this route. Provide one session/resource-scoped route; prevent duplicate shell/gateway handlers. |
| Save target | `files.save` calls `guard()`, resolves the current active Document and uses the source application's selected Vault lease. `status`, `location`, `recover` and comparison also depend on active-tab state. | Bind commands to an exact resource/session and preserve existing authority/dirty/receipt checks. Reusing these active-tab closures could save the wrong Document or fail after Flint closes. |
| Native resource authority | [native-session.ts](src/persistence/native-session.ts) is a WeakMap singleton per editor. It owns bindings, pending receipts, relocation and cheap dirty state. | Reuse it. Same-service identity and survival after source close were demonstrated; actual pending Save transfer was not. Keep pending writes/receipts blocked under the accepted initial E1 policy. |
| Vault/knowledge services | Feature registration owns shared factories; each Flint instance owns selected Vault leases, knowledge/facts and tool state. [document-vault.ts](src/application/document-vault.ts) releases shared entry work when its last user releases. | Classify/refcount resource services before source close. Merely retaining a DOM root does not retain an app-owned Vault lease. |
| Entity context/backlinks | Active origin comes from `liveViews` and active tab; the Entity list is disposed on application cleanup. Reference navigation validates mounted/current app state. | Keep app-wide tools with Flint. A session-owned linking interaction requires an explicit transferable adapter or blocks movement; do not dispose/promote it implicitly. |
| Input gateway | [gateway.ts](src/input/gateway.ts) routes DOM events through occurrence mounts and composition/input policies. | Same occurrence mounts permitted trusted text after movement in the experiment. Still qualify window authorization, stale focus, native editors, clipboard and modal coordination before production use. |
| Window owner resolution | Manager combines registered wrapper IDs, physical `[data-mwm-window]` ancestry and projection ancestors. | Add authoritative live host-lease lookup. Physical ownership may change while canonical ancestry and cached context still point to the source. |
| Context and coordinates | [context.tsx](src/reactive-editor/context.tsx) supplies stable projection/coordinate objects; components can cache host-specific values. | Retain projection, but provide reactive host/geometry/activity ports and audit consumers. DOM adoption cannot replace captured Solid context. |
| Portal/surface leases | [window-manager.tsx](src/rendering/window-manager.tsx) resolves portal ownership once with `untrack`, chooses a group and registers fixed ownership. | Negative control confirmed the portal stayed with Flint. Qualified surface parentage, stacking, geometry and lifecycle must rebind transactionally; unresolved surfaces block transfer. |
| Floating tool anchoring | [managed-floating-tool.ts](src/rendering/managed-floating-tool.ts) captures owner, geometry controller and visibility dependencies. | Rebind to the new host without resetting local tool state, or refuse movement with that tool open. |
| Modals | Application modal boundary and lifecycle registration capture owner window/surface. | Block affected moves until the modal/guard completes. A DOM move must not evade input containment. |
| View close | `closeTab` and `disposeView` intentionally release occurrence state. | Introduce a separate membership-transfer operation later. Neither existing close path is a detach primitive. |

**Demonstrated versus audited:** trusted editor input and native-service object identity survived the fixture-owned root's source closure. Detached Save, Vault lease survival, real Entity-tool transfer, modal coordination and application navigation after transfer were source-audited only. The fixture's portal marker uses the production portal adapter but is not a real transferred Entity linking transaction.

The existing Flint lifecycle regression suite passed, including its current Entity-panel cancellation behavior. That does not qualify a new transfer behavior.

## 6. Persistence decision and evidence

D1's [contract](src/persistence/managed-desktop.ts) requires a unique anchor per application view and exactly one window per view. [NamedLayouts](src/application/named-layouts.ts) derives runtime memberships from window placements and maps them to durable identities on explicit Save.

Two internal Flint Document tabs therefore do not have distinct D1 Document-view restore identities. Moving one into a separate anchor does not by itself establish a durable identity shared across its previous internal and new standalone host.

The seven E1.0 persistence probes establish:

1. Two Flint tabs currently capture one application anchor descriptor.
2. An inner view descriptor without a desktop window is rejected.
3. Two windows owning one descriptor are rejected.
4. Arbitrary unknown host fields survive validation even when their references are impossible.
5. Desktop 5 is rejected by the existing reader.
6. Existing local capture/load retains two canonical resources and anchor restore identities.
7. Existing managed server capture/load retains those identities and emits **zero Document writes**.

The local/server probes exercise production serializers/materializers with in-memory resources. They perform no actual filesystem write and do not claim to round-trip a detached session. Existing managed-desktop tests separately cover established Save cancellation/failure protections.

### Recommended contract

The [separate proposal](MUTABLE_WINDOW_MANAGER_E1_PERSISTENCE_PROPOSAL.md) specifies:

- Desktop **5**, unchanged outer JSON formats and shell layout version.
- A `documentViews` catalogue with independent durable view identities and exact canonical resource references.
- A `documentHosts` table assigning each view exactly once to either a Flint tab slot or a standalone Document window.
- Flint/Ink application descriptor version 2, with one authoritative serialized tab topology.
- Existing `views`/`windows` retained for application and shell identity.
- Named arrangements remaining window arrangements, not implicit rehosting instructions.
- Atomic pruning of a retired standalone window from named snapshots on return, following D1's removal principle.
- Explicit upgrade/Save As, fail-closed old readers, partial-resource placeholders and host-revision-aware Save acknowledgement.
- Runtime return addresses, drafts, selections, tools, focus leases and pending operations excluded.

Unknown-field round-tripping is not a safe substitute for this contract. No prototype validator or production format extension was implemented. Schema approval is a distinct gate.

## 7. Unsupported descendants and capability policy

Use an explicit capability policy over the actual mounted descendant types/state. Do not grant transfer merely because a block says `container`, `native-text` or `opaque-widget`. Evaluate outside typing; invalidate eligibility when relevant structure, mode, modal, composition or pending-operation state changes, and revalidate immediately before commit.

| Descendant/state | E1.0 evidence | Initial restriction |
|---|---|---|
| Ordinary standoff Document text | Actual owner/DOM/input/history continuity demonstrated in Chrome | Candidate for the first adapter, subject to host/input/geometry integration |
| Plain native text, code textarea | Source audit only | Require native selection, IME and undo proof before allowlisting |
| `code-mirror-block` | Current [CodeBlockView](src/rendering/core-block-views.tsx) is a textarea with a migration notice, not an integrated CodeMirror instance | Do not claim CodeMirror state continuity from this result |
| Source Markdown/HTML editor | [SourceBlockView](src/rendering/source-block-view.tsx) owns composition state, preview worker request and a conditional preview iframe | Block pending conversion/preview work and mounted preview iframes; source-only mode still needs native-editor qualification |
| Generic iframe, HTML/PDF iframe aliases, YouTube iframe | Real `IframeView` element moved unchanged; load count increased **1 → 2**, edited iframe-local value reset to `"fresh"` | Block DOM-reparent transfer for mounted browsing contexts with this mechanism |
| Activated provider video | [VideoBlockView](src/rendering/video-block-view.tsx) owns iframe activation and observes a captured ancestor chain; hiding can unload playback | Block active playback. Inactive placeholder mode needs an explicit capability, not automatic permission |
| Native video/audio or other media | Playback/buffering/presentation effects not tested | Block until resource-specific continuity is demonstrated |
| PDF.js/IIIF viewers | [PDF](src/rendering/pdf-block-view.tsx) and [IIIF](src/rendering/iiif-block-view.tsx) own async loading, viewer instances and destroy-on-cleanup behavior | Block until page/zoom/scroll, render tasks, grants and resize ownership are qualified |
| Structured, web, academic and other opaque viewers | Separate controllers, async work and possible nested browsing contexts | Default unsupported; per-viewer capability required |
| Open modal or pending close guard | Fixed owner/input containment | Reject affected transfer without dismissing the dialog |
| Linked Entity Reference or other transaction tool | Source occurrence and application/portal ownership can diverge | Reject unless an explicit adapter preserves transaction, owner and focus; no implicit promotion |
| Nonmodal inspector/popover | Fixed surface lease unless specifically rebound | Move only after its adapter is qualified; menus used to invoke an action may close normally |
| IME, active selection/drag capture | Composition/gesture lifetime not qualified by these experiments | Block until settled; never force blur or cancel composition to move |

The iframe result disproves a generic “same DOM means same embedded session” assumption. Other browsers or a future state-preserving DOM API might offer different behavior, but neither is demonstrated here and neither is a basis for E1 eligibility.

## 8. Resource usage and suspension boundaries

Retention trades fewer remounts for longer-lived subscribers, mounts, DOM and optional workers. E1.0 demonstrates required canonical delivery while hidden, not that a hidden session currently becomes computationally idle.

| Work | Current evidence | Recommended treatment for future retained sessions |
|---|---|---|
| Projection repository subscriber | One per private projection; stayed subscribed while hidden and delivered another view's edit | Keep active. Release only on final session disposal. |
| Canonical history, native binding, dirty flags, Save receipts | Repository/resource-owned | Keep active independently of view visibility; never pause acknowledgement/consistency work. |
| Selection/bookmarks and editor-local state | Retained by owner/mount lifetime | Retain. Hidden sessions must not request native focus; preserve enough state for eligible activation. |
| Caret rendering | [caret-modes.ts](src/runtime/caret-modes.ts) tracks visible surfaces; standoff editor reports IntersectionObserver visibility | Suspend hidden caret paint; preserve providers and logical selection. Inactive-but-visible differs from hidden. |
| Annotation/search/selection geometry | [standoff-editor-view.tsx](src/rendering/standoff-editor-view.tsx) uses resize/intersection observers and scheduled measurement; visibility gates some search drawing, not every measurement | Hidden sessions can accumulate invalidation without drawing. On reveal, refresh affected geometry in shared read-before-write batches before hit testing. Do not use stale caches or sweep every Document during typing. |
| Count worker | [DocumentCountBar](src/rendering/document-count-bar.tsx) owns a worker; [DocumentCounts](src/runtime/document-counts.ts) schedules after repository changes and has no visibility-suspend API | Keep narrow dirty/member bookkeeping; defer hidden count dispatch and derived UI publication, or share a resource-scoped cache. Do not multiply full root rebuilds across retained tabs. |
| Pointer spotlight/tool anchors | Event/frame-driven, with window/ancestor geometry and visibility dependencies | Suspend hidden measurement/paint; rebind/invalidate the host dependency on transfer. |
| Graph, search results, backlink previews and summaries | Flint/application-owned services with cancellation and request guards | Pause optional hidden rendering and stale preview requests. Preserve query/local state and canonical reference inventory; do not rebuild backlinks on unrelated text edits. |
| Source/resource preview work | Component-local worker/controller/viewer state | Avoid new optional work while hidden; cancel only work defined as disposable and keep generation guards. Do not cancel a domain operation merely to permit transfer. |
| Resource loading/indexing services | May be shared through Vault/native factories | Refcount at the correct authority; do not suspend shared work because one view becomes inactive. |

The final fixture run recorded one text-count Worker, three posted messages over the run, and termination at teardown. One message occurred during the bounded hidden interval. This is a **fixture-wide counter**, including the separate Ink window; it does not attribute that message to the hidden transient view and is not a CPU, memory or latency measurement.

Source inspection shows that `DocumentCounts` schedules from repository events and may rebuild its root after structural changes. Retaining many independent copies without an activity/shared-cache policy would amplify optional work. This report identifies the risk; it neither changes that service nor runs a load test.

Maintain three explicit states:

- **Mounted:** canonical subscriptions and editing state exist.
- **Visible:** geometry/rendering needed for the current presentation may run.
- **Active:** this view may own input and activation-specific behavior.

An inactive visible window still needs correct visible content. A hidden window can defer optional presentation work while retaining consistency.

## 9. Verification performed

### Browser

Command:

```sh
MWM_TRACE=1 node scripts/e1-boundary/run-browser.mjs
```

**41/41 checks passed**, Chrome **155**, headless on macOS, with trusted CDP text input. Browser evidence includes exact failure observations, projection subscription/disposal counts and the fixture hash.

This is a finite correctness fixture, not a benchmark or load test. It does not qualify OS IME, other browser engines, browser zoom, changed-width anchoring, native file pickers, pending Save transfer, or full managed-host transactional behavior.

### Targeted tests

Command:

```sh
npx vitest run scripts/e1-boundary/persistence.test.ts \
  src/application/flint-transient-proof.test.ts \
  src/application/flint-lifecycle.test.tsx \
  src/persistence/managed-desktop.test.ts
```

| Suite | Result |
|---|---|
| New E1.0 persistence probes | 7 passed |
| Existing Flint transient projection proof | 5 passed |
| Existing Flint lifecycle | 24 passed |
| Existing managed-desktop contract | 26 passed |
| **Total** | **62 passed, 0 failed** |

Experimental typecheck:

```sh
npx tsc --noEmit -p scripts/e1-boundary/tsconfig.json
```

Passed. This checks the experimental files and imported dependencies; it is not a claim that the entire client/server build was rerun.

The accepted 13 baseline regression failures were **not rerun or reclassified** in E1.0. No production code changed, and the targeted existing suites above passed. The report makes no new full-suite regression claim.

### Experimental corrections and observed failures

- An initial identity assertion compared occurrence keys across an intervening real text edit/undo. Those operations may legitimately replace cell occurrences. The final proof captures keys immediately before adoption, isolating transfer from content changes.
- A reverse-move scroll assertion exposed the real browser reset. The final evidence records the raw zero and tests explicit restoration rather than claiming automatic continuity.
- Initial persistence fixtures incorrectly mutated the clone returned by `desktopOf`, omitted managed server-bundle arguments/registrations, and attempted Desktop 4 capture without a managed WorkspaceSession. The fixtures were corrected to use the actual production contracts; no production behavior was changed to make them pass.
- The isolated typecheck required an explicit check that the captured selection existed.
- The Ink source-close and iframe reload failures are intentional negative controls that remain present in the current implementation. They are architectural blockers, not suppressed test failures.

### Cleanup

Final browser teardown verified zero remaining editor projections and termination of every instrumented Worker. Render roots, event handlers, containers, temporary method wrappers and fetch/Worker interception were released/restored. The runner exited successfully after closing its Chrome process, temporary profile and Vite server.

Tests use in-memory fixture resources. No production files, databases or Vaults were created. The checked-in artifacts are only experimental source, evidence and review documents.

## 10. Architecture decisions and blockers

| Decision | Recommendation | Evidence/status |
|---|---|---|
| Retain Flint Document rendering outside active-tab conditionals | Proceed only in an explicitly approved E1.1 | Current destruction and independent-root viability demonstrated |
| One disposal authority | Workspace-owned session render lifetime; private projection disposed by that lifetime, shared projection owned by WorkspaceSession | Both private and shared proof boundaries demonstrated |
| Adopt already-live legacy owners | Do not claim support | Raw Ink source-close failure demonstrated; no safe owner extraction proven |
| Host/context ports | Introduce generation-aware owner, activity, geometry and command binding | Required by source audit and portal negative control; not implemented |
| Selection/scroll restoration | Explicit transfer interaction snapshot and stale-focus checks | Raw loss and bounded restoration demonstrated |
| Dirty canonical Document movement | Preserve existing dirty/history authority; no implicit Save | Canonical text/history continuity demonstrated; production Save routing still blocked |
| Pending writes, IME and transactional tools | Keep initial refusal policy | No continuity proof for these lifetimes |
| Durable host topology | Review Desktop 5 proposal separately | Existing D1 contract limits tested; no schema changed |
| Embedded content | Explicit allowlist with runtime capability checks | Iframe loss demonstrated; other resource viewers unqualified |
| Hidden resource work | Preserve required subscriptions; add optional-work activity policy before retaining many tabs | Canonical delivery demonstrated; suspension design remains future work |

The blockers to shipping E1 are the production render-lifetime boundary, host/context and command ownership, service-lease independence, lifecycle transaction implementation, approved persistence topology, and qualification of eligible descendant/input states. These do not prevent completion of E1.0; identifying and demonstrating them is its outcome.

**E1.0 is complete. Work stops here. E1.1, schema implementation and later batches require further explicit approval.**
