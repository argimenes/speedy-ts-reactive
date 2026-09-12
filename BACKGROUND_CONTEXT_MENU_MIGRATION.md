# Backgrounds and general context menu

Plan recorded 12 September 2026, before implementation. Status: implemented and
verified within the specific scope below; whole-workspace/multi-window actions
and the documented legacy gaps remain open.

## Original source and inputs

| Source | Behavior to convert |
| --- | --- |
| `src/blocks/image-background-block.ts` | Fullscreen cover/center image from `metadata.url`; children above it. |
| `src/blocks/video-background-block.ts` | Fullscreen native video, autoplay, loop, muted. |
| `src/blocks/youtube-video-background-block.ts` | YouTube player, hidden controls, no pointer/keyboard interception, source loading and player cleanup. |
| `src/blocks/canvas-background-block.ts` | Paper Design mesh-gradient WebGL shader, four original colours, speed 0.25. |
| `src/universe-block.ts:582,1105,1327` | Native `contextmenu` routing, block menu positioning, four background switching methods. Ledger `universe-block-binding-04`. |
| `src/components/block-menu.tsx` | Background presets; document, structural, ancestor-focus and theme menus. |
| `src/blocks/window-block.ts:123` and `src/blocks/context-menu-block.tsx` | Window-header theme menu and Escape dismissal (`blocks-context-menu-block-binding-01`). |
| `src/assets/codex.css:454` | Glass theme: white text/shadow, translucent gradient, 10px backdrop blur and translucent border; paper theme restores a white background. |
| `src/blocks/document-block.ts:838` | Original Control-left-click selects a Block (`blocks-document-block-binding-07`); macOS Control-click also raises the native context menu. |

The user explicitly requests Control-click to open the menu. The converted
gateway will accept Control-left-click on all platforms, native right-click /
macOS contextmenu, and Shift+F10 / ContextMenu. It must open one menu, not also
toggle the original Block-selection gesture. Unmodified clicks keep their normal
behavior. Native form fields, media controls, opaque widgets, dialogs and menu
inputs keep native event ownership; Control-click on ordinary Block surfaces
opens the application menu. Escape/outside click closes; dismissal restores the
previous focused Block and selection without resetting the caret. Keyboard menu
navigation and viewport clamping are included.

## Specific implementation

1. Replace the placeholder/substring background renderer with exact type
   dispatch and independently owned media lifecycles. Preserve the background
   surface, descendant mounts, metadata, IDs, and child order on switching and
   undo. YouTube must never render as a native `<video>`.
2. Implement image cover, muted looping inline video, looping YouTube embed,
   and the installed shader library's original mesh gradient. Dispose old media,
   animation, observers and listeners. Honour reduced motion for WebGL and
   provide a static gradient fallback if WebGL is unavailable. Report invalid
   or failed local media without blocking document interaction. Validate media
   schemes and YouTube IDs; support watch, short, embed, shorts and raw IDs.
3. Background menu: original Green aurora, Desktop, High, Aurora over snow,
   rain video, Scottish Mountain Stream YouTube, and Colour Cycling WebGL;
   additionally allow entering a custom image/video/YouTube URL and controlling
   video pause/sound. YouTube starts muted instead of the original unmuted 10%
   setting, to support browser autoplay. Provider/network restrictions can still
   prevent playback; this is not a promise that every remote video is embeddable.
4. Put an actual background surface behind the demo document. Keep its workspace
   state independent of document-file JSON and alive across document open/reset.
   Expose background undo/redo in its menu. Existing document Save stays a
   document save, not an implicit workspace-format conversion.
5. Add a reusable session-only context menu driven by the clicked model node and
   its ancestors, using the existing gateway, mount registry and transaction
   commands. No legacy Block constructors or document-wide DOM mutation.
6. General actions: add text/code/image/video/canvas/grids; delete a Block;
   convert to grid/tab/page/list; add/rename/reorder/delete tabs, pages and sticky
   tags; flatten grids/tabs/lists and pockets; grid row insertion, cell merge and
   directional movement; pocket height; book blank pages; ancestor focus;
   window paper/glass theme; existing Open/Save/Save As and history commands.
   Structural changes are single undoable transactions with root/boundary guards.
7. Record legacy unfinished/miswired actions rather than implementing fake
   success: document Rename and Convert to pocket were no-ops; tab merge/move
   menu callbacks incorrectly called grid handlers. Correct tab movement, mark
   unavailable tab merging explicitly. Duplicate/extract into independent
   document windows and whole-workspace server save/load require the separate
   multi-window session/persistence controller; show their unavailability rather
   than silently saving document JSON as a workspace. Existing document browsing
   remains usable from the menu.
8. Proxy the original `/image-backgrounds` and `/video-backgrounds` static routes
   in both Vite configs (Node already serves the sibling codex-data assets).
   Do not copy or modify the user's original media or stored documents.

## Acceptance checks

- [x] Four exact renderers, valid/invalid URLs, defaults, load errors, source
  changes, cleanup and reduced-motion/static shader fallback.
- [x] Switch every background type and undo/redo without remounting a descendant
  text editor; preserve child data and unknown metadata in legacy round-trips.
