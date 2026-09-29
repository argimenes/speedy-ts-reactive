# Flint B1.1 — compatibility resolution

**Status: bounded corrections implemented and qualified; stop for review. B2 and production native Save/Open remain unstarted.** Owned nested Documents remain design-only. This report succeeds, rather than rewrites, the accepted [partial B1 report](FLINT_B1_NATIVE_QUALIFICATION_REPORT.md).

The `.mutable.json` envelope and existing resource graph remain the native proposal. There is no new Document DTO, editor, Workspace format, History format, general resolver or persistence framework. These are platform corrections, enabled as ordinary behavior; there is no Flint-specific feature switch or injected editor access for features.

## 1. Resource-aware linked definitions

Implemented in [resource-identity.ts](src/block-tree/resource-identity.ts), [linked-annotations.ts](src/block-tree/linked-annotations.ts) and the existing runtime annotation service.

The semantic identity of a shared definition is **owner scope + resource ID + annotation ID**. Canonical owned edges and explicit definition retention establish the consuming Block's resource; a transcluded occurrence does not change it.

- A new linked annotation whose segments belong to one Document is stored once in that Document's existing `linkedAnnotations` bag. Local segments use `annotationId` resolved in that resource context.
- A new annotation spanning Documents is stored once on their current shared Workspace. Each segment carries the existing `externalDefinition` descriptor with the Workspace's stable identity and `unpinned` version. It is not copied into consuming Documents.
- An explicit foreign Document/Workspace descriptor takes precedence over local or root-registry entries with the same annotation ID. Missing, ambiguous or pinned sources do not resolve to an arbitrary current definition. Editing an unresolved/ambiguous definition fails explicitly.
- Renderers, Entity snapshots and the annotation monitor supply canonical content context. Shared edit/delete operations update the identified registry once and remain undoable. Segment lists are scoped to that definition's owner.
- Legacy unqualified properties retain the established root-registry fallback when no Document-local definition exists. Native capture interprets that known legacy rule on its detached snapshot and writes explicit foreign provenance. It does not mutate live state or copy definitions. A missing registry entry remains a capture error.
- Existing identity-less legacy roots still support local editing. They cannot produce a durable foreign descriptor until stable identity is established; no ID is invented by lookup or Save.

Clipboard Block copies receive fresh linked identities in the destination resource. Explicit foreign links remain foreign. Moving an owned annotated Block between Documents records its definition source in the same move/undo operation; it does not transfer the registry. A move of a Document resource itself is not assigned new semantics.

Qualification covers same-Document reopen in a shared Workspace; two occurrences; edit/delete/undo; one shared cross-Document definition; missing/ambiguous/pinned sources; colliding local definitions; legacy provenance capture without live mutation; Block copy and cross-Document segment movement. The browser also creates and edits a Document-owned shared definition through two ordinary Flint Windows.

## 2. Durable foreign transclusions

`commands.transclude` now records source resource identity and target authored Block ID using **the existing `ExternalTarget` type**. Version semantics are explicitly `unpinned`; no historical revision is invented.

The runtime distinguishes:

- `externalReference`: existing terminal/unavailable external target, with a private unresolved key;
- `resolvedReference`: the same target descriptor alongside a currently loaded `contentKey` binding.

This is a binding distinction within the existing reference model. There is no second reference graph. Native projection emits the same existing external edge for either case, and never saves the private binding or foreign body. Repository validation rejects a bound reference with a mismatched target ID, incompatible kind, unknown source, pinned version or simultaneous terminal descriptor.

Creating a foreign reference to a Document-owned Block also establishes its existing `definitionOwnerKey` retention membership in the **same authored command** when absent. This is necessary so the target can outlive removal of its last owned placement and still be captured in its source resource. Save does not normalize ownership. The existing `definitionOwnerBlockIds` field carries this membership through native bytes.

The isolated native admission proof binds only uniquely identified, already loaded, unpinned targets. It handles either resource load order, including binding a previously terminal edge when its resource is admitted. The binding and resource admission share one undoable commit. No network lookup, polling, observer chain or general load resolver was introduced.

Qualification covers live edits through the foreign occurrence, unchanged consumer bytes after foreign-only edits, both admission orders, unavailable targets, undo/redo of admission, retained targets after source-placement removal, and stale provenance after a source identity change. One older History gate fixture now explicitly constructs a **legacy pointer without producer provenance** so its original pinned-enrollment tests continue to test that earlier state. The gate's terminalization adapter drops a live binding when creating a terminal descriptor. History persistence and byte grammar are unchanged.

