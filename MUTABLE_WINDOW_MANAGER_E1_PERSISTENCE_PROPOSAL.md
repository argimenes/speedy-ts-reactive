# E1 — Proposed persistence contract for Document view hosting

**Status: proposal only; separate approval required.** Prepared during E1.0 on 20 October 2026 against `819788a`. No schema, validator, reader or writer is changed by this document.

## Decision

Recommend **Managed Desktop version 5**, retaining the current JSON containers, filename conventions, shell layout version and canonical resource arrangements.

D1 Desktop 4 can preserve arbitrary extension JSON, but its implemented semantics describe one application view per window anchor. It cannot independently identify each Document view inside Flint or validate ownership of those views across Flint and standalone windows. Its named arrangements describe windows, not internal Document hosting.

The [E1.0 persistence probes](scripts/e1-boundary/persistence.test.ts) demonstrate that:

- A Flint window with two Document tabs captures one application view and one window, with no separate Document view identities.
- A view descriptor without a desktop window is rejected as orphaned.
- Two windows cannot own the same application view descriptor.
- An unknown `documentHosts` field containing impossible references is preserved, not interpreted or validated.
- The current reader rejects Desktop 5.

It is technically possible to encode more JSON under application descriptor version 2 while keeping Desktop 4. That would still require a new contract and new readers; existing unknown-field acceptance does not make it supported. A Desktop version bump is recommended because cross-application host validation, whole-workspace capture and named-arrangement reconciliation become core semantics. Old readers should reject the new contract before interpreting an incomplete topology.

## 1. Preserve the existing layers

| Layer | Proposed treatment |
|---|---|
| `speedy-local-workspace`, schema 2 | Unchanged outer format. Supported canonical Documents remain embedded and self-contained. |
| `speedy-workspace`, schema 2 | Unchanged outer format. Documents remain exact external references; workspace Save writes no Document content. |
| Workspace presentation envelope, version 1 | Unchanged. |
| Managed Desktop | Version **5** introduces the fields below. |
| Split-tree layout, version 1 | Unchanged. Leaves still contain managed window restore IDs. |
| Existing `views` | Continue to identify application/shell views anchored by `anchorBlockId`; do not reinterpret them as internal Document sessions. |
| Existing `windows` | Continue to refer to application/shell views. |
| Existing `layouts`, `activeLayout`, `lastActive` | Continue to describe window arrangements. They do not restore or transfer internal Document sessions when selected. |

No `.desktop`, `.canvas`, `.world`, sidecar or additional workspace file is introduced. Existing native-resource and durable-history workspace Save restrictions remain. This proposal does not package native resource pairs into legacy workspace JSON or change their authority.

## 2. New durable catalogue and host table

Add two required arrays to Desktop 5. They may both be empty.

### `documentViews[]`

| Field | Type and meaning |
|---|---|
| `restoreKey` | `document-view-<UUID>`. Stable presentation identity for one Document view; distinct from every runtime session/ViewId/NodeKey, window/app-view restore ID and canonical resource ID. |
| `resource` | Existing exact Document resource reference: `{kind: "document", scope: "workspace", documentId: string}`. Resolve through the existing workspace resource authority, never a title or path guess. |
| `renderer` | `{id: "ink-document", version: 1}` for the first qualified Ink/Flint Document renderer. Unknown IDs/versions are preserved as unavailable views. |

Multiple `documentViews` may refer to the same canonical Document. They represent explicitly independent views, not duplicate resources or independent canonical histories.

Do not serialize a runtime projection ID, occurrence root, render owner, caret, scroll bookmark, editor-local undo stack, unsaved application draft, lease generation, pending receipt or operation. Reopening creates a new runtime session for the saved durable view identity. It does not promise restoration of an unsaved editing session.

### `documentHosts[]`

Each entry references exactly one `documentViews.restoreKey` through `view`. Its `host` is one of:

```ts
// Illustrative contract only; no production type or validator is added.
type DocumentHost =
  | {
      kind: "flint-tab";
      applicationView: string; // existing views[].restoreKey, appId "flint"
      slotKey: string;         // tab-slot-<UUID>, presentation-only identity
      order: number;          // unique nonnegative safe integer within this app
      selected: boolean;      // exactly one selected slot in a nonempty app
    }
  | {
      kind: "document-window";
      window: string;         // existing windows[].restoreKey
    };
```

Host fields describe **current topology**, not transfer history or a second lease. A Document view appears once in this table. A detached view has a `document-window` host and no active Flint slot. A returned view has a `flint-tab` host and no detached-window membership.

The original return address remains runtime-only. After reopening, the application may offer an explicit choice of an eligible live Flint destination. This contract does not remember an abandoned source application or automatically recreate it.

### Application descriptor integration

- A Flint application participating in this table uses `appId: "flint", descriptorVersion: 2`. Its tab list is derived from the host table.
- A standalone Document host uses the existing `document-window-block` presentation anchor, with `appId: "ink", descriptorVersion: 2`. Its resource descriptor must match the one hosted `documentView`.
- The new standalone anchor contains no owned copy of the Document. A reference or renderer adapter supplies its view; canonical placements and semantic ownership stay unchanged.
- Other application descriptor versions keep their established behavior.

There must be **one tab-restoration authority**. A future explicit upgrade/capture must normalize old Flint tab payloads into the host table and omit their obsolete tab-target presentation payloads from descriptor-2 serialized application chrome. The live editor's canonical Document data is not rewritten. Descriptor-2 loading must reject conflicting legacy tab targets rather than mount both representations.

This normalization is a proposed serialization rule requiring approval and tests. Merely adding the host table beside fully authoritative legacy tabs would risk duplicate views.

## 3. Validation rules

Validation runs before live workspace replacement or writing, outside the typing path.

