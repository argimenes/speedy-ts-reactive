# Restore this Block — bounded first increment

2026-09-18. **Complete; stopped for review.** Implementation, focused regressions
and the persistent browser/restart check passed. This is the first write action added after the accepted History
UI/read-path review, not a P6 or broader restoration programme.

## Semantic rule

**History remains immutable evidence of the past. Restoring historical content
creates an ordinary new change in the present; it never moves, rewrites or
truncates history.** Selecting R212 while the Document is at R500 prepares authored
values from R212 and commits an ordinary R501. Undo returns to the pre-restore
live state; Redo replays the ordinary restore. Their commits are recorded normally.
A restore after Undo creates the normal present-day branch and invalidates the
ordinary redo stack, while all previously recorded revisions remain in History.

## First supported case

An available historical plain-text or Standoff text Block can replace the authored
state of the corresponding current Block when it has a unique owned occurrence
under an unshared path inside the enrolled Document. The current type must match.
The authored-value schema supports text, name/title metadata, the ordinary local
toolbar annotations (including colours, superscript/subscript, uppercase and
decorative styles), plus explicit local Block typography and layout properties.
The ordinary Standoff follow-up below specifies the admitted wire fields.
Unsupported fields cause refusal;
they are not silently dropped. Historical/current linked annotations, reference-dependent authored fields,
inline images/structural Cells, descendants or owned/opaque relations are refused.

The current Block ID, Content key, Placement key/ID, ownership, location and empty
structural fields remain current. Repository/content counters advance by normal
command rules. No historical repository revision, runtime key, commit identity,
history metadata or undo state is imported. Existing Document definition-table
membership is preserved; retained/unplaced historical definitions are not revived.

Only the changed text span is replaced (verified common prefix/suffix are reused).
Replacement Cells get fresh Content/Placement keys. Local annotation/property
segment IDs get fresh IDs; historical segment IDs are not resurrected. Their
supported authored values/ranges are restored. Linked/shared annotation identities
are outside this increment. Ordinary Undo restores the prior live records and
segment IDs exactly; Redo uses the restore's already-recorded operations. A
semantically identical current Block is a no-op, ignoring these local segment IDs.

## Read/write boundary and confirmation

The UI preview remains compact, immutable and inert. It is never used as the
restore source. The session's optional read-only `readAuthoredBlock` capability
reconstructs/verifies the exact selected revision via the established persistent
reader and exports only the restricted authored-value DTO plus source identities.
The history reader receives no editor command capability and performs no writes.
This independent export is also a path toward a later **Copy from History** action;
there is no Copy UI or new-Block recovery implementation in this increment.

`TreeCommands.prepareBlockRestore` validates the live target and creates an
immutable, one-use plan. `restoreBlock` publishes that plan through the existing
normal command/repository path as **one** undoable edit, with normal exact capture.
Its command descriptor is `tree.restoreBlock`; cause is `edit`, label is
`Restore this Block`. The current repository revision is a strict confirmation
precondition, including unrelated edits, moves, Undo and Redo. Missing/replaced
Block identities, changed revision selections, session switches, cancellation
and close invalidate preparation/confirmation rather than guessing a target.

The panel offers **Restore this Block…**, then displays the source label/full
revision ID, current Document revision, and explicit confirmation that this adds
a new current change and preserves the old version in History/Undo. Preparation
and cancellation do not mutate the Document. Success keeps the historical preview
fixed and offers **Show latest revisions** once normal capture has drained.

## Existing durable limits and failure atomicity

The first UI action requires an enrolled persistent Document with healthy capture
and a fully server-verified current prefix. Session-only or stopped/offline/pending
recording is explicitly unavailable for restore. It does not promise capture into
an already failed recorder.

Before presenting confirmation, a read-only worker preflight uses a private draft
to validate the exact proposed capture and its immediate normal Undo and Redo.
It checks the unchanged 20 MiB/100,000-record state admission and existing 100 KiB
outbox record bound, reserving 1 KiB inside that bound for subsequent envelope /
counter differences. Three existing enrollment slots must remain for restore and
immediate Undo/Redo. No queue, record, state or history-depth limit is increased.
The authored DTO has a separate 1 MiB transfer bound. Large unsupported changes
are refused before publishing anything, not split into multiple undo steps.

Confirmation again checks current revision/selection and recorder health, then
commits synchronously. Current text/properties, counters, undo/redo stacks and
history remain untouched if source export, target admission or preflight fails.
The committed restore follows the ordinary asynchronous durable-capture/outbox
pipeline; the UI continues to expose its actual pending/verified status. Future
unrelated edits and network failures retain the existing capture semantics.

