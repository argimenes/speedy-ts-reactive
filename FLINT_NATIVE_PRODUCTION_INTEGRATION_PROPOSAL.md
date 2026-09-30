# Flint native Save/Open — minimum production integration proposal

**30 September 2026. B2 and this bounded proposal are accepted. Implementation results are in the [production qualification report](FLINT_NATIVE_PRODUCTION_QUALIFICATION_REPORT.md). Stage C remains unstarted.**

Recommendation: integrate **per-Document Server Open/Save** using the existing document-store location shape and the accepted native admission/pair coordinator. A new Workspace format is not necessary for that bounded path. **Saving/reopening a Workspace containing native resource registrations remains guarded and outside this proposal.** This is an explicit product limitation, not a promise of complete session persistence.

## 1. Existing paths and minimum changes

| Current implementation | Proposed change |
| --- | --- |
| [Flint view](src/features/flint/index.tsx) and [application capabilities](src/feature-api/document-application.ts) expose opening an already loaded Document, renaming and tab closure. | Add narrow host-provided Open file, Save active Document and resource-save status actions. Resolve the active tab to its canonical resource ID; keep editor/repository/filesystem access out of Flint UI. |
| [PersistenceService](src/reactive-editor/persistence.ts) has `DocumentLocation`, `workspaceReference` and `registerWorkspaceDocument`; [WorkspaceDocumentSource](src/reactive-editor/workspace-manifest.ts) is `{kind: "document-store", folder, filename}`. | Reuse those validated locations and ID-to-location associations. `.mutable.json` already passes filename validation. Keep pair status/expected file versions in resource persistence bookkeeping, not authored Document metadata or tab state. |
| [Server document store](server/document-store.ts) validates tree Documents, injects filename metadata on load and publishes through its legacy writer. | Add explicit native load and pair save/status/recovery dispatch using the accepted codec and B2 adapter. Return unchanged native bytes, identity, location and observed file versions. Never pass native data to the tree validator, metadata mutator, tree indexer or History save path. |
| [Workspace Open](src/application/workspace-open.ts) currently loads a DTO and inserts an owned Document Window. | Add a shared native-admission operation used by Flint Open, without routing native data through that DTO insertion path. Admit once through non-owning `resourceRegistration`, then use Stage A's transient occurrence. Leave Desktop/Canvas/Spatial hosting generalization alone. |
| B1/B2 code lives under `src/qualification`. | Promote only the qualified codec/admission, Markdown projection and per-resource coordinator/managed adapter into ordinary platform modules; keep tests/fault hooks in qualification. Reuse the graph/value codec without altering History or introducing a persistence framework. |

The first writable target is the existing private/local Node document store. Preserve public-hosted read-only behavior. Browser downloads and individual file handles remain export operations, never paired-save success.

## 2. Open, enroll and save

**Open native:** select a server file; validate format/version and canonical identity before admission. Resolve already-known identities against the selected location and observed bytes. Reuse an existing canonical resource only when unambiguous; divergent files/live state require an explicit conflict, not replacement, duplication or ownership adoption. Required dependency locations come from existing registrations or an explicit Locate action, with decoded identities checked. Do not infer paths from IDs or create a discovery/catalog subsystem.

Native bytes remain authoritative regardless of a newer `.md` file. Corrupt native input fails explicitly. Missing dependencies remain unresolved under existing admission rules and prevent a durably complete owner save. Once admitted, add the ID to Flint's existing membership and open the transient tab; membership and the occurrence confer neither ownership nor storage retention.

**Open Markdown:** offer a clearly labeled import into a new native candidate through the B2 subset importer. Leave source bytes and any original rich resource untouched. Prefer the native counterpart when a known pair is opened; importing changed Markdown is an explicit separate action. No production rollout of additional Markdown syntax or gesture machinery is needed for this Save/Open integration.

**First Save:** choose a canonical `.mutable.json` location and a sibling Markdown name (default: remove `.mutable.json`, append `.md`). Legacy tree Documents save to a new native destination; leave the legacy file intact. Unknown existing destinations conflict. Opening a native file without pairing evidence must not silently enroll or overwrite it: explicitly establish its reviewed byte baseline and resolve any Markdown collision, or choose a fresh destination.

