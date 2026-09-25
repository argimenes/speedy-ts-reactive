import { createContext, useContext, type Accessor } from "solid-js";
import type { NodeKey } from "../block-tree/types";

export interface DocumentMarginEntry {
  ownerKey: NodeKey;
  relationKey: NodeKey;
  side: "left" | "right";
  name: string;
}

export interface DocumentMarginPresentation {
  collapsed: Accessor<boolean>;
  drawerOpen: Accessor<boolean>;
  entries: Accessor<DocumentMarginEntry[]>;
  indicators: Accessor<boolean>;
  open: (entry?: DocumentMarginEntry) => void;
  register: (entry: DocumentMarginEntry) => () => void;
}

export const DocumentMarginContext = createContext<DocumentMarginPresentation>();

export function useDocumentMargins(): DocumentMarginPresentation | undefined {
  return useContext(DocumentMarginContext);
}

export function marginSide(name: string): "left" | "right" | undefined {
  if (name === "leftMargin") return "left";
  if (name === "rightMargin") return "right";
}

/** Keep the main reading column stable while collapsed margin lanes free window space. */
export function collapsedMarginWindowWidth(root: HTMLElement, currentWidth: number, minimumWidth: number): number {
  const layout = root.querySelector<HTMLElement>(".workspace-demo__document--flow")
    ?? root.querySelector<HTMLElement>(".reactive-page");
  if (!layout || currentWidth <= 0) return currentWidth;
  const style = getComputedStyle(layout);
  const leftPadding = Number.parseFloat(style.paddingLeft) || 0;
  const rightPadding = Number.parseFloat(style.paddingRight) || 0;
  const compactLeft = layout.classList.contains("reactive-page--minimap-left") ? 58 : 32;
  const compactRight = layout.classList.contains("reactive-page--minimap-right") ? 58 : 32;
  const releasedWidth = Math.max(0, leftPadding - compactLeft) + Math.max(0, rightPadding - compactRight);
  const floor = Math.min(currentWidth, minimumWidth);
  return Math.max(floor, Math.round(currentWidth - releasedWidth));
}
