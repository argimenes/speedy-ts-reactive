# Flint B1 — native Document qualification

**Outcome: PARTIAL. The full-fidelity gate has NOT passed. Stop for review; B2 has not begun.**

Date: 29 September 2026. Scope: the approved [Stage B amendment](FLINT_STAGE_B_NATIVE_DUAL_SAVE_PLAN.md), B1 only.

A rich, closed canonical Document completed **capture → native UTF-8 bytes → decode → admission into the existing shared repository → ordinary browser editing → re-save**. Its authored graph, properties, local references and retained definitions survive the qualified cases. The same repository serves multiple Flint occurrences and their shared undo/redo. No second editor or content repository was introduced for a visible occurrence.

This is **not** evidence that every legitimately authored Mutable Document can be saved with full fidelity. Actual current producers expose value and resource-boundary mismatches. These are failed qualification cases, not a new definition of supported authored state. Production save/open routes remain unchanged. The implementation is isolated under [src/qualification/native-b1](src/qualification/native-b1/resource.ts); no production module imports it. There is consequently no new product flag or UI entry to enable. The new code does not alter any existing feature defaults.

## 1. Blocking findings

| Finding | Concrete producer and representation | Evidence and required compatibility decision |
|---|---|---|
| **Implicit Workspace-owned linked definitions** | `LinkedAnnotations.createForSegments` and multi-range `createBatch` in [runtime/linked-annotations.ts](src/runtime/linked-annotations.ts) put the shared registry on the repository root. In Flint this is the Workspace; Document segments retain `annotationId` and range/type, without source provenance. Entity annotation uses this same shared infrastructure. | The real command test reproduces it. Capture refuses to invent Document ownership or silently omit the definition. A reviewed rule must establish definition ownership/provenance and dependency handling, including cross-Document linked annotations. Copying the whole Workspace registry into each Document is not a valid fix. |
| **Document-local linked definitions do not resolve in the shared host** | In a standalone Document repository the same command writes the registry on the Document root. [resolveLinkedProperty](src/block-tree/linked-annotations.ts) nevertheless looks only at the current repository root. | Native encoding succeeds, but admission into the Workspace is deliberately rejected: the current resolver would ignore the Document registry. A resource-aware definition lookup is required, retaining shared identity and explicit foreign semantics. This is a platform correction, not Flint-specific behavior. |
| **Real authored values exceed the portable JSON grammar** | Rich-image paste in [input/gateway.ts](src/input/gateway.ts) writes `width: undefined` and `height: undefined` when dimensions are absent. `insertInlineImage` preserves those own properties in an image Cell. | A mounted editor, installed input gateway and actual paste event reproduce the failure. The resource encoder rejects the resulting payload. Dropping those keys would change the captured value. Review reuse of the existing lossless value grammar at the **payload/value boundary**, before the portable encoder's assertion. Normalizing future producers alone would not qualify existing saved/in-memory state. |
| **Owned nested Documents** | The ordinary `commands.insert(createFormattedDocument(...).document, …)` path accepts a Document owned within another Document. | The resource validator rejects `nested resource`. No edge is rewritten to a reference. Decide the durable treatment of this existing owned hierarchy; relaxing the validator without resolving resource identity/ownership is insufficient. |
| **Live cross-resource references lack durable provenance** | `commands.transclude` from another canonical Document creates a reference to a live private content key; it does not attach an external resource/target descriptor. | Capture refuses the boundary. A targeted producer/enrollment compatibility change must record authoritative resource and target identity. B1 neither follows the reference into ownership nor fabricates a source. Explicit descriptors already represent terminal dependencies, but ordinary transclusion does not yet produce them. |
| **Legacy type spelling is not preserved by the graph codec** | `decodeBlockTree` maps `main-list-block` and `membrane-block` to canonical `document-block`, while retaining the original `payload.type`. Such files are still accepted by the Document store. | The existing graph encoder emits `viewType`; decode reconstructs `payload.type` from it. The proof detects and rejects this rewrite. Review preserving the authored type with alias-aware canonical decoding; do not silently rewrite legacy authored payloads. |

The linked-definition and nested-resource decisions are the main architectural gate. B1 does not attempt their implementation or a general resource resolver. The pasted-image case is a narrower value compatibility issue, but it is still enough to defeat an unrestricted full-fidelity claim.

## 2. Concrete provisional `.mutable.json` contract

The qualification writes a UTF-8 JSON file, without History enrollment:

