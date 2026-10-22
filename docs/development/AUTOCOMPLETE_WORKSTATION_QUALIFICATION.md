# Autocomplete workstation — implementation and qualification

> Bracket triggers, cancellation and interaction boundaries are superseded by the [Scry interaction restoration addendum](SCRY_INTERACTION_RESTORATION_QUALIFICATION.md). The results below remain the historical qualification record.

22 October 2026. Implements the scoped core of `MUTABLE_AUTOCOMPLETE_WORKSTATION_FEATURE_BRIEF.md`. The earlier [legacy analysis](AUTOCOMPLETE_ANALYSIS.md) remains a historical comparison, not a specification of current behaviour.

## Delivered behaviour

- Default-enabled `autocompleteWorkstation` flag. Turning it off removes the new input adapter, commands, bindings and popup. The existing Entity tool remains available. Entity completion currently requires `entityReferences` as well.
- One transient `CompletionSession` per editor, tied to the exact occurrence, ViewId, canonical content, placement, inline version and range. Provider responses use cancellation and generation checks; commit revalidates the source and canonical Entity. No new resource ownership or persistence schema.
- `@` opens Entity completion; `[[` opens the existing native Document target pool where the invoking Flint context supports it; `/` uses the same controller for commands. `((` reserves Block-reference invocation but clearly reports that native Block drill-down is unavailable. Backslash escapes invocation. Existing saved markup is not reinterpreted or migrated.
- Local Entity ranking combines committed Document mention frequency, session recency, exact canonical-name/explicit-alias matches and Cavern search. Entity GUIDs are displayed and deduplicated; identical names do not merge identities. Saved observed mentions remain labelled as such, with the existing saved-index coverage diagnostics.
- Explicit Document/session/24-hour/7-day scopes and Clear usage history. Usage records contain only Entity ID, display name and timestamp, capped at 200 Entities per Cavern. Persistence reuses the browser-local preference facility used by Flint recents; no SQLite migration, publication content or second backlink/index store. This is a last-successful-use history, not a complete event log. Recent usage survives Document Undo, which does not undo knowledge-service activity.
- Select a phrase and type `:` to open an independent `phrase : query` field without deleting the selection. Alternatively use **Ctrl+; then A** or the Autocomplete action. Inline completion offers **Edit independently**. The default Entity operation preserves the authored phrase; **Replace with name** is explicit.
- The spaced separator ` : ` avoids interpreting ordinary times and URLs. `phrase : @` selects session recency, `phrase : #` selects Document frequency, and `phrase : +Name` prepares the existing explicit creation form. An escaped control stays literal. No punctuation shortcut executes outside an eligible invocation/selection.
- **Create / aliases…** reuses the existing managed Linked Entity Reference tool, its explicit alias mutations, stable creation retry IDs, close guards and created-but-not-linked recovery. Normal linking never learns an alias. The handoff focuses an already-open tool for the same Document rather than replacing its state.
- **Ctrl+A inside the workstation** opens reviewed Document matching. Ordinary editor Ctrl+A remains Select All. Existing candidate search supplies literal matching, whole-word/case controls, temporary highlights, exclusions and conflict diagnostics. All accepted ranges are validated and bound in one native Undo unit. It never silently overwrites an existing Entity reference.
- Up/Down, Enter and Escape use leased BindingRegistry actions in the completion scope. Tab, Copy, Save, history, the established **Ctrl+; then R** Entity entry and Thesis shortcut retain their existing roles.
- `/entity`, `/link` and `/date` are supported. `/backlinks` opens the existing Document Entity-reference inventory; this is not a new backlink implementation. `/proposition` invokes the existing Thesis draft command. Navigation/tool actions retain their literal slash invocation; `/date` and confirmed links replace their invocation. Unsupported semantic heading/task/embed operations are not advertised.
- The compact popup uses existing application-surface portals. Inline completion retains the editor caret; optional reads are cancelled on dismissal, source changes, owner hiding/activation changes and composition. Positioning measures one caret range in a coalesced frame, with scroll, viewport and visual-viewport invalidation.

