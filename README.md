# speedy-ts reactive reconstruction

This repository is the in-progress Solid-owned reconstruction of `speedy-ts`,
following [`SOLID_RESTRUCTURE.MD`](./SOLID_RESTRUCTURE.MD). The current runnable
milestone loads the original 92-Block workspace sample through the canonical
model and Solid renderer. The smaller two-pane PlainText/Standoff pilot remains
available as a focused view-local-state example.

See [`RESTRUCTURE_PROGRESS.md`](./RESTRUCTURE_PROGRESS.md) for the exact hand-off
state, verified behavior, known limits, and next migration stage.

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

Use **Open…** for the expandable folder tree and document list. Select a folder,
filter the filenames if needed, then double-click a document or select it and
press Open. **Save** updates the current document; **Save as…** chooses a folder
and filename for a copy. The title shows unsaved changes, and opening/resetting/
closing edited content offers Save, Discard, or Cancel. Shortcuts are Ctrl/Cmd+O,
Ctrl/Cmd+S, and Ctrl/Cmd+Shift+S respectively.

The default store is the existing sibling `../codex-data/data` directory.
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
image presets and rain video use `../codex-data/backgrounds/images` and
`../codex-data/backgrounds/video`, served by Node through Vite's media proxies.
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

Workspace files default to the sibling `../codex-data/workspaces` directory.
Set `SPEEDY_WORKSPACE_ROOT=/absolute/path/to/workspaces` to select a different
existing directory. See [WORKSPACE_PERSISTENCE_PLAN.md](./WORKSPACE_PERSISTENCE_PLAN.md)
for the manifest, recovery and compatibility contracts.

See [DOCUMENT_STORE_MIGRATION.md](./DOCUMENT_STORE_MIGRATION.md) for the design,
compatibility boundaries, and verification requirements.

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
