import type { ExistingBlockDto } from "../block-tree/types";
import { backgroundImages } from "../rendering/backgrounds";

/** Fresh application workspace, constructed once before editing starts. */
export function createInitialWorkspace(): ExistingBlockDto {
  const documentId = crypto.randomUUID();
  return {
    id: crypto.randomUUID(), type: "workspace-block", children: [{
      id: crypto.randomUUID(), type: "image-background-block", metadata: { url: backgroundImages[0].url }, children: [{
        id: crypto.randomUUID(), type: "document-window-block",
        metadata: { title: "Untitled document", position: { x: 24, y: 24 }, size: { w: 840, h: 620 }, state: "normal" },
        children: [{
          id: documentId, type: "document-block", metadata: { documentId, folder: ".", filename: `${documentId}.json` },
          children: [{ type: "standoff-editor-block", text: "" }],
        }],
      }],
    }],
  };
}
