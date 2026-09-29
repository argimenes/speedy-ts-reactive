# Flint B1.2 — owned-resource and storage qualification

**Status: bounded implementation and qualification complete; stop for review.** B1.1 is accepted. This implements the accepted distinction between authored content membership, resource lifetime ownership, storage retention and presentation. It does not enable production native Save/Open or begin B2.

The proof can retain/open B before A, later resolve A's owned-resource edge without adopting or copying B, edit B through multiple ordinary transient occurrences, and save/reopen A and B as separate native resources. No new Workspace envelope, owner backlink, Document DTO or generalized resource manager was required for this bounded proof.

## 1. Owned-resource edge and schema

The outer `.mutable.json` envelope remains `format: "mutable-document", version: 1`, with the accepted `valueEncoding: "codex-authored-value-v1"`. The existing resource graph and portable graph now have **version 2** for owned external edges. Version 1 remains reference-only for external targets. Native capture emits version 2 when the resource contains such an edge; unknown versions remain rejected.

Example in A's graph:

```json
{
  "placementId": "authored-placement-of-b-in-a",
  "kind": "owned",
  "target": {
    "kind": "external",
    "reference": {
      "kind": "block",
      "targetId": "b",
      "source": { "scope": "document", "resourceId": "resource-b" },
      "version": { "kind": "unpinned" }
    }
  }
}
```

`external` describes the serialization boundary; `owned` describes resource ownership. The authored edge in A is the **only ownership authority**. A derived `resourceOwnership` query follows those edges; it is not a second persisted index/backlink. Duplicate claims, including two owned edges from the same A, and ownership cycles are rejected. References do not enter the ownership graph.

Owned targets must be unpinned Document resource roots, with no route or target-placement selector. The descriptor shape is checked on decode. When B is absent, its root identity cannot yet be verified; the edge remains unresolved. Admission when B becomes available and the native file proof both verify that the target is B's actual root, not another Block in B. Wrong-root admission fails atomically in either load order.

Capture now stops at an actual authored nested Document boundary. It extracts A and B separately, retaining B's Block/resource identity and authored content. It does not flatten, duplicate or reinterpret nesting as transclusion. B's standalone root placement is distinct from the placement authored in A: first capture of a legacy nested B uses the deterministic root identity `resource-root:<resourceId>`. Native admission retains that root identity on its registration thereafter. This is part of the proposed initial conversion contract, not an ownership-transfer implementation. Existing standalone roots retain their existing IDs; prior legacy first-save identity limitations are not generally solved.

The native codec supports graph 2. Existing History codec/enrollment paths are guarded against claiming support for this extension; durable History integration is not qualified here. Ordinary repository Undo/Redo continues to work.

## 2. Retention and storage representation

The minimum runtime addition is an explicit private **`resourceRegistration: true`** on a **reference** placement from the existing object bank to the loaded Document root:

```ts
{ key, placementId, contentKey: documentRootKey,
  kind: "reference", resourceRegistration: true }
```

The registration gives existing reachability/pruning and projection machinery a canonical retained root. It grants no semantic resource ownership. Validation requires a Document target, an object-bank child slot, no external binding on the registration itself, unique registration and unambiguous resource identity. It cannot be moved into a tab/Window and treated as storage.

The registration is rebuilt at isolated native admission, not saved inside B's authored payload. Native B writes its ordinary local root edge and graph. A's owned external edge binds to the same loaded root through the accepted `resolvedReference` descriptor; if B is absent it uses the existing terminal `externalReference` representation. No hidden duplicate editor or body is introduced.

Core Document root lookup now prefers an explicit registration, with the existing unique owned-placement fallback for legacy Documents. Flint's host adapter and linked-definition editing use that lookup. Visible occurrences are still Stage A projections, independently mounted/disposed, with no authored placements of their own.

**No claim of production Workspace native support:** ordinary legacy Workspace/Document tree export rejects registrations or owned external edges rather than dropping their roles. Existing legacy Workspace round trips still pass. The native proof reloads separately located files and reconstructs registrations. Existing manifest location concepts are sufficient for this experiment, but dispatching native files from the production Workspace loader remains unimplemented. This did not require a replacement Workspace envelope.

