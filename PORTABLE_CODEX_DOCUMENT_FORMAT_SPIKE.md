# Portable Codex Document format: proposal and isolated spike

Date: 2026-09-17. Status: experimental proposal with executable fixtures, not a
production file format, replacement Document codec or Stage C implementation.

The user has accepted this spike's semantic direction for Stage C. Production
integration remains unauthorized. The follow-up
[pre-plan results](BLOCK_SCOPED_HISTORY_STAGE_C_PREPLAN_RESULTS.md) retain the
explicit canonical load boundary. Subsequent decisions stop exact history at
authoritative Document ownership and place independent memoirs under the immediate
parent directory's `.memory`. They resolve the environmental-dependency question
without reopening the accepted Block/placement model. This document's executable
results predate those decisions; external provenance and storage integration are
planning contracts, not newly implemented spike capabilities.

## Finding

A versioned collection of unique authored Block definitions, connected by explicit
structural placements with persistent semantic IDs, preserves the tested authored
structure across ordinary JSON serialization and reload. Fresh runtime graph keys
do not affect Block identity, placement identity, content or intentional sharing.
The representation supports shared containers, references surviving removal of an
owned placement, named relations, reference cycles and rich inline content without
serializing character Cell identities.

That semantic equivalence is **not sufficient for exact Stage C continuation**.
Runtime keys, repository/content counters, Cell identities and some canonical
property-presence details are regenerated. The spike demonstrates that a captured
exact change applies to its original saved canonical state but is rejected against
the semantically equivalent reopened state. Stage C still needs an explicit load
projection boundary or a separately proven exact canonical bridge.

Legacy compatibility is read-old/write-new. Existing JSON remains directly
decodable by the unchanged legacy codec. Explicit normalization constructs a
modern model in memory, preserves unambiguous existing authored IDs, and assigns
missing identities once for that session. Opening does not rewrite the file.
A later deliberate Save may serialize the modern format. No application Save or
Open handler has been changed in this spike.

## 1. Executable footprint and evidence

- [codec.ts](src/block-tree/portable-spike/codec.ts): experimental schema,
  validation, runtime encode/decode adapters, semantic placement bindings and
  explicit in-memory legacy normalization.
- [fixtures.ts](src/block-tree/portable-spike/fixtures.ts): legacy tree with
  margins/annotations and a modern shared-container/rich-inline example.
- [codec.test.ts](src/block-tree/portable-spike/codec.test.ts): semantic oracle,
  runtime-key regeneration, existing command lifecycle fixtures, JSON round trips,
  rejection cases and exact-history counterexample.

Run the isolated spike with:

```sh
npm test -- src/block-tree/portable-spike/codec.test.ts
```

The codec is not exported from a production module or imported by the application.
It has no filesystem, network, outbox, memoir, editor-save or UI integration.
Tests create private repositories and exercise existing commands. The new
`codex-portable-document-spike` discriminator deliberately avoids claiming a
released, stable format name/version.

The semantic oracle reads canonical states independently of the encoder. It
compares Block IDs/types/payloads, ordered placement IDs/kinds/targets, named
relations, opaque relation values, empty collection presence and inline authored
units. It also checks that all generated content and placement keys differ after
decode, that exported structural fields contain no runtime machinery, and that
encoding leaves the source graph unchanged. Encode/decode/encode equality alone
would not establish those properties.

## 2. Proposed authored model and wire example

```json
{
  "format": "codex-portable-document-spike",
  "version": 1,
  "resourceId": "resource-1",
  "root": {
    "placementId": "root-placement",
    "blockId": "document-1",
    "kind": "owned"
  },
  "blocks": [
    {
      "id": "document-1",
      "type": "document-block",
      "properties": {},
      "children": [
        { "placementId": "p-original", "blockId": "paragraph-1", "kind": "owned" },
        { "placementId": "p-transclusion", "blockId": "paragraph-1", "kind": "reference" }
      ]
    },
    {
      "id": "paragraph-1",
      "type": "standoff-editor-block",
      "properties": {},
      "inline": [{ "kind": "text", "text": "Shared authored text." }]
    }
  ]
}
```

