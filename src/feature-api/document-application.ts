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
    create(vaultId: string, documents: readonly ApplicationDocument[]): ExistingBlockDto;
    view: Component<{ application: DocumentApplicationInstance }>;
  }): void;
}