## 3. Authored values and provisional wire contract

Native payload bags, image descriptors and opaque relation bags use the existing lossless value grammar from [wire.ts](src/history/preplan-spike/wire.ts). Structural IDs, edge roles and resource envelopes are not value-encoded.

The one justified envelope addition is:

```json
"valueEncoding": "codex-authored-value-v1"
```

It distinguishes tagged authored values from ordinary user objects in the original B1 JSON files. New output declares it; absent means the original B1 plain-JSON interpretation. Unknown encodings and malformed/unknown value tags are rejected. Outer `format: "mutable-document"`, provisional version 1, resource ID, graph and retained-definition list remain as before. The native profile of the existing graph codec performs the mapping; its default History/gate writer profile remains unchanged.

| Value class | Result / contract |
|---|---|
| Null, booleans, strings, finite numbers, dense arrays, plain records | Preserved as values. Graph identity is represented by resource edges, not JavaScript object identity. |
| Own `undefined` properties, signed zero, NaN, ±Infinity | Preserved by the reused tags, including omission versus explicit `undefined`. |
| User data containing `$codexHistoryValue` | Escaped by the existing grammar; cannot impersonate a tag. |
| Date, Map, Set, DOM/class instances, functions, symbols, cyclic value objects, sparse arrays, accessors/hidden fields | No defined durable authored semantics in this value contract; rejected rather than converted. No audited feature requires persistence of these runtime objects. A concrete producer requiring them must return for a specific semantic decision. |

The actual mounted rich-paste gateway still writes own undefined dimensions. Its native capture/admission/re-save now preserves them exactly. Omitting absent dimensions in future producers is a reasonable canonicalization opportunity, **not** the compatibility solution implemented here. Similarly, non-finite numbers may be invalid for a feature's dimensions even though the value grammar can represent them; feature validation is a separate concern. No universal JavaScript serializer was added.

## 4. Legacy aliases

The native codec writes exact authored `type`, and reconstructs canonical `viewType` using the same alias mapping as the legacy decoder. Both `main-list-block` and `membrane-block` round-trip with their original spelling while editing as `document-block`. Other accepted types keep their authored spelling. Missing or inconsistent authored types are still explicit failures.

There is no migration command and no rewriting of existing files. The existing default History writer profile was retained; this phase does not retrospectively repair historical files previously written with canonicalized types.

## 5. Owned nested Documents

See the concise [owned-resource design recommendation](FLINT_B11_OWNED_RESOURCE_DESIGN.md).

Recommend allowing A to own resource B while B retains independent canonical identity and a native serialization boundary, distinct from transclusion. The proposed representation extends the existing edge model to an owned edge targeting a Document resource root, in a separately reviewed schema revision. The design explains why admission/storage retention, ownership authority, independent opening, moves, deletion and multi-resource save failure need decisions first.

**Nothing in that proposal is implemented.** Nested Documents were not flattened, turned into references, assigned a new DTO or admitted by relaxing the validator. Their current explicit native qualification failure remains.

## 6. Updated fidelity matrix and remaining limits

| B1 finding / capability | B1.1 result |
|---|---|
| Rich closed Document, shared occurrences, editing/undo/re-save | Preserved; existing B1 positive fixtures still pass. |
| Document-local linked definitions in a shared repository | Corrected and qualified, including real browser use. |
| Workspace/shared or explicitly foreign linked definitions | Provenance preserved; one owner/identity; no definition duplication. Dependencies may remain unavailable. |
| Legacy implicit Workspace registry | Detached capture adds explicit source using the existing root-registry rule; live registry remains in place. |
| Ordinary new foreign transclusion | Corrected producer, source retention, external native edge and qualified shared-host rebinding. |
| Pasted image's undefined dimensions | Corrected through exact value encoding, not producer coercion. |
| Legacy authored aliases | Exact native round trip qualified. |
| Owned nested Documents | **Design-only; native gate remains blocked pending review.** |
| Native product Save/Open, Workspace native dispatch and tree-export guards | **Still unimplemented.** Existing native files are qualification artifacts, not a supported production open/save route. |
| Broader transient/nested applications, Canvas/Spatial, Markdown/B2 | Not implemented. |