## Authority acquisition

Wikidata and GND/lobid searches are explicit and visibly disclose that the query leaves Mutable. No external authority requests occur during ordinary typing. Search returns at most ten candidates, responses are capped at 1 MB, requests are cancellable, repeated reads are cached, and HTTP errors are surfaced without automatic retry loops.

Staging uses the existing managed Entity tool. Wikidata details show the name, description, aliases and record URL. The writer may explicitly select a local GUID for reconciliation or confirm identity-only import. Reconciliation preserves existing local names, aliases and descriptions. New imports include the reviewed identity metadata and aliases. The canonical ledger commits the identity, Entity and aliases atomically, records provenance, and retains an idempotent operation receipt. Existing `(namespace, externalKey)` uniqueness prevents a second Entity for the same authority ID; conflicts with an explicitly chosen different GUID fail without merging. Several supported external identities can belong to one local Entity.

Canonical identity acquisition is separate from Document linking and manual Save. It does not auto-link the source or auto-save a Document. The tool retains an uncertain write's retry payload and guards dismissal; confirmed imported Entities can be linked through the existing tool.

**GND limitation:** the current `ExternalIdentity.namespace` constraint does not include GND. GND-only import/attachment is therefore unavailable. A GND record's declared Wikidata link can be reviewed as a Wikidata identity. No GND identifier is disguised as another namespace, stored in an alternate identity index, or used to guess a merge. The brief's GND-linked reconciliation scenario is consequently only partial.

