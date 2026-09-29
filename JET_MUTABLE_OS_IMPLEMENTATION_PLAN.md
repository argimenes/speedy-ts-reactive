# Flint — revised implementation plan

**Revision:** 30 September 2026, updated after acceptance of B1.2 and completion of the bounded B2 paired-save/consumed-Markdown proof for review.

**Status:** Stage A, B1.1 and B1.2 are accepted. The authorized [B2 paired-save/consumed-Markdown proof](FLINT_B2_QUALIFICATION_REPORT.md) is complete for review. Production native Save/Open remains disabled. Stage C has not begun.

**Naming and supplied artwork:** Flint is the product name, following the supplied Flint app icon. Earlier Jet-named plan/report files and qualification identifiers remain as historical references; this revision does not rename implementation identifiers. Preserve the [supplied icon master](docs/assets/flint/flint-app-icon-master.png) unchanged. It establishes the flint-stone mark, dark background and FLINT wordmark; any small-icon derivatives belong to later UI integration, not this architecture review.

This revision supersedes the original plan's persisted Document transclusions inside tabs and retained Markdown delimiter Cells. The [Stage A report](JET_STAGE_A_QUALIFICATION_REPORT.md) and [executable reproduction](src/application/jet-stage-a-proof.test.ts) remain valid historical evidence. The subsequent transient-view implementation is complete and accepted: see the [Flint Stage A qualification report](FLINT_STAGE_A_QUALIFICATION_REPORT.md). Markdown and dual-save remain unimplemented.

## 1. Recommendation and changed risk profile

Adopt two distinct boundaries:

1. **Persistent Document identity/content/ownership → transient presentation occurrences.** A tab stores which Document it displays. Its live content is a disposable view of that canonical Document and contributes no ownership edge.
2. **Canonical native Document → generated Markdown projection.** Completed Markdown gestures are consumed into ordinary text, standoff and Blocks. Markdown is reconstructed at import/export boundaries, including every successful save of a dual-save Document.

These boundaries fit together cleanly. Opening or closing a tab does not change Document content or generate a save of that content. Saving the Document serializes its native resource once and generates one Markdown projection, regardless of how many tabs or Windows display it. A Workspace saves presentation state and vault membership, not duplicate tab-owned Document subtrees.

**Recommend consumed syntax plus dual-save over retained syntax plus visibility modes.** This removes the proposed hidden-marker caret/geometry subsystem and the need to maintain both source delimiters and semantic annotations during normal editing. It introduces real persistence work: deterministic export, pair completion status, conflict detection and recovery. Those obligations should be visible prerequisites, not described as an existing free capability.

Transient Document hosting/disposal has passed Stage A. The remaining Stage B gates concern native resource fidelity/admission and honest paired-save semantics. The user has selected Stage B next; Stage C remains unstarted. The Stage B amendment makes the existing native compatibility review boundary explicit.

## 2. Existing architecture: reuse and actual gaps

The current repository uses Codex/Speedy names; no general rename is proposed. Active reactive code, rather than legacy class names, determines available capabilities.

