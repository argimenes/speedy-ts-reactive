# Flint Stage B — native fidelity, admission and dual-save amendment

**Status:** proposed amendment for review, following acceptance of Stage A. No Stage B implementation or file-format change has begun.

This refines Stage B of the [approved implementation plan](JET_MUTABLE_OS_IMPLEMENTATION_PLAN.md), particularly its §5 native-codec/admission gate. The consumed-Markdown decision is retained. It does not reopen Stage A or authorize Stage C.

## 1. Review finding

The intended architecture remains appropriate: persist a canonical native Document resource and generate Markdown from that resource. However, a codec round-trip alone cannot establish that a rich Document can be saved from a Workspace, reopened there, and reused by Flint without loss. Resource extraction, definition ownership, value encoding, identity admission and every applicable save route must be qualified together.

**Amendment:** make the native proof a distinct B1 qualification boundary, before paired writes or Markdown gestures. Present its proposed wire contract, compatibility results and unsupported cases for review before enabling production native admission/save routes. This makes the existing §5 requirement concrete; it is not permission for a general persistence redesign.

The main question remains open until that proof passes. Existing code provides useful parts, not an already qualified full-fidelity ordinary-Document save path.

## 2. Accepted Stage A invariants

These are platform invariants, including when Flint is disabled:

- One stable canonical Document/resource identity; tabs and Windows refer to it rather than owning or copying its content.
- Each visible occurrence may have independent projection keys, mounts, focus, selection and disposal.
- Closing an occurrence does not delete its canonical Document or disturb another occurrence.
- Simultaneous occurrences share canonical content and the same in-session command/history system.
- Missing or ambiguous identity fails explicitly. Loading/saving cannot choose an arbitrary source, transfer ownership or replace a dirty live Document silently.
- Presentation state remains distinct from canonical authored state. No view key, DOM state, focus cache or transient editing rectangle enters native Document serialization.

Preserve Stage A's missing-root handling, independent projection disposal, mount/selection cleanup, toolbar scope and queued-focus guards as platform corrections. Do not introduce Flint-named alternatives to them.

**Recorded for later work only:** transient Document occurrences appear suitable as a Mutable OS presentation primitive for Desktop, Canvas, Spatial Studio and application/document composition. B does not generalize the host API, implement those integrations, or remove the current recursive application/Document-hosting restriction. No additional hidden editor or live projection is needed to export Markdown.

## 3. Evidence from the current repository

| Existing component | What can be reused | What it does not establish |
| --- | --- | --- |
| [Tree DTO codec](src/block-tree/codecs.ts) | Legacy compatibility and ordinary JSON Documents | Sharing/placement roles and cycles cannot be faithfully represented by expanding a tree; normal export rejects inline images. |
| [Portable resource codec](src/history/stage-c-gates/portable.ts) | Stable Block/placement identities, explicit owned/reference edges, named relations, inline text/image atoms, unknown JSON properties | No ordinary save route; strict portable-JSON value domain; definition-retention membership needs the outer envelope. |
| [Resource model](src/history/stage-c-gates/resource.ts) | Ownership-evidenced resource extraction and explicit external targets | `projectOwned` requires evidence; walking whatever is visible in a tab is not that evidence. Nested Document resources are rejected. |
| [Durable native envelope](src/history/durable-core.ts) | Existing resource codec plus retained-definition membership and strict reserved-field validation | `codex-history-document` requires a memoir ID. `projectWholeDocument` explicitly requires a single-Document repository, not a Workspace. |
| [Durable value wire](src/history/preplan-spike/wire.ts) | Existing explicit encoding for values ordinary JSON cannot faithfully express | Wrapping a final result does not bypass the resource codec's earlier portable-JSON validation. Reuse would need a reviewed value boundary. |
| [Workspace materialization](src/reactive-editor/workspace-manifest.ts) | Resource catalog, stable Document IDs and existing v1 file references | Currently expands loaded Documents into tree DTOs before decoding; cannot admit a rich resource graph through that path without loss. |
| [Persistence service](src/reactive-editor/persistence.ts), [Workspace Open](src/application/workspace-open.ts) | Existing transports, identity checks and error surfaces | Workspace routes explicitly reject history-enrolled Documents. A history-independent native discriminator/graph admission path is missing. |
| [Document store](server/document-store.ts), [Workspace store](server/workspace-store.ts) | Confined locations, staged JSON writes, existing read-only policy | No native/Markdown pair protocol. Hash-check-then-rename is not conditional replacement against arbitrary outside writers. |

