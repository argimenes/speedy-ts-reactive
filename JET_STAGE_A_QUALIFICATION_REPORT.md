# Jet Stage A — qualification gate report

**Date:** 29 September 2026  
**Status:** Stage A has **not passed**. Stopped at the reference-placement persistence prerequisite.  
**Scope completed:** executable identity/ownership proof using current core commands and both supported Workspace materialization paths.  
**Scope not completed:** production Jet shell, composite hosting adapter, browser editing/focus/toolbar qualification and feature-removal build. No Stage B–E work began.

## Finding

A live tab can reference and edit an existing Document without copying or moving it. Shared Document identity also survives save/reopen. **The owned/reference roles of its occurrences do not survive independently of tree traversal order.**

If a Jet tab appears before its canonical vault source in the saved Workspace, the reopened tab becomes the owned placement and the vault source becomes a reference. The existing `commands.unlink` operation then rejects the tab's Document occurrence:

```text
Only a reference placement can be unlinked
```

This happens with both self-contained local Workspace JSON and the server Workspace manifest/bundle. Saving the same arrangement with the source before the tab masks the problem. Ownership should not depend on where the application Window appears in the Workspace tree.

No Document content loss was observed in this reproduction. Closing the entire Window still leaves both Documents reachable through the vault. The failure concerns preservation of the canonical ownership/reference contract, not deduplication of content or an observed deletion of user data.

## Reproduction

The test fixture contains two Documents with deliberately distinct root Block IDs and Document resource IDs:

```text
workspace
├── window-block: jet-window
│   └── jet-application-block
│       └── tab-row-block
│           ├── tab-block: tab-a → reference to doc-a
│           └── tab-block: tab-b → reference to doc-b
└── workspace-object-bank-block
    └── container-block: vault
        ├── owned Document doc-a (documentId: resource-a)
        └── owned Document doc-b (documentId: resource-b)
```

The fixture's application type is an ordinary authored DTO used for the qualification test. It has no registered production Jet view. Vault membership is ordinary metadata outside the Window.

1. Materialize the Workspace and create one existing editor/projection.
2. Call the existing `commands.transclude` for each Document into its tab.
3. Verify tab `kind: reference`, vault source `kind: owned`, and matching content keys.
4. Edit text through the tab occurrence and rename the Document through ordinary core commands; verify both occurrences share those changes and retain their identity.
5. Save through `editor.persistence.captureWorkspace().document`, JSON-round-trip and materialize locally; separately create and materialize a server Workspace bundle.
6. Verify shared identity still exists, but the earlier tab now has `kind: owned` and the source has `kind: reference`.
7. Call `commands.unlink` on the reopened tab's Document placement; observe the rejection.
8. Close the application Window and verify the two source Documents remain accessible, with the surviving source placement still marked reference.

| Check | Result |
| --- | --- |
| Live transclusion points at one canonical Document content record | Pass |
| Editing and renaming propagate across occurrences | Pass |
| Distinct authored Block and Document resource identities are preserved | Pass |
| Live reference unlink and Window removal retain source content; Window removal is undoable | Pass |
| Local reopen deduplicates repeated Documents | Pass |
| Server bundle emits two Document resources for two Documents; reopen deduplicates their occurrences | Pass |
| Canonical owned/reference roles survive local reopen regardless of order | **Fail** |
| Canonical owned/reference roles survive server-manifest reopen regardless of order | **Fail** |
| Reopened tab occurrence remains eligible for the existing unlink operation | **Fail when tab precedes source** |
| Conflicting repeated Document content is rejected instead of silently merged | Pass |
| Source-first order preserves the expected roles in the local control case | Pass, but demonstrates the order dependency |

## Root cause and why this is a review gate

- [`transclude` in commands.ts](src/block-tree/commands.ts) creates a new reference placement with the existing content key. The live model supports the intended distinction.
- [`encodeBlock` in codecs.ts](src/block-tree/codecs.ts) expands content into the existing tree DTO without serializing the occurrence's `kind` or the intended canonical owner.
- [`createWorkspaceSaveBundle` in workspace-manifest.ts](src/reactive-editor/workspace-manifest.ts) externalizes Document occurrences as document-reference placeholders. It also does not retain their original owned/reference role.
- `materializeDocumentIdentities` in that same module decodes each occurrence as owned, retains the first Document identity and converts later duplicates into reference placements. This successfully restores sharing, but cannot recover an ownership distinction absent from the saved representation.