## 3. Admission, independent opening and transclusion

All cases run in the existing shared repository:

| Case | Result |
|---|---|
| A before B | A retains a terminal owned edge and an ownership claim; B admission binds it atomically. |
| B before A | B gets a non-owning registration. Owner evidence is **unknown**, not “unowned.” Later A supplies authority. |
| B opened/edited while A is absent | Ordinary Codex editing and Undo/Redo work; native B saves independently. |
| A subsequently reunited with edited B | B's existing content, history, identity and occurrences are retained; A does not overwrite it. |
| Two transient occurrences of B | Distinct occurrence keys/mount lifetimes, shared canonical content/history. Disposal leaves B and the other view intact. |
| C references B | Ordinary external reference; no extra owner or body. Removing the reference retains B. |
| A and C both claim B | Second conflicting admission fails before mutation, in either order. No first-loaded-owner takeover. |
| Duplicate ownership claims in A | Rejected. |
| A owns B, B owns A | Rejected. |
| A owns B, B references A | Accepted; projection uses existing cyclic-reference behavior. Reference cycles are not ownership cycles. |
| Missing B | Owned edge remains terminal; A bytes remain representable, but a complete durable A save requires locating B. |
| Missing A/owner evidence | Retention and editing are allowed; absence supplies no permission for adoption, transfer or destructive deletion. |
| Conflicting disk/live B | Existing native conflict rejection remains; admission does not overwrite or reset history. |

Proof scope is the loaded repository plus explicitly supplied durable catalog. It cannot prove the absence of an owner in an undiscovered file or another store. No global ownership oracle is claimed.

## 4. Native-only A/B file proof

[The isolated filesystem proof](src/qualification/native-b1/owned-resource-files.mjs) receives frozen native snapshots and an explicit resource-ID-to-file-location map. Resource identity is checked against decoded bytes; an ID is never guessed to be a path. It follows the existing server store's temporary-file, file-sync and publication pattern, without changing server routes or validators.

- Saving B writes only B. Saving A writes only A plus its owned-resource edge.
- Preflight validates known ownership claims, dependency roots, locations and conflicts before publication.
- First publication orders dependencies before owners: **B, then A**. A-only saving fails if B cannot be located and decoded.
- An interrupted first pair reports **incomplete**, including files already published. If B succeeded and A failed, B remains valid; retry verifies it and finishes A. No pretend rollback or all-or-nothing transaction is claimed.
- A replacement needs explicit prior bytes and rejects detected divergence. New files use exclusive publication. Completion re-reads the requested resources and owned dependency closure.
- Independent editing/re-save of B leaves A's bytes unchanged. Loss of B during publication prevents a complete result, even if A's file was already published.

This is a finite **single-writer qualification**, not a concurrent store or transaction framework. The check-before-rename sequence is not a multi-process atomic compare-and-swap. The supplied catalog is not a persisted new catalog format, and there is no discovery service, save journal, Markdown output or production location UI. General crash recovery and concurrent writer coordination remain outside this proof. The tests exercise real temporary files and clean them up.

## 5. Move and deletion limits

There is no ownership-transfer command. Moving an owned external edge with the ordinary Block move command is rejected; unwrapping/flattening it is also rejected. A future transfer must preserve B's identity and explicitly update authority, with durable multi-owner-file failure semantics reviewed first.

Closing occurrences and removing C's reference do not delete B. Removing a registration, its containing bank, or an owned-resource edge through ordinary remove commands fails conservatively. Admission Undo restores the previous validated state; undoing A's arrival leaves a previously loaded B and its occurrence intact. No cascade, orphan adoption or garbage collection on missing-owner evidence is introduced.

The existing B1.1 retained foreign-Block deletion constraint remains. Whole-resource deletion UX, unloading/reloading a resource while preserving foreign consumers, and arbitrary composition/clipboard restructuring are not newly supported. Low-level repository operations are an internal validated mechanism, not a user-facing authorization model for destructive resource actions.

## 6. Updated native-fidelity matrix

