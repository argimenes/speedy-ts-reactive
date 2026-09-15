# Resilient workspace save/load plan

Planned 15 September 2026, before implementation, at the user's request.
Status: approved for a short-term implementation; no runtime code has been
changed as part of this planning document.

## Outcome

A Workspace will be saved as a small, versioned manifest. The manifest owns the
Workspace layout and refers to independently stored Document JSON files; it does
not embed those Documents.

The saved layout includes the complete `WorkspaceBlock` subtree, including its
`BackgroundBlock`, background configuration, windows, non-document Blocks and
window presentation state. A `DocumentWindowBlock` contains an explicit
reference to a Document resource. On load, each reference is resolved and the
Document file is hydrated into the live Workspace.

For this increment, the live Workspace and all hydrated Documents continue to
use the current single reactive repository, revision counter and undo history.
Separate repositories, per-Document dirty state and per-Document undo stacks are
deliberately deferred.

## Current-code findings

- `PersistenceService.saveWorkspace()` currently posts
  `editor.encodeWorkspace()` directly to `/api/saveWorkspaceJson`.
- `PersistenceService.loadWorkspace()` currently expects the response itself to
  be a Block DTO and passes it directly to `decodeWorkspace()`.
- The reactive workspace encoder inherited the old convention: a
  `document-block` with `metadata.loadFromExternal === true` is written with an
  empty `children` array. Its folder and filename remain in metadata.
- The original `UniverseBlock.saveWorkspaceAsync()` used that convention for
  every Document. During reconstruction, the old `DocumentBlock` builder noticed
  `loadFromExternal` and fetched the separate Document file.
- The convention is lossy and ambiguous: an empty Document is also a valid
  Document, a folder/filename is being mixed into Document content metadata, and
  there is no stable identity or integrity check.
- The current workspace endpoint atomically replaces one workspace JSON file,
  but it neither coordinates Document saves nor validates document references.

The old format remains useful as an import format. It should not be the new
canonical format.

## Scope of this increment

This work includes:

- a versioned Workspace manifest schema;
- stable Document identities plus explicit external locations;
- serialization of the entire Workspace layout, including the BackgroundBlock;
- coordinated saving of all referenced Documents followed by the manifest;
- resilient loading, identity checking, missing-file placeholders and relinking;
- migration of the existing `loadFromExternal` workspace shape;
- path, schema, duplicate-identity and partial-failure validation; and
- focused codec, persistence, server and browser tests.

This work does not include:

- one reactive repository or undo stack per Document;
- precise per-Document dirty tracking;
- cross-Workspace or multi-user merge;
- a general filesystem watcher;
- automatic source-control repositories;
- a database-backed Document catalogue; or
- transparent repair of arbitrary moved files without an identity index.

## Persisted format

The Workspace file will have a top-level envelope rather than pretending to be a
single Block DTO:

```json
{
  "kind": "speedy-workspace",
  "schemaVersion": 1,
  "workspaceId": "workspace-uuid",
  "documents": {
    "document-uuid": {
      "documentId": "document-uuid",
      "title": "Research notes",
      "source": {
        "kind": "document-store",
        "folder": "projects/research",
        "filename": "notes.json"
      },
      "contentHash": "sha256:optional-integrity-value"
    }
  },
  "root": {
    "type": "workspace-block",
    "children": [
      {
        "type": "image-background-block",
        "metadata": {
          "url": "/image-backgrounds/green-aurora.jpg"
        },
        "children": [
          {
            "type": "document-window-block",
            "metadata": {
              "title": "Research notes",
              "position": { "x": 80, "y": 40 },
              "size": { "w": 720, "h": 640 },
              "state": "normal",
              "zIndex": 3
            },
            "children": [
              {
                "type": "document-reference-block",
                "metadata": { "documentId": "document-uuid" }
              }
            ]
          }
        ]
      }
    ]
  }
}
```

The resource table separates identity from location. `documentId` is the durable
identity; `folder` and `filename` are the current location in the configured
Document store. The source object is a tagged union so a later format can add a
relative-file URI or another provider without overloading today's fields.

`contentHash` is optional in the first compatible reader, but new saves should
write it. It detects a file that has been replaced or edited externally. It is
not a substitute for the stable `documentId`, and the current global repository
revision must not be presented as a per-Document revision.

Unknown envelope, resource-entry and Block fields are retained where practical.
An unsupported future `schemaVersion` fails with an explanatory error rather
than being partially decoded.

## BackgroundBlock and ownership boundary

The `BackgroundBlock` is Workspace data and is saved inside `root`, not in a
Document file. Its concrete type (`image-background-block`,
`video-background-block`, `youtube-video-background-block` or
`canvas-background-block`), metadata, relations, opaque fields and child order
must round-trip unchanged.

