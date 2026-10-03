# Phosphor planning brief

## Document status

- **Purpose:** turn the supplied Phosphor/Phosphorescence design consolidation into a decision-oriented planning document.
- **Phase:** discovery and architecture planning only.
- **Implementation status:** no implementation is authorized by this document.
- **Primary constraint:** Phosphor is a specialized character-computing view over Mutable's Ink/BlockTree model, not a separate document platform.

## Executive summary

Phosphor should be planned as four cooperating layers:

1. **Ink integration** owns authored content, Block identity, persistence, history, selection, and standoff semantics.
2. **Phosphor's authored model** describes profiles, grids, screens, decks, actors, CellSprites, frames, regions, and behaviors without storing transient rendered frames.
3. **A deterministic runtime** evaluates a shared Behaviour IR on one logical clock and produces a CharacterGrid plus provenance.
4. **Phosphorescence tooling** parses and analyzes a small typed language, then compiles it to the same Behaviour IR used by visual authoring.

The runtime must be proven before the language. The first architecture milestone should therefore deliver a fixed Screen, CellSprites, a deterministic clock, a minimal behavior vocabulary, events, reset/replay, and programmatic provenance. The cloud/rain/garden work should qualify this milestone. Only then should a tiny parser prove source-to-runtime compilation, followed by native Ink editing and the kinetic-text qualification work.

Three decisions block a reliable implementation plan:

1. which Mutable/Ink repository and primitives are in scope;
2. the canonical authored representation shared by GUI and source; and
3. deterministic conflict/event semantics for a cell-based runtime.

## Scope and boundaries

### In scope

- Character-cell **Flow**, fixed **Screen**, ordered **Deck**, and embedded `PhosphorScreenBlock` concepts.
- Glyph sets and profile-aware rendering capabilities.
- CellSprites, textual actors, frames, regions, stable actor identity, and reusable cellular patterns.
- A shared authored behavior model and executable Behaviour IR.
- One deterministic logical clock, event processing, replay, pause, reset, and step.
- Phosphorescence parsing, semantic analysis, typed expressions, and compilation to Behaviour IR.
- Source ranges and runtime provenance from initial architecture work onward.
- Ink ScriptBlock integration and derived syntax/diagnostic standoff layers.
- Cross-application entity and actor references through Mutable standoff semantics.

### Explicitly out of initial scope

- Pixel/vector drawing or pixel-positioned animation.
- Emulator-level fidelity for historical machines.
- An independent Phosphorescence VM, file system, editor, or timer system.
- Classes, inheritance, closures, packages, exceptions, metaprogramming, user-defined operators, or general-purpose asynchronous programming.
- Live editing of a paused performance; reset-on-edit is the proposed initial rule.
- Persistent runtime variables, graph-powered semantic selectors, custom glyph authoring, and a full motion-graphics timeline.
- Reproduction of copyrighted poetry in qualification works.

## Architectural invariants

The following should be written as architecture tests or review gates rather than treated as aesthetic preferences:

1. **Cells are authoritative.** Logical positions and movement use integer column/row coordinates. Rendering may know pixels, but authored content and runtime behavior may not depend on them.
2. **Ink owns documents.** Phosphor-specific Blocks remain part of the same BlockTree and retain normal identity, history, relationships, and persistence behavior.
3. **Authorial intent is persisted.** Profiles, authored positions, actors, frames, behaviors, source, and semantic relationships are saved; transient grids normally are not.
4. **There is one behavior runtime.** Visual authoring and Phosphorescence both produce the same executable model.
5. **There is one logical clock.** No actor owns an unmanaged JavaScript timer.
6. **Execution is deterministic.** Equal authored state, seed, inputs, and clock steps produce equal grids, events, and provenance.
7. **Identity is stable.** Runtime and standoff references target IDs; author-facing names are mutable labels.
8. **Provenance is foundational.** Executable constructs retain source identity/ranges, and runtime effects can report their causes without saved frame-by-frame output.
9. **AST and Behaviour IR are distinct.** Syntax evolution must not force runtime redesign.
10. **Semantics survive projection.** Profile-specific character rendering cannot replace or erase Ink semantic identity.

