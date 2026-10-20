import { createContext, useContext } from "solid-js";
import type { RetainedDocumentSession } from "../application/document-sessions";
export const DocumentSessionContext = createContext<RetainedDocumentSession>();
export const useDocumentSession = () => useContext(DocumentSessionContext);
