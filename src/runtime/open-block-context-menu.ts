import type { OverlayService } from "./overlays";

/** One opening path for core input and explicitly opted-in hosted widgets. */
export function openBlockContextMenu(overlays: OverlayService, key: string, root: Element, point?: { x: number; y: number }) {
  const existing = overlays.overlays.find(item => item.viewType === "context-menu");
  if (existing?.ownerKey === key) return; // macOS Control-click plus native contextmenu
  if (existing) overlays.close(existing.key, false);
  const rect = root.getBoundingClientRect();
  overlays.open({ ownerKey: key, viewType: "context-menu", title: "Block menu", anchor: point ?? { x: rect.left + 12, y: rect.top + 24 } });
}