| Need | Current implementation | Consequence |
| --- | --- | --- |
| Window and tab composition | [core views](src/rendering/core-block-views.tsx), [Window application guide](docs/development/CREATING_WINDOW_APPLICATIONS.md) | Reuse Window, TabRow and Tab Blocks. No nested Document Window or general application framework. |
| Native editing and formatting | [Document container](src/rendering/container-block-view.tsx), [standoff editor](src/rendering/standoff-editor-view.tsx), [style bar](src/rendering/document-style-bar.tsx) | Reuse ordinary editable DOM, annotations, selection and scoped formatting/status UI. |
| Composite application hosting | [BlockRuntime](src/feature-api/index.ts), [adapter](src/application/feature-capabilities.tsx) | Opaque widgets retain `mountWidget`. Stage A added a bounded container application host and core-owned tab/Document slot through [DocumentApplicationCapabilities](src/feature-api/document-application.ts); nested native input remains ordinary. |
| Multiple occurrences | [editor.createView](src/reactive-editor/editor.ts), [BlockTreeProjection](src/block-tree/projection.ts) | Scoped projections share one editor/repository with independent occurrence keys. Stage A qualified explicit disposal, source disappearance, focus/selection and toolbar scope. Preserve these platform corrections. |
| Identity materialization | [workspace manifest](src/reactive-editor/workspace-manifest.ts) | Repeated Documents share content after load, but the first serialized occurrence becomes owned. Do not serialize additional Document occurrences for Flint tabs. |
| References | [standoff schemas](src/rendering/standoff-styles.ts), [linked annotations](src/runtime/linked-annotations.ts), [clipboard](src/block-tree/clipboard.ts) | Reuse `codex/block-reference`, stable authored IDs and shared definitions. A tab's presentation target is distinct from a semantic reference annotation. |
| Search | [TextSearch](src/runtime/text-search.ts) | Reuse cancellable matching and ranges; aggregate across vault member Documents because traversal stops at nested Document boundaries. |
| Backlinks and graph | [historical reference extraction](src/history/index.ts), [legacy Graph helper](src/library/graph.ts) | No ready live Vault backlink service or registered reactive GraphView Block. Derive a shared, rebuildable relationship projection; later add a small generic graph renderer. No graph database. |
| File operations | [PersistenceService](src/reactive-editor/persistence.ts), [document store](server/document-store.ts), [workspace store](server/workspace-store.ts), [browser JSON files](src/demo/browser-json-file.ts) | Existing JSON loading, staged writes, local single-file handles and server Workspace bundles. No coordinated native/Markdown pair API, projection receipts or Markdown conflict workflow. |
| Native formats | [tree codec](src/block-tree/codecs.ts), [extended repository codec](src/block-tree/extended-codec.ts), [durable native document](src/history/durable-core.ts), [resource codec](src/history/stage-c-gates/portable.ts) | Distinguish filename, codec, resource scope and History integration. See §5; none should be silently substituted for a qualified dual-save document path. |

## 3. Persistent identity, ownership, membership and transient views

### Four identities, four responsibilities

| Concept | Persisted? | Meaning |
| --- | --- | --- |
| Document/resource ID and authored Block IDs | Yes | Stable identity of canonical content and semantic link targets; independent of title/path. Existing `documentId` and root Block ID need not be equal. |
| Canonical ownership/definitions | Yes, through the native model's supported storage | Where authored content belongs. Presentation does not create or relocate that ownership. |
| Vault membership, folders, storage association | Yes | Collection organization and mapping to physical artifacts. Membership is not Document identity and logical folder changes need not rename files. |
| Tab descriptor versus rendered occurrence | Descriptor yes; occurrence no | Stable tab ID, target Document ID and optional view preferences are app state. NodeKeys, projection instances, mount registrations, DOM, focus and transient geometry are runtime state. |

Accepted Stage A composition (schematic):

```text
Workspace
├── existing canonical Document owners — unchanged
├── existing object bank
│   └── vault container — membership plus newly created canonical Documents
└── WindowBlock
    └── flint-application-block
        └── TabRowBlock
            ├── TabBlock { documentTarget: { version: 1, documentId: A } }
            │   └── runtime-only Document occurrence of A
            └── TabBlock { documentTarget: { version: 1, documentId: B } }
                └── runtime-only Document occurrence of B
```

The runtime-only child is **not** an authored child/reference placement. A semantic link such as a wiki reference also does not become a tab ownership edge. Do not conflate these three uses of “reference.”

The tab DTO stores `metadata.documentTarget: { version: 1, documentId }`, referencing the stable Document ID. No Document body, private content key, source placement key or live projection is serialized under it. Existing Tab Blocks consume a bounded core-owned content slot; this does not imply a pane registry.

### Qualified Stage A lifecycle to preserve

1. Resolve the target ID against the canonical loaded Document catalog. Resolve ambiguity explicitly; never choose by title or “first occurrence.”
2. Core creates a view rooted at the resolved source placement using the same editor/repository. Flint receives a restricted rendered slot and semantic actions, not editor/projection access.
3. Mount only the active tab's content initially. Another Window may display the same canonical Document through its own occurrence; distinct mount keys prevent duplicate-registration collisions.
4. Scope toolbar, selection, overlays, find/reveal and focus to the active occurrence. Store only safe optional bookmarks as presentation preferences, not ownership.
5. On tab switch/close, unmount and dispose the occurrence; clear its focus/overlay owners and unregister it from editor projection/occurrence maps. `ReactiveEditor.disposeView` performs explicit map, selection, focus, overlay and mount-bookkeeping cleanup in addition to projection disposal.
6. If the canonical source placement disappears or changes, stop rendering that occurrence before dereferencing it. Re-resolve only to a valid canonical target for the same ID or show unavailable. The qualified missing-root guard prevents a disappearing source from interrupting repository delivery; the host releases the occurrence and can resolve a fresh view after Undo.
7. Closing a tab/Window removes presentation state only. It neither calls `unlink` on a Document nor removes its canonical owner. Reopen constructs a fresh occurrence from the persisted target ID.