The approved [plan](JET_MUTABLE_OS_IMPLEMENTATION_PLAN.md), §3, explicitly says:

> If tab references cannot round-trip through the supported path, stop at the proof gate and report the exact failure.

The simple persisted-reference tab strategy fails that requirement. Preserving ownership would require either an explicit persistence-contract change or a different tab occurrence strategy. Neither is a cosmetic shell fix. I have not added Jet-specific ownership guesses to the generic loader, reordered the user's Workspace to influence decoding, or adopted the portable-format spike as a workaround.

## Bounded alternatives for review

### Recommended next proof: transient Document occurrences in authored tabs

Keep the vault membership and each tab's stable target Document ID as ordinary authored application/tab metadata. The canonical Document remains in its existing owner. A core-owned slot resolves and renders the active Document as a transient occurrence using the existing editor/projection machinery, rather than serializing a duplicate Document subtree under each tab.

The current `ReactiveEditor.createView(viewId, rootPlacementKey)` is a concrete primitive to investigate for this. Such a view would share the repository and editor, have distinct mounted occurrence keys, and be disposed with the tab. It would not be a hidden editor or a second Document DTO.

This is a **proposed follow-up proof, not an implemented or qualified solution**. It must check projection disposal, selection/focus and toolbar scope, source disappearance, inactive-tab behavior, multiple occurrences and save/reopen. A separate view is needed if the same source is already mounted elsewhere; rendering the same NodeKey twice would conflict with mount ownership. The feature should still receive only a bounded core-owned Document slot, not `createView` or editor access directly.

The saved tab would cease to contain an authored Document reference placement. This is the transient-slot fallback anticipated in the approved plan, but it changes the first proposed tab strategy and should be reviewed before continuing. It avoids a new Workspace wire format and leaves room to retain ordinary TabRow/Tab Blocks.

### Alternative: preserve occurrence roles in persistence

Define generic saved evidence of which occurrence is owned versus a reference, then update both local and server Workspace encoding/materialization. Old files without that evidence would retain their current behavior; new files would need validation for missing/conflicting owners and compatibility with shared definitions, exports, undo and external references.

This is a persistence-contract extension affecting more than Jet. It may prove bounded, but its exact representation and compatibility need a separate decision. It has not been implemented or sized as a routine fix within this Stage A pass.

### Workarounds not adopted

- Forcing the vault/source to precede every application occurrence in serialization.
- Inferring ownership from a parent named `jet-application-block`.
- Replacing reference unlink with unconditional removal merely to hide the role change.
- Copying or reparenting a Document into a tab.
- Enabling an experimental persistence format or creating a Jet-specific document store.

## Evidence and verification

- [Executable proof](src/application/jet-stage-a-proof.test.ts): five qualification tests.
- [Test log](artifacts/jet-stage-a/qualification.log): **13 tests passed** across the proof and existing local Workspace/manifest suites.
- Client TypeScript check passed.

**The passing test run is not a passing Stage A.** Two proof cases deliberately characterize the observed ownership inversion and rejected unlink; they will need to change when a reviewed solution is qualified. The existing eight Workspace tests continue to pass because they establish shared identity/materialization, not preservation of an externally chosen canonical owner.

Reproduce with Node 22 or later:

```sh
npx vitest run src/application/jet-stage-a-proof.test.ts src/reactive-editor/workspace-manifest.test.ts src/reactive-editor/local-workspace.test.ts
npx tsc --noEmit --project tsconfig.reactive.json
```

All proof data is in-memory. No server file writes, live user Document edits, runtime feature changes, new application menu, persistence fixes or browser claims are included in this pass. The proof ran before composite-hosting implementation because persistence is a prerequisite to that proposed arrangement.

**Awaiting review of the tab occurrence strategy. Stage B remains independent and has not begun.**