## Proposed conceptual model

This is a vocabulary for design work, not a finalized schema.

### Persisted authored resources

| Concept | Responsibility | Important constraints |
| --- | --- | --- |
| `DisplayProfileRef` | Select geometry defaults, glyph set, palette, cursor, capabilities, and presentation grammar | Version or otherwise pin behavior so a profile update cannot silently change an existing work |
| `GlyphSetRef` | Resolve symbolic glyph identity to a profile-supported glyph | Distinguish a glyph repertoire from a font/rendering asset |
| `PhosphorFlowBlock` | Fixed-column, vertically extensible content | Store semantic breaks; derive soft wraps and ordinary positions |
| `PhosphorScreenBlock` | Fixed columns × rows composition | Screen bounds and explicitly authored positions are semantic |
| `PhosphorDeckBlock` | Ordered, named/addressable screens | Define ID-based navigation separately from mutable display names |
| `Actor` | Stable identity, transform, state, behavior attachments, and references | Position is integral and character-space only |
| `CellSprite` | Rectangular cellular frames plus occupied-cell information | Preserve the distinction between blank cells and transparent/unoccupied cells |
| `Region` | Named cellular selection/area | Bounds and membership rules must be explicit |
| `AuthoredBehaviour` | Editable behavior representation shared with property UI | Canonical-form decision is still open |
| `PhosphorescenceBlock` | Ink-native language-aware source Block | Persist text and semantic references; derive parse products and diagnostics |

### Derived and runtime-only data

- parser tokens, concrete/abstract syntax structures, diagnostics, and syntax decorations;
- resolved symbol/type tables;
- Behaviour IR and optimized execution plans, unless caching proves necessary;
- CharacterGrid frames;
- logical clock state, active executions, event queues, runtime variables, and seeded random state;
- provenance indexes and optional replay checkpoints.

Derived caches may be serialized later for performance, but must be disposable and versioned. The authored document must remain sufficient to rebuild them.

### Cell composition result

A runtime cell needs a defined composition result containing at least:

- glyph (or empty);
- foreground/background and supported attributes;
- semantic/content associations;
- contributing actor/frame/behavior executions;
- causal event references; and
- originating Block ID and source range where applicable.

This does **not** imply that every full cell result is retained for every tick. The provenance design should prefer execution logs plus replay and sparse checkpoints.

## Deterministic runtime proposal

### Tick phases

A candidate tick contract should be prototyped and then frozen before event syntax is designed:

1. accept timestamped external inputs for the next logical tick;
2. advance eligible behavior executions in stable order;
3. stage actor/state/position changes rather than mutating the grid opportunistically;
4. derive spatial transitions and collisions from pre- and post-step states;
5. enqueue events using an explicit ordering key;
6. process event reactions with a documented same-tick or next-tick rule;
7. resolve simultaneous actor and cell writes under a declared composition policy;
8. produce the CharacterGrid and provenance index; and
9. commit runtime state and an execution-log entry.

Suggested stable ordering inputs are logical tick, phase, explicit priority (if the product truly needs one), authored order, stable behavior ID, and stable actor ID. Array iteration order or callback scheduling must never be an implicit semantic rule.

### Collision vocabulary to decide

- `ENTERS`: occupied cells change from no intersection to intersection with the target.
- `LEAVES`: occupied cells change from intersection to no intersection.
- `TOUCHES`: either begins overlap, remains overlapping, or becomes edge-adjacent; the term is currently ambiguous.
- Sprite occupancy: transparent/unoccupied cells should probably not collide, while an authored blank glyph may still be occupied. This requires distinct data states.
- Regions: decide whether intersection uses region bounds, region masks, or semantic membership.
- Fast movement: decide whether collisions are checked only at endpoints or across each traversed cell. Whole-cell movement alone does not answer tunneling.

### Conflicting writes

