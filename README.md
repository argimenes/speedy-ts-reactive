# speedy-ts reactive reconstruction

This repository is the in-progress Solid-owned reconstruction of `speedy-ts`,
following [`SOLID_RESTRUCTURE.MD`](./SOLID_RESTRUCTURE.MD). The current runnable
milestone loads the original 92-Block workspace sample through the canonical
model and Solid renderer. The smaller two-pane PlainText/Standoff pilot remains
available as a focused view-local-state example.

See [`RESTRUCTURE_PROGRESS.md`](./RESTRUCTURE_PROGRESS.md) for the exact hand-off
state, verified behavior, known limits, and next migration stage.

For the current reactive architecture, data/input/rendering flows, extension
recipes, and day-to-day source map, start with the
[Codex developer guide](./docs/README.md).

Feature-module Stages 1–5 are accepted. Start with the
[extension architecture and tutorials](./docs/development/EXTENSION_ARCHITECTURE.md)
for current Block Application, feature, passive standoff-effect and Window presentation
APIs. The [Stage 5 report](./CODEX_FEATURE_MODULE_STAGE_5_REPORT.md) records the latest
qualification. Stage 6 / History extraction is deliberately deferred.

Canvas Milestones A–E are accepted and integrated into the main application.
The home page starts with an empty Desktop workspace. Choose
**Workspace → Presentations → Canvas** to switch; the menu is available immediately
in development (`npm run dev`, port 3000) and production (`npm run build` then
`npm start`, port 3002), with no opt-in environment variable required.
Use **Workspace → Open Document from Server…** (or Ctrl/Cmd+O) to browse server
Documents and open one in the current Desktop or Canvas. No workspace file is
required. **New Document** and **Open Image…** are also available in both modes.
Opening adds to the current session; reopening the same server file reveals its
live Document and preserves unsaved edits. Images accept HTTP(S), data or site-relative
URLs. Canvas additions use the object bank; explicitly reopening a server Document
on Desktop reuses its existing Window and content.
**Create Desktop from Canvas** appears for imported workspaces whose Desktop layout
is absent. Existing layouts stay independent and content identities remain shared.
The [Milestone E report](./CODEX_CANVAS_MILESTONE_E_REPORT.md) records derivation
behavior and qualification. The original sample remains at **Workspace → Sample
document demo** (`/?demo=1`), opening separately without replacing your workspace.

The application enables `canvasWorkspace`; other editor hosts still opt in through
configuration. `VITE_CANVAS_WORKSPACE=0` explicitly disables it for a development
server or production build. No loaded or edited demo is implicitly converted.
The [Canvas plan](./CODEX_CANVAS_WORKSPACE_PRESENTATION_PLAN.md) records the scope.
Integration qualification: 61 focused tests, type checking and client/server builds
passed. The [application browser check](./scripts/check-canvas-integration-browser.mjs)
passed 46 checks against the actual sites on ports 3000 and 3002, including typing,
switching, in-memory file save/reopen, reverse derivation, opening the existing
server Document `text1.json` on both presentations, images and the sample demo link.
The physical Canvas-removal check also passes. Browser qualification never writes
server Documents.

The [Spatial Workspace plan](./CODEX_SPATIAL_WORKSPACE_PRESENTATION_PLAN.md)
proposes a separate, default-off Three.js study presentation with existing Codex
DOM editing. It is awaiting review; Spatial Milestone A has not begun.

The design principles for portable Blocks and reusable tools, with a staged
ToolbarBlock demonstration and refactoring roadmap, are documented in
[BLOCK_COMPOSITION_AND_TOOLBAR_PLAN.md](./BLOCK_COMPOSITION_AND_TOOLBAR_PLAN.md).
This is a planning document; the proposed ToolbarBlock is not yet implemented.

The feasibility review and proposed technical specification for temporal Block
and subtree history are in [BLOCK_SCOPED_HISTORY_SPEC.md](./BLOCK_SCOPED_HISTORY_SPEC.md).
It covers identity, revision capture, persistent history, read-only historical
views, and recovery of earlier material.
The bounded identity and commit-capture spike is planned in
[BLOCK_SCOPED_HISTORY_STAGE_A_PLAN.md](./BLOCK_SCOPED_HISTORY_STAGE_A_PLAN.md).
Stage A implements authored identity and optional immutable commit capture;
[the implementation report](./BLOCK_SCOPED_HISTORY_STAGE_A_COMPLETION.md) records
the approved copy policy, replay proof, regression results, and performance costs.
The next [Stage B technical plan](./BLOCK_SCOPED_HISTORY_STAGE_B_PLAN.md) covers
compact exact capture, derived sentence-oriented playback grouping, and isolated
in-memory historical queries. Existing undo/redo behavior remains unchanged.
These are planned, not implemented; durable recording and history controls
remain later stages.

## Usage

Use Node 22 (`nvm use` reads the included `.nvmrc`), then:

```bash
npm install
npm test
npm run typecheck
npm run dev
```