Conspicuous remaining limits:

1. **Whole-resource deletion with retained foreign targets is rejected atomically by the current repository command.** It does not cascade, orphan or transfer ownership. A dedicated test confirms no partial mutation. The new source-membership record exposes this existing retention constraint; final resource-deletion UX/policy needs review.
2. Changing a referenced resource's identity or moving a retained definition into conflicting ownership can make provenance stale; capture fails instead of silently retargeting it. General ownership transfer and rename reconciliation are not implemented.
3. Old live cross-resource pointers that never recorded provenance are not silently enrolled by guessing their original source. Newly produced references and existing explicit descriptors are qualified. Legacy first-save placement identity and independently decoded tree identity remain the B1 compatibility limits.
4. Unavailable and pinned dependencies are preserved, not fetched or treated as current data. Runtime binding on later arrival is implemented only at the isolated native admission boundary. Workspace registry/resource persistence is not redesigned to package every dependency.
5. The grammar preserves authored values, not object aliasing/prototypes or arbitrary runtime objects. Nested resource ownership and all-source lifecycle cases remain outside the passing subset. This is **not** a claim that the complete unrestricted native gate has passed.
6. Whole-Document/application clipboard composition and general resource-owner transfer were not newly qualified. The tested clipboard correction concerns ordinary Blocks and known annotation references.

## 7. Qualification and evidence

The focused qualification run passed **265 tests across 32 files**, covering B1/B1.1, Stage A lifecycle/identity, linked annotations, Entity features/monitor, cross-Block selection, repository/compact history, existing resource gates, legacy codecs and server Document/Workspace stores. See [machine-readable results](artifacts/flint-b1.1/qualification-results.json) for counts and cases.

Browser: **15 native checks** and **28 Stage A checks passed**. The latter include ordinary typing, selection/toolbar/SVG, Grouping, composition, focus/restore, source disappearance/undo and multiple Window lifetimes. Existing client, server and qualification TypeScript checks pass. The production client build passes, with an advisory about large chunks and outdated browser-mapping data; `git diff --check` is clean.

One additional strict commit-capture test fails in both B1.1 and the untouched accepted B1 commit **`7d6eb93`**: “never snapshots, serializes or enumerates the whole graph for strict captured typing and Enter.” A temporary diagnostic traced the enumeration to Solid's dev-store `wrap` called by `projection.ts:38`; it was then removed. A detached baseline checkout reproduced the original failure and was cleaned up. The test was neither weakened nor marked skipped. This baseline failure is excluded from the green focused-run count and remains conspicuous here. No claim of a comprehensive typing-performance comparison is made. Resource ownership lookups are cached per repository revision; linked-annotation rendering can invalidate that cache, so it is not advertised as zero-cost. Ordinary unlinked input has no added feature dispatch hook.

Artifacts (the original B1 evidence is retained):

- [Rich native input](artifacts/flint-b1.1/rich.mutable.json), [command re-save](artifacts/flint-b1.1/rich-resaved.mutable.json), [browser re-save with a Document-owned definition](artifacts/flint-b1.1/browser-resaved.mutable.json)
- [Native browser results](artifacts/flint-b1.1/native-browser-results.json), [editing screenshot](artifacts/flint-b1.1/native-editing.png)
- [Stage A browser results](artifacts/flint-b1.1/stage-a/browser-results.json)
- [Compatibility tests](src/qualification/native-b1/compatibility.test.ts) and [original B1 tests updated to assert the corrected cases](src/qualification/native-b1/resource.test.tsx)

Reproduce with Node 22 and the existing development server for browser checks:

```sh
B1_ARTIFACTS=artifacts/flint-b1.1 node node_modules/vitest/vitest.mjs run src/qualification/native-b1
node node_modules/typescript/bin/tsc --noEmit --project tsconfig.native-b1.json
NATIVE_B11=1 NATIVE_B1_ARTIFACTS=artifacts/flint-b1.1 node scripts/check-native-b1-browser.mjs
FLINT_ARTIFACTS=artifacts/flint-b1.1/stage-a node scripts/check-flint-stage-a-browser.mjs
```

**Stop here for review of the contracts, remaining limits and owned-resource design. Do not begin B2 or enable native product persistence on the strength of these results.**
