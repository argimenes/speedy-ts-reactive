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