- [x] Control-click/native contextmenu/keyboard target the correct Block once;
  native widgets pass through; outside/Escape close; input submission, keyboard
  navigation, viewport bounds and selection restoration work.
- [x] Applicable general menu actions mutate the clicked Block, not stale focus;
  structural ordering, active tabs, deletion fallback and undo are tested.
- [x] Actual demo background can be switched while the open document remains
  editable and unchanged; static assets resolve through the development proxy.
- [x] Full tests, typecheck, build, Chrome visual/input/lifecycle checks; update
  progress and input-audit documents with results and remaining limitations.

## Implementation and verification

- `src/rendering/backgrounds.ts`: exact type registry, original presets,
  media-scheme validation and YouTube URL/ID parsing.
- `src/rendering/background-media.tsx`: image, native video, YouTube and lazy
  WebGL adapters. Native video stops/releases its source on disposal; removed
  YouTube frames are blanked; shaders dispose their animation/resources and
  listeners, pause while the document is hidden or reduced motion is requested,
  and fall back to a static gradient if WebGL is unavailable/lost.
- `src/block-tree/commands.ts`: background changes retain content/placement IDs,
  children and owned relations, including root surfaces. Existing metadata and
  unknown payload fields are retained. Transaction-aware child reads let menu
  operations build wrappers without relying on an uncommitted DOM projection.
- `src/runtime/block-menu-actions.ts`: contextual actions and guards, including
  correct tab movement, ordered grid merges, flattening and undo grouping.
  Original “Add Video” creates a YouTubeVideoBlock, not a native-video Block;
  the converted menu labels that input explicitly.
- `src/input/gateway.ts`, `src/runtime/overlays.ts`, and
  `src/rendering/block-context-menu.tsx`: one owner-resolved menu per gesture,
  explicit tab-label targeting, Control-pointer selection preservation,
  native-input pass-through, session-only portals, focus/selection restoration,
  validation, Escape/outside dismissal and viewport bounds. Up/Down/Home/End
  navigate; Right opens a submenu (never activates a destructive leaf); Left
  returns; Enter/Space activate; Tab dismisses. Submenus use one bounded panel
  with Back, rather than the original overflowing hover-only flyouts.
- `src/demo/workspace-demo.tsx`: persistent desktop background editor alongside
  the document session, Background toolbar entry, file-command forwarding,
  Control-click window-header menu, and paper/glass theme rendering. Opening or
  resetting a document does not reset the desktop. Desktop background history
  is separate from document history and does not mark a document dirty.
- Both Vite configs proxy the original background and upload media routes;
  HTTP checks returned JPEG/MP4 content from Node, not Vite's HTML fallback.

`npm test`: **75 tests in 14 suites passed**. `npm run typecheck` and the
client/server production build passed. New tests cover source parsing, exact
dispatch, source failures, native/shader cleanup, reduced motion, all background
switches and undo, stable child mounts, preserved metadata/relations, clicked
versus focused targets, selection return, native widget boundaries, keyboard
and form handling, conversions, tab/label operations, grid ordering, tags,
themes, pockets, and background/document session separation.

Chrome exercised actual desktop right-click and Control-click, all four
background switches, image loading, native rain playback/pause/resume, shader
rendering at 1440×900, paper/glass switching, intact document mounts/text,
viewport-clamped menus and a 390×844 viewport. YouTube's embed URL, muted
autoplay/loop configuration and pointer isolation were verified; playback of
third-party YouTube content remains subject to provider/network restrictions.
Screenshot: `/tmp/speedy-background-context-menu.png`.

## Remaining boundaries

Development-mode follow-up: a blank page on port 3000 revealed that the upload
proxy was returning an image for Vite's JavaScript asset-import request. Both
configs now leave `?import`, `?raw` and `?url` requests to Vite. Six added tests
cover the routing/config consistency; 81 tests in 15 suites pass, with typecheck
and build. Chrome now also checks the actual development URL: the document and
background load with no startup console errors. This corrects a gap in the
earlier production-only browser check.

- Desktop choices are **session-only** and reset on a full page reload. Existing
  background Blocks in loaded/saved JSON still round-trip normally. The document
  Save command does not serialize the independent desktop into a document file.
- Whole-workspace server save/load, creating additional document windows, and
  duplicate/extract into independent windows remain disabled with explanatory
  labels/tooltips. Use the working document Open/Save/Save as actions for files.
- Document Rename, Convert to pocket and tab merging remain disabled rather than
  pretending the original no-op/miswired commands are complete. The migrated
  grid-row insertion and tab movement provide working model-backed actions.
- Code, canvas and book content still use their existing migrated views/previews;
  exposing insertion/structure actions does not complete those specialized editors.
- Playback/sound changes rebuild a YouTube embed and can restart its position.
  Custom local files must be served by Node (or provided via an HTTP(S) URL);
  this pass does not add an upload picker or replace the media library.
- No original document or asset was changed. Only a disposable, inactive Chrome
  test profile was deleted to recover about 101 MB after disk space exhausted a
  file write; screenshots and project data were retained.