No ownership repair pass, tree-order workaround or new Workspace occurrence-role format is needed for these tabs. The old persisted-reference tests remain evidence for the rejected strategy; their observed inversion must not be “fixed” by weakening the new acceptance criteria.

The vault remains Workspace-owned outside Flint's Window. Existing Documents are admitted by membership without reparenting. New ones may live in the existing object bank's vault container. Stage A does not introduce `.md` paths into this identity contract. Future storage associations resolve the same stable identity.

## 4. Accepted Stage A baseline and platform observation

The [Flint qualification report](FLINT_STAGE_A_QUALIFICATION_REPORT.md) records the accepted production composition proof: 134 focused tests, 28 Chromium checks, independent occurrences, shared editing/history, scope/focus/disposal, source disappearance and local/server-format round-trip without tab-owned Document bodies. Retain the older [Jet report](JET_STAGE_A_QUALIFICATION_REPORT.md) and five reproduction tests as evidence for the rejected persisted-transclusion strategy, not a remaining requirement to implement it.

Stage A established the shell, container adapter, transient Document host and platform lifecycle corrections. No Markdown scanner, hidden-syntax model, new Workspace format or dual-save protocol was implemented. The distinction between identity, canonical ownership and transient presentation is now an invariant, not a speculative alternative.

**Future observation, explicitly deferred:** transient Document occurrences may become a Mutable OS primitive serving Desktop, Canvas, Spatial Studio and application/document composition. Do not generalize the API or lift recursive application/Document-hosting restrictions in B. Existing lifecycle fixes remain core/platform behavior rather than Flint-specific branches.

## 5. Canonical storage: `.mutable.json` is a filename, not a fidelity guarantee

**Recommendation:** a native Document resource is authoritative in memory; its qualified native serialization is authoritative on disk. Use `.mutable.json` as the naming convention for newly opted-in dual-save artifacts. Do not make the generated `.md`, an entity graph database, or Flint's tab metadata authoritative.

The distinction matters in this repository:

- Ordinary Document/Workspace Save uses the legacy nested Block DTO. It preserves much ordinary authored metadata, but expands shared occurrences, cannot encode cycles, and rejects inline images in its normal loss-preventing path. A filename change cannot turn it into a universal full-fidelity format.
- `ExtendedRepositoryDto` preserves explicit repository graph records in a raw state envelope, including internal keys. It is useful for internal checkpoints and comparative proofs, but is not a reviewed portable, single-Document resource contract. Ordinary JSON serialization also cannot represent every possible JavaScript value faithfully.
- `codex-history-document` is an existing native Document envelope with resource/Block/placement identity, inline atoms, external references and definition-retention information. Its codec is a stronger reuse candidate than inventing a Flint format. However, its current envelope requires memoir identity and the Workspace open paths explicitly reject history-enrolled Documents. Do not enable History, forge a memoir, or claim this is already a drop-in Flint save format.
- The older portable spike is explicitly isolated. The resource codec under `history/stage-c-gates` is reused by durable Document code, but its direct use as an ordinary history-independent save route has not been qualified. Preserve its validation/rejection behavior; do not treat unsupported values as permission to silently coerce them.

**Bounded decision gate, now specified as B1 in the [Stage B amendment](FLINT_STAGE_B_NATIVE_DUAL_SAVE_PLAN.md), before the dual-save proof writes real data:** qualify reuse of the existing native resource encoding for an ordinary Document without requiring History enrollment. Check closed resource extraction from a Workspace, shared definitions, external target descriptors, inline images, unknown Blocks/properties, cyclic/shared authored structure where supported, identity and load admission. Copy canonical resources once; never include Flint's transient view in the resource snapshot.

