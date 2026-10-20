import { entries } from "../runtime/window-layout";
import { desktopOf, importLegacyDesktop, validateManagedContainer, type ManagedDesktop } from "../persistence/managed-desktop";
import { assertLegacySaveAllowed, disposeNativeSession } from "../persistence/native-bindings";
import { isDocumentName } from "../persistence/document-file-names.mjs";
import { createStore } from "solid-js/store";
import { decodeHistoryDocument, isHistoryDocument } from "../history/durable-core";
import { decodeDocument, decodeWorkspace, encodeWorkspace, encodeDocument } from "../block-tree/codecs";
import type { ExistingBlockDto, RepositoryState } from "../block-tree/types";
import { withWorkspacePresentation, type PresentationSnapshot, type WorkspacePresentationState } from "./workspace-presentation";
import type { ReactiveEditor } from "./editor";
import { decodeExtendedRepository, encodeExtendedRepository, type ExtendedRepositoryDto } from "../block-tree/extended-codec";
import {
  createWorkspaceSaveBundle,
  documentIdentity,
  extractLegacyWorkspaceReferences,
  isWorkspaceManifest,
  materializeWorkspace,
  materializeLocalWorkspace,
  parseWorkspaceManifest,
  workspaceContentHash,
  workspaceDocumentContentKeys,
  type LoadedWorkspace,
  type WorkspaceDocumentRegistration,
  type WorkspaceDocumentSource,
  type WorkspaceLoadIssue,
  type WorkspaceManifest,
} from "./workspace-manifest";

interface SaveState {
  saving: boolean;
  lastSavedRevision?: number;
  error?: string;
  warning?: string;
  unsavedWorkspaceContent?: boolean;
  status?: number;
  requestToken: number;
}

class StoreRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function responseJson(response: Response, listing = false) {
  let json: any;
  try { json = await response.json(); }
  catch { throw new Error("The document server did not return JSON. Check that the Node server is running."); }
  if (!response.ok || json.Success === false || (!listing && !json.Success)) {
    throw new StoreRequestError(json.Error || `The document server rejected the request (HTTP ${response.status}).`, response.status);
  }
  return json;
}

export interface DocumentLocation { folder: string; filename: string; }

export interface WorkspaceSaveSnapshot {
  repository: RepositoryState;
  document: ExistingBlockDto;
  presentation?: PresentationSnapshot;
  visibilityRevision?: number;
  localValue?: Record<string, any>;
  documentFingerprints?: Map<string, string>;
  layoutRevision?: number;
}

export class PersistenceService {
  readonly state: SaveState;
  savedDocument?: ExistingBlockDto;
  private readonly setState: (...args: any[]) => void;
  private savedServerDocuments = new Map<string, string>();
  private workspaceId?: string;
  private managedTemplate?: Record<string, any>;
  private managedDesktop?: ManagedDesktop;
  private sourceFilename?: string;
  private sourceHash?: string;
  private restoreKeys = new Map<string, { anchor: string; view: string; window: string }>();
  private workspaceManifest?: WorkspaceManifest;
  private workspaceReferences: WorkspaceDocumentRegistration[] = [];
  private loadIssues: WorkspaceLoadIssue[] = [];
  private workspacePresentation?: Pick<WorkspacePresentationState, "capture" | "markSaved">;
  private captures = new WeakSet<WorkspaceSaveSnapshot>();
  private disposed = false;

  constructor(private readonly editor: ReactiveEditor) {
    const [state, setState] = createStore<SaveState>({ saving: false, requestToken: 0 });
    this.state = state;
    this.setState = setState;
  }