| Capability | B1.2 result |
|---|---|
| Rich closed Document capture/bytes/admission/edit/re-save | Passing B1 regression retained. |
| Document-local, Workspace/shared and explicit foreign definitions | Passing B1.1 ownership/provenance/edit/undo results retained. |
| Foreign Block transclusions and retained source definitions | Passing B1.1 results retained. |
| Undefined image dimensions and the accepted authored-value grammar | Preserved; no serializer expansion. |
| Exact legacy aliases and unknown authored payloads | Preserved. |
| Authored nested Document boundary | Qualified as separate native resources and an owned external edge. |
| Non-owning storage; B before A; multiple occurrences | Qualified without canonical adoption or copies. |
| Native A/B save/reopen and partial failure | Qualified within the explicit-location, single-writer file proof. |
| Unseen owner evidence / unavailable dependency | Explicitly unknown/unresolved; not inferred from storage or presentation. |
| Ownership transfer, destructive lifetime UX, general unloading | Conservative rejection/deferred; no broad policy invented. |
| Durable History graph-2 integration | Not qualified; incompatible codec/enrollment paths reject it. |
| Production native Save/Open / Workspace native dispatch | Still disabled/unimplemented. Legacy tree export is guarded. |
| B2, Markdown, nested application execution, Canvas/Spatial expansion | Not started. |

This is a **passing bounded B1.2 storage/ownership proof**, not a declaration that unrestricted native persistence and all lifecycle combinations are production-ready.

## 7. Regression evidence and artifacts

The consolidated test run passed **308 tests across 35 files**, covering Stage A, B1, B1.1, B1.2, linked annotations/Entity, standoff editing, legacy Document/Workspace paths, resource gates and server stores. Details are in [qualification-results.json](artifacts/flint-b1.2/qualification-results.json). Client, server and native qualification type checks pass. The production client build passes with large-chunk and outdated browser-mapping advisories; `git diff --check` is clean.

Browser: **23 native checks** and **28 Stage A checks** passed. B opens and receives real browser typing before A exists; two Flint occurrences share B; A and C arrive without losing its edits. Existing selection, toolbar/SVG, Grouping, IME, Entity/focus, occurrence disposal and source-disappearance checks remain passing.

The expanded browser sequence exposed a small pre-existing lifecycle hole: cached image completion could call an edit command after its occurrence was disposed. Image handlers now check that the element is connected and its occurrence still exists. A focused lifecycle regression test exercises both late load and late error. No editor lifecycle reconstruction was needed.

The previously documented strict commit-capture enumeration failure remains a baseline finding from B1.1, not counted as a passing test here. Its prior reproduction against `7d6eb93` is recorded in the [B1.1 report](FLINT_B11_COMPATIBILITY_REPORT.md); no typing-performance claim or fix is made in B1.2.

Review files:

- [A: owned-resource graph](artifacts/flint-b1.2/a.mutable.json), [B: independent graph](artifacts/flint-b1.2/b.mutable.json), [C: reference consumer](artifacts/flint-b1.2/c.mutable.json)
- [B after independent browser editing](artifacts/flint-b1.2/b-browser-resaved.mutable.json), [browser screenshot](artifacts/flint-b1.2/independent-b-editing.png)
- [Native browser checks](artifacts/flint-b1.2/native-browser-results.json), [Stage A browser checks](artifacts/flint-b1.2/stage-a/browser-results.json)
- [Ownership/admission qualification](src/qualification/native-b1/owned-resources.test.ts), [native filesystem qualification](src/qualification/native-b1/owned-resource-files.test.mjs)

With Node 22 and the existing dev server, the focused reproduction is:

```sh
B1_ARTIFACTS=artifacts/flint-b1.2 B12_ARTIFACTS=artifacts/flint-b1.2 node node_modules/vitest/vitest.mjs run src/qualification/native-b1
node node_modules/typescript/bin/tsc -p tsconfig.native-b1.json --noEmit
NATIVE_B11=1 NATIVE_B12=1 NATIVE_B1_ARTIFACTS=artifacts/flint-b1.2 node scripts/check-native-b1-browser.mjs
FLINT_ARTIFACTS=artifacts/flint-b1.2/stage-a node scripts/check-flint-stage-a-browser.mjs
```

**Stop for review after B1.2. B2 and production native Save/Open remain unstarted.**