If a small history-independent adapter/envelope admission is needed, return its concrete compatibility proposal for review before changing format/load routes. This is justified by full-fidelity canonical Document saving, **not** by preserving tab roles. Do not redesign the Workspace envelope to solve the old tab problem.

A preliminary dual-save experiment may use ordinary JSON-safe text/table fixtures and the existing codec, clearly labeled a **subset proof**. It must not be promoted as satisfying the full-fidelity promise for all Mutable content. Unsupported canonical serialization is a hard save error, distinct from a successful but limited Markdown export.

Existing `.json` Documents continue to load through their current route; no automatic bulk conversion or destructive renaming. Mixed legacy/native resources and legacy Workspace snapshots need a defined supported boundary. Until native resource admission is qualified, an incompatible Workspace save must fail visibly rather than fall back through the tree codec. This remains a real dependency for releasing dual-save, not for completing transient Stage A.

## 6. File association, import and subsequent loads

### Association

Use a Document-scoped storage association owned by the persistence adapter: Document/resource ID, canonical location, Markdown location, export profile/version, and save/provenance state. Store portable relative locations and stable IDs; never browser handles or session keys in authored JSON. Browser capabilities may be retained separately by the host.

New dual-save pairs can use `poe-raven.mutable.json` and `poe-raven.md`. Resolve name collisions explicitly, including case/Unicode-normalization collisions. The path is a locator, not identity. Titles and logical vault folder membership can change without renaming either file. File relocation is an explicit operation updating the association.

Semantic Document links retain authored target IDs. Export resolves these against a captured target-to-path mapping. Use a documented wiki-link export profile, with disambiguated stable path stems and a label when needed, e.g. `[[poe-raven|The Raven]]`; this does not add title-alias lookup as a product feature. A conventional relative Markdown link can be an alternative profile later. Export label/path escaping and collision rules must be deterministic. Unavailable/out-of-vault targets retain readable text plus a disclosed unresolved-target marker; never bind a link by a coincidentally matching title.

Keep generated path stems stable by default so ordinary target renames do not require rewriting every source file. Explicit path/profile changes invalidate affected projections; their freshness depends on the captured export mapping as well as source Document content.

### Safe first Markdown import

Default to **copy import into a new managed Mutable/dual-save destination**. Read original files without modifying them. Preserve original bytes/source location/hash as import provenance or in the untouched source directory. If the user selects an overlapping destination, require an explicit migration choice and collision/backup plan; do not overwrite an original vault as a side effect of opening a note.

Import in two passes for a small selected collection: allocate target Document IDs/path mappings, then parse supported content and resolve internal references against that mapping. Ambiguous or missing wiki links remain literal/unresolved until explicitly resolved. Preserve unsupported constructs as literal text or code with a diagnostic instead of discarding them or pretending conversion was lossless. Do not execute imported HTML or fetch remote media automatically as part of parsing.

Opening/importing `.md` materializes a new native Document in memory. Completion of the first save creates the canonical artifact and generated projection at the chosen destination. Import success and pair-save success are separate statuses; interrupted saving must not imply a canonical file exists.

### Subsequent load

Load an associated valid canonical file through its declared codec. Verify its resource identity before resolving tabs. Inspect projection provenance for status only; do not rebuild the Document from `.md` because that file is newer. If canonical data is corrupt/unavailable, offer explicit recovery/import into a new Document, not a silent fallback that discards native semantics. If two canonical files claim the same identity with different content, retain existing conflict rejection.

## 7. Dual-save orchestration and failure semantics

The guarantee is scoped to **Documents opted into dual-save**: a successful Save means both canonical content and generated Markdown describe the same captured Document revision. Enabling Flint does not silently change every existing application's save behavior. Once a Document is enrolled, however, saving it from Desktop, Flint or a Workspace must honor that policy through shared persistence orchestration; it cannot be a Flint-only button hook.

Separate Document Save from presentation-only Workspace Save. Saving tab selection/Window geometry does not regenerate Document Markdown. A Workspace save that writes enrolled Documents coordinates their pair results and reports incomplete ones; it must not bypass the pair path via today's direct bundle writer. Deduplicate by resource ID, not open occurrences.

### One captured generation