The runtime must specify what happens when multiple causes target one cell. Candidate policies include deterministic z-order composition, explicit conflict errors, attribute-wise composition, or a profile-specific rule. A single global “last callback wins” policy would be difficult to explain through Inspect and should be rejected.

### Replay and randomness

Replay inputs should include authored document revision, runtime version, profile/glyph resource versions, random seed, external input log, initial state, and clock operations. Seeded randomness can then be added without compromising reproducibility. Checkpoints are a performance optimization, not a second persistence model.

## Behaviour IR plan

### Minimum P0 vocabulary

- `Sequence`
- `Parallel` only if the qualification work cannot be expressed without it
- `Wait(duration)`
- `Move(actor, direction/offset, cadence)`
- `Show(actor)` / `Hide(actor)`
- `SetFrame(actor, frame)` or `AdvanceState(actor)`
- `Emit(event, payload?)`
- `On(event, predicate?, behaviour)`
- `Repeat(count, behaviour)`
- Deck navigation only when Deck enters the qualified slice

Each IR node should carry a stable authored-behavior ID and optional origin metadata. Phosphorescence-generated nodes additionally carry source Block ID and source range. Visual nodes carry the property/editor origin that created them. Runtime execution instances require separate IDs so repeated execution does not blur authored identity with a particular occurrence.

### Runtime-neutral contracts to establish first

- typed operands and duration units;
- cancellation/reset behavior;
- sequence and concurrency semantics;
- event subscription lifetime;
- state transition atomicity;
- same-tick event recursion limits;
- resource/actor lookup errors; and
- provenance records emitted by every operation.

## Canonical authoring decision

This is the highest-risk product/architecture issue. Three strategies should be evaluated with a working round-trip spike:

| Strategy | Benefit | Main risk |
| --- | --- | --- |
| Source is canonical; GUI performs source-aware edits | Preserves a readable work and keeps one obvious authority | Requires a concrete syntax tree or precise rewrite system; some source constructs may not have a simple property UI |
| Authored behavior graph is canonical; source is generated | GUI editing is straightforward and graph validation is centralized | Regeneration destroys hand formatting/comments and makes the language feel non-native |
| Source and GUI each author separate nodes in one higher-level model | Can preserve handwritten source while allowing native visual nodes | Cross-surface editing may be surprising; users may not be able to edit every behavior from either surface |

**Recommended spike hypothesis:** use a higher-level persisted authored behavior model in which a behavior has one owning authoring surface. A source-owned behavior preserves source exactly and recompiles it; a GUI-owned behavior stores structured authored nodes and may show a read-only textual projection. Cross-surface conversion is explicit until lossless source rewriting is proven. Both lower to Behaviour IR. This avoids promising a fragile bidirectional round trip in v1 while honoring the shared-runtime requirement.

The product owner must confirm whether “GUI and language are two authoring surfaces” requires arbitrary round-trip editing or only equivalent expressive output. Those are materially different scopes.

## Phosphorescence language plan

### Compiler pipeline

```text
Ink source Block
  -> tokens / concrete syntax with ranges
  -> AST with stable syntax identities
  -> name resolution and lightweight type checking
  -> authored behavior references
  -> Behaviour IR with origin metadata
  -> deterministic runtime
```

Parser-library selection should follow an integration spike against the actual Ink change model. Evaluate incremental reparsing, source-range accuracy, error recovery, bundle/platform compatibility, grammar maintainability, and the ability to preserve concrete syntax. Do not choose a parser solely because its grammar notation is attractive.

### Proposed language increments

1. **P1 proof:** actor references, integer/duration literals, `MOVE`, `WAIT`, `SHOW`, `HIDE`, and bounded `REPEAT`.
2. **Typed core:** `LET`, `NUMBER`, `BOOLEAN`, `STRING`, `DURATION`, `POSITION`, `DIRECTION`, `GLYPH`, `COLOR`, and actor/sprite/region/screen reference types; arithmetic, comparison, Boolean expressions, and parentheses.
3. **Control and collections:** `IF`; only add `LIST` and `FOR EACH` when a qualification example requires them.
4. **Events:** `WHEN`, named events, and precisely defined spatial predicates.
5. **Poetic text:** indexing/slicing, insert/delete/replace, split/join, case operations, permutation, reveal, and erase.

