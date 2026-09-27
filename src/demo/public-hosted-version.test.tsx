// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { featureFlags } from "../configuration";
import { WorkspaceDemo } from "./workspace-demo";
import type { BrowserFileHandle } from "./browser-json-file";

const disposers: Array<() => void> = [];
afterEach(() => { while (disposers.length) disposers.pop()?.(); document.body.replaceChildren(); vi.unstubAllGlobals(); });

function mount(canvasWorkspace = false) {
  const host = document.body.appendChild(document.createElement("div"));
  disposers.push(render(() => <WorkspaceDemo configuration={{ features: { codexSystemBar: false, canvasWorkspace } }} />, host));
  return host;
}

function button(label: string, root: ParentNode): HTMLButtonElement {
  const result = [...root.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === label);
  if (!result) throw new Error(`Missing ${label} button`);
  return result;
}

function click(element: HTMLElement) { element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); }

function writableHandle(name: string, writes: string[]): BrowserFileHandle {
  return {
    name,
    getFile: async () => ({ name, text: async () => writes.at(-1) ?? "{}" }) as File,
    createWritable: async () => ({
      write: async data => { writes.push(typeof data === "string" ? data : await data.text()); },
      close: async () => undefined,
    }),
  };
}

describe("public-hosted-version", () => {
  it("switches a loaded workspace through fallback commands and uses the same snapshot for Local Save As", async () => {
    const original = { id: "workspace", type: "workspace-block", children: [{ id: "window", type: "document-window-block", children: [{ id: "document", type: "document-block", metadata: { documentId: "stable" }, children: [{ id: "text", type: "plain-text-block", text: "Identity retained" }] }] }] };
    const writes = [JSON.stringify(original)], copies: string[] = [];
    const handle = writableHandle("Original.json", writes), copy = writableHandle("Copy.json", copies);
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([handle]));
    const picker = vi.fn().mockRejectedValueOnce(new DOMException("Cancelled", "AbortError")).mockResolvedValueOnce(copy);
    vi.stubGlobal("showSaveFilePicker", picker);
    const host = mount(true);
    expect(host.querySelector('[aria-label="Presentations"]')).toBeNull();
    click(button("Open Workspace…", host.querySelector('[aria-label="Local files"]')!));
    await vi.waitFor(() => expect(host.querySelector('[aria-label="Presentations"]')).not.toBeNull());
    click(button("Canvas", host));
    expect(host.querySelector('.workspace-canvas')).not.toBeNull();
    click(button("Save Workspace as…", host));
    await vi.waitFor(() => expect(button("Save Workspace as…", host).disabled).toBe(false));
    expect(writes).toHaveLength(1); expect(copies).toHaveLength(0);
    expect(host.textContent).toContain("Unsaved changes");
    click(button("Save Workspace as…", host));
    await vi.waitFor(() => expect(copies).toHaveLength(1));
    expect(writes).toHaveLength(1);
    const saved = JSON.parse(copies[0]);
    expect(saved.id).toBe("workspace");
    expect(saved.children[0].children[0].metadata.documentId).toBe("stable");
    expect(saved.metadata.workspacePresentation.active).toBe("canvas");
    expect(host.textContent).not.toContain("Unsaved changes");
    click(button("Desktop", host)); expect(host.querySelector('.workspace-canvas')).toBeNull();
    click(button("Canvas", host)); expect(host.querySelectorAll('textarea')).toHaveLength(1);
  });
  it("is enabled by default and separates read-only Server actions from writable Local actions in Workspace", async () => {
    expect(featureFlags.publicHostedVersion).toBe(true);
    expect(featureFlags.codexSystemBar).toBe(true);
    const host = document.body.appendChild(document.createElement("div"));
    disposers.push(render(() => <WorkspaceDemo />, host));
    click(host.querySelector<HTMLButtonElement>('[data-system-menu-trigger="workspace"]')!); await Promise.resolve();
    const menu = host.querySelector<HTMLElement>('[role="menu"][aria-label="Workspace"]')!;
    const server = menu.querySelector<HTMLElement>('[aria-label="Server files"]')!;
    const local = menu.querySelector<HTMLElement>('[aria-label="Local files"]')!;
    expect(server).not.toBeNull(); expect(local).not.toBeNull();
    expect(button("Save", server).disabled).toBe(true);
    expect(button("Save as…", server).disabled).toBe(true);
    expect(button("Save Workspace…", server).disabled).toBe(true);
    expect(button("Open…", server).disabled).toBe(false);
    expect(button("Save", local).disabled).toBe(false);
  });

  it("writes Local Documents and self-contained Local Workspaces through browser file handles", async () => {
    const documentWrites: string[] = [], workspaceWrites: string[] = [];
    const pick = vi.fn()
      .mockResolvedValueOnce(writableHandle("My Document.json", documentWrites))
      .mockResolvedValueOnce(writableHandle("My Workspace.json", workspaceWrites));
    vi.stubGlobal("showSaveFilePicker", pick);
    const host = mount();
    const local = host.querySelector<HTMLElement>('[aria-label="Local files"]')!;
    click(button("Save", local));
    await vi.waitFor(() => expect(documentWrites).toHaveLength(1));
    expect(JSON.parse(documentWrites[0]).type).toBe("document-block");
    expect(host.querySelector(".workspace-demo__window-title")?.textContent).toContain("My Document.json");

    click(button("Save Workspace…", local));
    await vi.waitFor(() => expect(workspaceWrites).toHaveLength(1));
    const workspace = JSON.parse(workspaceWrites[0]);
    expect(workspace.type).toBe("workspace-block");
    expect(JSON.stringify(workspace)).toContain("My Document.json");
    expect(JSON.stringify(workspace)).toContain("document-block");
    expect(JSON.stringify(workspace)).not.toContain("document-reference-block");
  });

  it("opens a Local Document without contacting the Server", async () => {
    const localDocument = { type: "document-block", children: [{ type: "plain-text-block", text: "From my computer" }] };
    const handle = { name: "Local.json", getFile: async () => ({ name: "Local.json", text: async () => JSON.stringify(localDocument) }) as File };
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([handle]));
    const host = mount();
    click(button("Open…", host.querySelector('[aria-label="Local files"]')!));
    await vi.waitFor(() => expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("From my computer"));
    expect(host.querySelector(".workspace-demo__window-title")?.textContent).toContain("Local.json");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opens a self-contained Local Workspace from one JSON file", async () => {
    const workspace = {
      type: "workspace-block",
      children: [{ type: "image-background-block", children: [{ type: "document-window-block", children: [
        { type: "document-block", children: [{ type: "plain-text-block", text: "Portable Workspace" }] },
      ] }] }],
    };
    const handle = { name: "Portable Workspace.json", getFile: async () => ({ name: "Portable Workspace.json", text: async () => JSON.stringify(workspace) }) as File };
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([handle]));
    const host = mount();
    click(button("Open Workspace…", host.querySelector('[aria-label="Local files"]')!));
    await vi.waitFor(() => expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Portable Workspace"));
    expect(host.textContent).toContain("Portable Workspace.json · revision 0");
  });

  it("preserves unavailable presentation data and leaves edits during a local write unsaved", async () => {
    const presentation = { version: 99, futureLayout: { retained: true } };
    const workspace = { type: "workspace-block", metadata: { workspacePresentation: presentation }, children: [
      { type: "document-window-block", children: [{ type: "document-block", children: [{ type: "plain-text-block", text: "Before" }] }] },
    ] };
    const writes: string[] = [];
    let finish!: () => void;
    const handle: BrowserFileHandle = {
      name: "Workspace.json", getFile: async () => ({ name: "Workspace.json", text: async () => JSON.stringify(workspace) }) as File,
      createWritable: async () => ({ write: async data => { writes.push(String(data)); }, close: () => new Promise<void>(resolve => { finish = resolve; }) }),
    };
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([handle]));
    const host = mount();
    click(button("Open Workspace…", host.querySelector('[aria-label="Local files"]')!));
    await vi.waitFor(() => expect(host.querySelector(".workspace-demo--canonical")).not.toBeNull());
    expect(host.textContent).toContain("Presentation data was preserved; Desktop is shown");
    const input = host.querySelector<HTMLTextAreaElement>("textarea")!;
    const edit = (text: string) => { input.value = text; input.dispatchEvent(new Event("input", { bubbles: true })); };
    edit("Captured");
    click(button("Save Workspace", host.querySelector('[aria-label="Local files"]')!));
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    edit("Newer"); finish();
    await vi.waitFor(() => expect(button("Save Workspace", host.querySelector('[aria-label="Local files"]')!).disabled).toBe(false));
    expect(host.textContent).toContain("Unsaved changes");
    expect(JSON.parse(writes[0]).metadata.workspacePresentation).toEqual(presentation);
    expect(writes[0]).toContain("Captured"); expect(writes[0]).not.toContain("Newer");
    click(button("Save Workspace", host.querySelector('[aria-label="Local files"]')!));
    await vi.waitFor(() => expect(writes).toHaveLength(2)); finish();
    await vi.waitFor(() => expect(host.textContent).not.toContain("Unsaved changes"));
    expect(writes[1]).toContain("Newer");
    edit("Unsaved after failure");
    handle.createWritable = async () => { throw new Error("Disk write failed"); };
    click(button("Save Workspace", host.querySelector('[aria-label="Local files"]')!));
    await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain("Disk write failed"));
    expect(host.textContent).toContain("Unsaved changes");
  });
});
