import type { ExistingBlockDto } from "../block-tree/types";
import { backgroundImages } from "../rendering/backgrounds";

/** Fresh application workspace, constructed once before editing starts. */
export function createInitialWorkspace(): ExistingBlockDto {
  return {
    id: crypto.randomUUID(), type: "workspace-block", children: [{
      id: crypto.randomUUID(), type: "image-background-block", metadata: { url: backgroundImages[0].url }, children: [],
    }],
  };
}
