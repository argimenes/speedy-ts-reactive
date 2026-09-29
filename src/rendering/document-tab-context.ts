import { createContext, useContext, type Component } from "solid-js";
import type { NodeKey } from "../block-tree/types";

/** A composite application's bounded, core-rendered Document slot. */
export interface DocumentTabHost {
  title(documentId: string): string | undefined;
  view: Component<{ documentId: string; tabKey: NodeKey }>;
}
export const DocumentTabContext = createContext<DocumentTabHost>();
export const useDocumentTabHost = () => useContext(DocumentTabContext);
export function tabDocumentTarget(metadata: unknown): string | undefined {
  const target = (metadata as any)?.documentTarget;
  return target?.version === 1 && typeof target.documentId === "string" && target.documentId ? target.documentId : undefined;
}
