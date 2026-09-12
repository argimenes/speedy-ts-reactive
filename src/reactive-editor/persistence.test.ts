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