The ownership rule is structural:

- Workspace-level layout and controls stay in the Workspace manifest.
- A window shell stays in the Workspace manifest.
- A Document root and everything owned below that root stay in its Document
  file, including Pages, annotations, margins and Document-owned floating Blocks.
- The window position, size, minimized state, icon choice, title and z-index stay
  with the window in the Workspace manifest.
- A Workspace-level floating Block that is not owned by a Document remains in
  the Workspace layout.

Therefore a background media change can be saved by saving the Workspace, while
an edit inside a Document is stored in that Document's own JSON file.

## Stable Document identity

Every externally referenced Document file needs a stable
`metadata.documentId`. For an older Document, the migration uses its existing
Document root `id` when that ID is present and unique; otherwise it generates a
UUID once and includes it in the next saved Document.

Identity rules:

- two resource entries may not claim the same `documentId` with different
  locations;
- two different loaded files may not claim the same `documentId` without an
  explicit repair choice;
- a reference to an unknown ID becomes an unresolved reference, never an empty
  Document; and
- changing a filename or folder updates the Workspace resource location, not
  the Document's identity.

More than one window may refer to the same `documentId`. In the current single
repository, the hydrator loads that Document once and creates additional
reference placements to the same content record. Editing either occurrence then
updates the same canonical content and avoids divergent in-memory copies.

## Live representation in the current repository

The persisted manifest and the hydrated Block tree are intentionally different
representations.

On load, a Workspace hydrator resolves `document-reference-block` nodes before
or while constructing the live repository. A resolved reference presents a
normal `DocumentBlock` directly inside its window, preserving the assumptions of
the existing rendering, Find, entity and style-bar code. The persistence session
keeps a non-canonical registry from `documentId` to source information and live
Document content/placements.

On save, a dedicated manifest encoder walks the live snapshot. For every
registered external Document root it emits a `document-reference-block` instead
of recursively embedding the Document. It emits each source once in the resource
table. This encoder must not infer externality from an empty child list.

An unresolved reference remains a registered placeholder Block in the live
Workspace. The placeholder shows the expected title/location and offers Retry,
Relink and Remove Window. It must never masquerade as a successfully loaded empty
Document.

The existing general `encodeWorkspace()` remains a plain Block-tree operation
until its callers are migrated. Workspace persistence uses the new explicit
manifest encoder so another caller cannot accidentally embed Documents or strip
their children based on legacy metadata.

## Save workflow

Because this increment deliberately retains one global dirty state, Save
Workspace conservatively saves every referenced Document, not only Documents
believed to be dirty.

1. Capture one immutable repository snapshot and its global revision.
2. Validate Workspace shape, resource registrations, unique Document IDs and
   source locations before making any request.
3. Encode every distinct referenced Document from that same snapshot. Remove
   session-only properties and calculate its canonical content hash.
4. Encode the Workspace root from the same snapshot, replacing external
   Document roots with explicit references. The complete BackgroundBlock and
   window layout remain in this output.
5. Send the independently encoded Document files and manifest through a
   coordinated save operation. The transport may contain both, but the server
   writes them as separate files; the stored Workspace never embeds a Document.
6. Stage and validate all JSON first. Atomically replace each Document file, then
   atomically replace the Workspace manifest last. If a Document write fails, do
   not advance the manifest.
7. Report the exact failed file and preserve the user's live Workspace. A retry
   repeats the whole snapshot operation safely.
8. Mark the Workspace clean only if the repository is still at the captured
   revision. If edits occurred during the request, report that the snapshot was
   saved but newer changes remain unsaved.

Individual atomic replacements plus “manifest last” prevent truncated JSON and
a new manifest pointing at files that were never written. They are not a true
cross-file filesystem transaction: a crash after one Document replacement can
leave a newer standalone Document beside the previous manifest. The hash check
makes this visible, and retry converges the set. A durable write-ahead journal or
immutable Document revisions can be considered later if this remaining crash
window proves material.

Normal Save Document remains available. After a successful Save As, any open
Workspace registry entry for that `documentId` must adopt the new location so
the next Workspace save does not retain a stale path.

## Load and recovery workflow

1. Fetch and parse the Workspace file without destroying the current editor.
2. Validate its envelope, version, Workspace root, BackgroundBlock structure,
   resources, reference IDs and safe source paths.
3. Resolve distinct Document resources with bounded parallel requests and an
   abort signal. Repeated references reuse the same result.
4. Validate each loaded file as a Document and compare its internal
   `documentId`. If a hash is present, compare the canonical content hash too.
5. Hydrate valid resources, creating shared reference placements for repeated
   windows. Convert missing or invalid resources into explicit unresolved
   placeholders while retaining the rest of the Workspace layout.
