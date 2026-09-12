import type { ReactiveEditor } from "../reactive-editor/editor";
import { ContainerBlockView } from "./container-block-view";
import {
  CheckboxView,
  CanvasPreviewView,
  CodeBlockView,
  FlippableSurfaceView,
  GenericContainerView,
  IframeView,
  ImageView,
  ListView,
  PageView,
  StableBackgroundView,
  StickyTabRowView,
  TabPanelView,
  TabRowView,
  TableCellView,
  TableRowView,
  TableView,
  WindowView,
  YouTubeView,
} from "./core-block-views";
import { PlainTextBlockView } from "./plain-text-block-view";
import { StandoffEditorView } from "./standoff-editor-view";
import { UnknownBlockView } from "./unknown-block-view";

function many(editor: ReactiveEditor, types: string[], view: any, capabilities: string[]) {
  for (const type of types) editor.registry.register({ type, view, capabilities });
}

export function registerCoreViews(editor: ReactiveEditor): void {
  editor.registry.register({ type: "document-block", aliases: ["main-list-block", "membrane-block"], view: ContainerBlockView, capabilities: ["container", "selectable"] });
  editor.registry.register({ type: "plain-text-block", view: PlainTextBlockView, capabilities: ["native-text", "container", "selectable"] });
  editor.registry.register({ type: "standoff-editor-block", view: StandoffEditorView, capabilities: ["inline-editor", "container", "selectable", "annotations"] });
  editor.registry.register({ type: "checkbox-block", view: CheckboxView, capabilities: ["control", "container", "selectable"] });
  editor.registry.register({ type: "code-mirror-block", view: CodeBlockView, capabilities: ["native-text", "container", "opaque-widget"] });
  editor.registry.register({ type: "cyclic-reference", view: UnknownBlockView, capabilities: ["reference-placeholder"] });

  many(editor, ["universe-block", "workspace-block", "root-block", "container-block", "book-block", "fixed-size-page-block", "side-block", "embed-document-block", "entities-list-block", "context-menu-block", "control-panel-block", "monitor-block", "left-margin-block", "right-margin-block", "error-block", "unknown-block"], GenericContainerView, ["container", "selectable"]);
  many(editor, ["surface-block"], FlippableSurfaceView, ["container", "sides", "selectable"]);
  many(editor, ["canvas-block"], CanvasPreviewView, ["container", "canvas-preview", "selectable"]);
  many(editor, ["page-block"], PageView, ["container", "selectable"]);
  many(editor, ["indented-list-block"], ListView, ["container", "selectable"]);
  many(editor, ["table-block", "grid-block"], TableView, ["container", "grid"]);
  many(editor, ["table-row-block", "grid-row-block"], TableRowView, ["container", "grid-row"]);
  many(editor, ["table-cell-block", "grid-cell-block"], TableCellView, ["container", "grid-cell"]);
  many(editor, ["tab-row-block", "document-tab-row-block"], TabRowView, ["container", "tabs"]);
  many(editor, ["sticky-tab-row-block"], StickyTabRowView, ["container", "sticky-tabs"]);
  many(editor, ["tab-block", "document-tab-block", "sticky-tab-block"], TabPanelView, ["container", "tab"]);
  many(editor, ["image-block"], ImageView, ["media", "container"]);
  many(editor, ["iframe-block", "html-editor-block", "html-block", "pdf-block"], IframeView, ["media", "opaque-widget"]);
  many(editor, ["youtube-video-block"], YouTubeView, ["media", "opaque-widget"]);
  many(editor, ["window-block", "document-window-block"], WindowView, ["window", "container", "selectable"]);
  many(editor, ["image-background-block", "video-background-block", "youtube-video-background-block", "canvas-background-block"], StableBackgroundView, ["background", "surface", "container"]);

  editor.commandRegistry.register({
    id: "history.undo",
    label: "Undo",
    canExecute: () => editor.repository.canUndo(),
    execute: () => editor.repository.undo(),
  });
  editor.commandRegistry.register({
    id: "history.redo",
    label: "Redo",
    canExecute: () => editor.repository.canRedo(),
    execute: () => editor.repository.redo(),
  });
  editor.commandRegistry.register({
    id: "block.remove",
    label: "Remove Block",
    canExecute: ({ targetKey }) => targetKey !== editor.projections.values().next().value?.state.rootKey,
    execute: ({ targetKey }) => editor.commands.remove(targetKey),
  });
}
