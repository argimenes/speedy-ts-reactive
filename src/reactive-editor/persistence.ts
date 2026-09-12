import { createStore } from "solid-js/store";
import { decodeDocument, decodeWorkspace } from "../block-tree/codecs";
import type { ExistingBlockDto } from "../block-tree/types";
import type { ReactiveEditor } from "./editor";
import { decodeExtendedRepository, encodeExtendedRepository, type ExtendedRepositoryDto } from "../block-tree/extended-codec";

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

  constructor(private readonly editor: ReactiveEditor) {
    const [state, setState] = createStore<SaveState>({ saving: false, requestToken: 0 });
    this.state = state;
    this.setState = setState;
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
    const revision = this.editor.repository.state.revision;
    const token = this.state.requestToken + 1;
    this.setState({ saving: true, error: undefined, requestToken: token });
    try {
      await responseJson(
        await fetch("/api/saveWorkspaceJson", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Speedy-Revision": String(revision),
          },
          body: JSON.stringify({ filename, workspace: this.editor.encodeWorkspace() }),
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

  static async loadDocument(filename: string, folder = "data", signal?: AbortSignal): Promise<ExistingBlockDto> {
    const params = new URLSearchParams({ filename, folder });
    const json = await responseJson(await fetch(`/api/loadDocumentJson?${params}`, { signal }));
    const dto = json.Data?.document as ExistingBlockDto;
    if (!dto || typeof dto !== "object" || Array.isArray(dto) || typeof dto.type !== "string") throw new Error("The file is not a Block document.");
    decodeDocument(dto);
    return dto;
  }

  static async loadWorkspace(filename: string): Promise<ExistingBlockDto> {
    const params = new URLSearchParams({ filename });
    const json = await responseJson(await fetch(`/api/loadWorkspaceJson?${params}`));
    const dto = json.Data.workspace as ExistingBlockDto;
    decodeWorkspace(dto);
    return dto;
  }

  static async loadExtendedRepository(filename: string) {
    const params = new URLSearchParams({ filename });
    const json = await responseJson(await fetch(`/api/loadReactiveRepositoryJson?${params}`));
    return decodeExtendedRepository(json.Data.repository as ExtendedRepositoryDto);
  }
}
