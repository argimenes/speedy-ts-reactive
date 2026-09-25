import type { WindowPresentationContribution } from "../runtime/window-presentation";

export interface PresentationCapabilities {
  register(contribution: WindowPresentationContribution): void;
}