1. Keep all existing finite-geometry, split-tree, window ordering, anchor uniqueness, JSON safety, authority and resource-reference checks.
2. Enforce unique, correctly prefixed Document-view and slot identities. They cannot collide with Block IDs, resource IDs, workspace IDs or existing restore IDs. Do not derive them from runtime IDs.
3. Every declared Document view has exactly one host. No orphan, multiply hosted or unknown view reference is accepted.
4. A `flint-tab` host refers to a compatible Flint application descriptor. Slot IDs and order are unique within it; a nonempty tab set has exactly one selected slot. An empty Flint window is valid.
5. A `document-window` host refers to a compatible standalone Document window. That window hosts exactly one Document view. A descriptor-2 Ink window without its Document-view host is invalid.
6. Canonical Document identity resolves to one resource authority. Missing or inaccessible resources become D1-style placeholders; ambiguous or conflicting identity cannot be rebound by guessing.
7. Known resource descriptors agree across the Document-view table, standalone app descriptor and resource table. Validation never fixes disagreement by cloning or changing resource IDs.
8. Unknown renderer/descriptor data remains round-trippable. It occupies the same host slot as an unavailable view and cannot silently become a different renderer or resource.
9. Reject malformed hosting graphs and conflicting legacy descriptor-2 tabs as a whole load; partial resource restoration does not waive structural validation.
10. Reject runtime-only payloads recursively, including transfer journals, host leases, session IDs, pending operations and application drafts.
11. Named snapshots may refer only to retained, declared windows and their correct application views. They do not contain `documentHosts` overrides.

Placeholder Retry validates the exact original resource and renderer. Locate/Relink uses existing explicit identity validation. Remove releases the unavailable presentation entry and reconciles affected layouts; it never deletes a canonical resource.

## 4. Detach, return and named arrangements

### Detach

Retain the same durable `documentViews.restoreKey`. Replace its host entry with a standalone window reference; allocate distinct shell/app-view/window restore IDs if a new shell is required. Remove the source tab-host entry in the same presentation transaction.

The existing Flint application restore key stays with Flint. It is not transferred to the detached Document.

An older named arrangement without the new window keeps its existing D1 meaning: the new window may become retained but hidden and can be revealed from the registry list. Selecting that arrangement must not recreate the former Flint tab or rehost the Document.

### Return

Keep the Document-view restore key. Replace the host entry with a validated Flint slot. Retire the standalone presentation anchor/window/app descriptor only after the transfer commits.

Apply D1's existing removal principle to the retired window: atomically prune its references from all named snapshots, collapse empty split/tab nodes, clear obsolete active hints and increment affected arrangement revisions. This preserves valid arrangements without pretending that selecting one can resurrect an old host relationship. The UI/qualification report must disclose that retiring a window updates affected saved-in-memory arrangements.

This policy does not move other windows or overwrite a snapshot with the current arrangement. It only reconciles the removed member. A pre-commit failure restores the affected presentation records; it does not replay a whole-workspace snapshot.

### Close

Use ordinary session/resource close guards. Remove the closed view's catalogue/host entries according to the agreed close-versus-hide policy; hidden/minimized sessions remain represented. Closing the last view does not remove canonical Document data. A close veto changes neither table.

## 5. Upgrade, Save and compatibility

- Loading Desktop 2/3/4 never upgrades or rewrites it. Existing readers, validators and filenames continue to apply.
- Introducing durable Document-host topology requires the existing explicit **Upgrade Workspace and Save as…** flow, targeting Desktop 5 and a new filename. A canceled picker or failed write leaves the original format and dirty acknowledgement unchanged.
- Upgrade operates on a detached capture. Enumerate exact existing Flint tab targets and eligible Ink occurrences, validate authority, allocate durable Document-view/slot identities and derive current hosts. Multiple deliberate views of the same resource get different view keys; ambiguous canonical resources reject upgrade.
- No automatic save occurs when detaching, returning or selecting a layout.
- Native Document Save stays on its existing resource binding and manual workflow. Workspace schema 5 does not bypass a native-resource workspace restriction.
- Capture only a committed host table. During a transfer, Save either captures the last committed topology or explicitly waits/cancels according to the coordinator contract; it cannot capture half a move.
- Save receipts compare the captured host-topology and Document-view-catalogue revisions in addition to existing repository/presentation/layout revisions. A late receipt cannot acknowledge a later transfer.
- Local saves preserve self-contained supported content. Server manifests preserve exact resource registrations and write zero Documents. Existing unavailable-resource and self-contained-export restrictions remain.
- In-place downgrade from 5 is rejected. Do not silently discard detached hosting by exporting as Desktop 4. Any future lossy export requires its own explicit design and user choice.
- Unknown future Desktop versions reject before replacement/write. The E1.0 probe confirms the present reader already rejects 5.

## 6. Required qualification before approval to ship

- Upgrade from 2/3/4, cancellation, failed local/server writes, original-byte preservation and stale receipts.
- Local/server round trips with two Flint tabs, one detached view, two independent views of one resource, an empty source Flint window and a returned view.
- Stable Document-view restore key across detach/return; distinct resource, app, window and runtime identities.
- Missing/inaccessible resources and unsupported renderers in both tab and window hosts.
- Duplicate/orphan hosts, mismatched resource descriptors, identity collisions, conflicting legacy tabs and invalid selection/order.
- Named arrangements captured before detach, after detach and after return; no duplicate session or implied rehosting on selection.
- No draft, focus lease, pending receipt or transient tool state in serialized output.
- No schema capture/validation or resource discovery on ordinary typing.

This proposal defines a reviewable extension, not evidence that version 5 is implemented. E1.1 and persistence implementation both remain unauthorized.