1. Capture an immutable, resource-scoped snapshot plus link-path/export-profile dependencies. Allocate a save generation. Validate the canonical encoder and export before changing final files.
2. Produce canonical bytes and deterministic UTF-8 Markdown bytes from that same capture. Normalize generated line endings; hash the actual emitted bytes. Do not read a changing live DOM or generate from whichever tab has focus.
3. Preflight both destinations, expected prior canonical version/hash, and the current Markdown bytes against the last accepted baseline. A new destination uses create-only semantics. A previously existing unknown file is a conflict, not an assumed output slot.
4. Stage both outputs. Publish canonical first, then Markdown, then confirm the pair. Keep enough durable intent/receipt evidence to recover a partial publication. Serialize saves per canonical Document across its occurrences and reject stale completions.
5. Report pair completion only after both outputs and their identity/generation evidence verify. If the user has typed since capture, that newer state remains dirty; completion of generation N cannot mark N+1 saved.

| Outcome | Required status / action |
| --- | --- |
| Encoding/export or preflight fails | No pair success. Preserve existing files; explain canonical unsupported content versus Markdown conflict/error. |
| Canonical publication fails | Save failed; do not publish a new Markdown file claiming to represent a saved canonical revision. |
| Canonical published; Markdown publication fails | **Canonical saved; Markdown pending.** Retain recoverable generation and retry action; no ordinary “Saved” indicator. |
| Both published; completion receipt interrupted | Re-read and verify intent and both artifacts; reconstruct completion when hashes agree. Do not trust a stale UI acknowledgment. |
| Markdown differs from the expected baseline | **External Markdown changes.** Block replacement until an explicit resolution; do not roll back a safely published canonical file to hide partial progress. |
| Both verified, with export limitations | **Saved**, with visible projection limitations. Markdown is current for the declared profile; canonical content remains full-fidelity. |

V1 may block a later save generation while an earlier pair is pending/conflicted, while continuing to allow editing in memory. Retry uses the frozen failed generation; a superseding save requires an explicit state transition, not accidental reuse of a newer editor snapshot.

### Durable provenance without a circular “saved” claim

A possible **conceptual**, not yet approved wire representation consists of:

- Canonical projection intent: resource ID, generation, target path, exporter/profile version, semantic-source digest, desired Markdown byte hash and accepted prior Markdown hash (or create-only absence).
- A confirmed pair receipt in adapter-owned durable bookkeeping: generation, canonical artifact hash, Markdown hash and locations, written only after verification.

The semantic-source digest excludes projection bookkeeping/timestamps and volatile view state, preventing self-referential hashing. A canonical file written before Markdown must describe an **intent**, not falsely advance a `lastExportHash` that claims completion. A confirmed receipt's hash is the divergence baseline; intent plus actual bytes permits crash recovery if receipt publication was interrupted. A narrowly scoped sidecar/managed-store record is a proposal to qualify, not a new general persistence service.

### Transport limitations and concurrent writers

Existing single-file temp/rename handling and Workspace staging/rollback are useful precedents. They do not provide an atomic two-file transaction, a cross-process lock or compare-and-swap against arbitrary external editors. Hashing a file and later renaming over it leaves a race.

The first save proof should use an explicitly writable managed test store, preserving the application's current public read-only setting. The adapter must serialize cooperating writers and prove conditional publication **with preservation of displaced bytes**, or publish to a fresh destination and report conflict when safe replacement is unavailable. Plain check-then-overwrite is insufficient. Test an external modification between preflight and publication. Do not advertise universal race-free replacement on arbitrary filesystems; if the chosen adapter cannot protect external content, keep that case blocked or use a new-version output path rather than silently overwriting it.

Browser single-file JSON handles/downloads are not yet a paired-file capability. A managed two-file/directory capability needs a later explicit adapter. Without it, offer an explicit export/package or ordinary non-enrolled save; never report two unverified browser downloads as a completed dual-save. This proof does not introduce filesystem-compatible Obsidian behavior.

## 8. External Markdown divergence and recovery

Compare exact file bytes with the recorded accepted hash; timestamps are informational only. A missing expected file, changed location or unexpected newly created file is also a state to resolve. On normal load, verify canonical identity first and keep it authoritative even when Markdown changed.

