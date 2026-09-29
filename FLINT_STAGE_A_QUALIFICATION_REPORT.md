# Flint Stage A — transient Document occurrence qualification

29 September 2026. **Stage A complete; stop for review before B or C.**

The transient-view strategy passes this qualification gate. The existing editor/repository/projection architecture can host independently disposable Document occurrences with bounded lifecycle fixes. No Workspace persistence format or ownership-materialization changes were needed. Markdown, dual-save and native serialization migration remain unimplemented.

## Try it

On Desktop, choose **Workspace → Open Flint**. The feature flag is `flint`, enabled by default. The launcher uses the existing Desktop background/content host and ordinary Window mechanics. The Stage A entry is disabled in other presentations, with an explanatory title; this stage does not add Canvas/Spatial application-launch integration.

An empty Workspace receives two ordinary canonical Documents, **Notes** and **Ideas**, in a vault container in the existing object bank. In a Workspace that already has Documents, Flint lists those loaded identities without moving their owners. The first two become tabs. Each invocation opens another Window, allowing the same Document to be edited through two visible occurrences.

Use the left-hand Document buttons to open/reopen tabs, the adjacent native text fields to rename Documents, and **Close tab** to remove a presentation descriptor. Window minimize/restore and close use existing controls. Save/reopen through the existing Workspace UI. Server save remains subject to the existing read-only policy; Stage A does not relax it.

This is a composition/identity proof UI. Vault folder management, document creation workflows beyond the initial proof Documents, search/backlinks/graph, Markdown and final visual integration are later work. The supplied Flint icon master is preserved; icon derivatives and finished branding have not been added in A.

## Persisted model and transient host

A core `tab-block` stores:

```json
{ "metadata": { "documentTarget": { "version": 1, "documentId": "stable-resource-id" } } }
```

The tab has **no authored Document child or reference placement**. Its NodeKeys, mounted editor, projection and selection bookmarks are transient. Vault membership stores resource IDs separately from canonical ownership. Document identity may differ from its authored root Block ID.

The host resolves a unique canonical Document and its owned placement, then calls the existing `createView` against that placement. Multiple views have different occurrence keys but the same canonical content and placements. There is one editor, repository, command/history system and input gateway. Only an active tab mounts; two visible Windows may independently mount the same Document. No hidden editor, second DTO or copied text model is introduced.

The feature receives semantic document listing/open/rename/close actions and a core-rendered tab slot through [DocumentApplicationCapabilities](src/feature-api/document-application.ts). It receives no `ReactiveEditor`, repository, projection or arbitrary DOM lookup. The [private application adapter](src/application/document-application-capabilities.tsx) handles core composition, identity resolution, container input policy and registrations. The feature owns its shell and initial tab description. There is no application registry beyond the existing Block registry or generalized application framework.

The first host is deliberately Window-scoped. A Flint application encountered inside a Document renders an unavailable-host message, preventing recursive application/Document hosting. The application tab-host context is also reset inside the rendered Document, so authored inner tabs cannot recursively resolve through the outer application. This is not a promise of unrestricted nested applications.

## Qualification findings and bounded core changes

1. **Missing source root:** the original scoped projection threw `Missing projected placement …` after source deletion, interrupting repository change delivery. A missing scoped root now produces an empty projection. The host unmounts it and shows an unavailable message; Undo resolves and mounts a fresh view. A direct projection proof also verifies continued subscriber delivery and recovery on Undo.
2. **Independent disposal:** `ReactiveEditor.disposeView` unregisters the projection, cancels its current text operation when owned, closes its Find/overlays, clears its cross-text/block/text selections and focus, and releases mount bookkeeping. Canonical content is untouched. Disposal is idempotent; another occurrence stays alive. Duplicate live view IDs are rejected rather than replacing the lookup entry and leaking a subscription. Queued panel focus returns recheck the mount, preventing a closed tab/Window from resurrecting a disposed focus key.
3. **Selection/focus:** core stores transient placement-based bookmarks, remapping to fresh occurrence keys on activation. Inline/native selections and cross-Block endpoints restore when their canonical revisions are still valid. Edits through another view invalidate stale bookmarks; they are not replayed at obsolete offsets. Bookmarks survive Window minimize/remount and are removed with their tab/application lifetime. The last focused text occurrence is tracked even while focus moves through app controls.
4. **Unmount ordering:** mount disposal can precede host cleanup. The mount registry now retains the final inline selection, just as it already retained native-text selection, until final occurrence disposal removes both caches. This avoids relying on Solid cleanup order.
5. **Toolbar scope:** ordinary formatting already uses the Document occurrence scope. The current-operation annotation branch needed an additional scope check: a toolbar in another Window must not format the first Window's grouped selection. It now refuses that operation with the existing scope notice.
6. **Window focus:** an authored-only descendant check could not recognize a physically hosted transient Document. Window containment now also recognizes registered mounts inside its DOM. Restore respects an already focused mounted editor instead of stealing focus back to the Window frame. Existing Window tests still pass.
7. **Composite input:** the application mount uses `container`, not `opaque-widget`. Existing native/standoff input reaches the same core gateway. Tab panels consume one optional core Document-host context; ordinary tabs retain their existing path. With the feature disabled, the target descriptor remains serialized and unavailable content is explicit.

