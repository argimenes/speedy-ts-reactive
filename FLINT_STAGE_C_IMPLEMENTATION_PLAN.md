# Flint Stage C implementation plan

**Planning only. Stage A, Stage B and native Save/Open production integration are accepted and complete. This proposal does not authorize implementation.**

Stage C should turn Flint into a useful knowledge workspace for a bounded collection of canonical Documents: create and organize Documents, find relevant passages, create and follow native references, inspect a small set of properties, and see incoming references. The editor remains ordinary Codex. Stage A supplies independently disposable occurrences; Stage B supplies native fidelity, explicit Markdown import and resource-owned Save/Open. Stage C builds application behavior on those results.

The smallest coherent delivery is three implementation stages with explicit gates. Organization and derived views must remain separate from canonical authored content and persistence bindings. Native Documents save individually through the accepted mechanism. **Collection folders, membership, trash and tab layout do not gain a durable native Workspace round-trip in Stage C.** If that is required before this application can be useful, stop for a product decision rather than solving it through new storage work.

## Existing abstractions to build upon

| Existing abstraction | Stage C use and actual gap |
| --- | --- |
| [DocumentApplicationCapabilities](src/feature-api/document-application.ts) and [host adapter](src/application/document-application-capabilities.tsx) | Extend the narrow semantic actions and read models for collection operations, queries and navigation. Flint owns its UI; repository/editor/projection access stays in the host. Current membership is a vault container's list of resource IDs. |
| [TransientDocumentView](src/rendering/transient-document-view.tsx), core tabs and `documentTarget` | Open results and references through existing occurrences. Preserve independent selection, toolbar scope, focus, overlays, disposal and source-disappearance behavior. No hidden editor to support queries. |
| [Resource identity](src/block-tree/resource-identity.ts), [registration and ownership](src/block-tree/resource-registration.ts) | Resolve canonical IDs and authored ownership independently of paths, membership and occurrences. Missing or ambiguous identity produces an unavailable result, never arbitrary adoption. |
| [Document factories](src/features/document-formats/model.ts) and ordinary command transactions | Create a basic editable Document with a fresh stable identity through the existing canonical creation path. Add membership and a transient tab without copying its content. Use existing Undo/Redo for authored edits and collection operations. |
| [Native session persistence](src/persistence/native-session.ts) | Reuse Open, explicit Markdown import, per-resource Save/status and recovery unchanged. Register newly created unsaved candidates with the existing lifecycle/warning behavior through the smallest necessary host action. No new persistence protocol. |
| [TextSearch](src/runtime/text-search.ts), [matching](src/runtime/search-matching.ts) and [worker](src/runtime/search-worker.ts) | Reuse matching, cancellation, Unicode/Cell mapping and result limits. Current `TextSearch` requires projection nodes and stops at nested Documents; it is not already an unmounted collection search API. Add a bounded canonical source adapter, factoring existing text extraction only where needed. |
| [Annotation capabilities](src/feature-api/annotations.ts), [linked annotations](src/runtime/linked-annotations.ts) and [position markers](src/runtime/document-position-markers.ts) | Reuse native `codex/block-reference`, validated selection/range snapshots, shared definition resolution and occurrence-scoped reveal. A cross-Document result must first resolve and open its target occurrence, then obtain current runtime ranges. |
| [Historical reference inspection](src/history/index.ts) | Evidence of existing native reference shapes, not a ready live backlink API. Provide a narrow backlinks query service with a default local implementation; keep storage and reference extraction behind that boundary. Do not enroll History or extract a general graph service. |

No panel registry or application framework is needed. Start with Flint-owned navigation, results and properties/backlink UI inside its existing composition. Use existing core focus/selection restoration where a picker temporarily takes focus.

## State and scope decisions

These are proposed Stage C decisions, not claims of functionality already implemented.