Open language semantics include Unicode unit (grapheme, code point, or glyph token), slice bounds, duration precision, overflow, color portability across profiles, null/missing references, actor-name ambiguity, and whether event handlers capture variable values or read current runtime state.

## Ink and Mutable integration discovery

No Phosphor implementation estimate should be approved until the target Mutable/Ink codebase has been inspected. The discovery should produce a short capability matrix for:

- BlockTree schema/versioning and custom Block extension points;
- stable Block IDs and cross-document/resource references;
- text model, caret, linear and rectangular selection, history, and transactions;
- source range tracking through edits;
- standoff property persistence versus transient/derived decorations;
- scroll-to-range and selection-to-range APIs;
- change notification granularity and incremental derived-state updates;
- resource storage for profiles, glyph sets, sprite frames, and patterns;
- renderer/plugin boundaries and application-specific inspectors;
- Flint entity-reference types and coexistence of multiple relationships on one range;
- test facilities for deterministic document mutations; and
- current parser/editor dependencies already present in the actual application.

The repository in which this brief was prepared is an Expo ARC Art Quiz project and does not contain the described Mutable, Ink, Flint, or BlockTree implementation. It cannot answer the consolidation's Astra questions or support credible code-level estimates. The correct repository (or architecture references) is therefore a prerequisite for the next planning pass.

## Delivery plan and gates

Durations are deliberately omitted until Ink discovery and staffing are known. Each phase ends in a decision gate rather than automatically committing to the next.

### Phase D0 — architecture discovery

**Outputs**

- Ink/Mutable capability matrix;
- glossary and ownership map;
- proposed `.ink` schema fragments and versioning approach;
- canonical-authoring spike;
- parser spike recommendation;
- runtime determinism decision record; and
- provenance cost prototype plan.

**Exit gate**

- The 15 decision questions below have owners and either answers or explicitly accepted deferrals.
- The team can identify which functionality belongs in reusable Mutable infrastructure.
- A vertical slice can be built without inventing a parallel document system.

### Phase P0 — runtime before language

**Build**

- CharacterGrid and display-profile capability interface;
- Screen with integer geometry and at least one generic profile;
- actors, CellSprites, occupancy masks, frames, and stable IDs;
- logical clock, behavior scheduler, reset/pause/step/replay;
- minimal Behaviour IR and event/collision processing;
- provenance records accessible through a programmatic query; and
- visual/property authoring sufficient for the qualification piece.

**Acceptance gate: cloud/rain/garden**

- Movement and frame/state changes are cellular and deterministic.
- Rain causally reacts to the cloud; plants react to rain by event, not calculated delay.
- Reset and replay reproduce the same states and provenance.
- Selecting a grown plant can return the event and behavior chain, even if Inspect UI is not built.
- Conflicts and collisions have unit-tested semantics.

### Phase P1 — tiny parser proof

**Build**

- parser/tooling spike implementation;
- AST distinct from IR;
- source ranges and diagnostics;
- name/type resolution for the tiny subset; and
- compilation into the existing Behaviour IR.

**Exit gate**

- A source-authored behavior and GUI-authored equivalent produce observably equivalent IR/runtime results.
- Syntax errors do not corrupt authored source or the last valid executable state.
- Source identity survives repeated execution and supports provenance queries.

### Phase P2 — native Ink ScriptBlock

**Build**

- generic language-aware Block/provider contract where justified;
- Ink-owned editing, history, caret, and selection;
- transient highlighting and diagnostics;
- semantic references on relevant ranges; and
- source/screen selection hooks.

**Exit gate**

- Derived decorations do not pollute persisted semantic standoff data.
- Undo/redo, paste, and range shifts preserve correct diagnostics and references.
- A fallback editor is considered only if measured Ink gaps imply substantial code-editor reimplementation.