  attachWorkspace(workspace: LoadedWorkspace): void {
    if ((workspace.localContainer || workspace.manifest?.schemaVersion === 2) && !this.editor.features.mutableWindowManager) throw new Error("Enable the Mutable Window Manager to open a managed Workspace.");
    this.managedTemplate = workspace.localContainer ?? (workspace.manifest?.schemaVersion === 2 ? workspace.manifest : undefined);
    this.managedDesktop = this.managedTemplate && desktopOf(this.managedTemplate.root);
    this.sourceFilename = workspace.sourceFilename; this.sourceHash = workspace.sourceHash;
    this.savedServerDocuments = workspace.manifest ? this.documentFingerprints(workspace.state) : new Map();
    this.workspaceId = workspace.workspaceId;
    this.workspaceManifest = workspace.manifest;
    this.workspaceReferences = workspace.references.map(reference => structuredClone(reference));
    this.loadIssues = workspace.issues.map(issue => structuredClone(issue));
  }

  attachWorkspacePresentation(presentation: Pick<WorkspacePresentationState, "capture" | "markSaved">): void {
    if (this.workspacePresentation || this.disposed) throw new Error("Workspace presentation lifetime is already owned or disposed.");
    this.workspacePresentation = presentation;
  }

  // Only called on load or explicit Save. Never subscribed to typing changes.
  private documentFingerprints(state: RepositoryState): Map<string, string> {
    return new Map(workspaceDocumentContentKeys(state).map(key => {
      const placement = Object.values(state.placements).find(p => p.contentKey === key)!;
      return [key, JSON.stringify(encodeDocument(state, placement.key))];
    }));
  }

  /** The same synchronous capture is used by local writes and server bundles.
   * Focus bookmarks belong to the DTO, not the repository/layout dirty clocks. */
  captureWorkspace(options: { upgrade?: boolean } = {}): WorkspaceSaveSnapshot {
    if (this.disposed) throw new Error("Workspace persistence is disposed.");
    const repository = this.editor.repository.snapshot();
    if (repository.contents[repository.placements[repository.rootPlacementKey].contentKey].viewType !== "workspace-block") throw new Error("Save Workspace requires a workspace-block root.");
    const presentation = this.workspacePresentation?.capture();
    this.editor.viewVisibility.captureInto(repository);
    const managed = !!this.managedTemplate || options.upgrade === true;
    if (managed && !this.editor.features.mutableWindowManager) throw new Error("Enable the Mutable Window Manager before upgrading this Workspace.");
    if (this.editor.windowManager?.layout.hasLayout() && !managed) throw new Error("Use Upgrade Workspace and Save as… to preserve the shell layout in a managed Workspace.");
    if (this.managedDesktop?.version === 3 && !this.editor.windowManager) throw new Error("Open this layout in a managed Workspace session before saving.");
    assertLegacySaveAllowed(this.editor.repository);
    const snapshot: WorkspaceSaveSnapshot = { repository, presentation, visibilityRevision: this.editor.viewVisibility.revision(), document: withWorkspacePresentation(managed ? encodeWorkspace(repository) : this.editor.encodeWorkspace(repository), presentation) };
    if (managed) {
      snapshot.documentFingerprints = this.documentFingerprints(repository);
      // Allocation occurs only during explicit Save, on a detached capture. Runtime
      // placements index the session cache but never enter the file.
      const placements: string[] = [];
      const walk = (key: string) => {
        const c = repository.contents[repository.placements[key].contentKey];
        if (["document-block", "main-list-block", "membrane-block", "document-reference-block"].includes(c.viewType)) return;
        if (["window-block", "document-window-block"].includes(c.viewType)) { placements.push(key); return; }
        c.children.forEach(walk); Object.values(c.ownedRelations).forEach(walk);
      };
      walk(repository.rootPlacementKey);
      snapshot.document = importLegacyDesktop(snapshot.document, (block, index) => {
        const placement = placements[index];
        let keys = this.restoreKeys.get(placement);
        if (!keys) {
          keys = { anchor: block.id ?? globalThis.crypto.randomUUID(), view: `view-${globalThis.crypto.randomUUID()}`, window: `window-${globalThis.crypto.randomUUID()}` };
          this.restoreKeys.set(placement, keys);
        }
        const record = Object.values(this.editor.windowManager?.registry.windows ?? {}).find(w => w.placementKey === placement);
        if (record) block.metadata = { ...block.metadata, zIndex: record.rank, pinned: record.pinned };
        if (this.editor.viewVisibility.isClosed(placement)) block.metadata = { ...block.metadata, state: "closed" };
        return keys;
      }, this.managedDesktop);
      const desktop = desktopOf(snapshot.document)!;
      const layout = this.editor.windowManager?.layout;
      if (layout?.hasLayout()) {
        const mapping = new Map(placements.map((key,index)=>[key,desktop.windows[index].restoreKey]));
        const capture = layout.capture(mapping), tiled = new Set(entries(capture.tree));
        snapshot.layoutRevision = capture.revision;
        const next = { ...desktop, version: 3, layout: { ...desktop.layout, version: 1, kind: "split-tree", ...(capture.tree ? {tree:capture.tree} : {}), floating:desktop.windows.filter(w=>!tiled.has(w.restoreKey)).map(w=>w.restoreKey) } };
        (snapshot.document.metadata as any).workspacePresentation.presentations.desktop = next;
      }
      snapshot.localValue = validateManagedContainer({ ...(this.managedTemplate?.kind === "speedy-local-workspace" ? this.managedTemplate : {}), kind: "speedy-local-workspace", schemaVersion: 2, workspaceId: this.workspaceId ??= globalThis.crypto.randomUUID(), root: snapshot.document });
    }
    this.captures.add(snapshot);
    return snapshot;
  }