`npm run dev` builds and starts the Node document server on port 3002, waits for
it to be ready, then starts Vite. Ctrl+C stops both. The development server opens the workspace at
[http://localhost:3000/](http://localhost:3000/) and the focused linked-view
pilot at [http://localhost:3000/pilot](http://localhost:3000/pilot).

`npm run build` builds both the Vite client and existing Express server.

## Browsing and saving documents

The `publicHostedVersion` feature flag is enabled by default on this branch. It
splits the toolbar into **Server** and **Local** groups. Server Documents and
Workspaces can be browsed and opened, but their write actions are disabled.
Local Open uses the browser's file picker, while Local Save/Save as writes a
JSON file through the browser File System Access API where available and falls
back to a JSON download. Local Workspace files are self-contained, so a single
download includes the Background, window layout, and Document content.

The Node server also rejects Document and Workspace writes by default. Set
`SPEEDY_PUBLIC_HOSTED_VERSION=0` when running a private writable instance, and
pass `{ features: { publicHostedVersion: false } }` to `WorkspaceDemo` to restore
the original single set of server-backed controls.

Use **Open…** for the expandable folder tree and document list. Select a folder,
filter the filenames if needed, then double-click a document or select it and
press Open. **Save** updates the current document; **Save as…** chooses a folder
and filename for a copy. The title shows unsaved changes, and opening/resetting/
closing edited content offers Save, Discard, or Cancel. Shortcuts are Ctrl/Cmd+O,
Ctrl/Cmd+S, and Ctrl/Cmd+Shift+S respectively.

The default store is the repository-owned [`data`](./data) directory.
Folders must already exist. To use a different store:

```bash
SPEEDY_DOCUMENT_ROOT=/absolute/path/to/documents npm run dev
```

The API keeps the original folder/file listing and document load/save endpoints.
JSON files remain compatible with the original application. File storage works
without the optional search database; if indexing is unavailable, a successful
save reports that separately. `SPEEDY_DISABLE_DATABASE=1` explicitly skips opening
the graph database, for example when using an isolated test store.

For production, run `npm run build` followed by `npm start`, then open
[http://localhost:3002](http://localhost:3002). `npm run dev:client` starts Vite
alone when a Node server is already running. Restart `npm run dev` after changing
server TypeScript; frontend changes reload automatically.

## Backgrounds and Block menus

Control-click or right-click the desktop, or use **Background…**, to select an
image, looping video, YouTube background or animated WebGL gradient. The original
image presets and videos are bundled from
[`src/assets/hosted/backgrounds`](./src/assets/hosted/backgrounds), so they are
available in static Vite/Vercel builds without a sibling data repository.
Custom image/video URLs and YouTube URLs or IDs are accepted. Video backgrounds
start muted; the menu provides pause/play and sound options. WebGL respects
reduced motion and falls back to a static gradient if unavailable.

Control-click/right-click a Block for its applicable structural, file, theme and
focus actions. Shift+F10 or the Context Menu key also opens the menu from a
focused Block. Use arrows to navigate, Enter to activate, Escape to dismiss;
native text fields and embedded media keep their native menus. Window headers
also open the Block/theme menu. Editing commands support undo.

Desktop background choices persist across document opens/resets during the
current browser session. Background undo/redo is in its own menu; document Save
still saves only the document. Use **Open Workspace…** and **Save Workspace…**
for versioned Workspace manifests containing the BackgroundBlock/window layout
and stable-ID references to separate Document JSON files. Their browser-safe
shortcuts are Ctrl+;, then O and Ctrl+;, then S. A new sample Document must first
be given a file with Document **Save as…**. Missing files open as recoverable
Retry/Relink placeholders, and replacing a Workspace requires confirmation.
Disabled legacy actions explain their limits in tooltips. See the
[background/context-menu migration notes](BACKGROUND_CONTEXT_MENU_MIGRATION.md)
for source mapping and verification.

Workspace files default to the repository-owned [`data/workspaces`](./data/workspaces)
directory.
Set `SPEEDY_WORKSPACE_ROOT=/absolute/path/to/workspaces` to select a different
existing directory. See [WORKSPACE_PERSISTENCE_PLAN.md](./WORKSPACE_PERSISTENCE_PLAN.md)
for the manifest, recovery and compatibility contracts.

See [DOCUMENT_STORE_MIGRATION.md](./DOCUMENT_STORE_MIGRATION.md) for the design,
compatibility boundaries, and verification requirements.

The proposed sticky-note Block design, including movable notes,
window behavior, placement modes, and text limits, is in
[STICKY_NOTE_DOCUMENT_PLAN.md](./STICKY_NOTE_DOCUMENT_PLAN.md). It is not yet
implemented.

## Legacy notes

The original project notes follow. Its source remains available in this
repository as migration reference code.

Those templates dependencies are maintained via [pnpm](https://pnpm.io) via `pnpm up -Lri`.

This is the reason you see a `pnpm-lock.yaml`. That being said, any package manager will work. This file can be safely be removed once you clone a template.

```bash
$ npm install # or pnpm install or yarn install
```

### Learn more on the [Solid Website](https://solidjs.com) and come chat with us on our [Discord](https://discord.com/invite/solidjs)

## Available Scripts

In the project directory, you can run:

### To deploy

#### On MacOS
You will need to run ```./build.sh```. To do this first you will need to enure it has the right permissions:
```bash
$ chmod +x build.sh
```

And then you can run:
```bash
$ ./build.sh
```

#### On Windows
You will need to have Powershell installed. Then you can run

```bash
$ .\publish.ps1
```

Open [http://localhost:3002](http://localhost:3002) to view it in the browser.<br>

### `npm run build`

Builds the app for production to the `dist` folder.<br>
It correctly bundles Solid in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.<br>
Your app is ready to be deployed!

## Deployment

You can deploy the `dist` folder to any static host provider (netlify, surge, now, etc.)