6. Construct a new editor/session off-screen. Replace the active Workspace only
   after the manifest is valid and construction succeeds.
7. Present one recovery summary listing missing, inaccessible, malformed,
   identity-mismatched or externally changed Documents.

A missing Document does not prevent the background and the other windows from
opening. Relink asks the user to select a candidate file, verifies its
`documentId`, and updates the session mapping. If the selected file has a
different ID, “replace this reference” must be an explicit choice rather than an
automatic repair.

A matching ID with a different hash means the same Document was edited outside
the saved Workspace snapshot. The default is to load that current file and show
a warning; no data is overwritten merely by opening the Workspace. The user can
then save the Workspace to accept the new hash.

## Compatibility and migration

The loader accepts three inputs during migration:

- the new `speedy-workspace` version 1 manifest;
- an old Workspace Block tree containing `loadFromExternal` Document stubs; and
- a fully embedded legacy Workspace Block tree.

For `loadFromExternal`, the importer creates a resource entry from the legacy
folder/filename, loads the Document, establishes or generates its stable ID, and
records an explicit reference in session state. An embedded legacy Workspace can
open without data loss, but Save Workspace requires each embedded Document to
have a selected external location before the new manifest is written. It must
not silently discard or embed that content.

New saves always use the versioned manifest. Migration is therefore gradual and
reversible at the file level: existing Document JSON remains independently
readable, and the original Workspace file is only replaced after a successful
save.

The legacy `loadFromExternal` branch and encoder test should remain until sample
and user Workspace files have been migrated, but new code must not create that
shape.

## Validation and safety

- Workspace filenames, Document folders and Document filenames are validated at
  the server boundary and confined to their configured roots after symlink
  resolution.
- Filenames cannot contain separators; folder traversal and absolute paths are
  rejected for the `document-store` source kind.
- Duplicate IDs, duplicate destinations, unsupported source kinds and reference
  cycles fail before writing.
- A Document response must have a Document root; an arbitrary JSON object or
  Workspace cannot be hydrated in its place.
- Save/load errors use structured codes suitable for Retry, Relink and conflict
  UI instead of only `{ Success: false }`.
- Loading and relinking are read-only until the user explicitly saves.
- Session-only minimaps, Find results, highlights, focus handles and other view
  state remain excluded from both Workspace and Document persistence.

## Implementation phases

### Phase 1 — contracts and pure transforms

- Add TypeScript manifest/resource/source types and strict validators.
- Add pure manifest externalization and hydration planning functions.
- Add stable Document-ID and canonical-hash helpers.
- Cover BackgroundBlock preservation, nested Documents, duplicate references,
  unknown fields and legacy conversion with unit tests.

### Phase 2 — persistence session and loading

- Add the session-only Document reference registry.
- Load manifests and Documents without replacing the active editor on failure.
- Hydrate shared Documents once and render unresolved placeholders.
- Add Retry/Relink recovery and update document-store browser integration.

### Phase 3 — coordinated save

- Encode one repository snapshot into separate Documents and one manifest.
- Add a validated coordinated endpoint that stages writes and commits the
  manifest last.
- Preserve accurate clean/dirty reporting when edits occur during a save.
- Update Save, Save As and Save Workspace interactions.

### Phase 4 — migration and verification

- Import legacy external stubs and embedded Workspaces.
- Exercise real temporary Document/Workspace roots, partial failures and path
  attacks without touching user files.
- Add a browser save → close → load check covering background, window layout,
  minimized state, shared Document windows and a missing-file relink.
- Update the README and progress record with the final contract and evidence.

## Acceptance criteria

- Saving a Workspace produces one manifest plus separate, valid Document files;
  no Document content appears in the manifest.
- Reload restores the exact BackgroundBlock type/configuration, child order,
  windows, geometry, z-order and minimized state.
- Document text, annotations, margins, opaque fields and IDs round-trip through
  their own files.
- Two windows referencing one Document share one live content record and save one
  Document file.
- A missing or malformed Document leaves a recoverable placeholder while the
  rest of the Workspace opens.
- Relinking verifies identity and updates only the Workspace reference.
- A failed Document write does not acknowledge success or replace the Workspace
  manifest; edits made during saving remain dirty.
- Legacy external and embedded Workspaces open and can be migrated explicitly.
- Session-only visualisers and highlights never enter saved JSON.
- Typecheck, focused unit/integration tests, client/server builds and an isolated
  real-browser round trip pass.

## Deferred architecture

The manifest is designed not to block a later move to one repository per
Document. The resource table and explicit reference Blocks can remain unchanged;
only hydration, dirty accounting, save coordination and undo ownership need to
move behind Document sessions. Per-Document undo/redo, independent dirty badges,
file watching, repository boundaries, immutable revisions and an ID index are
therefore follow-up work, not hidden requirements of this increment.
