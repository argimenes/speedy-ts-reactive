// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactiveEditor } from "./editor";
import { PersistenceService } from "./persistence";

afterEach(() => vi.unstubAllGlobals());
const response = (json: unknown, status = 200) => new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });

describe("document persistence", () => {
  it("snapshots the saved revision, prevents double submit, and leaves newer edits dirty", async () => {
    const editor = new ReactiveEditor({ type: "document-block", metadata: { extra: "kept" }, children: [{ type: "plain-text-block", text: "Before" }] });
    const projection = editor.createView();
    let complete!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; })); vi.stubGlobal("fetch", fetch);
    const pending = editor.persistence.saveDocument("A copy.json", "archive/notes", { createOnly: true });
    expect(await editor.persistence.saveDocument("Duplicate.json", "archive")).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[1].headers).toMatchObject({ "If-None-Match": "*", "X-Speedy-Revision": "0" });
    expect(JSON.parse(request[1].body as string)).toMatchObject({ folder: "archive/notes", filename: "A copy.json", document: { metadata: { extra: "kept", folder: "archive/notes", filename: "A copy.json" } } });
    const node = projection.state.nodes[projection.state.rootKey].children[0];
    editor.commands.setPayloadField(node, "text", "Newer edit");
    complete(response({ Success: true }));
    expect(await pending).toBe(true);
    expect(editor.persistence.state.lastSavedRevision).not.toBe(editor.repository.state.revision);
    expect(editor.encodeDocument().metadata).toEqual({ extra: "kept" });
    editor.dispose();
  });
  it("records storage errors and indexing warnings without falsely marking changes clean", async () => {
    const editor = new ReactiveEditor({ type: "document-block" });
    const fetch = vi.fn().mockResolvedValueOnce(response({ Success: false, Error: "A document with this name already exists." }, 409)).mockResolvedValueOnce(response({ Success: true, Warning: "Index offline" })); vi.stubGlobal("fetch", fetch);
    expect(await editor.persistence.saveDocument("Copy.json", ".")).toBe(false);
    expect(editor.persistence.state.status).toBe(409);
    expect(editor.persistence.state.lastSavedRevision).toBeUndefined();
    expect(await editor.persistence.saveDocument("Copy.json", ".")).toBe(true);
    expect(editor.persistence.state.lastSavedRevision).toBe(0);
    expect(editor.persistence.state.warning).toBe("Index offline");
    editor.dispose();
  });
  it("escapes nested paths and filenames and validates listing/load responses", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ files: ["A & B.json", "ignore.txt"] })).mockResolvedValueOnce(response({ Success: true, Data: { document: { type: "main-list-block", children: [] } } })).mockResolvedValueOnce(response({ Success: true, Data: { document: [1] } })); vi.stubGlobal("fetch", fetch);
    expect(await PersistenceService.listDocuments("A/B & C")).toEqual(["A & B.json"]);
    expect(fetch.mock.calls[0][0]).toContain("folder=A%2FB+%26+C");
    expect((await PersistenceService.loadDocument("A & B.json", "A/B & C")).type).toBe("main-list-block");
    expect(fetch.mock.calls[1][0]).toContain("filename=A+%26+B.json");
    await expect(PersistenceService.loadDocument("bad.json", ".")).rejects.toThrow("not a Block document");
  });
});