Review validation: the existing durable-core, portable-resource, definition-provenance and ownership-lifetime suites passed **17 tests in four files**. These establish useful existing codec contracts. They do not qualify the proposed ordinary native envelope, extraction/admission in Flint's Workspace, or dual-save. No implementation files were changed for this review.

## 4. Define the fidelity contract before selecting bytes

“Full fidelity” means preservation of the complete **authored native resource state**, including native features that Markdown cannot express. Compare native semantics after reopen, not rendered text, Markdown equality or private in-memory keys.

| State | Required treatment |
| --- | --- |
| Resource ID, authored Block IDs, structural placement IDs | Preserve stable identity. Resource ID and root Block ID may differ. |
| Content/placement graph | Preserve shared definitions, owned/reference roles, ordering, supported reference cycles and named owned/opaque relations. Do not flatten sharing. |
| Text and annotations | Preserve Unicode/Cell semantics, inline images, all standoff properties, linked annotation identities and authored definition values/provenance. |
| Native features | Preserve tables, margins, anchors, Document formats, image/media/3D/hosted-Block metadata and unknown feature payloads with the implementation absent. Never strip data to make Markdown export work. |
| Retained, currently unplaced definitions | Preserve explicit resource membership and retention semantics, including after the last reference is removed. |
| Foreign Documents/Blocks/definitions/assets | Preserve source identity and external-target semantics. Do not copy a foreign resource into this resource's ownership. Missing dependencies remain explicit; a URL is not embedded asset bytes. |
| Private runtime keys, Cell allocations and revision counters | May be regenerated when their semantic role is preserved. Reopen must allocate collision-free private keys. |
| Transient UI and caches | Exclude mounts, occurrence keys, focus, selections, geometry previews, observers, search results and generated Markdown caches. Persist separately authorized presentation descriptors only through their existing route. |
| Undo/History | Keep shared in-session history across occurrences. Native Document save does not newly promise persistence of the session undo stack or the History archive; existing History enrollment/receipts remain separate. |

Native-only visual behavior may depend on a feature implementation or an external asset being available. Fidelity here preserves its authored configuration and references, not browser GPU objects, network availability or a packaged copy of every remote asset.

### Value domain and unsupported input

The candidate portable resource codec rejects values such as `undefined`, non-finite numbers, signed zero and non-JSON objects. Audit real feature-created payloads, not just hand-authored JSON fixtures. Distinguish absent properties from explicitly authored values; do not silently drop keys, stringify objects or convert unsupported numbers to `null`.

For values that are supported authored data but cannot pass the existing codec, B1 must either demonstrate reuse of an existing lossless value encoding at a precise boundary or report the concrete compatibility change needed. Do not invent a universal JavaScript object serializer. Unknown *authored properties* must survive; unknown reserved *wire fields/versions* must be rejected rather than ignored.

A rejection before writing is safe behavior, but it does **not** prove full-fidelity support for that Document. The qualification report must enumerate exclusions. Text-only success cannot satisfy this gate while ordinary supported rich Documents remain unrepresentable.

## 5. B1 — isolated native resource and admission proof

### Proposed native envelope, for qualification

Use `.mutable.json` as the filename convention. Propose a small, explicitly discriminated **history-independent** envelope with these responsibilities:

| Proposed field | Responsibility |
| --- | --- |
| `format: "mutable-document"`, `version: 1` | Distinguish native bytes before any legacy tree decoder or validator runs. Names remain provisional until B1 wire review. |
| `resourceId` | Authoritative stable resource identity. Validate consistency with the inner resource and any existing metadata identity. |
| `document` | Reuse the existing versioned resource graph encoding; do not invent a second graph model. |
| `definitionOwnerBlockIds` | Preserve the existing outer-envelope information identifying definitions whose retention owner is this Document. |

Derive the authored root ID from the graph rather than treating a second DTO/tree as authority. Canonical content has one authority inside the envelope. Export associations/intent and receipts are persistence bookkeeping with an explicit versioned schema; their final location is part of B1/B2 review, not an arbitrary field added to authored text.