### Phase P3 — variables, types, and expressions

**Build**

- the minimum typed value model selected from qualification needs;
- `LET`, expressions, diagnostics, and bounded control flow;
- explicit separation of authored initial values and runtime values; and
- inspectable variable/state transitions.

**Exit gate**

- Common unit/reference errors are caught before play.
- Runtime state resets deterministically and is not silently persisted.

### Phase P4 — events and choreography

**Build**

- `WHEN`, event payloads, collision predicates, ordering, and recursion safeguards;
- causal provenance across emitted and handled events; and
- refined cloud/rain/garden source version.

**Exit gate**

- The authored work contains no timing hacks for causal relationships.
- Simultaneous events and cell writes have deterministic tests.

### Phase P5 — Inspect and bidirectional provenance

**Build**

- freeze/time selection, step controls, and a lightweight scrubber;
- cell/actor-to-causal-chain-to-source navigation;
- source-to-current-effects highlighting;
- actor/cell history derived from replay and optional sparse checkpoints; and
- provenance memory/performance instrumentation.

**Exit gate**

- The UI can answer “why is this cell like this?” for the qualification work.
- Multiple contributing causes are represented rather than collapsed.
- Provenance meets an agreed memory and interaction-latency budget.

### Phase P6 — poetic text transformations

**Build**

- finalized string/glyph indexing semantics;
- selected transformation operations;
- Flow/Screen interactions needed by the textual study; and
- the original kinetic textual qualification work.

**Exit gate**

- Precise placement, transformation, reveal/erase, repetition, and timing are expressible without pixel concepts or generic-language escape hatches.
- Replay and source/screen provenance work across transformations.

### Later, evidence-driven phases

- richer Deck authoring/navigation;
- reusable parameterized behaviors;
- persistent interactive state;
- semantic graph selectors;
- custom glyph-set authoring;
- richer profiles and presentation effects; and
- optimization/checkpointing proven necessary by profiling.

## Cross-cutting test strategy

### Determinism tests

- golden state hashes for every tick of small performances;
- replay from identical seed/input log;
- pause/step/speed changes that do not alter logical results;
- randomized insertion/order tests proving stable event ordering; and
- serialization round trips that preserve authored outcomes.

### Model/property tests

- movements always resolve to integral cells;
- actor IDs remain stable through label changes;
- Flow soft wrapping does not create semantic breaks;
- Screen authored positions survive profile presentation changes;
- all runtime IR nodes report an authored origin where one exists; and
- reset returns exactly to authored initial state.

### Integration tests

- Ink edits update ranges, diagnostics, semantic references, and compiled output transactionally;
- GUI-authored and source-authored equivalent behaviors share runtime conformance tests;
- one token can retain both actor and entity references;
- profile capability degradation is explicit and diagnosed; and
- `.ink` documents load without derived caches.

### Qualification works

Treat both works as versioned acceptance fixtures with assertions, not demos alone. Record expected actor states, selected grid snapshots, event chains, and provenance queries at named logical times. Create original content and document its authorship/licensing.

## Primary concerns and risks

