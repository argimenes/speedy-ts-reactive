import type { Component } from "solid-js";
import type { ExistingBlockDto } from "./index";

export interface ApplicationDocument { id: string; title: string }
/** The first composite Document application: core owns the rendered tabs/editors. */
export interface DocumentApplicationInstance {
  documents(): readonly ApplicationDocument[];
  openDocument(id: string): void;
  renameDocument(id: string, title: string): void;
  closeActiveTab(): void;
  tabs: Component;
  vault?: ApplicationVault;
  knowledge?: ApplicationKnowledge;
  backlinks?: import("./backlinks").ApplicationBacklinks;
  properties(): ApplicationDocumentProperties | undefined;
  setProperties(id: string, value: {title: string; tags: readonly string[]}): void;
  files?: {
    list(folder: string): Promise<string[]>;
    open(location: {folder: string; filename: string}, importMarkdown?: boolean): Promise<void>;
    save(location: {folder: string; filename: string}): Promise<void>;
    recover(location: {folder: string; filename: string}): Promise<void>;
    compare(): Promise<{external: string; generated: string}>;
    keepMutable(): Promise<void>;
    status(): string;
    location(): {folder: string; filename: string} | undefined;
  };
}
export interface DocumentApplicationCapabilities {
  register(definition: {
    type: string;
    create(documents: readonly ApplicationDocument[]): ExistingBlockDto;
    view: Component<{ application: DocumentApplicationInstance }>;
  }): void;
}

export interface ApplicationDocumentProperties {
  id: string; title: string; tags: readonly string[]; tagsValid: boolean;
  format: string; location?: {folder: string; filename: string}; status: string; unsaved: boolean;
}
export interface ApplicationVaultDocument {
  id: string; title: string; location: {folder: string; filename: string};
  state: string; loaded: boolean; tags: readonly string[];
}
export interface ApplicationVaultState {
  root: string; folders: readonly string[]; documents: readonly ApplicationVaultDocument[];
  markdown: readonly string[]; diagnostics: readonly string[];
  operations: readonly {operationId: string; phase: string}[];
  readOnly: boolean; complete: boolean; busy: boolean; notice: string;
}
export interface ApplicationVault {
  /** Host-owned, confined server directory chooser. Selection still requires native discovery. */
  choose?(): void;
  state(): ApplicationVaultState | undefined;
  open(root: string): Promise<void>;
  close(): void;
  refresh(): Promise<void>;
  openFile(location: {folder: string; filename: string}): Promise<void>;
  createDocument(folder: string, filename: string, title: string): Promise<void>;
  importMarkdown(source: {folder: string; filename: string}, destination: {folder: string; filename: string}): Promise<void>;
  createDirectory(parent: string, name: string): Promise<void>;
  relocateDocument(source: {folder: string; filename: string}, destination: {folder: string; filename: string}): Promise<void>;
  relocateDirectory(source: string, destination: string): Promise<void>;
  recoverOperation(operationId: string): Promise<void>;
  recoverNative(location: {folder: string; filename: string}): Promise<void>;
}


export interface DocumentTarget { documentId: string; blockId: string; title: string; location: string }
export interface VaultSearchHit extends DocumentTarget { id: string; kind: 'title' | 'text'; snippet: string; start: number; end: number }
export interface VaultSearchResults { coverageMode?: 'loaded'|'saved-and-live'; token: string; hits: readonly VaultSearchHit[]; diagnostics: readonly string[]; available: number; discovered: number; complete: boolean }
export interface NativeReferenceItem { id: string; label: string; target?: DocumentTarget; diagnostic?: string; removable: boolean }
export interface ApplicationKnowledge {
  search(query: string): Promise<VaultSearchResults>;
  cancel(): void;
  current(token: string): boolean;
  activate(hitId: string): Promise<void>;
  selection(): string;
  cancelPicker(): void;
  picker(selection: string): Promise<{targets: readonly DocumentTarget[]; diagnostics: readonly string[]}>;
  createReference(selection: string, target: DocumentTarget): Promise<void>;
  references(): Promise<{token: string; items: readonly NativeReferenceItem[]; diagnostics: readonly string[]}>;
  followReference(id: string): Promise<void>;
  removeReference(id: string): void;
}