These are lifecycle/hosting corrections, not reconstruction of the editor, selection engine, ancestry model or persistence system. The application catalog ignores inline/split/empty-paragraph fast-path notifications, so ordinary typing does not re-scan Document identities. No new global input pipeline, observer loop, file watcher or Markdown recognizer was installed.

## Persistence and identity results

- Local Workspace JSON round-trip preserves the two canonical Documents, tab target IDs, authored edits and owned source placements. Browser reopen mounts fresh independent occurrences.
- The existing server bundle builder/materializer produces **two resource Documents**, even with two Windows showing the same content. All reopened canonical sources remain owned; tab DTOs have no Document body.
- The actual launcher also passes server-format round-trip, including new proof Document file locations. Repeated launch reuses the existing object bank rather than creating ambiguous multiple banks.
- Closing a tab or Window removes presentation state only. Its canonical Documents remain reachable through their existing owners/object bank.
- Missing or ambiguous identity produces an unavailable view, never a “first match” or ownership transfer. Removing the ambiguity/undoing source deletion restores a view.
- Feature-disabled reopen preserves the serialized payload and mounts no transient editors.
- The original five Jet persisted-transclusion characterization tests remain unchanged and pass as evidence of the rejected strategy's ownership inversion. They are **not** counted as proof that authored tab transclusion became safe.

Server qualification here exercises the existing bundle encoding/materialization in memory. It does not claim a new live HTTP save or filesystem transaction protocol. No real server documents or external Markdown files were written. Native full-fidelity serialization remains Stage B's separate gate.

## Automated and browser evidence

[Focused test log](artifacts/flint-stage-a/qualification.log): **134 tests passed in 16 files**, including 17 new transient/model/composite tests and existing Workspace, Block tree, standoff rendering, Grouping, Entity lifetime, annotation, linked-annotation, feature capability and Window tests.

New tests:

- [Transient model proof](src/application/flint-transient-proof.test.ts): sharing, rename/edit/Undo, independent disposal and pending-focus revocation, duplicate view ID rejection, source deletion/recovery, local/server identity and ownership round-trip.
- [Rendered lifecycle](src/application/flint-lifecycle.test.tsx): repeated activation/disposal, inline/cross-Block selection restoration and stale-bookmark rejection, scoped Grouping toolbar, Entity panel focus/async cancellation, launched server bundle, Window minimize/restore, ambiguous identity, nested-tab context isolation, source deletion/Undo, close/reopen, disabled feature and simultaneous Windows.

[Chromium results](artifacts/flint-stage-a/browser-results.json): **28 checks passed**, with no uncaught browser exceptions. These cover visible main-menu launch, native typing/caret/selection, Undo/Redo, scoped formatting, measured SVG, cross-Block selection, Control-drag Grouping, Chromium IME composition, native rename controls, minimize/restore, source deletion/Undo, shared content in two Windows, repeated switches, local reopen and feature-disabled preservation. IME qualification uses Chromium's composition API; it is not a claim of an exhaustive native input-method/device matrix.

Reproduce with Node 22:

```sh
node scripts/check-flint-stage-a-browser.mjs
```

The script defaults to `http://localhost:3000/`; `FLINT_URL`, `CHROME_BIN` and `FLINT_ARTIFACTS` override the host/browser/output. It uses an isolated browser profile and in-memory proof workspace.

Captured views:

- [Main Desktop launch](artifacts/flint-stage-a/main-application.png)
- [Two Windows sharing a Document](artifacts/flint-stage-a/shared-document-windows.png)

[Build log](artifacts/flint-stage-a/build.log): client and server TypeScript checks and production client build. Existing browser-compatibility-data freshness and bundle-size warnings are informational; no dependency updates were made. No typing benchmark is claimed: A adds no recognizer or ordinary-input dispatch and its remaining catalog work bypasses text fast paths.

## Decision for review

Stage A no longer needs an ownership-preserving Workspace format change. Transient presentation can be kept separate from stable canonical identity using the current architecture and the qualified lifecycle fixes above.

**Stop here.** Stage B still requires its own native full-fidelity codec/admission and paired-save review. Stage C's knowledge-workspace functionality has not begun. The conceptual approval of consumed Markdown and dual-save has not been treated as implementation authorization.
