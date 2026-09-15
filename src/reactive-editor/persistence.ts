import { createStore } from "solid-js/store";
import { decodeDocument, decodeWorkspace } from "../block-tree/codecs";
import type { ExistingBlockDto } from "../block-tree/types";
import type { ReactiveEditor } from "./editor";
import { decodeExtendedRepository, encodeExtendedRepository, type ExtendedRepositoryDto } from "../block-tree/extended-codec";
import {
  createWorkspaceSaveBundle,
  documentIdentity,
  extractLegacyWorkspaceReferences,
  isWorkspaceManifest,
  materializeWorkspace,
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

export class PersistenceService {
  readonly state: SaveState;
  savedDocument?: ExistingBlockDto;
  private readonly setState: (...args: any[]) => void;
  private workspaceId?: string;
  private workspaceManifest?: WorkspaceManifest;
  private workspaceReferences: WorkspaceDocumentRegistration[] = [];
  private loadIssues: WorkspaceLoadIssue[] = [];

  constructor(private readonly editor: ReactiveEditor) {
    const [state, setState] = createStore<SaveState>({ saving: false, requestToken: 0 });
    this.state = state;
    this.setState = setState;
  }

  attachWorkspace(workspace: LoadedWorkspace): void {
    this.workspaceId = workspace.workspaceId;
    this.workspaceManifest = workspace.manifest;
    this.workspaceReferences = workspace.references.map(reference => structuredClone(reference));
    this.loadIssues = workspace.issues.map(issue => structuredClone(issue));
  }

  workspaceLoadIssues(): readonly WorkspaceLoadIssue[] {
    return this.loadIssues;
  }

  workspaceReference(documentId: string): WorkspaceDocumentRegistration | undefined {
    const reference = this.workspaceReferences.find(item => item.documentId === documentId);
    return reference ? structuredClone(reference) : undefined;
  }

  registerWorkspaceDocument(contentKey: string, documentId: string, folder: string, filename: string, title?: string): void {
    const next: WorkspaceDocumentRegistration = {
      documentId,
      contentKey,
      source: { kind: "document-store", folder, filename },
      ...(title ? { title } : {}),
    };
    this.workspaceReferences = this.workspaceReferences.filter(reference => reference.contentKey !== contentKey && reference.documentId !== documentId);
    this.workspaceReferences.push(next);
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
      if (this.editor.repository.state.revision === revision) {
        this.setState("lastSavedRevision", revision);
      }
      this.setState("saving", false);
      this.setState("warning", json.Warning);
      return true;
    } catch (error) {
      if (token === this.state.requestToken) {
        this.setState({ saving: false, error: error instanceof Error ? error.message : String(error), status: error instanceof StoreRequestError ? error.status : undefined });
      }
      return false;
    }
  }

  async saveWorkspace(filename: string): Promise<boolean> {
    if (this.state.saving) return false;
    let snapshot = this.editor.repository.snapshot();
    const root = snapshot.contents[snapshot.placements[snapshot.rootPlacementKey]?.contentKey];
    if (root?.viewType !== "workspace-block") {
      this.setState({ error: "Save Workspace requires a workspace-block root.", status: undefined });
      return false;
    }
    const identityOperations = workspaceDocumentContentKeys(snapshot).flatMap(contentKey => {
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
    const revision = snapshot.revision;
    const token = this.state.requestToken + 1;
    this.setState({ saving: true, error: undefined, warning: undefined, status: undefined, requestToken: token });
    try {
      const bundle = await createWorkspaceSaveBundle(snapshot, this.workspaceReferences, this.workspaceId);
      const json = await responseJson(
        await fetch("/api/saveWorkspaceBundle", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Speedy-Revision": String(revision),
          },
          body: JSON.stringify({ filename, workspace: bundle.manifest, documents: bundle.documents }),
        }),
      );
      if (token !== this.state.requestToken) return false;
      this.workspaceId = bundle.manifest.workspaceId;
      this.workspaceManifest = bundle.manifest;
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
      if (this.editor.repository.state.revision === revision) this.setState("lastSavedRevision", revision);
      this.setState("saving", false);
      this.setState("warning", json.Warning);
      return true;
    } catch (error) {
      if (token === this.state.requestToken) this.setState({ saving: false, error: error instanceof Error ? error.message : String(error), status: error instanceof StoreRequestError ? error.status : undefined });
      return false;
    }
  }

  async saveExtendedRepository(filename: string): Promise<boolean> {
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
    return json.files.filter((name: string) => /\.json$/i.test(name));
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
    decodeDocument(dto);
    return dto;
  }

  static async loadWorkspace(filename: string, signal?: AbortSignal): Promise<LoadedWorkspace> {
    const params = new URLSearchParams({ filename });
    const json = await responseJson(await fetch(`/api/loadWorkspaceJson?${params}`, { signal }));
    const value = json.Data.workspace as unknown;
    if (!isWorkspaceManifest(value)) {
      const dto = value as ExistingBlockDto;
      decodeWorkspace(dto);
      const legacy = extractLegacyWorkspaceReferences(dto);
      if (!Object.keys(legacy.resources).length) {
        return { state: decodeWorkspace(dto).state, references: [], issues: [], legacy: true };
      }
      const workspaceId = typeof (dto.metadata as any)?.workspaceId === "string"
        ? String((dto.metadata as any).workspaceId)
        : typeof dto.id === "string" ? dto.id : globalThis.crypto.randomUUID();
      const manifest = { kind: "speedy-workspace" as const, schemaVersion: 1 as const, workspaceId, documents: legacy.resources, root: legacy.root };
      return this.resolveWorkspaceManifest(manifest, signal, true);
    }
    return this.resolveWorkspaceManifest(parseWorkspaceManifest(value), signal, false);
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
        if (!["document-block", "main-list-block", "membrane-block"].includes(String(document.type))) {
          issues.push({ documentId: resource.documentId, kind: "invalid", message: `${resource.source.filename} is not a Document root.` });
          return;
        }
        const actualId = documentIdentity(document);
        if (actualId && actualId !== resource.documentId) {
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
        issues.push({
          documentId: resource.documentId,
          kind: error instanceof StoreRequestError && error.status === 404 ? "missing" : "invalid",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      await resolveNext();
    };
    await Promise.all(Array.from({ length: Math.min(4, resources.length) }, () => resolveNext()));
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