**Subsequent Save:** capture once per canonical resource, freeze the export mapping/profile and publish through B2. Closing tabs does not cancel the operation; newer edits remain dirty. Resource status must distinguish Saved, Canonical saved/Markdown pending, Confirmation pending and Conflict. Repository-wide `lastSavedRevision` is not a substitute for a resource's acknowledged generation. Acknowledging one Document does not acknowledge Workspace layout or another Document.

## 3. Small production hardening required

- **Caller baseline:** send the native/Markdown hashes and confirmed generation observed at Open/last successful Save. Under the resource lock, compare those with current files and durable evidence. B2 currently reads the latest receipt itself; that alone would let a second stale editor overwrite another editor's completed save. Never refresh the caller's baseline automatically. Keep Mutable authorizes only the precisely reviewed Markdown hash, not a changed native file.
- **Transport recovery:** expose the existing durable generation/status, so a lost HTTP response reconnects to the same operation rather than publishing a second generation. Reuse B2 intent/receipt evidence and retain pending generations across server restart. Validate retry identity and payload; do not trust a client-supplied Saved claim. Whole-session closure needs an unsent-dirty warning; already staged server work belongs to the resource.
- **Managed locations:** reuse server path confinement/read-only checks; validate both destinations and private staging paths as regular files/directories, reject unsafe symlinks, enforce size limits and prevent two resources from claiming a destination. Missing lock support fails closed. No change to publication ordering or claim of two-file atomicity.
- **Bypass guards:** legacy Document, Workspace bundle, compatibility and local-tree writers must reject writes that bypass an enrolled/native resource. Keep existing native tree-export guards. Do not enable legacy tree indexing for native files. Extended repository export cannot acknowledge a resource pair.
- **Conflict UI:** reuse Compare, import-as-new-candidate and pre-publication Keep Mutable. A conflict after partial publication remains blocked with preserved files and a visible recovery explanation; no force overwrite, intent rewriting or automatic cleanup. In-place conflict resolution and relocation of a pending pair remain separately gated.

These are request validation, adapter integration and minimal status UI, not a new authored storage model. Enrollment is recovered from the selected native location and B2 pair evidence; no new global enrollment catalog is proposed.

## 4. B1.2 and Workspace boundary

Owned dependencies retain separate native files and canonical IDs. Validate the available owned closure before confirmation; save required missing/dirty dependencies explicitly first where necessary. Do not recursively enroll/export their Markdown or promise an atomic owner/descendant save. `external` remains a serialization boundary; authored owned edges remain the sole ownership authority. Load order, location registration and Flint membership cannot adopt a resource. Preserve cycle, unknown-owner, deletion/transfer, unloading and History graph-2 guards.

**Separate Workspace limitation:** `captureWorkspace` and `createWorkspaceSaveBundle` call tree encoders before externalization; those deliberately reject `resourceRegistration` and owned external edges. Merely putting a `.mutable.json` name in the existing manifest does not solve this: current loading expands Document DTOs and materializes tree ownership. Do not bypass those guards or reinterpret a manifest reference as an owner.

The minimum release therefore leaves affected Workspace Save disabled with an actionable explanation: save native Documents individually; reopen them through Flint's file Open. Unaffected legacy Workspace paths stay available. Automatic restoration of native registrations, Flint membership and tab presentation would require a separately reviewed manifest save/load mapping and ownership/retention semantics. Whether that can reuse schema version 1 is unqualified. **If complete Workspace round-trip is required for release, stop here for that decision; do not invent a new Workspace/storage contract during integration.**

## 5. Acceptance gate

Qualify the real UI/server route end-to-end: native Open → two transient tabs → edits → paired Save → close/reopen with native fidelity; zero-view completion; stale second client; lost response/server restart; partial publication/external-write conflicts; explicit Markdown import; missing owned dependency; read-only server; every legacy bypass rejection. Rerun Stage A/B1/B1.1/B1.2/B2 regressions and verify existing legacy Open/Save remains unchanged.

Approve this bounded integration separately before implementation. Stop again after its qualification; Stage C remains unstarted.