Provider references checked during implementation: [Wikibase API](https://www.mediawiki.org/wiki/Wikibase/API), [Wikidata data formats](https://www.wikidata.org/wiki/Wikidata:Data_formats), [lobid GND API](https://lobid.org/gnd/api), and [lobid usage policy](https://lobid.org/usage-policy/). Both public search endpoints returned HTTP 200 with CORS enabled during bounded live checks; reproducible application tests use isolated resolver data and do not write to public services or user Caverns.

## Qualification evidence

Tests use temporary fixtures and never save user Documents. No load testing was performed.

| Check | Result |
| --- | --- |
| Client and server TypeScript checks | Pass |
| Consolidated targeted Vitest run: completion, Entity tools/services, native references, text search, bindings and Window Manager/session suites | **168 passed, 2 baseline failures** across 17 files; [log](autocomplete-qualification/targeted-tests.txt) |
| Final bounded-input and search-version regression checks | **34 passed**; overlaps the consolidated suites, not an additional 34 distinct cases; [log](autocomplete-qualification/final-fix-tests.txt) |
| SQLite canonical Entity and authority tests | **3 passed**, including restart, idempotent retries, duplicate/conflicting identifiers, preservation of local metadata, imported aliases and multiple IDs per Entity; [log](autocomplete-qualification/canonical-tests.txt) |
| Real Chrome with actual retained Flint editor components | **18 passing interaction checks**, no browser exceptions; [results](autocomplete-qualification/browser.json), [viewport screenshot](autocomplete-qualification/popup.png) |
| Live public-provider read checks | Wikidata and lobid/GND both HTTP 200, one result requested, CORS enabled; no canonical writes |

Browser coverage includes actual character insertion, editor focus retention, canonical Entity GUIDs, literal-on-cancel, selected-text colon input, one-step completion Undo, Ctrl+A handoff, conflict exclusion, reviewed batch commit and one-step batch Undo, slash date, composition-start cancellation, literal escape, late results after cancellation, resized viewport, native Tab traversal, minimization and another actual Flint Window. Several development reruns encountered Chrome startup or interaction timeouts; the recorded final run completed all 18 checks. Browser-run repeatability remains a qualification limitation, not a claim that every intermediate run passed. The Entity resolver is an isolated fixture; these are real components and input events, not a claim that a live user Cavern was modified. Composition events are synthetic Chrome events; full operating-system IME candidate-window testing remains manual. Native Document completion is qualified separately against the real native save/load service in the Flint integration suite, including distinct Document/root Block IDs, cancellation and replacement Undo.

The two failures assert **exactly two repository snapshots** in the pre-existing Entity-candidates tests; the implementation currently takes **zero**. Both reproduce at untouched HEAD `b52051b` in an isolated worktree: **9 passed, 2 failed** ([baseline log](autocomplete-qualification/baseline-tests.txt)). They were not relabelled as the previously accepted Window Manager thirteen-failure baseline. This pass ran targeted regression suites, not the entire historical regression inventory. The temporary baseline worktree was removed.

A reused search-path defect was fixed during qualification: `TextSearch` returned session cache epochs as annotation range versions. After prior text edits, otherwise valid matches could therefore fail native batch validation. Cache epochs still protect undo branches; public ranges now carry the canonical inline/content revision required by `TextRanges`. The added regression and actual Chrome batch commit/Undo verify the fix. No newly failing targeted test remains.

### Typing costs

The real Flint typing benchmark used the same read-only in-memory native fixture: eight paragraphs and a 499-character measured paragraph. No fixture or user file was saved. [Before](autocomplete-qualification/typing-before.json), [final enabled](autocomplete-qualification/typing-after.json), and [paired flag-off](autocomplete-qualification/typing-flag-off.json) artifacts retain the measurements.

| Measurement, milliseconds | Before implementation | Final enabled | Final flag off |
| --- | ---: | ---: | ---: |
| Synchronous handler median / p95 | 5.7 / 9.9 | 7.0 / 10.5 | 7.8 / 12.6 |
| Handler plus queued caret median / p95 | 7.9 / 15.3 | 9.9 / 13.3 | 11.0 / 17.0 |

All runs recorded **zero repository snapshots, Save-status reads, vault-row reads, service requests and worker starts** during the measured typing, and verified text restoration. An initial suffix scan on every key was removed after an intermediate timing run. Ordinary input now reads at most the affected Block and one new cell; a regression test asserts that bound and zero snapshots/network work. Suffix recognition is capped at 256 cells when a trigger is possible or a completion is already open, with a separate long-input test proving the bound.

These finite headless samples vary with the browser/system; they do not establish user-visible latency guarantees or a statistically significant speedup. The paired flag-off result provides no evidence of a remaining feature-specific typing slowdown. Full operating-system IME and representative interactive long-Document use remain manual acceptance checks.

## Limits and deliberate deferrals

- Native Document completion inherits the existing picker: one eligible active saved Flint Document in a selected Cavern, with available loaded targets and unambiguous native identities. It does not invent a resolver for unopened, unavailable or ambiguous resources. Ink contexts without that capability report the limitation and retain literal text.
- Block/heading drill-down, `/block`, `/embed`, semantic heading/task conversion and a legacy `((Entity))` trigger profile are not implemented. The new profile affects invocation only and is reversible through the feature flag.
- Expanded batch review annotates reviewed phrase occurrences; it does not also rewrite an inline invocation's surrounding syntax. This avoids combining text cleanup with a separately reviewed multi-range operation. For clean source prose, start review from a selected phrase. Single-occurrence inline linking/creation does remove its invocation atomically.
- Current-Document display names may come from committed annotation metadata; the canonical Entity is fetched again before linking. The reference inventory is built on opening and on relevant annotation/structure changes, not on ordinary character edits. Usage history is browser-local and not synchronised between browsers/devices.
- Alias and Entity creation use the existing expanded tool, not a second canonical editor inside the popup. The existing tool's keyboard behaviour is retained; the new compact popup does not add numeric selection shortcuts.
- Authority search is currently English for Wikidata and a literal preferred-name query for GND. Search is deliberately capped rather than offering unbounded paging. No provider credentials are required. Identity provenance is recorded on the existing ExternalIdentity record; assertion-level property provenance is not invented.
- Selected property ingestion, relationship expansion, GND-only canonical import, AI research, domain ingestion, generated connectors, macros, cross-Document batch matching and advanced alias inference are deferred. They are not presented as completed features.
- No Window Manager redesign, new canonical Entity model, workspace schema, background Document Save, Markdown sidecar or resource reconstruction was introduced.