  acknowledgeWorkspaceSave(snapshot: WorkspaceSaveSnapshot, layoutOnly = false): void {
    if (this.disposed || !this.captures.delete(snapshot)) return;
    if (this.editor.repository.state.revision === snapshot.repository.revision) this.setState("lastSavedRevision", snapshot.repository.revision);
    this.setState("unsavedWorkspaceContent", layoutOnly && [...(snapshot.documentFingerprints ?? [])].some(([key, value]) => this.savedServerDocuments.get(key) !== value));
    if (snapshot.localValue) { this.managedTemplate = snapshot.localValue; this.managedDesktop = desktopOf(snapshot.document); }
    if (snapshot.layoutRevision !== undefined) this.editor.windowManager?.layout.markSaved(snapshot.layoutRevision);
    if (snapshot.presentation) this.workspacePresentation?.markSaved(snapshot.presentation);
    if (snapshot.visibilityRevision !== undefined) this.editor.viewVisibility.markSaved(snapshot.visibilityRevision);
  }

  dispose(): void {
    disposeNativeSession(this.editor.repository);
    this.savedServerDocuments.clear(); this.restoreKeys.clear();
    this.disposed = true; this.captures = new WeakSet(); this.workspacePresentation = undefined;
    this.setState({ requestToken: this.state.requestToken + 1, saving: false });
  }

  workspaceLoadIssues(): readonly WorkspaceLoadIssue[] {
    return this.loadIssues;
  }

  workspaceReference(documentId: string): WorkspaceDocumentRegistration | undefined {
    const reference = this.workspaceReferences.find(item => item.documentId === documentId);
    return reference ? structuredClone(reference) : undefined;
  }

  registerWorkspaceDocument(contentKey: string, documentId: string, folder: string, filename: string, title?: string, contentHash?: string): void {
    const previous = this.workspaceReferences.find(reference => reference.documentId === documentId);
    const next: WorkspaceDocumentRegistration = {
      ...previous,
      documentId,
      contentKey,
      source: { ...previous?.source, kind: "document-store", folder, filename },
      ...(title ? { title } : {}),
      ...(contentHash ? { contentHash } : {}),
    };
    if (!contentHash) delete next.contentHash;
    this.workspaceReferences = this.workspaceReferences.filter(reference => reference.contentKey !== contentKey && reference.documentId !== documentId);
    this.workspaceReferences.push(next);
  }

  markCurrentRevisionSaved(document?: ExistingBlockDto): void {
    if (document) this.savedDocument = structuredClone(document);
    this.setState("lastSavedRevision", this.editor.repository.state.revision);
  }