## Explicitly deferred semantics

A later **Restore subtree** should require an explicit structural replacement
policy. A safe proposed default is to preserve the selected current root identity,
allocate fresh identities for recovered descendants/placements, and never infer
resurrection from historical runtime keys. Matching existing descendant identities,
replacement versus merge, and lifetime of detached current definitions need an
explicit mapping and dependency check. Shared content needs an explicit choice
between editing every current occurrence and creating an independent copy;
references and linked annotation definitions need a policy to preserve an existing
binding, copy a definition, or leave an external boundary. Restoring old locations
or missing root Blocks is not implied by Restore this Block. **Copy from History**
can later use authored export with a new destination and fresh Block identities,
without replacing the current Block or rewriting old evidence.

## Focused evidence

- `block-restore.test.ts`: one normal commit, exact authored state, stable current
  Block/Placement identities, fresh replacement Cells/local segment IDs, old history
  unchanged, Undo/Redo, no-op, plain text, shared ancestors, references, stale plans,
  failed admission, and normal branch/redo behavior.
- `block-history-persistence.test.tsx`: actual action/confirmation controls, no
  mutation before confirmation, cancelled preparation, stale current revision /
  selected revision, and failed preflight atomicity.
- [Persistent browser/restart result](BLOCK_HISTORY_RESTORE_CHECK_RUN2.json): actual
  History action/confirmation on the 25,000-character, 15.2 MiB Document; one
  appended restore revision, stable Block/Placement identities, exact ordinary
  Undo/Redo, save and browser/native-server restart. All five revisions (baseline,
  edit, restore, undo, redo) match independent full authored-Document oracles after
  restart. The original source and pre-restore revision IDs/contents remain intact;
  previews remain compact and read-only. Preparation took about 1.6 s in this
  fixture; this is a focused functional check, not a latency qualification.
- [First attempt retained](BLOCK_HISTORY_RESTORE_CHECK.json): CDP evaluation timed
  out after enrollment; no passing result was claimed. The repeat added phase
  attribution, without changing the fixture, validation or browser settings.
- 25 focused tests pass across restore commands, controller/UI, session export,
  durable bridge and static rendering parity. TypeScript checks and the client/server build pass.

Scope stop: Restore this Block works end-to-end against persistent History and is
ready for review.
No subtree recovery, Copy UI, richer historical rendering or broad qualification
is included.

## Ordinary Standoff follow-up (2026-09-18)

The first increment's generic **“References and unsupported Block properties need
explicit restoration semantics”** was produced only by the `blockProperties`
validator. It was not evidence that an external reference had actually been found.
The old check admitted only `id/type/value`, required a string value, and allowed
only `block/alignment`, `block/indent` and **`block/font-size`**. This mismatched the
editor's normal authored schema in three ways:

- The toolbar and shipped “Standoff Property Text Editor” heading use
  **`{type:"block/font/size", value:"h3"}`**. That exact sample heading now has a
  regression test; its ordinary `style/rainbow` and `style/spiky` annotations were
  also absent from the old annotation allowlist.
- `BlockProperty.serialize()` normally writes **`metadata: {}` and
  `isDeleted: false`**. Either field failed the old keys-only check even on valid
  alignment. Neither is itself a reference.
- Normal class-style properties such as `block/font/size/three-quarters`,
  `block/alignment/left` and `block/margin/top/40px` can omit `value` entirely.

The old message did not name the property, and the user's particular live Block
payload was not supplied. These are reproduced concrete causes in the shipped
data/serializers, not a claim to have inspected that unidentified live Block.
Refusals now identify the property list, ordinal, type and offending field or
unresolved semantics (for example `metadata.documentId` or `annotationId`).

### Explicit authored-value semantics

`restore-properties.ts` admits enumerated local types, never arbitrary `style/*`
or `block/*` prefixes. Text and the complete admitted property lists are replaced
from the verified historical source. No unsupported property is filtered out.
Both historical source and current target must pass the same schema.

- Inline: all ordinary Document formatting toolbar styles, text/fill colours,
  and existing strike/color aliases. Preserve type, order, inclusive Cell ranges,
  string value, `isDeleted`, empty metadata/attributes, legacy serialized `text`
  excerpt and `plugin: null`, including whether optional fields were absent.
  The excerpt is preserved verbatim, not treated as text authority or recomputed
  using different UTF-16/Cell conventions. Active endpoints must be within restored
  text; deleted local tombstones retain ordered non-negative integer endpoints
  even if those endpoints lie beyond current text. They remain deleted.