Do not make `memoirId` optional in the existing History envelope or create a fake memoir. Existing History readers/writers and bytes remain valid. If a neutral adapter/re-export can reuse shared codec functions, prefer that to moving the History subsystem or renaming its existing wire formats. A native file is not passed to the legacy decoder as an apparently empty Document.

### Extract from canonical ownership, not presentation

Capture one immutable repository snapshot for the requested resource ID. Resolve exactly one canonical owner and prove its resource closure from canonical graph/definition evidence. Include unplaced owned definitions and required local annotation definitions. Exclude unrelated Workspace/application content and all transient projections.

Important cases to prove:

- Shared content inside one Document is encoded once, with each structural placement retained.
- Workspace-root linked definitions are not automatically made Document-owned just because this Document uses them. Preserve explicit external provenance; missing or ambiguous provenance is an admission failure requiring a concrete decision.
- A nested **owned** Document is not silently converted into a foreign reference to satisfy the resource validator. The candidate currently rejects nested resources; report that limit and its real producer cases before proposing support.
- Existing missing authored IDs or placement IDs need deterministic, stable admission evidence. Do not normalize/rewrite the live repository or break Undo as a side effect of Save.
- A Document with no open view can be captured; ten open views still produce one resource snapshot and one save generation.

### Reopen/admit without a DTO detour

Decode and validate into detached resource graph records with fresh private keys. Check the entire incoming identity/ownership contract before changing the live repository. Then admit it once into the existing editor/repository at its canonical storage location; create transient occurrences afterward.

When the resource is already loaded, reuse its canonical content if the admission is compatible. Divergent disk bytes, dirty live edits, duplicate Block/resource identities or conflicting ownership must produce an explicit conflict. Do not replace live content, reset history or choose a first occurrence to make import succeed. Explicitly importing a Markdown file as a new Document is a different action from reopening an existing native identity.

### Workspace compatibility boundary

First try to retain the existing v1 manifest's resource IDs and `.json` locations, dispatching the referenced file by its content discriminator. A targeted graph-admission path may replace the tree-expansion step **for native resources only**. Legacy Documents and manifests continue to use their existing supported paths. This is not a new Workspace envelope or occurrence-role format.

Do not claim native compatibility for ambiguous repeated *authored* Document placements: the old manifest still lacks their owner/reference role evidence. Multiple transient Flint tabs need no such metadata. Reject unsupported native Workspace topology instead of transferring ownership by traversal order; any additional persisted-role requirement returns for separate review.

Single-file local Workspace export currently embeds tree DTOs. It must not flatten a loaded native graph. Until a compatible native-aware container path is separately approved, reject an incompatible local Workspace export before writing and explain the supported separate-resource route. Do not silently auto-migrate old Workspaces or create a new local Workspace format to make the proof pass.

**B1 exit:** demonstrate capture → bytes → decode → admission → ordinary editing/re-save for rich fixtures in the actual shared-repository host, plus legacy compatibility and Stage A regressions. Return the wire/admission proposal, preservation matrix and actual gaps. **Stop for review before production format/load-route changes and before B2.** A standalone codec-only or text-only success is a partial result, not the gate passing.

## 6. B2 — paired-save protocol and Markdown projection proof

Proceed only after B1's native contract is accepted. Keep the approved scope: a declared small Markdown subset, one qualified writable test adapter and explicit partial/conflict states. No general persistence service or file synchronization engine.

The persistence owner coordinates **per resource**, not per tab or Window. Capture native state, export profile and link-path mapping once. Both outputs represent that same immutable generation. Native encoding failure prevents publication; ordinary Markdown degradation produces readable output plus diagnostics and does not discard native state.

For an explicitly enrolled Document, every applicable save route must honor this policy. Closing an occurrence cannot cancel or misattribute a resource-owned save. Saving only presentation state does not export Markdown. Two occurrences editing during a save share the result, but newer canonical edits remain dirty.

Protocol and status requirements from the approved plan remain:

1. Validate native encoding and deterministic Markdown export before writing final files.
2. Preflight expected native and Markdown versions/hashes; unknown existing destinations are conflicts and new destinations are create-only.
3. Stage outputs; publish native first, Markdown second, and then confirm pair completion using durable intent/receipt evidence.
4. Report **Canonical saved; Markdown pending** after a failed second publication. Retain the exact captured generation for retry/recovery. Do not display ordinary “Saved.”
5. On interrupted confirmation, verify both files against durable intent before reconstructing completion. A written intent is not a confirmed `lastExportHash`.
6. Serialize cooperating writers per resource; reject stale completions. V1 may block a later save while an earlier pair is unresolved while allowing continued editing in memory.