Provide these explicit workflows:

- **Compare:** show the external file and a newly generated projection/diff. Distinguish representation differences from a claim of semantic merge.
- **Import changes:** V1 imports into a **new candidate Document**, preserving the external bytes and original native Document. Let the user review/copy or deliberately adopt it; do not replace rich canonical content with a lossy Markdown parse under the original identity.
- **Keep Mutable version:** after explicit choice, preserve the externally changed bytes as a conflict copy/version and generate from canonical content. Recheck the file at publication; consent concerning one observed hash does not authorize overwriting a later edit.
- **Save elsewhere / cancel:** retain the unresolved state without data loss.

No automatic bidirectional merge or file watcher that imports Markdown into the live Document. An external file identical to the desired output may be reconciled by byte verification, but a filename/title match alone is never proof of common identity.

## 9. Markdown input, import and export semantics

### Consumed gestures

On a supported, complete and unambiguous construct, plan the text/structural replacement and native annotation together. Remove syntax, create ordinary semantics and put the caret at a defined resulting boundary in **one conversion transaction**. Only the active text Block and affected native structure are involved; no hidden characters, secondary text model or per-keystroke Document reconstruction.

For a gesture-created bold span, deleting `**` must remap existing annotations using the existing range-edit commands before adding `style/bold`. Wiki references resolve a unique stable target before consuming; unresolved/ambiguous input stays literal until a user choice. Existing toolbar Bold simply creates native Bold: it does not insert Markdown back into the editor.

Recognition runs on a few completion triggers and explicit conversion/paste-import actions, not a general input middleware chain. Composition remains ordinary native input; defer recognition until committed composition and stable selection, never convert during an IME session. Ordinary pasted text remains ordinary by default; offer explicit Markdown import/paste rather than surprising broad conversions. Code Blocks, escaped punctuation, incomplete tokens and native form fields bypass recognition.

### Undo/redo contract

The logical state immediately before conversion contains the completed literal construct. One Undo of conversion restores that literal text, previous annotations/structure and a sensible caret; Redo consumes it again. The recognizer must not immediately reconvert an Undo-restored construct. Trigger only on a fresh user completion/conversion action and suppress replay-triggered recognition. Do not merge conversion into a prior arbitrary typing history group or require separate delimiter-removal and annotation Undos.

How the existing input commit and compound tree commands expose this transaction boundary is a small proof item. Structural conversions must also move/split children and restore selection in one conversion transaction. Grapheme/UTF-16-to-Cell mapping and annotation maintenance still matter during edits, but there is no persistent visible/model offset divergence to solve.

### First proof subset

| Construct | Native mapping / proof |
| --- | --- |
| `**bold**` | Ordinary text + `style/bold`; typed conversion, toolbar equivalence, import and export. |
| `[[Document]]` | Text + `codex/block-reference` with target authored root ID and Document-ID mapping; unique resolution, rename stability, deterministic export path/label. |
| `# Heading` | Existing standoff text Block with h1 font-size structural property; consume the prefix on a defined trigger. No new heading Block. |
| Simple pipe table | Existing table → row → cell → text Blocks; explicit import/export of rectangular plain-text cells and a header separator. If header-row intent lacks an existing field, propose minimal reusable table metadata; never silently reinterpret all native first rows as headers. |

A small parser/importer and deterministic serializer for this declared subset are enough. Use explicit escaping and keep unsupported nesting/literals intact. They may share lexical helpers, but import and export operate on native values—not an authoritative Markdown AST. Test export/import semantic equivalence only for the supported subset; original whitespace/delimiter spelling is not preserved by design.

Later small additions may include italic, strike, URL links, basic unordered lists, quote treatment, textarea-backed code Blocks and standalone images. Reuse audited real types: h1–h4 exist; no registered QuoteBlock/ListItemBlock or migrated reactive CodeMirror was established. Defer CommonMark completeness, complex nesting/tables, arbitrary HTML, YAML/frontmatter, aliases, attachments management, source-mode switching and full-source round-trip.

### Deterministic projection and explicit degradation

Define fixed traversal, escaping, newline and annotation-precedence rules. Overlapping annotations that cannot nest safely must either be split into deterministic representable runs or emit plain text with a limitation; canonical annotations remain intact. Persist no generated Markdown syntax inside canonical text.

