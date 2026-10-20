import type { PanelSession } from "./panel-contributions";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { OverlayDescriptor } from "./overlays";

/** Core focus handles stay private; features can mount only their own panel UI. */
export function panelSession(editor: ReactiveEditor, overlay: OverlayDescriptor): PanelSession {
  const present = () => editor.overlays.isOverlayKey(overlay.key);
  return {
    key: overlay.key, ownerKey: overlay.ownerKey, get data() { return overlay.data; },
    guardClose: editor.windowManager ? guard => {
      const releaseOverlay = editor.overlays.guardClose(overlay.key, guard);
      const owner = editor.mounts.get(overlay.ownerKey)?.root.closest<HTMLElement>("[data-mwm-window]")?.dataset.mwmWindow ?? editor.windowManager!.ownerForNode(overlay.ownerKey);
      const releaseOwner = owner ? editor.windowManager!.lifecycle.guard(owner, guard) : undefined;
      return () => { releaseOverlay(); releaseOwner?.(); };
    } : undefined,
    close: restore => editor.overlays.close(overlay.key, restore),
    allowDocumentInput: allow => editor.overlays.setDocumentInput(overlay.key, allow),
    mountWidget(root, focus) {
      if (!present()) return () => {};
      return editor.mounts.register(overlay.key, { root, focusElement: root, inputPolicy: "opaque-widget", focus });
    },
    focus() { if (present()) editor.focus.request(overlay.key, {reason:"reveal-panel"}); },
  };
}