  async resolveWorkspaceDocument(documentId: string, replacement?: WorkspaceDocumentSource): Promise<boolean> {
    const registered = this.workspaceReferences.find(reference => reference.documentId === documentId);
    const source = replacement ?? registered?.source;
    if (!source) {
      this.setState({ error: `Document ${documentId} has no external location.`, status: undefined });
      return false;
    }
    try {
      const document = await PersistenceService.loadDocument(source.filename, source.folder);
      if (isHistoryDocument(document)) throw new Error("Open this history-enrolled Document separately; Workspace integration is not yet supported.");
      const actualId = documentIdentity(document);
      if (actualId && actualId !== documentId) {
        throw new Error(`${source.filename} contains Document ${actualId}, not ${documentId}.`);
      }
      document.metadata = { ...((document.metadata as Record<string, unknown> | undefined) ?? {}), documentId, folder: source.folder, filename: source.filename };
      const contentHash = await workspaceContentHash(document);
      const snapshot = this.editor.repository.snapshot();
      const placeholders = Object.values(snapshot.placements).filter(placement => {
        const content = snapshot.contents[placement.contentKey];
        const metadata = content?.payload.metadata as Record<string, unknown> | undefined;
        return content?.viewType === "document-reference-block" && metadata?.documentId === documentId;
      });
      let contentKey = registered?.contentKey;
      if (placeholders.length) {
        const first = placeholders[0];
        this.editor.commands.replace(first.key, document, "replace");
        contentKey = this.editor.repository.state.placements[first.key].contentKey;
        const current = this.editor.repository.snapshot();
        const operations = placeholders.slice(1).flatMap(placement => {
          const old = current.placements[placement.key];
          if (!old || !contentKey) return [];
          const uses = Object.values(current.placements).filter(candidate => candidate.contentKey === old.contentKey).length;
          return [
            { kind: "put-placement" as const, record: { ...old, contentKey, kind: "reference" as const } },
            ...(uses === 1 ? [{ kind: "remove-content" as const, key: old.contentKey }] : []),
          ];
        });
        if (operations.length) this.editor.repository.commit("Share resolved Workspace Document", operations);
      }
      const resource: WorkspaceDocumentRegistration = {
        ...structuredClone(registered ?? { documentId, source }),
        documentId, source, contentHash, contentKey,
      };
      this.workspaceReferences = this.workspaceReferences.filter(reference => reference.documentId !== documentId);
      this.workspaceReferences.push(resource);
      if (this.workspaceManifest) {
        this.workspaceManifest.documents[documentId] = { ...resource };
        delete (this.workspaceManifest.documents[documentId] as Record<string, unknown>).contentKey;
      }
      this.loadIssues = this.loadIssues.filter(issue => issue.documentId !== documentId);
      this.setState({ error: undefined, status: undefined });
      return true;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error), status: error instanceof StoreRequestError ? error.status : undefined });
      return false;
    }
  }

  async saveDocument(filename: string, folder = "data", options: { createOnly?: boolean } = {}): Promise<boolean> {
    if (this.state.saving) return false;
    const revision = this.editor.repository.state.revision;
    const token = this.state.requestToken + 1;
    this.setState({ saving: true, error: undefined, warning: undefined, status: undefined, requestToken: token });
    try {
      assertLegacySaveAllowed(this.editor.repository);
      const pendingHistorySave = this.editor.blockHistory.savePersistent(filename, folder, options.createOnly);
      if (pendingHistorySave) {
        const persistent = await pendingHistorySave;
        if (persistent) {
          if (token !== this.state.requestToken) return false;
          this.savedDocument = persistent.document as unknown as ExistingBlockDto;
          this.setState({ saving: false, lastSavedRevision: persistent.revision, warning: persistent.warning });
          return true;
        }
      }
      const document = this.editor.encodeDocument();
      document.metadata = { ...(document.metadata as Record<string, unknown> | undefined), filename, folder };
      const json = await responseJson(
        await fetch("/api/saveDocumentJson", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Speedy-Revision": String(revision),
            ...(options.createOnly ? { "If-None-Match": "*" } : {}),
          },
          body: JSON.stringify({ folder, filename, document }),
        }),
      );
      if (token !== this.state.requestToken) return false;
      this.savedDocument = document;
      this.editor.blockHistory.attachLocation({ folder, filename });
      if (this.editor.repository.state.revision === revision) {
        this.setState("lastSavedRevision", revision);
      }
      this.setState("saving", false);
      this.setState("warning", [json.Warning, this.editor.blockHistory.state.recordingError && `History is unavailable: ${this.editor.blockHistory.state.recordingError}`].filter(Boolean).join(" ") || undefined);
      return true;
    } catch (error) {
      if (token === this.state.requestToken) {
        this.setState({ saving: false, error: error instanceof Error ? error.message : String(error), status: error instanceof StoreRequestError ? error.status : undefined });
      }
      return false;
    }
  }

  async saveWorkspace(filename: string, options: { createOnly?: boolean; upgrade?: boolean; signal?: AbortSignal } = {}): Promise<boolean> {
    if (this.state.saving || this.disposed) return false;
    let snapshot = this.editor.repository.snapshot();
    const root = snapshot.contents[snapshot.placements[snapshot.rootPlacementKey]?.contentKey];
    if (root?.viewType !== "workspace-block") {
      this.setState({ error: "Save Workspace requires a workspace-block root.", status: undefined });
      return false;
    }
    const identityOperations = (options.upgrade || this.managedTemplate ? [] : workspaceDocumentContentKeys(snapshot)).flatMap(contentKey => {
      const content = snapshot.contents[contentKey];
      const metadata = content.payload.metadata && typeof content.payload.metadata === "object" && !Array.isArray(content.payload.metadata)
        ? content.payload.metadata as Record<string, unknown> : {};
      if (typeof metadata.documentId === "string" || typeof content.payload.id === "string") return [];
      return [{ kind: "put-content" as const, record: { ...content, payload: { ...content.payload, metadata: { ...metadata, documentId: globalThis.crypto.randomUUID() } } } }];
    });
    if (identityOperations.length) {
      this.editor.repository.commit("Assign Document identities", identityOperations);
      snapshot = this.editor.repository.snapshot();
    }
    let captured: WorkspaceSaveSnapshot;
    try {
      if (options.upgrade && !options.createOnly) throw new Error("Upgrade requires Save As to a new Workspace filename.");
      options.signal?.throwIfAborted();
      captured = this.captureWorkspace(options);
    } catch (error) { this.setState({ error: String(error), status: undefined }); return false; }
    const revision = captured.repository.revision;
    const token = this.state.requestToken + 1;
    this.setState({ saving: true, error: undefined, warning: undefined, status: undefined, requestToken: token });
    try {
      const bundle = await createWorkspaceSaveBundle(captured.repository, this.workspaceReferences, this.workspaceId, captured.presentation, captured.localValue ? { root: captured.document, previous: this.workspaceManifest } : undefined);
      if (token !== this.state.requestToken) return false;
      options.signal?.throwIfAborted();
      const json = await responseJson(
        await fetch("/api/saveWorkspaceBundle", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Speedy-Revision": String(revision),
            ...(options.createOnly ? { "If-None-Match": "*" } : {}),
            ...(captured.localValue && !options.createOnly && filename === this.sourceFilename && this.sourceHash ? { "If-Match": this.sourceHash } : {}),
          },
          body: JSON.stringify({ filename, workspace: bundle.manifest, documents: bundle.documents }),
          signal: options.signal,
        }),
      );
      if (token !== this.state.requestToken) return false;
      options.signal?.throwIfAborted();
      this.workspaceId = bundle.manifest.workspaceId;
      this.workspaceManifest = bundle.manifest;
      this.sourceFilename = filename; this.sourceHash = json.Data?.contentHash;
      this.workspaceReferences = Object.values(bundle.manifest.documents).map(resource => {
        const previous = this.workspaceReferences.find(reference => reference.documentId === resource.documentId);
        const contentKey = previous?.contentKey ?? workspaceDocumentContentKeys(snapshot).find(key => {
          const content = snapshot.contents[key];
          const metadata = content.payload.metadata as Record<string, unknown> | undefined;
          return (metadata?.documentId ?? content.payload.id) === resource.documentId;
        });
        return { ...structuredClone(resource), contentKey };
      });
      this.loadIssues = [];
      this.acknowledgeWorkspaceSave(captured, !!captured.localValue);
      if (!captured.localValue) this.savedServerDocuments = this.documentFingerprints(captured.repository);
      this.setState("saving", false);
      this.setState("warning", json.Warning);
      return true;
    } catch (error) {
      if (token === this.state.requestToken) this.setState({ saving: false, error: error instanceof Error ? error.message : String(error), status: error instanceof StoreRequestError ? error.status : undefined });
      return false;
    }
  }

  async saveExtendedRepository(filename: string): Promise<boolean> {
    try { assertLegacySaveAllowed(this.editor.repository); } catch (error) { this.setState({ error: String(error), saving: false }); return false; }
    const revision = this.editor.repository.state.revision;
    const token = this.state.requestToken + 1;
    this.setState({ saving: true, error: undefined, requestToken: token });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.state.lastSavedRevision !== undefined) {
      headers["If-Match"] = String(this.state.lastSavedRevision);
    }
    try {
      await responseJson(
        await fetch("/api/saveReactiveRepositoryJson", {
          method: "POST",
          headers,
          body: JSON.stringify({
            filename,
            repository: encodeExtendedRepository(this.editor.repository.snapshot()),
          }),
        }),
      );
      if (token !== this.state.requestToken) return false;
      if (this.editor.repository.state.revision === revision) this.setState("lastSavedRevision", revision);
      this.setState("saving", false);
      return true;
    } catch (error) {
      if (token === this.state.requestToken) this.setState({ saving: false, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  static async listFolders(folder = ".", signal?: AbortSignal): Promise<string[]> {
    const json = await responseJson(await fetch(`/api/listFolders?${new URLSearchParams({ folder })}`, { signal }), true);
    if (!Array.isArray(json.folders) || !json.folders.every((item: unknown) => typeof item === "string")) throw new Error("Invalid folder listing.");
    return json.folders;
  }

  static async listDocuments(folder = ".", signal?: AbortSignal): Promise<string[]> {
    const json = await responseJson(await fetch(`/api/listDocuments?${new URLSearchParams({ folder })}`, { signal }), true);
    if (!Array.isArray(json.files) || !json.files.every((item: unknown) => typeof item === "string")) throw new Error("Invalid document listing.");
    return json.files.filter(isDocumentName);
  }

  static async listWorkspaces(signal?: AbortSignal): Promise<string[]> {
    const json = await responseJson(await fetch("/api/listWorkspaces", { signal }), true);
    if (!Array.isArray(json.workspaces) || !json.workspaces.every((item: unknown) => typeof item === "string")) throw new Error("Invalid Workspace listing.");
    return json.workspaces.filter((name: string) => /\.json$/i.test(name));
  }

  static async loadDocument(filename: string, folder = "data", signal?: AbortSignal): Promise<ExistingBlockDto> {
    const params = new URLSearchParams({ filename, folder });
    const json = await responseJson(await fetch(`/api/loadDocumentJson?${params}`, { signal }));
    const dto = json.Data?.document as ExistingBlockDto;
    if (!dto || typeof dto !== "object" || Array.isArray(dto) || typeof dto.type !== "string") throw new Error("The file is not a Block document.");
    if (isHistoryDocument(dto)) decodeHistoryDocument(dto);
    else decodeDocument(dto);
    return dto;
  }

  static async loadWorkspace(filename: string, signal?: AbortSignal): Promise<LoadedWorkspace> {
    const params = new URLSearchParams({ filename });
    const json = await responseJson(await fetch(`/api/loadWorkspaceJson?${params}`, { signal }));
    signal?.throwIfAborted();
    const value = json.Data.workspace as unknown;
    if (!isWorkspaceManifest(value)) {
      const dto = value as ExistingBlockDto;
      if ((dto as any)?.kind || (dto as any)?.schemaVersion !== undefined) throw new Error("Unsupported Server Workspace container.");
      decodeWorkspace(dto);
      const legacy = extractLegacyWorkspaceReferences(dto);
      if (!Object.keys(legacy.resources).length) {
        return materializeLocalWorkspace(dto);
      }
      const workspaceId = typeof (dto.metadata as any)?.workspaceId === "string"
        ? String((dto.metadata as any).workspaceId)
        : typeof dto.id === "string" ? dto.id : globalThis.crypto.randomUUID();
      const manifest = { kind: "speedy-workspace" as const, schemaVersion: 1 as const, workspaceId, documents: legacy.resources, root: legacy.root };
      return this.resolveWorkspaceManifest(manifest, signal, true);
    }
    const loaded = await this.resolveWorkspaceManifest(parseWorkspaceManifest(value), signal, false);
    signal?.throwIfAborted();
    loaded.sourceFilename = filename; loaded.sourceHash = json.Data.contentHash;
    return loaded;
  }

  private static async resolveWorkspaceManifest(manifest: WorkspaceManifest, signal?: AbortSignal, legacy = false): Promise<LoadedWorkspace> {
    const loaded = new Map<string, ExistingBlockDto>();
    const issues: WorkspaceLoadIssue[] = [];
    const sessionManifest = structuredClone(manifest);
    const resources = Object.values(manifest.documents);
    let cursor = 0;
    const resolveNext = async (): Promise<void> => {
      const resource = resources[cursor++];
      if (!resource) return;
      try {
        const document = await this.loadDocument(resource.source.filename, resource.source.folder, signal);
        if (isHistoryDocument(document)) throw new Error("Open this history-enrolled Document separately; Workspace integration is not yet supported.");
        if (!["document-block", "main-list-block", "membrane-block"].includes(String(document.type))) {
          issues.push({ documentId: resource.documentId, kind: "invalid", message: `${resource.source.filename} is not a Document root.` });
          return;
        }
        const actualId = documentIdentity(document);
        if ((actualId || manifest.schemaVersion === 2) && actualId !== resource.documentId) {
          issues.push({ documentId: resource.documentId, kind: "identity-mismatch", message: `${resource.source.filename} contains Document ${actualId}, not ${resource.documentId}.` });
          return;
        }
        document.metadata = { ...((document.metadata as Record<string, unknown> | undefined) ?? {}), documentId: resource.documentId };
        const actualHash = await workspaceContentHash(document);
        sessionManifest.documents[resource.documentId].contentHash = actualHash;
        if (resource.contentHash) {
          if (actualHash !== resource.contentHash) {
            issues.push({ documentId: resource.documentId, kind: "changed", message: `${resource.source.filename} has changed since the Workspace was saved.` });
          }
        }
        loaded.set(resource.documentId, document);
      } catch (error) {
        signal?.throwIfAborted();
        issues.push({
          documentId: resource.documentId,
          kind: error instanceof StoreRequestError && error.status === 404 ? "missing" : "invalid",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      await resolveNext();
    };
    await Promise.all(Array.from({ length: Math.min(4, resources.length) }, () => resolveNext()));
    signal?.throwIfAborted();
    if (manifest.schemaVersion === 2 && issues.some(issue => issue.kind !== "changed")) throw new Error(`The managed Workspace was not opened: ${issues.filter(issue => issue.kind !== "changed").map(issue => issue.message).join(" ")}`);
    const result = materializeWorkspace(sessionManifest, loaded, issues);
    result.legacy = legacy;
    return result;
  }

  static async loadExtendedRepository(filename: string) {
    const params = new URLSearchParams({ filename });
    const json = await responseJson(await fetch(`/api/loadReactiveRepositoryJson?${params}`));
    return decodeExtendedRepository(json.Data.repository as ExtendedRepositoryDto);
  }
}
