# Document store browsing and persistence

Planned 12 September 2026, before implementation, at the user's request.
Status: implemented and verified, 12 September 2026. The initial plan above was
recorded before code changes; completion evidence is recorded below and in the
progress log.

## Source and scope

The original `src/components/workspace.tsx` constructs the workspace. Its file
controls live in `src/components/control-panel.tsx` (`load`, `save`,
`folderChanged`, `fileChanged`) and call `src/universe-block.ts`
(`listFolders`, `listDocuments`, `loadServerDocument`, `saveServerDocument`).
`DocumentBlock.getInputEvents` also declares Ctrl/Cmd+S (source ledger
`blocks-document-block-binding-28`). The implementation uses the existing Node
server in `server/index.ts` and the reactive `PersistenceService`.

This slice adds a document-store browser, Open, Save, and Save As to the current
single-document workspace. The initial sample remains available. Folder/file
deletion, renaming/moving, workspace-layout persistence, concurrent-writer merge,
and a durable indexing queue remain separate work.

## Interface and ownership

- A modal Explorer-style browser has an expandable folder tree, current path,
  a filterable document list, refresh, and explicit Open/Save actions. Selecting
  a file does not open it until Open, Enter, or double-click.
- Folder expansion loads child folders on demand, including arbitrary nesting.
  The document list contains JSON files only. Root, empty folders, loading,
  failed requests, and retry are represented explicitly.
- Open creates a fresh reactive editor only after fetch and decode succeed;
  existing content survives cancellation and failed requests. Editor disposal
  cleans up gateway listeners, focus handles, overlays, and pending UI requests.
- Filename/folder, dialog state, filtering, pending operations, and save status
  belong to session state. Existing JSON is decoded without substituting demo
  images, changing IDs, or inserting saved layout wrappers. Non-tabbed documents
  receive a scrolling view without rewriting their serialized structure.
- Save targets the open file. An unnamed sample uses Save As. Save As selects an
  existing folder and a JSON filename; replacing another file needs an explicit
  overwrite choice. A conditional create also detects files created after listing.
- Unsaved changes are visible. Replacing, resetting, or closing edited content
  offers Save, Discard, or Cancel. Browser navigation uses the native unsaved
  changes prompt. Edits made while a save is pending remain unsaved afterwards.
- Ctrl/Cmd+O opens the browser, Ctrl/Cmd+S saves, Ctrl/Cmd+Shift+S opens Save As.
  Dialog inputs keep normal typing/navigation; shortcuts have one session owner.
  Modal focus is contained and returns to the document on close.

## HTTP and file-store contracts

| Existing endpoint | Preserved response/body | Extension |
| --- | --- | --- |
| `GET /api/listFolders` | `{ folders: string[] }` | Optional `folder` query (default `.`), returning immediate child names. |
| `GET /api/listDocuments?folder=…` | `{ files: string[] }` | Sorted JSON filenames only; explicit errors. |
| `GET /api/loadDocumentJson?folder=…&filename=…` | `{ Success, Data: { document } }` | Validate path/content; report missing and malformed files. |
| `POST /api/saveDocumentJson` | `{ folder, filename, document }` → `{ Success }` | Optional `If-None-Match: *` prevents unintended replacement; revision header retained. |

Document JSON keeps legacy field names, IDs, annotations, margins, opaque data,
and type tokens. The existing load-time filename metadata behavior is retained;
save snapshots record their selected folder/filename without modifying live
content. Extended inline/reference semantics still use the separate repository
contract and existing legacy export-loss checks.

The default store is the repository-owned `data` directory. An explicit
`SPEEDY_DOCUMENT_ROOT` can select another existing document root, including an
isolated test store. Nested paths are confined to that root after resolving
symlinks; filenames cannot contain path separators. Writes use a temporary file
and atomic replacement (or conditional creation). Validation/write failures do
not acknowledge a save. Indexing runs after durable file storage; an indexing
failure returns successful storage plus a warning, not a false write failure.
File browsing/saving remains usable if the optional graph database is unavailable.

Development `/api` requests proxy from Vite to the Node server on port 3002.
`npm run dev` must build/start the API, wait for it to listen, then launch Vite;
Ctrl+C or a failed child process shuts down both owned processes. This startup
requirement was added after the user encountered a refused API connection with
the frontend-only development command. Both checked-in Vite configurations must
agree. Startup and root configuration are documented in the README.

## Acceptance checks

- [x] Nested folders, root and empty directories, sorted/filterable JSON lists,
  stale list responses, server/network errors, and modal keyboard navigation.
- [x] Load an existing legacy document without media/ID/schema rewrites; failed
  load leaves the current editor intact; non-tabbed documents still scroll.
- [x] Edit → Save As → list → Open reproduces text, annotations, margins, and
  unknown fields. Save updates the current filename and reports clean state only
  for the persisted revision; double submits cannot race.
- [x] Save/discard/cancel protects edited content during open/reset/close, and
  edits during an in-flight save remain dirty. Overwrite/create races are handled.
- [x] Real HTTP tests use temporary directories for read/write/error/path cases;
  no verification saves overwrite the user's existing documents.
- [x] Typecheck, focused UI/persistence/server regression tests, production build,
  and a real-browser browse/open/edit/save/reopen smoke check pass.

Evidence: 56 tests across 10 suites passed, including six real-HTTP store tests,
three persistence tests, and six document-browser/workspace tests. Typecheck and
the client/server production build passed. Chrome opened a copy of the existing
Masque of the Red Death document and verified scrolling; a separate editable
fixture passed edit → Save As → Open → Ctrl+S with preserved IDs, annotations,
margin data, and unknown fields. The 390×844 modal fit check passed. The browser
screenshot is `/tmp/speedy-document-browser.png`.

The single development command was exercised on isolated ports: both direct API
and proxied folder requests succeeded, and Ctrl+C stopped both servers. The live
default proxy also returned the user's existing folder/document lists. Verification
writes used temporary stores only. Search-index retry/outbox, multi-writer conflict
resolution, and complete legacy multiple-window shortcut routing remain outside
this slice; the full historical input ledger is not claimed closed.