| Priority | Concern | Why it matters | Proposed mitigation |
| --- | --- | --- | --- |
| Critical | Target architecture is unavailable in the current repository | Ink capabilities and reuse boundaries cannot be validated | Move this plan to or provide access to the Mutable/Ink repository before estimating implementation |
| Critical | GUI/source canonical ownership is unresolved | A wrong choice can destroy formatting or create divergent authorities | Run the D0 round-trip spike and initially prohibit implicit lossy cross-surface editing |
| Critical | Collision, event, and write ordering are unspecified | Determinism and provenance depend on these semantics | Write a tick-phase decision record and executable conformance tests in P0 |
| High | Provenance could become prohibitively large | Per-cell, per-tick histories scale poorly | Store causal execution records; reconstruct by replay; add sparse checkpoints only from measurements |
| High | “Character” is underspecified | Unicode text, glyph sets, slices, widths, and cells are not equivalent | Decide grapheme/glyph mapping and unsupported-character behavior before poetic string APIs |
| High | Profile changes could alter saved works | Defaults and capabilities affect geometry, color, attributes, and glyph resolution | Pin/version profile resources and define deterministic fallback/diagnostic behavior |
| High | Blank versus transparent sprite cells is unclear | Collision, hit testing, composition, and provenance differ | Model occupancy independently from the glyph value |
| High | Flow semantics may be pulled prematurely into a Screen-first runtime | Derived wrapping and explicit spatial placement have different persistence rules | Qualify Screen first; specify conversion/embedding boundaries before a shared implementation |
| Medium | The DSL could grow into a general-purpose language | Increases tooling and runtime complexity beyond product value | Require a qualification-work use case for every new construct |
| Medium | Ink may not provide code-editor-grade primitives | Rebuilding an editor can dominate the project | Measure required editing behaviors in D0/P2 and maintain a scoped fallback decision |
| Medium | Historical profiles may be mistaken for emulation promises | Fidelity work could overtake authoring goals | Publish capability-based profiles and explicit non-emulation acceptance criteria |
| Medium | Same actor/entity word may be resolved by string matching | Renames and ambiguous names will corrupt references | Bind source tokens to stable IDs via explicit resolution and standoff properties |

## Decision questions requiring answers

### Repository and platform

1. What is the authoritative Mutable/Ink repository, target platform, and supported runtime matrix?
2. Which existing Ink primitives satisfy range tracking, rectangular selection, decorations, transactions, scroll-to-range, and derived-state invalidation?
3. Which schema/versioning and resource-reference conventions must new Blocks and profile/glyph resources follow?
4. Which pieces should become generic Mutable infrastructure: language-aware Blocks, deterministic clock, provenance, or none of these?

### Product semantics

5. Does bidirectional GUI/source authoring require arbitrary lossless round trips, explicit conversion, or merely equivalent access to the same runtime capabilities?
6. Which geometry is required for the first released slice: Screen only, Screen plus embedded Screen Blocks, or Flow and Deck as well?
7. Is `TOUCHES` overlap, adjacency, overlap-start, or a family of explicit predicates? Do movements test traversed cells?
8. How are multiple actors composed into one cell, and what happens when their attributes or semantic associations conflict?
9. What is the required Unicode model, and how are unsupported/wide/combining characters mapped into a one-cell glyph world?
10. Are user inputs part of v1 performances, and if so how are they timestamped, serialized, and replayed?

### Runtime and language

11. Are event reactions visible on the emitting tick or the next tick, and how is recursive event emission bounded?
12. What precision/unit rules apply to durations, and does playback speed change logical scheduling or only wall-clock presentation?
13. What variables are mutable after `LET`; what is handler scope; and what state may an actor own?
14. Which operations are required by the two qualification works, rather than merely plausible future conveniences?
15. What measurable provenance budgets should guide retention: maximum actors, grid size, ticks, runtime duration, memory, and query latency?

## Immediate next actions

1. Identify the correct Mutable/Ink repository and supply architecture/schema references.
2. Assign decision owners for the 15 questions above.
3. Create three short decision records: canonical authoring, deterministic tick semantics, and authored-versus-runtime persistence.
4. Build disposable spikes for Ink language-block integration and GUI/source round tripping.
5. Specify the cloud/rain/garden fixture as concrete initial state, tick-by-tick expected events, and provenance queries.
6. Approve the P0 vertical-slice boundary only after D0 evidence is reviewed.

## Definition of planning complete

Planning is complete enough to authorize implementation when:

- the target Ink architecture has been inspected rather than inferred;
- persisted, derived, and runtime-only schemas have clear owners;
- canonical authoring and lossless/lossy transitions are explicit;
- tick, collision, conflict, and event semantics are documented with examples;
- P0 and P1 acceptance fixtures are executable specifications;
- provenance has a bounded prototype strategy;
- each phase has an owner and evidence-based estimate; and
- explicitly deferred features cannot accidentally enter the initial runtime or language surface.