```json
{
  "format": "mutable-document",
  "version": 1,
  "resourceId": "resource",
  "document": {
    "format": "codex-portable-resource-gate",
    "version": 1,
    "resourceId": "resource",
    "root": {
      "placementId": "root-placement",
      "kind": "owned",
      "target": { "kind": "local", "blockId": "doc" }
    },
    "blocks": [
      {
        "id": "doc",
        "type": "document-block",
        "properties": { "metadata": { "documentId": "resource" } },
        "children": []
      }
    ]
  },
  "definitionOwnerBlockIds": []
}
```

This reuses `GateDocument` / `ResourceSnapshot`, rather than defining another graph or a duplicate tree. Keeping the existing inner discriminator makes that reuse visible; **both names/version choices remain provisional**. There is no memoir, saved-history receipt, Markdown association, export profile, timestamp, or speculative extension registry.

Contract exercised:

- `resourceId` must agree with the inner graph and the existing identity rule: root `metadata.documentId`, otherwise root authored ID. Root Block ID and resource ID may differ when metadata carries that identity. A separate catalog identity with neither correspondence is not qualified by this proof.
- Each structural definition has a unique authored `id`, `type` and open authored `properties`. Local content is stored once; ordered child edges and named relation edges retain owned/reference roles and stable placement IDs.
- `relations` contains `owned` edges and `opaque` authored data. Children/relations preserve omitted, `null` and present states.
- Standoff text uses ordered text spans and image atoms. Unicode Cell semantics, image descriptors and range payloads are preserved. Private Cell keys, private inline placement IDs and revision counters regenerate; they are not authored identities.
- `definitionOwnerBlockIds` restores **existing** root-relative retention membership, including unplaced definitions. It is not used to assign retention to all decoded Blocks.
- Explicit external targets retain their source/target/version descriptor and remain terminal. B1 does not fetch or resolve them.
- Unknown JSON-safe authored Block types and feature payloads survive without their feature implementation. Unknown reserved envelope, graph, Block, edge, external edge target, relation and inline fields/versions are rejected. Authored property bags are open, not treated as reserved wire fields.
- The current value grammar is portable JSON, with exact rejection of values JSON would coerce. Its insufficiency for current producers is a **gate failure**, not an approved permanent restriction.

The candidate reader is an isolated compatibility proof, not a hardened production file reader: it does not establish file-size/depth budgets, duplicate-JSON-member rejection, migrations or a release wire-version policy. Those cannot be inferred from successful semantic tests. No new speculative fields were added to conceal these omissions.

## 3. Capture and admission

`captureNative(snapshot, resourceId)` receives one detached repository snapshot. It finds exactly one canonical Document and one owned root placement. It follows **owned and inline** edges plus explicitly retained definitions; reference traversal never establishes ownership. It detects conflicting retention, multiple/outside owners, owned cycles, missing identities and implicit linked dependencies. It delegates graph projection and validation to the existing resource implementation.

The snapshot includes no Flint tab, Window, occurrence key, focus, selection, mount, projection or view bookmark. Capture mutates neither the live graph nor undo history. The zero/one/multiple-occurrence test produces identical native bytes. Stored authored metadata is retained as stored; capture does not inject occurrence focus bookmarks.

Existing authored placement IDs are retained. For legacy placements without IDs, the proof uses the existing `durablePlacementId` fallback (`legacy:<resourceId>:<private placement key>`), without normalizing the live repository. This is stable for that live canonical instance and becomes an explicit stable ID after native reopen. **Two independent tree decodes of the same legacy file do not supply the same placement evidence.** The proof does not declare those independent loads compatible or rewrite live ownership to force a match. A production first-save/adoption boundary still needs review.

`decodeNative(bytes)` validates detached bytes, allocates fresh private keys using the existing decoder, restores retention, validates the graph and verifies that recapture cannot silently drop orphan definitions. `admitNative(repository, bytes, bankContentKey)` accepts the **existing** `CanonicalRepository` and existing object bank. It checks identity/placement collisions before one repository commit of graph records and the bank child edge. It does not pass resource contents through `ExistingBlockDto`.

An already loaded identical resource is reused without a commit. Divergent disk/live state fails explicitly; dirty content is not replaced and history is not reset. Admission is an ordinary undoable commit in the host history, while file bytes carry no undo stack. Closing a view has no effect on its resource. B1 does not add a persistence coordinator or an application service locator.

## 4. Preservation/fidelity matrix

“Pass” below is limited to the stated producer and qualification; it does not mean the gate as a whole passes.