- Block: canonical `block/font/size`, alignment, indent, rotation, supported
  legacy alignment/font/margin markers, and `block/margin`, `block/size`,
  `block/position`. Empty metadata and `isDeleted` are normal authored wire fields.
  Known geometry metadata contains only local scalar fields: margin sides,
  width/height/min-width, x/y/position. These set appearance at the **current**
  occurrence; they do not change repository Placement ownership or location.
- Block metadata remains name/title only. Non-empty unrecognized annotation
  metadata/attributes, unknown types/fields, linked annotation identities,
  entity/Block/URL references, embedded content and non-null plugin state remain
  refused with an explicit reason. Descendants, relations and shared occurrences
  retain their existing restrictions, including the sample paragraphs that
  actually contain margin relations or references.
- Local property IDs still receive fresh identities; current Block/Content/
  Placement identities remain current. Undo recovers the immediately preceding
  full authored state and its local IDs; Redo reapplies the recorded restore.
  No renderer, capture, replay or durable admission limit was changed. Existing
  64-character Block formatting values and 1 MiB authored-transfer bounds remain.

### Follow-up verification

The focused command regression now changes both text and formatting in the
pre-restore edit, then checks one new restore revision, complete historical
authored values, preserved Block/Placement identities, unchanged prior history,
History containing the restore, exact Undo, and exact Redo. It includes serialized
fields, colour, superscript, canonical font size and a valueless font marker.
The actual UI confirmation test uses a serialized ordinary Standoff Block too.
Separate focused cases cover all ordinary toolbar styles, deleted local ranges,
known geometry and atomic refusal of unresolved fields on either source or target.

The persistent browser check now starts with ordinary saved Standoff formatting,
changes both text and formatting, and compares the restored authored Block to its
baseline (only fresh local property IDs excluded from that one comparison).
Its restart verification still compares all five complete authored Documents,
including exact local IDs, against their respective independent full-reader
oracles. Earlier result artifacts are preserved unchanged.

**Passed; stopped for review.**
[Ordinary Standoff persistent result](BLOCK_HISTORY_RESTORE_STANDOFF_CHECK.json)
confirms text **and formatting** restored, one ordinary new revision, stable
semantic identity, History showing the restoration, exact Undo/Redo, and all five
full authored-Document oracles after browser/native restart on the 25,000-character
fixture. The 28 focused tests (restore commands, persistence/confirmation UI,
session source and static preview parity), TypeScript checks and client/server
build pass. No additional History features or broad qualification were started.

## Screenshot follow-up: legacy alignment spelling (2026-09-18)

The subsequent screenshot identifies the actual rejected value as
**`"block/alignment/left "`**, including one trailing ASCII space. This is a
different string from the admitted `"block/alignment/left"`. The exact typo is
present in `src/library/templates.ts`: `Template.EmptyPage` puts it on its ordinary
Standoff child; `Template.EmptyDocument` also puts it on its Page. Thus the
previous normal-formatting fix missed an existing template-produced value.

Every text revision can preserve the same Block property, so the same refusal
across snapshots is explained by the property rather than by repeated snapshot
contents. The screenshot does not by itself establish the full contents of each
revision, but the focused reproduction checks distinct text at each revision
while retaining this exact property.

Restore now explicitly admits **only this known legacy spelling** under the same
local scalar/empty-metadata restrictions. It copies the value verbatim. The current
appearance renderer ignores the trailing-space spelling; silently trimming it
would turn it into an active alignment style and could change inherited alignment.
No trimming, archive migration, renderer change or blanket acceptance of unknown
properties was introduced. Reference-bearing extra fields still fail. Diagnostics
quote whitespace-bearing type names so this distinction is visible.

The focused regression checks baseline → two distinct text edits → restore → Undo
→ Redo, admission on all six historical results, unchanged previous evidence,
one new restore revision, preserved current placement identity, and the exact
trailing-space property in every authored result. It also rejects arbitrary
two-space variants and reference fields. The UI confirmation fixture and persistent
browser fixture now contain the exact legacy spelling from the screenshot.

**Passed; stopped for review.** The 22 focused command/controller tests, typecheck
and client/server build pass. The
[legacy-alignment persistent browser result](BLOCK_HISTORY_RESTORE_LEGACY_ALIGNMENT_CHECK.json)
passes actual UI confirmation, one new restore revision, complete restored text
and formatting (including the exact trailing-space property), current semantic
identity, normal Undo/Redo, and all five independent full authored-Document
comparisons after browser/native-server restart. Previous artifacts are unchanged.