Definitions are unordered; child placements are ordered. Each definition appears
once regardless of how many placements target it. `properties` contains existing
authored payload fields other than the reserved identity/type/structural fields.
It can preserve unknown JSON-valued properties without treating them as commands
or structural links. `inline` is the sole Standoff text/content authority;
`properties.text` is rejected on that type.

This collection is a serialization of authored objects and their arrangement.
There is no portable contents/placements repository table, live projection index,
Cell table, revision counter or operation log. References target public Block IDs.
The choice of generated runtime keys and storage implementation remains private.

## 3. Block identity and definition uniqueness

A Block ID identifies authored content, including a container's own structural
slots. One ID has exactly one definition in a Document. Duplicate definitions
are rejected even if their payloads happen to be equal; equal text does not prove
shared identity. Multiple placements targeting that one definition explicitly
declare sharing. Valid existing nonempty IDs are retained verbatim; new IDs are
generated UUIDs. The validator does not require legacy IDs to be UUID-shaped.

Definitions remain present while referenced through any reachable structural
placement. The format can also retain an unplaced leaf Block definition, matching
the current repository's distinction between content existence and occurrence
existence. It does not invent a location for that Block. Detached outgoing
placements and unplaced hosts with live inline Cells are rejected by the spike's
runtime compatibility rules; arbitrary disconnected graphs are not supported.

Block IDs retain the specification's global uniqueness intent. A per-file
validator can only detect duplicates within that file. Cross-resource collision
resolution and provenance catalogues are not implemented here; adding resource
identity does not make duplicate authored identities automatically legitimate.

## 4. Placement identity and lifecycle

A placement ID identifies a structural edge occupying one root/child/named slot.
It is distinct from its target Block ID. IDs are globally unique by allocation
policy and validated for uniqueness throughout this Document. An edge appears at
one structural position, even when its parent Block has multiple displayed paths.
Array positions and parent IDs describe its current location, not its identity.

| Operation | Block identity | Placement identity |
| --- | --- | --- |
| Edit content or annotations | Preserved | Preserved |
| Move/reorder a surviving placement | Preserved | Preserved; slot/location changes |
| Transclude | Reuse target definition | Allocate a new reference placement |
| Remove/unlink an occurrence | Definition survives if still reachable elsewhere | Removed edge ends its current presence |
| Undo removal | Restore the original definition if required | Restore the original edge ID |
| Duplicate/copy a graph | Fresh IDs for copied authored definitions; retain intended sharing within the copy | Fresh IDs for copied edges |
| Replace content at a surviving placement | Old and new Blocks remain distinct identities | Edge ID survives if the canonical placement survives |
| Detach a transclusion | Fresh copied Block identities | Existing reference placement ID survives and its kind becomes owned, matching current `detach` |
| Recreate a superficially identical removed occurrence | No inference from appearance | New ID unless an explicit operation restores the original edge |

The session adapter maps current runtime PlacementKeys to semantic placement IDs.
Decoding builds a new mapping from IDs in the portable file. Encoding uses the
existing map and allocates IDs only for new structural edges. Failed export does
not publish new bindings. Deleted mappings are retained in this finite spike so
existing undo can restore the same ID; no undo implementation or stack is changed.
The map is never written as a runtime-key table in the portable file.

This binding map must stay associated with the live session. Creating a fresh map
at every Save would destroy placement continuity. The prototype discovers new
edges on export; production history enrollment would need to assign/bind IDs at
the appropriate committed-transaction boundary. That lifecycle integration and
bounded reclamation of retired bindings remain unimplemented.

## 5. Owned, reference, children, named relations and shared containers

**Resource-ownership qualification for Stage C:** placement kind and authoritative
resource ownership are different concepts. The semantics below describe internal
structure/sharing, not a rule that every reachable target belongs to this Document.
A foreign-owned target retains its source resource identity and known version
provenance through an explicit local reference; it is not copied into the local
definition table or memoir merely because it is transcluded. Reference-only local
definitions remain locally owned after an owned placement is removed. The current
spike does not implement source-resource/version-aware external descriptors.