| Authored state / producer | Result | Qualification |
|---|---|---|
| Text Cells, emoji, combining marks, CJK, newline; ordinary text edit | **Pass** | Canonical semantic comparison independent of wire encoding; bytes/decode/admit/edit/undo/redo/re-save; browser typing. |
| All nine `createFormattedDocument` formats | **Pass** | Page, simple, sticky-note, journal, diary, letter, card, notebook, framed; real constructors, fresh admission and re-capture. Notebook's authored tabs remain structural data. |
| `timerBlockDto` | **Pass for idle state** | Real producer with duration, remaining time, size and position; appears in browser. Running/paused wall-clock behavior was not newly qualified. |
| `objectDto` / procedural 3D object | **Pass for produced state** | Real scene, view, lighting, settings and size payload preserved. No GPU objects/textures are serialized. No new 3D behavior or hosting was implemented. |
| Anchor `anchorCapabilities.commit` | **Pass** | Actual producer writes target authored Block ID and offset; payload survives. No geometry or drag work in B1. |
| `commands.ensureMargin` | **Pass** | Real owned margin relation/container/paragraph survives. |
| `RangeAnnotations.apply`, rainbow SVG property | **Pass** | Actual range producer; endpoints and property identity preserved through text edits. Effect is visible in browser evidence. |
| Single-range Entity `createBatch` | **Pass** | Local mention stores value/metadata on the property; no shared registry required. Broader Entity panel lifetime remains covered by Stage A regressions. |
| Multi-range linked annotations / Entity mentions | **Fail** | Workspace registry provenance and shared-host lookup mismatches in §1. |
| `createTextSuperposition` | **Pass for authored state** | Actual alternative relation, property identity, endpoints, active/visible state and alternative text survive. Feature enabled explicitly in qualification; no projection/rendering redesign. |
| Local `commands.transclude` | **Pass** | Owned/reference roles retained, one definition shared by both occurrences. |
| Foreign `commands.transclude` | **Fail** | Existing live pointer lacks durable provenance. |
| Inline `insertInlineImage` with concrete dimensions | **Pass** | Entire descriptor and Cell position preserved; self-contained image used for browser proof. Asset identity/URL preservation does not imply packaging external asset bytes. |
| Real rich-image paste without dimensions | **Fail** | Actual gateway produces own `undefined` fields. |
| Retained unplaced definition and reference cycle | **Pass at graph level** | Constructed canonical graph fixture tests existing retention model, including re-admission. It is not presented as a new UI producer. Existing ownership-lifetime suites also pass. |
| Explicit foreign target descriptors | **Pass at graph level** | Terminal descriptor retained, no foreign content copied. No dependency resolver qualified. |
| Unknown feature Block, unknown metadata/property, tombstoned property, opaque relation | **Pass for JSON-safe data** | Ordinary insert/set-payload commands, absent feature registration, independent semantic comparison. |
| Owned nested Document | **Fail** | Ordinary insertion accepted by repository, rejected by resource validator. |
| Legacy aliases | **Fail for exact native payload conversion** | Legacy tree loading still works; native candidate would rewrite authored type. |
| Non-JSON extension values | **Fail** | Generic set-payload command reproduces `undefined`, signed zero, NaN, Infinity, Date and Map failures. Apart from image paste, these are boundary probes, not claims that a named UI feature produces every value. |
| Grouping/current operation, selection, focus, panels | **Not serialized** | Transient runtime state remains outside authored persistence. Stage A browser/lifecycle regressions pass. |
| Workspace/Window/Canvas/Spatial presentation and nested applications | **Outside B1** | No new integration or persistence contract. |

This is a representative producer audit, not a claim to have exhaustively exercised every media, table, code, imported legacy or third-party payload producer. Opaque JSON-safe storage is established; full behavior of every unknown feature is not.

## 5. Legacy Document and Workspace compatibility

Existing legacy Document/Workspace code was not changed. Their focused materialization suites and server HTTP suites pass. Legacy local and server Workspace round trips retain Document identity and canonical ownership; Stage A tab-first and repeated-occurrence regressions pass.

The existing v1 manifest source validator accepts `example.mutable.json` with no new Workspace format. However:

1. The Document store's `validateDocument` requires a tree-style top-level `type` and rejects the proposed native envelope. A regression test confirms the rejection.
2. Passing the native envelope to `materializeWorkspace` does **not** materialize its graph: its tree decoder produces an unknown Block. The proof explicitly characterizes this; it is not a supported import path.
3. Legacy tree export rejects rich inline images. Even without images, a native shared reference can expand into duplicated tree bodies and lose the edge role. The characterization test demonstrates both limits.
4. The v1 manifest does not provide enough information to reconstruct arbitrary repeated **authored** Document placement roles. Transient Flint tabs do not need those roles; that Stage A distinction remains intact.

