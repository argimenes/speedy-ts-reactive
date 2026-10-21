# E1.4 — Durable detached Document topology

**Design proposal only — no schema or migration implementation.** 21 October 2026, against accepted E1.3 (`1ef3de0`). Final contract and migration behavior require review and explicit implementation approval.

## Decision

Retain the Desktop **5** direction accepted in principle: separate `documentViews` and `documentHosts`, within existing Mutable JSON workspace containers. The contract records the intended canonical-resource/view/host relationship. It does **not** record whether an editor reached its host by retained transfer, reconstruction or fresh restoration.

Retained transfer keeps its runtime session identity. Reconstruction necessarily replaces that runtime identity while retaining the same logical Document-view identity. Explicitly opening a second independent view allocates another Document-view identity even when the resource is the same.

This proposal refines the [E1.0 persistence proposal](MUTABLE_WINDOW_MANAGER_E1_PERSISTENCE_PROPOSAL.md). That earlier proposal made Return addresses runtime-only and removed detached Flint membership. E1.3 instead retains a source navigation reference. The changes below are **proposed contract revisions**, not retroactive changes to accepted runtime behavior.

## Existing formats and authorities

| Layer | Proposed treatment |
|---|---|
| Local workspace | Keep `speedy-local-workspace`, schema 2, supported self-contained canonical content and existing filename conventions. |
| Server workspace | Keep `speedy-workspace`, schema 2, exact external resource manifests; Workspace Save never writes Document content. |
| Workspace presentation envelope | Keep version 1. |
| Managed Desktop | Version 5 adds the topology contract and explicit standalone-shell descriptors. |
| Binary split-tree/shell tabs | Keep layout version 1; leaves still contain window restore keys. |
| Canonical Documents, Blocks, propositions, Caverns | No ownership or identity changes. A layout is not a Cavern or a new resource container. |
| Native Save and durable history | Preserve existing authority, binding, manual Save and export restrictions. Desktop 5 does not waive them. |

No new extension, sidecar, automatic migration, background Save or crash-recovery file is proposed.

## Identities and collections

Allocate opaque typed restore identities once within the workspace. Do not derive them from runtime session IDs, ViewIds, NodeKeys, Block IDs, filenames or titles. Validate uniqueness and type-qualified references across the desktop catalogue.

Illustrative types below define the proposed semantics; they are not production TypeScript declarations or an implemented JSON schema.

```ts
type DocumentView = {
  restoreKey: DocumentViewKey;
  resource: { kind: 'document'; scope: 'workspace'; documentId: string };
  renderer: { id: 'ink-document'; version: 1 };
  host: DocumentHostKey;                  // one current host
  returnTo?: { applicationView: AppViewKey; slot: DocumentHostKey };
};

type DocumentHost =
  | { restoreKey: DocumentHostKey; kind: 'flint-tab'; applicationView: AppViewKey }
  | { restoreKey: DocumentHostKey; kind: 'document-window'; window: WindowKey };

type FlintReference = {
  slot: DocumentHostKey;                  // stable original slot, occupied or reference-only
  documentView: DocumentViewKey;
  order: number;
};

type FlintDescriptorV2 = {
  descriptorVersion: 2;
  references: FlintReference[];
  selectedSlot?: DocumentHostKey;
};
```

`documentViews` names logical editing presentations. `documentHosts` names available host slots. Occupancy is derived from `DocumentView.host`, avoiding two contradictory occupancy tables. A view has exactly one host; a host has at most one view. A reference-only Flint slot remains available but is not a second occupant or editor.

Host keys survive visibility/minimization and retained/reconstructed transitions. Closing a slot retires its identity; a newly created tab must not reuse it. The source Flint app view retains its own identity throughout detachment. A standalone host has a separate window restore identity; window IDs and Document-host keys are not interchangeable.

The catalogue can describe unloaded views and unavailable-resource placeholders. A durable view does not imply a currently mounted Solid owner or a live projection.

### Runtime standalone shells

E1.3 standalone shells have no canonical Block. Desktop 5 must not manufacture an authored Block to satisfy the older `anchorBlockId` rule. Add an explicit shell-view descriptor variant for a managed Document host, referring to its `documentHost` key. Existing anchored application descriptors retain their existing requirements. Its window references that shell-view descriptor, while the hosted Document-view entry references canonical resource authority separately.

This is a required validator/reader extension, not an optional unknown field in Desktop 4. Resource metadata must not be duplicated in the shell descriptor with competing authority. Old readers reject version 5 before interpreting these variants.

## Flint references and exact Return addresses

