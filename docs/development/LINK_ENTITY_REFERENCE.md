# Link Entity Reference: invocation and reuse

LER is the **Link Entity Reference Window**: a reusable semantic-authoring workflow for resolving an Entity and explicitly binding native text to its GUID. It is implemented by the `entity-references` feature, not by Flint's UI. Flint currently supplies the verified vault context needed for the canonical SQLite Entity service.

This guide describes the accepted P3d implementation. For authority, independent commits and deferred work, see the [accepted architectural baseline](../architecture/PERSISTENCE_AND_HISTORY.md#accepted-sqlite-p3-baseline). No additional API or hosting capability is introduced by these examples.

## Open and use it

1. Open a bound native Document in a Flint vault. Select text in the Document, including an ordinary cross-Block text selection if needed.
2. Press **Control+`;`, then `r`**, or choose **Entity reference** in the Document annotation toolbar. This is a two-step chord, including on macOS; it is not Command+R. Bindings can be customized.
3. Keep the selected **Target** and edit **Search** independently. For example, target `he`, query `leonardo`, and canonical Entity `Leonardo da Vinci` can link the original `he` without rewriting it.
4. Choose **Link** to preserve the prose, or explicitly choose **Replace & Link** to replace a suitable single-Block plain-text target with the preferred Entity name and annotate it in one native Undo operation.

The original target stays highlighted while the Window has focus. Search offers All/Name/Alias/Mention, Partial/Exact and Current Document/Vault. Current Document restricts results to Entities evidenced in that Document; Vault does not promise complete saved coverage. Coverage details distinguish no current matches from incomplete knowledge.

**+ Create Entity** opens a canonical-name field initialized from the search text, falling back to the original target. Without changing Search, the selection supplies the initial name. The field is independently editable before dispatch; **Create and link** performs the explicit operation. Creation is available even when other candidates exist: equal names are not identity and names are not required to be unique.

**Details / aliases** exposes preferred-name editing and explicit alias add/update/remove. An alias is canonical database knowledge; a Mention is authored surface text, not an automatically learned alias. **Find other occurrences** opens the existing review workflow: nominate an Entity, inspect/check/exclude candidate ranges, then bind explicitly. Matching text alone never authors references.

Up/Down and Enter navigate/select candidates; Escape closes. Alt+S/M/V change stream/match/scope. Number keys select the displayed numbered rows outside text fields. Native text entry, Tab and composition retain their normal role. Character/word target adjustments are transient and limited to a current, suitable plain-text Block; they add no delimiter Cells. Replace & Link and boundary adjustment have narrower eligibility than ordinary cross-Block linking.

The related **Entities in Document** action opens the listing, not LER. Its default chord is **Control+`;`, then `l`**.

## Choose the reuse boundary

| Caller needs | Existing entry point | Responsibility |
| --- | --- | --- |
| Open LER using the current native selection | Registered command `entity.open`; cross-text binding uses `cross.entity` | Host supplies the invoking occurrence's text target and preserves selection until dispatch. |
| Open LER using already captured annotation targets | `editor.annotationUI.get("codex/entity-reference").apply(ranges, contextKey)` in host/adapter code | Validate current revision and originating occurrence before dispatch. The feature takes its own versioned snapshot. |
| Reuse Entity discovery/details without annotation UI | Inject `EntityService` from an authorized host context | Preserve cancellation/currentness, provenance, coverage and disposal. This service does not grant annotation authority. |
| Implement/maintain LER itself | `openEntitySearch`, `EntitySearch`, `AnnotationCapabilities`, `PanelSession` | Keep feature registration, native mutation and panel/session ownership together. These are not a generic standalone picker API. |

Application/feature UI should receive a narrow action from its host, not `ReactiveEditor` just to open this Window. `DocumentApplicationInstance` does not currently expose a general LER launcher. A new Flint menu or another application should wire a small invoking-occurrence action in its application adapter, using the existing registrations below. Do not invent a second resolver or mount another editor to launch LER.

### Host command: selection still belongs to the editor

This code belongs in an existing application adapter that already owns `editor`. Pass only the resulting action to UI code.

```ts
// targetKey is the text occurrence in the invoking Window, not a Block GUID.
async function openLER(targetKey: string) {
  const context = { targetKey, args: undefined };
  if (!editor.commandRegistry.canExecute("entity.open", context)) {
    throw new Error("Entity reference is unavailable for this target.");
  }
  await editor.commandRegistry.execute("entity.open", context);
}
```

The command captures `api.selection(targetKey)` at execution time, including resolved cross-Block ranges. Dispatch before a toolbar/menu steals the text selection, or use the captured-target route below. The existing [Document style bar](../../src/rendering/document-style-bar.tsx) shows selection capture and pointer-focus retention. Do not prevent default input indiscriminately on form controls.

`canExecute` checks target availability; it does **not** prove that a nonempty range, writable vault or valid Entity service is available. The Window and service perform their own checks. Opening with a valid text context but no selected range permits discovery/review; direct Link still requires a valid target, and bulk binding requires reviewed candidates.

### Host contribution: explicit captured targets

Use the annotation contribution when the host already owns the intended ranges, for example a scoped annotation toolbar. This is the same feature entry used by the existing toolbar and avoids re-reading selection after focus has moved.

```ts
import type { AnnotationTarget } from "../runtime/annotation-contributions";

// Example in src/application: editor is the adapter's existing editor.
function openLERForCapturedSelection(
  ranges: readonly AnnotationTarget[],
  contextKey: string,
  capturedRevision: number,
) {
  if (editor.repository.state.revision !== capturedRevision) {
    throw new Error("The Document changed. Select the text again.");
  }
  const contribution = editor.annotationUI.get("codex/entity-reference");
  if (!contribution) throw new Error("Entity References is disabled.");
  // The caller has already checked that all ranges belong to its occurrence.
  contribution.apply(ranges, contextKey);
}
```

Capture the revision **with** the ranges, not when the button is eventually clicked. `AnnotationTarget` is `{ nodeKey, start, end }`, using **half-open native Cell boundaries**. Do not substitute UTF-16 string offsets, DOM offsets, canonical Block IDs, or a saved search snippet's offsets. Resolve an external query target through the existing navigation/selection authority first. A caller must enforce its own occurrence/Document scope; the contribution is not a general cross-Window target router.

The contribution snapshots content identity, placement identity, inline version, Cell coordinates and repository revision through `openEntitySearch`. It then opens the registered `entity-search` panel. Linked annotation creation remains shared core machinery; callers must not manufacture independent segments or infer linked identity from matching Entity GUIDs.

### Feature-owned helper: not an arbitrary panel factory

[Feature activation](../../src/features/entity-references/index.tsx) registers the annotation contribution, `entity.open`/`cross.entity`, listing commands, bindings, panels and underline effect. [Application assembly](../../src/application/features.ts) activates it with `annotationCapabilities(editor, scope)` when `entityReferences` is enabled.

Within that registered feature, the helper is:

```ts
openEntitySearch(api, ranges, contextKey); // returns PanelSession
```

`api` must be the feature's registered `AnnotationCapabilities`. Each adapter tracks the panel types registered through that capability instance. Constructing a different adapter and calling `openEntitySearch` does not grant permission to open `entity-search`, even if that panel type exists elsewhere. Prefer the existing command/contribution for external callers. Do not register duplicate Entity panels or render `<EntitySearch>` into an unrelated modal.

`openEntitySearch` returns a panel session, **not** a Promise resolving to a selected Entity. The feature owns explicit binding and closes through `PanelSession`. `chooseEntity` is an internal annotation helper: it checks the snapshot revision and delegates to native `annotate`, but does not itself resolve canonical Entity authority. It is not a safe replacement for the full resolve/revalidate/bind workflow.

## Reuse the resolver without binding text

[EntityService](../../src/feature-api/entities.ts) provides `search`, `summaries`, `get`, `create`, `rename`, `alias` and `dispose`. A feature with an appropriately scoped annotation capability obtains it via `api.entities?.(ownerKey)`; application composition can inject a narrower subset when only reads are needed. Do not call the legacy SurrealDB endpoints or select a database from global focus.

`search({ query, stream, match, scope }, signal)` returns candidates with GUID/name, local mention counts and evidence, plus `complete`, `diagnostics` and `current()`. Cancel superseded work and call `current()` before using a retained result. Its local freshness guard does not replace a fresh canonical lookup, native target validation or host navigation revalidation. The LER fetches the chosen Entity again before binding. Keep incomplete coverage visible; a zero-result response does not establish nonexistence.

Dispose the service when the owning interaction ends. Search AbortControllers are interaction-owned; they must be aborted on replacement/unmount. Do not interpret an aborted creation request as a rollback. Retain a creation's supplied Entity GUID, operation ID and exact request for an idempotent retry rather than generating new identities after an uncertain response. `rename` and alias edits use expected revisions; native Undo does not reverse those canonical database mutations. Broader canonical Relationship operations exist in the server service but are not an extra method on this `EntityService` UI contract.

The current resolver is deterministic. Future semantic/NL candidate discovery may feed the same explicit selection/binding model, but no semantic provider is implemented by this guide. Candidate evidence never becomes canonical merely because a provider returns it.

## Context, lifecycle and recovery requirements

**Context:** the [application Entity adapter](../../src/application/entity-service.ts) needs exactly one registered context accepting the owner occurrence, a live selected vault, a ready canonical resource boundary and verified source identity/location/hash evidence. Pending, missing or ambiguous bindings fail explicitly. [Flint composition](../../src/application/document-application-capabilities.tsx) registers/disposes that context with its existing vault/Facts lifecycle. `sqliteEntities` and `entityReferences` are enabled by default; that does not authorize writes to a read-only vault or enable `nativeKnowledgeSaved`.

The feature is reusable across invoking Flint Windows, including independent occurrences of one canonical Document. Another Window's focus must not select its vault or target. Generic Desktop Documents, Canvas and Spatial do not automatically gain this context just because they can render the feature. Their broader vault-context integration is deferred; showing the Window there may yield an explicit service-unavailable result. Do not fabricate a default vault, silently enroll a source or fall back to SurrealDB to make it work.

**Focus and ownership:** core supplies `PanelSession`, overlay identity, widget mounting and return focus. The feature owns its UI, target decorations, candidate controller and service. Default `panel.close()` restores focus; `close(false)` is used when the feature explicitly restores a new validated range. Cleanup disposes subscriptions/decorations/candidates/service. Opening another panel of the same type closes the existing one within the editor; do not promise independent concurrent LER panels over the same editor.

**Mutation:** ordinary intervening repository changes close the unresolved panel conservatively. During/after Entity creation, a changed target becomes invalid instead, allowing recovery of a confirmed canonical result. Late completion cannot annotate after the panel has closed. Never weaken revision checks to keep a stale UI open.

**Partial outcomes:** distinguish not created, created and linked, created but not linked, and creation outcome unconfirmed. A successfully created Entity is valid even when native linking fails. A confirmed GUID may remain in transient Window state and offer **Bind to new selection**, which validates a fresh same-Document/occurrence target and the original vault. Recovery state is not durable across panel dismissal. No compensating Entity deletion, cross-store transaction or staged publication is required. Duplicate conceptual Entities remain possible; future explicit Merge/Delete must not be replaced by name uniqueness.

## Source and qualification map

| Area | Code / existing evidence |
| --- | --- |
| Registration and invocation | [feature index](../../src/features/entity-references/index.tsx), [bindings](../../src/features/entity-references/bindings.ts), [open/bind helpers](../../src/features/entity-references/entity-search.ts) |
| Window and reviewed candidates | [search view](../../src/features/entity-references/search-view.tsx), [candidate controller](../../src/features/entity-references/entity-candidates.ts) |
| Public capability and host adapter | [annotations](../../src/feature-api/annotations.ts), [entities](../../src/feature-api/entities.ts), [annotation adapter](../../src/application/annotation-capabilities.ts), [Entity service](../../src/application/entity-service.ts) |
| Focus/mount lifetime | [panel contract](../../src/runtime/panel-contributions.ts), [panel session](../../src/runtime/panel-session.ts) |
| Focused regressions | [Window tests](../../src/features/entity-references/search-view.test.tsx), [candidate tests](../../src/features/entity-references/candidates-view.test.tsx), [lifecycle tests](../../src/features/entity-references/lifecycle.test.tsx), [service tests](../../src/application/entity-service.test.ts) |
| Accepted browser/server gate and limits | [P3d report](../../MUTABLE_SQLITE_PERSISTENCE_P3D_REPORT.md) |

When adding an invocation point, qualify selection surviving the trigger, target/query independence, the invoking Window's vault, cross-Block linking, stale selection, Escape/focus, native inputs/IME and disposal. If adding creation or recovery behavior, include uncertain retry, created-but-not-linked recovery, read-only rejection and Undo that changes only the native annotation. Reuse the existing native mutation and Entity service tests rather than building another resolver or persistence path.
