# Entity-reference search migration

Status: search-and-select implemented; grouped visual effects remain deferred.

14 September follow-up: scoped “Find/select all matching mentions” is now planned
in [ENTITY_MATCH_CANDIDATES_PLAN.md](ENTITY_MATCH_CANDIDATES_PLAN.md). It reuses
TextSearch/session decorations, separates mention text from entity lookup, preserves
native input shortcuts, and proposes reviewed, atomic binding of independent
mentions. **Planning only: bulk binding is not implemented or authorized yet.**

Original sources: `src/components/search-entities.tsx`,
`DocumentBlock.applyEntityReferenceToText()` in `src/blocks/document-block.ts`,
and the two `/api/findAgentsByNameJson` / `/api/findAgentsByAliasJson` routes in
`server/index.ts`. Original search seeds from the selected text, supports
alias/name and partial/exact lookup, result selection and mentions. The original
document command creates annotations after selection, not on opening the dialog.
The server queries SurrealDB Agent records and standoff_property_refers_to_agent
relations. The converted app already proxies /api to Node on port 3002.

Implementation plan:

1. Reuse the existing API paths and response envelope; harden search validation,
   pagination, parameterized queries and unavailable-database errors. Use an
   injectable router for tests without touching the user's database.
2. Add a session-only entity search overlay with seeded/debounced queries,
   request cancellation/stale-response protection, name/alias and partial/exact
   options, sorting, paging, loading/error/empty states and keyboard selection.
3. Wire the Entity reference toolbar action and linked entity creation to the
   overlay. Capture text ranges before focus changes. Commit only after selecting
   a result: one atomic transaction, shared identity for cross-Block references.
   Save the entity ID plus name metadata for the existing annotation monitor.
4. Cancel without mutation; invalidate pending targets on document edits/history.
   Preserve caret/range focus on close. Opening an existing document must not
   trigger search windows for loaded references.
5. Test API contracts/errors, debounce and stale responses, cancel, local/linked
   creation, metadata persistence and undo. Run typecheck and production build.

Scope: existing-entity search and selection. Original Add-to-graph and bulk
annotate-all-matches are deferred; no entity/database records are created by this
workflow. No live database writes or document-store writes during verification.

## Completed implementation / resume checkpoint

- Entity reference toolbar button opens the session overlay for a selected local
  range. Cmd+E / Ctrl+Shift+E preserve the original keyboard bindings, registered
  in the editable input catalogue. A selected range is required; automatic
  word-at-caret expansion is not included in this first port.
- The same action with cross-Block selection, or Create linked annotation with
  type `codex/entity-reference`, opens search for all captured segments. Selecting
  a result creates one shared annotation definition with local ranges, atomically.
- Search uses a trailing 300ms debounce, AbortController and stale-response
  checks. Empty text clears results; failed requests leave document data alone.
  Names/aliases, partial/exact match, sort direction, paging, mentions, mouse
  selection and Up/Down/Enter/Escape are supported. Controls are keyboard focusable
  with Tab containment. Search targets are highlighted without saved properties.
- Cancel creates no empty annotation/history entry. Any document mutation closes
  the pending search, and commit additionally verifies the captured revision.
- Selected entity metadata stores `entityId` and `entityName`; the existing
  annotation monitor resolves these for local and linked annotations. Loaded
  references do not trigger a search window. Existing-reference retargeting is
  still through monitor fields rather than a dedicated search action.
- `server/entity-search.ts` replaces the old route bodies on their existing
  URLs. SQL search text is parameterized, ordering is whitelisted, empty results
  return Page/MaxPage 1, requested pages are clamped, and DB failures return JSON
  HTTP 503. Agent RecordIds are returned as bare keys, matching existing document
  indexing/getEntitiesJson conventions rather than double-prefixing Agent IDs.
- Existing indexing now resolves shared definition values and ignores deleted or
  unassigned references. Mention text uses Cell/code-point offsets. Historical
  indexing cleanup/deduplication is unchanged and is not part of this port.

Verification:

- Four UI tests pass: seeded API request and local commit/save/undo, original
  keyboard opener/cancel/focus, linked creation/stale-target invalidation,
  debouncing/stale-response rejection/alias lookup/server error display.
- Two HTTP tests query the installed embedded SurrealDB engine using `mem://`:
  real Agent/mention relations, aliases, exact/partial match, paging, string ID
  conversion, zero results, invalid pages, SQL-like text and unavailable DB.
  Test fixtures exist only in disposable memory, never the user's appdb.
- Chrome 153 smoke passes seeded dialog, Enter selection, saved ID/name, close,
  and atomic undo. Browser responses are mocked; SQL/API are tested independently
  against the real in-memory engine. Existing cross-selection/IME/count checks
  also pass.
- Full suite: 182/184 pass; the two existing context-menu synthetic-button
  failures remain. Typecheck and client/server builds pass.
- Commands: `npx vitest run --no-cache`, `npm run typecheck`, `npm run build`,
  `CROSS_IMPLEMENTED=1 node scripts/check-cross-block-selection.mjs`.

Operational requirement: the existing Node server must have a working SurrealDB
connection (not `SPEEDY_DISABLE_DATABASE=1`). Restart an already running server if
it does not reload the rebuilt handlers. No new DB service, schema, credentials,
or plugin is required. The actual populated user database was not queried during
verification; a user-side search against its data remains the final environment
check. No commit requested or made.

Query syntax was checked against the official
[SurrealQL SELECT reference](https://surrealdb.com/docs/reference/query-language/statements/select)
and exercised against the locally installed engine, not assumed from newer docs.