describe("Workspace persistence", () => {
  const workspace = () => ({
    id: "workspace", type: "workspace-block", children: [{ id: "background", type: "canvas-background-block", children: [{
      id: "window", type: "document-window-block", metadata: { position: { x: 4, y: 8 } }, children: [{
        id: "document", type: "document-block", metadata: { documentId: "document-one", folder: "notes", filename: "One.json" }, children: [{ type: "plain-text-block", text: "Saved separately" }],
      }],
    }] }],
  });

  it("posts a coordinated bundle and only marks the captured revision clean", async () => {
    const editor = new ReactiveEditor(workspace());
    const fetch = vi.fn().mockResolvedValue(response({ Success: true })); vi.stubGlobal("fetch", fetch);
    expect(await editor.persistence.saveWorkspace("Desk.json")).toBe(true);
    const [url, request] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/saveWorkspaceBundle");
    const body = JSON.parse(request.body as string);
    expect(body.workspace.root.children[0].type).toBe("canvas-background-block");
    expect(body.workspace.root.children[0].children[0].children[0]).toEqual({ type: "document-reference-block", metadata: { documentId: "document-one" } });
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].document.children[0].text).toBe("Saved separately");
    expect(editor.persistence.state.lastSavedRevision).toBe(0);
    editor.dispose();
  });

  it("loads valid resources and leaves a recoverable placeholder for a missing Document", async () => {
    const manifest = {
      kind: "speedy-workspace", schemaVersion: 1, workspaceId: "workspace",
      documents: {
        found: { documentId: "found", source: { kind: "document-store", folder: "notes", filename: "Found.json" } },
        missing: { documentId: "missing", source: { kind: "document-store", folder: "notes", filename: "Missing.json" } },
      },
      root: { type: "workspace-block", children: [{ type: "image-background-block", children: [
        { type: "document-window-block", id: "found-window", children: [{ type: "document-reference-block", metadata: { documentId: "found" } }] },
        { type: "document-window-block", id: "missing-window", children: [{ type: "document-reference-block", metadata: { documentId: "missing" } }] },
      ] }] },
    };
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ Success: true, Data: { workspace: manifest } }))
      .mockImplementation((url: string) => url.includes("Found.json")
        ? Promise.resolve(response({ Success: true, Data: { document: { id: "found", type: "document-block", children: [{ type: "plain-text-block", text: "Loaded" }] } } }))
        : Promise.resolve(response({ Success: false, Error: "Not found" }, 404)));
    vi.stubGlobal("fetch", fetch);
    const loaded = await PersistenceService.loadWorkspace("Desk.json");
    expect(loaded.issues).toEqual([{ documentId: "missing", kind: "missing", message: "Not found" }]);
    const editor = new ReactiveEditor(loaded);
    const view = editor.createView("workspace");
    const types = Object.values(view.state.nodes).map(node => node.viewType);
    expect(types).toContain("document-block"); expect(types).toContain("document-reference-block");
    expect(editor.persistence.workspaceReference("missing")?.source.filename).toBe("Missing.json");
    editor.dispose();
  });

  it("retries or relinks unresolved references and shares one resolved Document across its windows", async () => {
    const manifest = {
      kind: "speedy-workspace" as const, schemaVersion: 1 as const, workspaceId: "workspace",
      documents: { missing: { documentId: "missing", source: { kind: "document-store" as const, folder: "old", filename: "Missing.json" } } },
      root: { type: "workspace-block", children: [{ type: "canvas-background-block", children: [
        { type: "document-window-block", children: [{ type: "document-reference-block", metadata: { documentId: "missing" } }] },
        { type: "document-window-block", children: [{ type: "document-reference-block", metadata: { documentId: "missing" } }] },
      ] }] },
    };
    const loaded = (await import("./workspace-manifest")).materializeWorkspace(manifest, new Map(), [{ documentId: "missing", kind: "missing", message: "Not found" }]);
    const editor = new ReactiveEditor(loaded);
    const fetch = vi.fn().mockResolvedValue(response({ Success: true, Data: { document: { id: "missing", type: "document-block", children: [{ type: "plain-text-block", text: "Recovered" }] } } }));
    vi.stubGlobal("fetch", fetch);
    expect(await editor.persistence.resolveWorkspaceDocument("missing", { kind: "document-store", folder: "new", filename: "Recovered.json" })).toBe(true);
    expect(fetch.mock.calls[0][0]).toContain("folder=new");
    const snapshot = editor.repository.snapshot();
    const placements = Object.values(snapshot.placements).filter(placement => snapshot.contents[placement.contentKey]?.viewType === "document-block");
    expect(placements).toHaveLength(2);
    expect(new Set(placements.map(placement => placement.contentKey)).size).toBe(1);
    expect(editor.persistence.workspaceReference("missing")?.source).toEqual({ kind: "document-store", folder: "new", filename: "Recovered.json" });
    expect(editor.persistence.workspaceLoadIssues()).toEqual([]);
    editor.dispose();
  });
});