- **Collection state:** retain the existing vault ID and membership IDs. Add only bounded folder assignments, stable logical folder IDs and reversible trash state to that collection's existing metadata. A Document has one logical folder assignment per collection initially. Folder movement never reparents its canonical content or renames a file. Collection state lives in the current repository; preserve any already-supported legacy serialization, but make no native Workspace restoration claim.
- **Document properties:** a small fixed surface: editable title and a string-list of tags; read-only canonical ID, format and current binding/save status. Title uses the existing field. Confirm a single tag field against existing producers before adding one native metadata field. Preserve unrelated metadata. No arbitrary property editor, schema designer or property framework. Authored properties are Document edits, survive native Save/Open and may be absent from Markdown with existing degradation diagnostics.
- **Membership removal:** use “Remove from collection” or reversible collection Trash. Remove visibility/membership only; leave the Document's authored owner, registration, file, history and saves intact. Do not empty Trash by deleting resources. Removing a folder returns its memberships to the collection root; it does not cascade into content deletion.
- **Query scope:** search and backlinks cover loaded, available collection members. Unloaded or ambiguous members remain visible as unavailable with incomplete-query diagnostics. No server-wide discovery/index, background file loading or filesystem vault semantics.
- **References:** create Document references using the existing annotation's root Block ID plus canonical Document ID. Titles and folders are labels, not identity. Keep authored reference text unchanged when a target is renamed. Missing/out-of-collection targets are explicit states, not permission to open an arbitrary file.
- **Derived state:** results, snippets and backlinks are disposable read models, never authored graph edges. Persistent IDs identify result targets; runtime keys are resolved only when acting. Queries never save, change ownership or contribute selection/deletion targets merely by highlighting text.

The current Open Flint command creates a new vault for each Window. C1 must make collection scope explicit: another Window for the same collection uses that existing vault ID, while distinct collections keep distinct membership. Do not silently choose the first vault when several exist or add a global application catalog.

## C1 Collection operations and Document properties

Deliver a minimal collection browser with root/folders, active members and reversible Trash. Support New Document, add an already loaded Document, existing native Open/Markdown import, rename, logical folder assignment, remove/restore membership, and the bounded properties surface. Use the existing default page Document; additional templates are not required.

Creation must establish exactly one canonical source before opening a transient tab. Reuse the Stage A creation/ownership path outside the Flint Window; closing the tab or trashing membership must leave that source intact. Existing Documents are added by stable ID without moving their owner. Keep independent native Save status separate from a collection's changed organization. A folder rename must not dirty or rename every member's native resource.

**Gate C1:** qualify one Document in two Windows of the same collection and in two different collections. Folder operations and Trash update only their intended collection; Document title/tags update all its occurrences. Test creation, duplicate titles, ambiguous/missing identities, membership Undo/Redo, remove/restore, closing either Window, and source disappearance. Save/reopen a new Document and edited properties through the accepted native route; verify its ID and unrelated authored payloads survive. Verify organization does not rewrite files and guarded Workspace Save remains guarded.

Stop if C1 needs a new durable collection/Workspace envelope, ownership transfer or destructive lifetime policy. Return that specific product limitation; do not hide it in Document metadata or a sidecar catalog.

## C2 Search and native reference navigation

Deliver title/text search over the loaded collection, result snippets and navigation into a passage. Include Documents with no mounted occurrence. Traverse canonical authored content once per member resource; respect separate Document boundaries and do not follow external resource bodies merely because a reference exists. Foreign/transcluded bodies outside that scope and unsupported hosted text must be diagnosed rather than silently counted as complete coverage. Reuse supported native text extraction and worker matching; no duplicate editor, hidden mount or Markdown export as a search source.

Start with plain text search and the existing matcher defaults. Bound/cancel work and invalidate stale generations when text, membership or scope changes. Reuse monotonic content epochs so Undo followed by a new edit cannot make old offsets appear valid. An action on a result revalidates identity and revision, opens/reuses a tab in the invoking Flint Window, then reveals the current range. Never focus another occurrence just because it was the first match.

Add a Document picker for creating a reference from a nonempty valid text selection within one Document. Use the existing annotation transaction and selection restoration; do not depend on typing Markdown. Creation, removal and Undo/Redo must use native annotation semantics. Opening an existing Document reference resolves the canonical ID/root Block ID and uses the same navigation action as search. Existing unsupported reference forms remain authored and are reported rather than rewritten into the new picker subset.

**Gate C2:** find text in a loaded member with no tab; count a Document once despite multiple occurrences; exclude nonmembers and diagnose unavailable members. Test Unicode and inline images, query replacement/cancellation, edits and Undo branches during search, member removal during a query, and stale result activation. Create a reference, Undo/Redo it, rename its target, follow it from either Window, and verify correct focus/selection and source disposal. Reopen the native file and follow the same stable target. Search/navigation alone must not mutate native bytes or add history entries.

