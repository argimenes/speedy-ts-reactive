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