`owned` records an ordinary structural placement; `reference` records an explicit
transcluded occurrence of the target definition. Both resolve to the same Block
object when their target ID is equal. Reference is not a snapshot, a separate
payload copy or an implicit read-only view.

Ownership is **not exclusive content lifetime ownership**. The current repository
does not require every Block to have exactly one owned placement. The spike
therefore preserves multiple owned placements when present and allows a Block
with only reference placements. Removing its owned placement neither deletes a
still-referenced definition nor silently promotes a reference to owned. Existing
command pruning removes content only when it becomes unreachable. Tests exercise
owned removal, reference-only reload, undo/redo and final-reference removal.
Sources: [remove](src/block-tree/commands.ts#L384),
[transclude/unlink](src/block-tree/commands.ts#L681),
[repository validation](src/block-tree/repository.ts#L124).

`children` contains ordered placement objects. Named relations use:

```json
{
  "relations": {
    "owned": {
      "leftMargin": { "placementId": "margin-edge", "blockId": "margin-block", "kind": "owned" }
    },
    "opaque": { "externalHint": { "id": "uninterpreted-value" } }
  }
}
```

The `owned` map denotes structural relation slots, as in Codex's existing
`ownedRelations`. Each slot explicitly declares its placement kind; the map's
name does not impose exclusive ownership of the target definition. Arbitrary
explicit structural names can round-trip, although that does not add renderer
support for new slots. A name cannot occur simultaneously in the structural and
opaque maps. Opaque objects remain data even when they look like placements.
Empty children/relations preserve omitted versus null versus present states.

A shared container has one definition, including one set of child and relation
edges. Transcluding it does not allocate new descendant placement IDs. Editing
its children changes the shared structure seen through every container placement.
One descendant edge can consequently appear through two ancestor routes. Its
placement ID identifies the edge; a particular displayed occurrence requires a
route of semantic placement IDs. Those routes are derived, not additional stored
occurrence objects or runtime NodeKeys.

## 6. Copies and identity-preserving moves

The fixtures use the actual `TreeCommands.move`, `copy`, `transclude`, `detach`,
`remove`, undo and redo behavior rather than a second editor implementation.
Copying a container with internal sharing creates new definitions once per copied
content object and fresh placement IDs while preserving the copied sharing.
Known Block-reference payloads follow existing copy remapping rules; opaque
strings are not rewritten.

Rich copying is demonstrated using the existing canonical
`captureBlocks`/`cloneBlocks`/`insertFragment` path. The ordinary `TreeCommands.copy`
still calls legacy export as an eligibility check and can reject inline images
or cycles. The spike does not change that existing command limitation and does
not claim a new user-facing rich-copy feature.

An identity-preserving move retains the existing edge and target IDs. Copy versus
move is an explicit operation decision, never inferred from text equality, file
paths or similar-looking records. Full Document Save As policy is not integrated;
an independent Document copy should receive a fresh resource ID and deliberately
apply authored/placement copy identity rules. A rename preserves identities.

The accepted storage convention puts optional history under the Document's
immediate parent's `.memory`, keyed by resource/memoir IDs, never its filename.
Renaming within that directory preserves the association; moving between
directories requires verified memoir relocation, not ancestor-store inheritance.
A filesystem copy retains IDs in its bytes: do not rewrite it on Open, treat it
as an authorized independent Save As, or attach a duplicate to the source writer.
Copied-directory archives may be read after validation, but divergent copies must
not be silently merged. Missing history never prevents ordinary Document use.
See [pre-plan results §5](BLOCK_SCOPED_HISTORY_STAGE_C_PREPLAN_RESULTS.md#5-checkpoints-and-physical-archive-layout)
for the directory copy/move, collision, legacy enrollment and recovery contracts.

## 7. Unresolved references and cycles

Missing definitions for owned edges or the root are invalid. A missing target of
an explicit reference is represented as unresolved, retaining its target ID and
placement ID. `decodePortable` returns the preserved document and missing IDs,
without a fabricated target definition or a partially valid `RepositoryState`.
Resolving that target later would require a supplied definition and validation.
No external fetch or placeholder renderer is implemented. A production opener
still needs an explicit degraded editing policy; this spike proves diagnosis and
preservation, not that UI.

The accepted next-format contract must additionally distinguish a missing required
local definition from an intentionally external target. Preserve the locally
owned reference/placement identity, known source resource and target identities,
and any recorded source revision/version or target occurrence information; keep
unknown/unpinned provenance explicit. Do not invent a pin from current target
state, a filename or timestamp. A missing external memoir/definition is a separate
historical-unavailability result, not corruption of exact local history. An
external target-only edit creates no local revision. The minimal unresolved-ID
fixture above does not yet prove this richer descriptor schema or query adapter.

Workspace-root definitions follow their authoritative resource ownership. A
Document reference to a Workspace-owned definition must preserve its source scope;
do not export the Workspace definition as a locally owned snapshot or substitute a
conflicting Document-local definition to make standalone resolution appear complete.
The portable Document remains usable for its owned content, with explicit unresolved
external references when their owners are unavailable. Fully self-contained copying
of foreign content would be a separate explicit copy operation, not implicit save.

Structural reference cycles can be serialized because definitions are emitted
once, without recursively expanding them. Validation follows the current runtime
rule: on a path from the root, re-entry into an ancestor Block is permitted only
through an incoming `reference` edge, at which traversal stops. Re-entry through
an owned edge is rejected. Each actual route must satisfy this rule; the mere
presence of some reference somewhere in a cycle is not sufficient.

Runtime validation runs after complete definition/edge allocation. A self-reference
fixture round-trips; the same closing edge changed to owned is rejected. This does
not authorize endlessly expanding cycles in a renderer. Unknown inline/structural
operations and unsupported format versions fail explicitly without modifying the
input. Unknown payload fields with admitted JSON values are preserved.

## 8. Rich inline content without Cell identities

Standoff definitions carry ordered text runs and image atoms:

```json
[
  { "kind": "text", "text": "A😀" },
  { "kind": "image", "properties": { "assetId": "image-1", "src": "/image.png", "alt": "Picture" } },
  { "kind": "text", "text": "é漢\n" }
]
```

Text is authored Unicode content, with no public ID per code point. Encoding
coalesces consecutive plain text Cells into runs; decoding regenerates one
runtime text Cell per Unicode code point and one runtime Cell per image atom.
Empty content is an empty inline array. Adjacent text-run boundaries do not carry
identity or authored meaning and may normalize on re-encoding.

Annotation positions retain current Codex units: one Unicode code point or one
image atom is one inline unit; combining sequences occupy multiple units. Standoff
start/end ranges remain inclusive, and annotation IDs are retained in
`properties.standoffProperties`, not converted to UTF-16 or grapheme offsets.
Linked definitions remain in their existing authored payload fields. The spike
preserves those payloads rather than introducing another annotation engine.

Image properties retain the descriptor, dimensions and admitted extension data.
The asset's identity/locator is portable; asset bytes and historical asset
versioning are outside the format. This does not prove asset availability on a
different machine.

The supported inline surface is deliberately text plus images. The encoder rejects
unknown atom types, structural/shared Cell records, multi-code-point text Cells
or extra text-Cell payload fields rather than silently discarding them. Shared
authored paragraphs are supported; sharing individual implementation Cells is
not declared an authored semantic feature. Future atom kinds require explicit
schema/adapter semantics.

## 9. Read-old/write-new and unsaved identity stability

The intended lifecycle is:

```text
Existing legacy file bytes (unchanged on disk)
  -> legacy decode
  -> explicit normalization of a private in-memory graph
  -> assign semantic placement IDs and one resource identity
  -> modern in-memory Document session / eligible history baseline
  -> ordinary editing with those same identities
  -> first deliberate Save serializes the new versioned format
  -> subsequent reopen reads definitions and placement IDs directly
```

`openLegacyInMemory` uses the existing legacy decoder and Stage A normalization.
It reports ambiguous authored IDs instead of merging duplicate definitions. Valid
IDs survive, including legacy non-UUID strings. Missing Block IDs are allocated
once, and every structural placement receives a semantic ID before enrollment.
The original DTO is unchanged; there is no on-disk migration, automatic save,
batch-migration requirement or alteration of the existing legacy decoder.

Legacy structural interpretation is the legacy codec's interpretation. Its known
margin relations become explicit structural slots; opaque relations and payload
strings remain opaque. A duplicate-ID tree that might once have represented
sharing remains ambiguous. The migration does not manufacture transclusions from
that ambiguity. Legacy aliases such as `main-list-block` normalize to their
semantic modern type. This is a declared projection, not exact legacy-byte
round-tripping. Old readers are not promised the ability to read the new envelope;
read-old/write-new is forward migration by a new reader.

The lifecycle fixture verifies legacy decode, in-memory identity assignment,
repeated serialization with identical identities, new-format JSON serialization,
reopen and identity equality. It checks the original bytes remain unchanged.
Another fixture edits and undo/redoes a normalized unsaved legacy document, then
serializes/reopens it with the same Block and placement IDs.

For Stage C, distinguish these identity lifetimes:

| Lifetime | Required identity evidence |
| --- | --- |
| Current unsaved session, repeated saves, editing and undo | Keep the normalized graph, resource identity and placement bindings. Do not renormalize the original DTO on each query/export. Proven by the spike. |
| First deliberate new-format Save | Persist assigned Block IDs, placement IDs and resource ID in the normal Document file. Proven through in-memory JSON serialization/reopen, not an actual filesystem write. |
| Unsaved close/reopen or crash after history enrollment | Durably retain the normalized baseline and semantic identity association before acknowledging dependent history. Associate it with the exact legacy artifact, resource and enrollment identity. This belongs to Stage C's outbox/memoir protocol and is not implemented. |
| Missing enrollment evidence or changed legacy artifact | Do not guess previous assigned IDs from text, paths or positions. Report a new/uncertain baseline or ambiguity. |

Re-running migration on the same id-less legacy bytes in an unrelated fresh
session allocates different IDs; a test explicitly demonstrates that limitation.
A retained hash-bound migration association can recover assigned IDs for the exact
same legacy artifact without writing it first. The hash alone is not a resource
identity: identical copied files can be different resources. Runtime keys are
not the association. Stage C must durably retain the migration mapping/evidence
and resolve resource ownership, including pre-save untitled Documents.

An unsaved normalized document with *no original file* similarly needs its baseline,
resource identity and bindings preserved through durable enrollment. Losing the
only RAM copy cannot be repaired by the portable format. The existence of this
requirement does not justify an automatic Document Save on Open.

## 10. Resource identity and deliberate exclusions

`resourceId` identifies the Document, separately from its root authored Block ID.
It is a required envelope field in the proposal. Rename/move of a file preserves
it. An independent Document copy must not silently share a mutable resource
identity. First saving an already enrolled untitled document preserves its assigned
resource identity rather than allocating a second one.

The prototype takes resource identity explicitly when migrating a legacy file.
It does not derive it from a path or runtime key. Existing root
`metadata.documentId`, when present, must agree with the envelope; a conflict is
reported. The envelope remains authoritative for resource identity. A future
application adapter must reconcile legacy registration metadata without inventing
an extra identity authority.

Deliberately outside this portable authored format:

- Runtime ContentKey/PlacementKey/NodeKey/ViewId, projection caches, Cell IDs,
  repository/content counters and operation records.
- Undo/redo stacks, revision ancestry, memoir identity, exact checkpoints,
  save receipts, retained old states, outboxes and crash durability protocol.
- Workspace arrangement/history, cross-resource atomic moves, collaboration,
  biography catalogues, retention, historical UI/copy insertion or restoration.
- Asset bytes, network resource resolution, execution of historical code and
  automatic interpretation/remapping of unknown payload strings.

Payload values are explicitly admitted JSON values. Undefined, non-finite numbers,
negative zero, sparse arrays, cyclic payload objects, accessors and non-JSON
objects are rejected rather than coerced. Unknown canonical record fields are
also rejected pending a semantic decision. That conservative boundary is different
from a future *exact history* wire codec, which must preserve required canonical
own-undefined and other admitted exact distinctions.

The spike retains JSON-valued payload data, including existing focus/location or
client-only annotation fields if present; it does not guess which unknown fields
may be discarded. A production authored/transient-field policy is still needed.
No new live focus bookmarks are injected during portable export. Rich annotation
range validity beyond existing canonical behavior is not newly enforced here.

## 11. Why semantic equality still needs a history projection boundary

The tested round trip deliberately regenerates runtime graph and Cell keys and
resets counters. It may normalize alias type spelling, empty internal field
presence and text-run boundaries. Existing exact patches address old keys and
require exact root/counter/preimage matches. Public Block and placement IDs solve
authored identity and structural sharing; they do not restore those canonical
preconditions.

The history counterexample captures a state after an edit, exports/reopens it,
then captures another edit on the original repository. The independent semantic
oracle accepts the reopened state. `applyHistoryChanges(originalSaved, event)`
succeeds; `applyHistoryChanges(reopened, event)` rejects the root/revision base.
Reopening does not restore the original editor's undo stack either.

The safe default is therefore an exact baseline of the freshly decoded/enrolled
graph, linked to the saved semantic projection of the earlier exact revision.
Block/placement identity can carry across that link without claiming the states
are canonically identical. The link is not itself an exact state-parent edge.

An alternative exact bridge could be designed using retained canonical metadata,
complete key/Cell mappings and a validated transformation, or an archive-local
canonical representation with translated incoming events. Neither follows merely
from this semantic codec, and neither is implemented. Do not broaden the ordinary
Document format into a repository dump to make old patches apply unchanged.

## 12. Results, limits and recommendation

Final verification on 2026-09-17:

| Check | Result |
| --- | --- |
| New portable spike suite | **31 tests passed**, included in the regression command below. |
| `npm test -- src/block-tree src/history src/reactive-editor/persistence.test.ts src/reactive-editor/workspace-manifest.test.ts` | **14 files / 146 tests passed**, including existing codec/identity, undo/redo, exact history, performance guard and save/open tests. Wall time 20.70 s. |
| `npm run typecheck` | Client and server type checks passed. |
| Document/source review | Local references checked; no existing application/codec/persistence files changed. |

Tests validate authored equivalence for the admitted surface; they do not prove an
exhaustive production format for every extension payload. No new benchmark, full
application suite, filesystem migration or crash-durability experiment was run.

Important remaining limits:

- No production codec dispatch, first-save upgrade UI/behavior, filesystem save,
  resource registry integration or durable identity association is installed.
- No persistent placement-ID command hook or retired-binding capacity policy is
  added; the finite adapter retains bindings for undo and assigns new ones on
  successful export.
- Unresolved references preserve data and report a diagnostic, but production
  degraded editing/placeholder behavior still needs a decision.
- Validation traverses occurrence paths and can be expensive for deep/shared
  graphs. Recursion/size limits, hostile-input budgets, schema evolution and
  performance benchmarks remain unproven; this is not a production parser.
- Full Document copy/resource adoption and cross-file identity conflicts remain
  application policy. File integrity, write conflicts and crash tests are Stage C
  concerns, not properties of JSON round-trip tests.

Recommendation: the authored definition/placement model is viable for the tested
Codex semantics and removes the need to recover intentional sharing from a
memoir. Carry persistent semantic placement IDs and read-old/write-new into the
next design decision. Preserve an explicit canonical load projection boundary
for Stage C unless a separate exact-bridge proof is undertaken. Do not replace
the existing Document codec or begin Stage C on the strength of this spike alone.