Stop if querying unmounted canonical content requires a second editor, persistent search index, broad input changes or substantial projection reconstruction. A small extraction adapter is justified; a new search platform is not.

## C3 Derived backlinks and integrated qualification

Deliver a narrow, read-only backlinks service and a Flint Backlinks view that consumes it through the application capabilities. The contract asks which authored references point to a stable Document/Block target within an explicit collection scope. It must not expose standoff storage, repository traversal or a database query language to Flint. Stage C exercises Document targets; it does not add a broader Block-navigation UI.

The minimal contract supplies:

- Stable source/target identities and a source-mention locator, with labels/snippets sufficient for display. No DOM nodes, projection keys or live editor objects cross the boundary.
- Explicit coverage and freshness information, including unavailable members, unsupported reference forms and partial or stale results. An empty partial result must not claim that no backlinks exist.
- Cancellable asynchronous queries and disposable change notifications. A delayed response for an old target, scope or generation must not replace the current view.

Core navigation revalidates a returned locator, opens/resolves the intended occurrence and reveals its current source range using C2's navigation action. The backlinks service owns neither focus nor editor occurrences, canonical resource lifetime or persistence. Supply it directly through the existing host composition; no service locator, backend registry or provider-selection UI is required.

Provide one default implementation using explicit native Document references authored in loaded, available collection members. Resolve linked annotation definitions through existing ownership/provenance helpers. One linked mention with multiple segments is one mention; separate mentions remain separate. Multiple tabs do not duplicate counts. Ignore deleted annotations, presentation `documentTarget` descriptors, structural ownership, membership, Find highlights and Entity annotations. Unrecognized reference forms are not guessed into Document backlinks. The abstraction hides how references are found, not their semantic meaning.

Use a bounded canonical scan initially, with invalidation of affected resource entries and coalesced refresh while the view is active. Reference creation/removal, linked definition changes, text/range edits, title changes, Undo/Redo, membership changes and source disappearance must invalidate relevant results. Closing the panel disposes its subscription and pending queries without cancelling another consumer's work. No full-repository snapshot on each keystroke, polling, observers on editable DOM or background graph framework.

A later local index or application-database implementation may satisfy the same semantic contract while declaring its coverage and freshness. Neither is implemented or qualified in Stage C; backend consistency, synchronization and indexing policy remain outside this plan. No additional authored relationship format or persistence contract is needed for the default implementation.

**Gate C3:** qualify the service separately from Flint's UI, and use a small delayed/partial-result test double to demonstrate that the UI depends only on the contract. Check cancellation, disposal, stale completions and visible incomplete coverage; do not build a second production backend. Default-service results must match the declared reference subset and loaded scope; duplicates, deleted mentions, unresolved/foreign definitions and cyclic references behave deterministically. Following a backlink revalidates and reveals the correct source mention in the invoking Window. Reference removal and Undo/Redo refresh results without stale rows. Rebuilding the derived view yields the same results and never changes canonical state.

Complete one real-browser workflow: create two Documents, organize them, edit title/tags, create and follow a reference, search a passage in an unmounted member, follow a backlink, trash/restore membership, save/reopen both native files, and repeat with two Windows. Inspect the UI and keyboard/focus behavior. Run focused collection/query/reference tests, the accepted Stage A/B/native regression suites and inexpensive Grouping, Entity, IME and native-control smoke checks. If query subscriptions change the typing path, compare the existing typing benchmark and verify no repository snapshot is introduced for ordinary typing; no exhaustive viewport/theme matrix is required.

## Approval and completion boundary

Recommended sequence: **approve C1 only → review C1 → approve C2 → review C2 → approve C3 → Stage C review**. These are three usable increments within Stage C, not permission to start later roadmap stages. Each report should identify implementation changes, qualification results and any unmet scope assumptions. New Stage C features default on when implemented, under the existing feature conventions.

Stage C is complete when the bounded collection workflow works through ordinary native editing, with useful search/references/backlinks and honest persistence/scope limits. Keep the accepted remaining persistence boundaries as future work: native Workspace round-trip, established binding relocation, archive cleanup, synchronization, broader Markdown and additional platform durability. Graph visualization belongs to a later roadmap stage. No Stage C code has been implemented by this planning update.