| Native content | Initial Markdown projection policy |
| --- | --- |
| Supported text/styles/headings/references/simple tables | Emit the declared syntax with deterministic escaping and path resolution. |
| Unsupported inline visual/standoff effects | Preserve text; omit purely visual effect; report meaningful semantic losses. |
| Rich/irregular tables | Preserve cell text in a labeled row/cell fallback or readable list; report table degradation. Do not silently drop embedded content. |
| Graph, 3D or hosted applications | Emit a readable typed placeholder with stable Block ID and a usable link only when a valid target locator exists. Never imply a live widget was exported. |
| Images/assets | Emit an available portable URL/path and alt text; otherwise alt/placeholder plus missing-asset diagnostic. No unrequested asset copying/network acquisition. |
| Margins, frames and presentation geometry | Preserve meaningful authored side content in labeled sections; omit layout/decoration. Transient tabs and app chrome are not Document content. |
| Unknown Blocks/properties | Preserve known text/children conservatively, identify unsupported content and retain all data in canonical storage. |
| Shared/cyclic authored structures | Use a bounded deterministic traversal with explicit repeat/reference markers; never duplicate infinitely. Canonical fidelity is assessed separately. |

Export produces structured diagnostics alongside bytes. An expected documented degradation can complete a save with a warning; an exporter crash or inability to encode the canonical artifact cannot. No policy may silently constrain native editing to Markdown's expressive subset.

## 10. Revised stages and independent tracks

**A — Transient application composition and identity proof. Accepted.** Preserve the qualified canonical identity, independent view lifetime and shared editor/history invariants. No Workspace occurrence-role format change is required.

**B — Native fidelity/admission, Markdown Import, Gesture Recognition & Dual-Save Projection Proof.** The [Stage B amendment](FLINT_STAGE_B_NATIVE_DUAL_SAVE_PLAN.md) is approved. B1 isolated native extraction, value fidelity, history-independent envelope and graph admission and returned an accepted [partial qualification result](FLINT_B1_NATIVE_QUALIFICATION_REPORT.md). B1.1 corrections are accepted. The accepted-in-principle owned-resource design is now qualified within the bounded [B1.2 proof](FLINT_B12_OWNED_RESOURCE_QUALIFICATION_REPORT.md), which is accepted. The separately authorized [B2 proof](FLINT_B2_QUALIFICATION_REPORT.md) now qualifies the existing four Markdown constructs and the bounded managed-store paired-save protocol. Stop for review before production native routes or Stage C. Retain atomic conversion Undo/Redo, deterministic export, native-only preservation, same-snapshot writes, failure/recovery/divergence tests and the recognizer typing baseline. Do not broaden persistence or History to force a gate pass. Stage B completion returns for review before C.

**C — Core knowledge-workspace application.** Can follow A without B: logical folder/membership operations, ordinary Document creation/admission, scoped search, native reference creation/navigation, properties and derived backlinks. Use normal native editing when Markdown gestures are unavailable. Closing/trashing membership never destroys canonical data in another owner. No implication of dual-save support until B is accepted.

**D — Bounded extensions.** Generic graph view over the shared reference projection may follow C independently of Markdown. Extend Markdown gestures/import/export only after B passes, through the already audited Block mappings. No universal graph/layout/parser subsystem.

**E — Integrated visual and release review.** Dark shell and three-region composition from the supplied mockup, the supplied Flint icon/branding, narrow-width controls, real content/status, removal/disablement and persistence evidence. When dual-save is enabled, every UI route must use the enrolled Document save policy. Stop for review; no automatic follow-on work.

New Flint capabilities remain default-on when implemented unless a later specification says otherwise. Dual-save enrollment is an explicit storage policy for a chosen destination, not a hidden feature flag or automatic overwrite policy for existing Markdown vaults. Existing feature defaults, History enrollment and server read-only settings remain unchanged.

## 11. Revised qualification and removed work

Retain focused tests for identity, transient view disposal, native text/selection, toolbar scope, linked definitions, copy/paste, structural commands and persistence. Keep Stage A browser qualification as regression evidence for ordinary editing and independent occurrence lifetimes.