Flint descriptor version 2 has one ordered reference catalogue. For a hosted view, its slot is the view's current host. For a detached view, the same reference points to its independent host; selecting it reveals that window. Exactly one selected slot is allowed in a nonempty reference list, and none in an empty list.

Do not persist both authoritative legacy tab payloads and a descriptor-2 reference catalogue. Explicit upgrade converts presentation membership in a detached capture and omits conflicting legacy tab-target ownership from descriptor-2 serialized chrome. Canonical Document data is not rewritten. A load with conflicting representations is rejected.

Recommended Return policy: persist `returnTo` only while its exact app view and slot exist in the saved catalogue. On load, validate that relationship, materialize the exact destination shell/slot if needed through ordinary restoration, and acquire a **fresh runtime lease**. Only then enable Return. Durable keys do not authorize use of an expired runtime lease. Missing/incompatible app or slot disables Return; it does not select another app, create a new tab, or find one by filename/title.

If the source Flint window closes, prune its references/slots and the affected Return addresses in the same presentation transaction. Independent views remain functional. A malformed reference to an undeclared slot is a structural error; a declared but unsupported application becomes an unavailable host with Return disabled. These cases must not be conflated.

**Decision requiring approval:** preserving an exact Return address across reload extends E1.0's runtime-only proposal. The conservative alternative is to omit `returnTo` entirely on capture. Neither alternative changes the currently implemented runtime lease rules before Desktop 5 approval.

## Named arrangements

Recommended scope: hosting topology is **workspace-global**. Named arrangements capture window membership/visibility, order, pinning, floating bounds, split-tree and shell tabs, minimized/maximized intent and eligible active-window hints. Selecting one does not rewind internal Document hosting or switch retained/reconstructed editor generations.

Consequences:

- Detaching keeps the Document-view key, assigns a new standalone host and leaves its source reference. An older arrangement can conceal that new window, subject to ordinary retained-session policy; selecting the reference reveals it.
- Returning changes the current host back to the exact Flint slot. After commit, retire the empty standalone host/window/shell descriptor and prune it from **all** arrangements, collapsing empty split/tab nodes and clearing obsolete active hints. Mark affected arrangements dirty; do not silently write them.
- Closing a view uses domain/unsaved guards, then removes its catalogue entry and navigation references. Close never deletes the canonical resource. Hide/minimize retains catalogue membership.
- A failed transaction changes neither arrangement membership nor the committed host catalogue.

This preserves D1's distinction between hiding an existing session and disposing it. Storing a different Document-host graph per named arrangement would require a separate multi-view rehosting transaction, conflict resolution and failure policy. That broader behavior is not recommended for the first contract and must not be inferred from the words “named layout.”

## Validation and unavailable entries

Validation precedes workspace replacement and writing, outside the input path.

1. Preserve D0/C/D1 limits, JSON safety, finite bounds, order, split-tree constraints, anchor uniqueness and resource authority checks. Bound collection sizes and reference traversal work.
2. Require unique Document-view and host keys. Every view resolves one declared host; each host has at most one occupant. Runtime session IDs and DOM pointers are never durable identifiers.
3. A Flint slot belongs to one compatible declared app view; its reference and occupant, if any, agree. A detached reference may target a view elsewhere but cannot imply another occupant. Source Return references must identify that same view and slot.
4. A standalone host resolves one declared managed Document shell/window and exactly one hosted view. Duplicate window ownership, orphan standalone shells or contradictory descriptors reject the whole structural contract.
5. Resource identity resolves through the existing local embedded resource authority or server manifest. Missing/deleted/inaccessible resources create placeholders in the declared slots. Ambiguous identities do not silently choose one occurrence or create a resource.
6. Unknown renderer/app descriptor versions are preserved as bounded unavailable descriptors, with no execution. Retry requires support and the original identity. Explicit Locate/Relink must validate canonical identity; changing resource identity is a separate user operation, not filename guessing.
7. Remove retires only the unavailable presentation, reconciles source references and arrangements, and leaves canonical content untouched. Missing-host structural corruption is not repaired by inventing a host.
8. Older/future managed-desktop versions must follow explicit reader rules. Unsupported future versions reject before live replacement or overwrite; no “best effort” flattening to Desktop 4.

Store only allowlisted schema fields. Unknown descriptor extensions may be preserved as opaque bounded data under their own versioned contract, not interpreted as executable runtime state.

## Lazy restoration

Load and validate catalogue/layout descriptors first. Resolve canonical authority once per resource, preserving local/server distinctions. Register shell or placeholder records without constructing a Document editor for every hidden tab.