Use an isolated writable managed store for the proof; keep public server read-only defaults. Test external changes between preflight and publication. A hash check followed by rename is insufficient against arbitrary external writers. The adapter must demonstrate a safe conditional-publish/recovery boundary that preserves displaced bytes, or leave that operation conflicted/use an explicit fresh destination. Do not claim two-file atomicity or universal filesystem compare-and-swap. Directory durability and crash guarantees must be stated for the actual adapter.

Existing browser single-file handles and two independent downloads do not establish dual-save. They retain their supported non-enrolled operations; no fake paired-save success. Before release, guard all applicable native/Workspace save paths against bypassing enrollment or encoding the resource through a lossy tree route. If coordinating the existing Workspace bundle needs a new general transaction/format model, stop with the specific limitation.

External Markdown edits use the approved explicit workflows: Compare; Import into a new candidate Document preserving the original rich native resource and external bytes; Keep Mutable with conflict-copy preservation and a fresh version check; or save elsewhere/cancel. There is no automatic Markdown-to-native reconciliation.

## 7. Consumed-Markdown proof retained within Stage B

Markdown is input/interchange and generated output, never a second authoritative runtime Document. Initial import reads original files without writing them, admits a new native Document, and creates an associated pair only on successful save into the chosen destination. Later loads use the native resource even if Markdown is newer. A corrupt native file does not trigger silent lossy reconstruction.

Retain the approved four proof cases: `**bold**`, a uniquely resolved wiki Document reference, one h1 gesture, and simple rectangular pipe-table import/export. Complete syntax is consumed into native text/standoff/Blocks in one undoable conversion. One Undo restores the completed literal construct without immediate reconversion. Native toolbar formatting does not insert delimiters. IME, escaped/incomplete input, code and native controls retain their ordinary paths.

No hidden delimiter Cells, persistent syntax-association model, source mode, CommonMark completeness, full Obsidian filesystem semantics or per-keystroke full-Document parser. Reuse existing typing benchmarks when the recognizer is integrated.

The exporter traverses captured native structure with bounded repeat/cycle handling. Unsupported standoff effects preserve readable text; images use available locators/alt text; hosted/3D/unknown Blocks receive honest typed fallbacks and diagnostics. Native values remain intact regardless of Markdown support. A file may be current and useful without losslessly reconstructing its source Document.

## 8. Qualification and stopping rules

| Boundary | Required evidence |
| --- | --- |
| Native semantics | Stable resource/Block/placement identity; shared/cyclic structure; retention; Unicode and inline images; standoff/linked definitions; margins/anchors/formats; native application payloads and unknown properties with feature absent; explicit external dependencies. |
| Values and errors | Real producer fixtures; missing versus null/undefined; current codec rejects versus supported lossless encoding; malformed versions/reserved fields; no partial admission or silent coercion. |
| Host admission | Same canonical resource in two Flint Windows, shared editing/Undo; close one while saving; zero-view save; missing/ambiguous identity; reopen in ordinary Codex without parsing Markdown. |
| Compatibility | Legacy Document/Workspace round-trip; native manifest dispatch where qualified; conflicting ownership and unsupported local Workspace export fail before writing. Existing History bytes/enrollment remain unchanged. |
| Pair persistence | Same-snapshot outputs, concurrent edits, stale completion, first/second/receipt failure, restart recovery, outside edits/races, missing targets and collisions, original import files untouched. |
| Input/export | Four supported constructs, atomic Undo/Redo, deterministic bytes/escaping, native-feature degradation diagnostics, native selection/IME and focused browser/typing regression checks. |

Stop at this amendment review now. After approval, perform B1 and return its concrete native compatibility result before enabling production paths or beginning B2. Stop sooner for unprovable ownership, lossy values, unsupported resource boundaries or an admission requirement that entails substantial core reconstruction. Report those failures rather than declaring them unsupported by definition to claim full fidelity.

After the approved B2/input proof, return the complete Stage B result and stop again. **Stage C, unrestricted nested hosting, Canvas/Spatial host generalization, graph features and broad History/persistence redesign remain outside this authorization.**