Stage B adds a small conversion/import/export corpus and a fault-injected save-state suite. Mandatory cases: native-only content survives canonical round-trip; export deterministic from the same snapshot; edits during saving remain dirty; two tabs save one resource; stale completions; second-file/receipt failure; external edits before and during publication; absent/colliding targets; import source untouched; subsequent load uses native data; corrupt native data does not silently fall back to `.md`. Run existing typing benchmarks for the recognizer integration, not for every shell styling change.

**Remove from the plan:** retained delimiter Cells after conversion; source-to-annotation syntax associations; Hidden/Contextual/Visible switches; hidden-run boundary affinity; marker-specific navigation/deletion; mode-dependent clipboard rewriting; synthetic-source materialization; geometry invalidation for contextual reveal; and tests/benchmarks devoted solely to those mechanisms.

**Retain:** existing core Show/Hide/Superposition behavior, ordinary standoff/selection/grapheme tests, atomic edit range remapping, IME discipline and central measurement. Preserve Stage A's core lifecycle corrections; the Markdown work must not undo or special-case them. Parser source spans may exist transiently while planning a conversion/import, and immutable original-source provenance may support recovery; neither is a live retained-source syntax-association model.

## 12. Direct responses to the correction's seventeen questions

1. **Stage A impact:** changes tab strategy and defines a future Document save boundary; A does not depend on implementing dual-save (§3–4).
2. **Retained work:** keep qualification evidence/core sharing tests; replace their proposed tab strategy. No hidden-syntax implementation exists (§4).
3. **Canonical representation:** prefer native Document resource serialization named `.mutable.json`; qualify reuse of current native codecs rather than treating legacy tree JSON or a database as a universal authority (§5).
4. **Markdown association:** Document-scoped storage association, stable IDs and paired locators/provenance; never title/path as identity (§6).
5. **First-load conversion:** copy import into a new destination, allocate IDs then resolve references, preserve unsupported source and original files (§6).
6. **Subsequent loads:** canonical-native first, with explicit recovery for missing/corrupt data; never routine reparsing of the shadow (§6).
7. **Safe orchestration:** one frozen generation, validated outputs, staged publication, visible partial states and confirmed pair completion (§7).
8. **Divergence:** exact emitted/current byte hashes plus generation, codec/profile and path mapping; timestamps alone are insufficient (§7–8).
9. **External modifications:** compare, candidate import, explicitly keep canonical with conflict preservation, or save elsewhere; no automatic merge (§8).
10. **Original vault safety:** copy import is the default; in-place migration needs explicit destination/backup decisions (§6).
11. **Consumption:** transactional native text/annotation/Block conversion on bounded triggers, deferred through composition (§9).
12. **Undo/redo:** one conversion step returns completed literal input; replay cannot retrigger recognition (§9).
13. **Minimal importer/exporter:** deterministic subset parser plus native semantic serializer, not a Markdown document engine (§9).
14. **Removed complexity:** all persistent hidden-syntax and associated visibility machinery (§11).
15. **First syntax:** bold, one stable wiki reference, h1, simple table import/export; broader Markdown deferred (§9).
16. **Degradation:** readable text/typed placeholders with diagnostics; native serialization must still preserve canonical content (§9).
17. **Syntax associations:** no persistent retained-source associations; only transient parser spans and optional immutable import provenance remain useful (§11).

## 13. Current review boundary

Stage A and the consumed-Markdown/dual-save direction are accepted. The user has selected Stage B and required plan review before implementation if amendment is necessary.

The [Stage B native/dual-save amendment](FLINT_STAGE_B_NATIVE_DUAL_SAVE_PLAN.md) is that review deliverable: it defines fidelity, the proposed history-independent resource envelope, targeted graph admission, compatibility limits and B1/B2 stopping points. It records the broader transient-occurrence observation without implementing it.

**Stop for review of B2.** The [owned-resource/storage report](FLINT_B12_OWNED_RESOURCE_QUALIFICATION_REPORT.md) records the qualified native A/B boundary, non-owning retention, independent occurrences and save-failure semantics, together with remaining lifetime, History and production dispatch limitations. No unrestricted production persistence pass is claimed. The [B2 report](FLINT_B2_QUALIFICATION_REPORT.md) records same-generation publication/recovery, consumed input and regression evidence, with production limitations. Stage C remains outside the current work.