A future production path therefore needs explicit content-discriminator dispatch to graph admission and guards preventing native resources from taking incompatible tree-save routes. Those guards/routes are **not shipped by B1**. There is no native product Save/Open option yet. Separate native resources have been written only as qualification artifacts. No Workspace format, History format or server publication protocol was redesigned.

## 6. Remaining rejected or unqualified cases

In addition to §1: missing or duplicate canonical identity; missing/multiple canonical owners; conflicting retained-definition owners; foreign ownership reached through a local owned edge; unproven cross-resource targets; orphan definitions without retention; missing/duplicate Block or placement identity; malformed/unknown reserved fields and versions; stale/conflicting live bytes; legacy identity evidence regenerated by independent tree loads; and resource ID supplied only by an unrelated catalog are rejected or not qualified.

The existing codec additionally rejects shared/structured inline Cells, inline hosts/atoms outside its current grammar, cyclic payload objects, sparse/extended arrays, non-plain objects, symbols/accessors and non-finite/signed-zero numeric values. These are not declared illegitimate authored features by this report. No actual UI producer was identified for every one of these shapes. JavaScript property descriptors/prototype identity are not proven durable semantics here. No general JavaScript serializer was introduced.

External assets can disappear after reopen. An initial browser run used a nonexistent test image URL; the existing image `onError` command changed its stored status from `ready` to `failed`, correctly invalidating a byte-equality assertion. The final fixture uses an embedded SVG image, with the same real inline-image producer, so byte equivalence is not dependent on a missing network asset. Asset availability and runtime status writes remain existing behavior, not a codec repair or data omission.

## 7. Qualification and artifacts

- **32 B1 tests**: 31 resource/host cases plus one server-envelope rejection. This includes expected-failure characterization; a green test suite does **not** mean all authored features passed the persistence gate.
- **47 focused existing tests** across nine files: Flint transient/lifecycle, original Jet Stage A characterization, local Workspace, Workspace manifest, durable core, resource portable codec, definitions and ownership lifetime.
- **14 existing server HTTP tests**: Document store and Workspace store. **93 distinct automated tests passed** across those runs.
- **11 new Chromium checks**: actual WorkspaceSession admission, live Flint occurrence, rich byte equality, browser typing, undo/redo, stale rejection, second Window sharing, re-save/decode, no uncaught exceptions.
- **28 Stage A Chromium regression checks**: menu/default-on application, ordinary input, selection/toolbar/SVG, cross-Block selection, Grouping, composition, minimize/restore, focus, source disappearance/undo, multiple Windows, tab disposal and local reopen. All passed.
- TypeScript: qualification, existing client and existing server projects passed. No application build was needed for this isolated, unregistered proof. No typing/input core code changed.

Review files:

- [Initial rich native file](artifacts/flint-b1/rich.mutable.json)
- [Native file after command edit/reopen/re-save](artifacts/flint-b1/rich-resaved.mutable.json)
- [Native file after browser and shared-occurrence edits](artifacts/flint-b1/browser-resaved.mutable.json)
- [Native editing screenshot](artifacts/flint-b1/native-editing.png)
- [B1 unit results](artifacts/flint-b1/unit-results.json)
- [Native browser checks](artifacts/flint-b1/native-browser-results.json)
- [Stage A browser regression checks](artifacts/flint-b1/stage-a/browser-results.json)

Reproduce with Node 22 and the existing Vite server for browser checks:

```sh
node node_modules/vitest/vitest.mjs run src/qualification/native-b1
node node_modules/typescript/bin/tsc --noEmit --project tsconfig.native-b1.json
node scripts/check-native-b1-browser.mjs
FLINT_ARTIFACTS=artifacts/flint-b1/stage-a node scripts/check-flint-stage-a-browser.mjs
```

`B1_ARTIFACTS=1` on the resource test run deliberately regenerates the initial/command-resaved samples with fresh producer IDs. Run the native browser script afterward to refresh the corresponding browser sample. The scripts use isolated browser profiles/in-memory fixtures; they do not save user Documents to the server.

## 8. Review boundary

The architecture can carry a substantial rich **closed** Document through native bytes and ordinary shared-host editing. It cannot yet promise complete native fidelity across all existing producers and resource boundaries.

Before B2, review the linked-definition ownership/resolution contract, owned nested Documents, foreign-reference provenance, exact value encoding and legacy alias/first-save compatibility. Preserve Stage A's platform corrections. Keep any continuation targeted at these demonstrated compatibility failures; do not use them to justify a new Workspace format, a general persistence framework or unrestricted nested application hosting.

**B1 has returned its partial qualification result. Production native routes, paired-save, Markdown admission/export/gestures and Stage C remain unimplemented.**