Construct an editing session only when its eligible host becomes visible/selected or explicit navigation requests it. Use the committed logical binding and a generation check so duplicate requests cannot create two current sessions. Minimized, concealed and unselected views can remain unmounted. Already-live sessions survive arrangement selection without reconstruction. Restoration cancellation disposes only its provisional candidate and cannot steal a newer binding.

Renderer readiness and resource resolution are separate. Missing resources remain visible placeholders with Retry/Locate/Remove. Unsupported descriptors do not trigger eager viewer loading or background ingestion. The last eligible active window is restored only after its host is usable and under a current focus lease.

## Save, upgrade and migration

- Loading D0/C/D1 formats does not mutate or rewrite them. Without opting into Desktop 5, existing non-detached capture behavior remains unchanged.
- First durable use of these relationships requires **Upgrade Workspace and Save As** with a new filename. Build and validate a detached snapshot; cancellation/failure leaves original bytes, active format and dirty acknowledgment intact.
- Allocate catalogue keys once in the upgrade candidate and adopt them only after the existing write/acknowledgment protocol succeeds. Repeated cancelled upgrades must not leak live hosts or partially adopt a version.
- Resolve old Flint/Ink membership by exact recorded resource authority and presentation anchors. Explicit independent occurrences receive distinct Document-view keys. Ambiguous references stop upgrade or become explicit supported placeholders according to D1 authority rules; do not merge by title.
- Capture only committed topology. Recommended policy during transfer/reconstruction: **refuse capture until it completes or is cancelled**, continuing E1.3's clear guard. Do not capture a half-move, automatically Return, or silently omit a candidate.
- Save receipts compare resource/presentation/layout revisions plus the logical-view catalogue and topology revisions. A late success cannot acknowledge a later detach, return, reconstruction, close or arrangement edit.
- Local captures remain self-contained where already supported. Server manifests retain exact resource references and write zero Documents. Preserve existing partial-failure and native-resource export restrictions; topology support grants no new resource packaging permission.
- In-place downgrade is rejected. Any future lossy export needs its own explicit contract and user choice.

Continue the current E1.3 workspace/named-arrangement guards until the entire reader/writer/validator/upgrade/receipt path is implemented and qualified under separate approval.

## Excluded transient state

Do not serialize Solid owners, DOM, runtime session/ViewIds/NodeKeys, lease generations, transfer journals, pending candidates, focus/caret leases, modal stacks, portal ownership, pending Save receipts, OCR/import/export jobs, viewer request controllers, playback or unsaved Thesis/tool/viewer drafts. Reopening is a new runtime session, not crash recovery.

Unsaved canonical Document content in a supported self-contained local workspace follows the **existing local content Save semantics**; that is distinct from persisting an unsaved application or annotation-entry draft in a layout. Server Workspace Save never acknowledges unsaved canonical Document edits. This distinction must be tested and stated in the UI.

## Required qualification before implementation acceptance

| Area | Required scenarios |
|---|---|
| Identities | Retained move, reconstruction replacement, Return and two independent views of one resource; stable logical keys and distinct runtime keys. |
| Local/server paths | Round trips, exact resource authority, no unintended Document writes, self-contained limitations, first upgrade Save As, cancellation/partial failure/stale receipt. |
| References | Hosted and detached Flint references, source close, source unavailable on load, exact Return resolution, no guessed tab/resource. |
| Layouts | Arrangements before/after detach and Return; dormant windows; pruning retired hosts; no implicit rehosting on selection. |
| Invalid data | Duplicate identities/occupancy, orphan shells, mismatched references, unsupported future versions, malformed bounds and schema limits. |
| Partial restoration | Missing/deleted/inaccessible resource, unsupported app/renderer, Retry/Locate/Remove and late completion after cancellation. |
| Lazy sessions | Many descriptors with no eager editor construction; one session per activated logical view; original session continuity for live arrangement switches. |
| Exclusions | No pending operations, drafts, focus/modal/portal/session state in captures; no validation or serialization during typing. |

## Review decisions

Approval is needed for the exact Return-address persistence policy; the workspace-global hosting interpretation of named arrangements; explicit unanchored standalone-shell descriptor shape; descriptor-2 normalization of legacy Flint membership; capture-time refusal during handover; and final key/collection limits and migration receipts. These decisions should be reviewed alongside the [session-replacement assessment](MUTABLE_WINDOW_MANAGER_RECONSTRUCTION_ASSESSMENT.md).

No Desktop 5 implementation is included in this work.
