// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import type { ExistingBlockDto } from "../block-tree/types";
import { WorkspaceDemo } from "./workspace-demo";
import { DocumentBrowser } from "./document-browser";

const disposers: Array<() => void> = [];
afterEach(() => { while (disposers.length) disposers.pop()?.(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const click = (element: Element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
const button = (label: string, root: ParentNode = document) => {
  const match = [...root.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label);
  if (!match) throw new Error(`Missing button: ${label}`); return match;
};
const input = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  element.focus(); element.value = value; element.dispatchEvent(new InputEvent("input", { bubbles: true }));
};
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const fixture: ExistingBlockDto = {
  id: "original-document-id", type: "main-list-block", future: { retained: true },
  children: [
    { id: "paragraph", type: "plain-text-block", text: "Original text" },
    { id: "annotation", type: "standoff-editor-block", text: "Annotated text", standoffProperties: [{ id: "bold", type: "style/bold", start: 0, end: 3 }] },
    { id: "image", type: "image-block", metadata: { url: "/original.jpg" } },
  ],
};
function mockStore() {
  const files = new Map<string, ExistingBlockDto>([["archive/notes/Original.json", structuredClone(fixture)]]);
  const fetch = vi.fn(async (address: string, init?: RequestInit) => {
    const url = new URL(address, "http://localhost"); const folder = url.searchParams.get("folder") || ".";
    if (url.pathname.endsWith("listFolders")) return response({ folders: folder === "." ? ["archive", "empty"] : folder === "archive" ? ["notes"] : [] });
    if (url.pathname.endsWith("listDocuments")) return response({ files: [...files.keys()].filter((key) => key.slice(0, key.lastIndexOf("/")) === folder).map((key) => key.slice(key.lastIndexOf("/") + 1)) });
    if (url.pathname.endsWith("loadDocumentJson")) {
      const document = files.get(`${folder}/${url.searchParams.get("filename")}`);
      return document ? response({ Success: true, Data: { document } }) : response({ Success: false, Error: "Document missing" }, 404);
    }
    const payload = JSON.parse(init?.body as string); const key = `${payload.folder}/${payload.filename}`;
    if ((init?.headers as any)?.["If-None-Match"] === "*" && files.has(key)) return response({ Success: false, Error: "Document already exists" }, 409);
    files.set(key, payload.document); return response({ Success: true });
  });
  vi.stubGlobal("fetch", fetch); return { files, fetch };
}
function mountWorkspace() {
  const host = document.body.appendChild(document.createElement("div")); disposers.push(render(() => <WorkspaceDemo />, host)); return host;
}
async function browseNotes(host: HTMLElement) {
  click(button("Open…", host));
  await vi.waitFor(() => expect(document.querySelector('[data-folder="archive"]')).not.toBeNull());
  click(document.querySelector('[data-folder="archive"] .document-browser__expander')!);
  await vi.waitFor(() => expect(document.querySelector('[data-folder="archive/notes"]')).not.toBeNull());
  click(document.querySelector('[data-folder="archive/notes"]')!);
  await vi.waitFor(() => expect(button("▤Original.json", dialog())).toBeTruthy());
}
async function openOriginal(host: HTMLElement) {
  await browseNotes(host);
  button("▤Original.json", dialog()).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  await vi.waitFor(() => expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Original text"));
}

describe("workspace document controls", () => {
  it("saves an unnamed edited document before continuing a reset", async () => {
    const store = mockStore(); const host = mountWorkspace();
    const original = host.querySelector<HTMLTextAreaElement>("textarea")!; input(original, "Save me before resetting");
    click(button("Reset demo", host)); click(button("Save changes", dialog()));
    await vi.waitFor(() => expect(button("Save", dialog()).disabled).toBe(false));
    input(dialog().querySelector('[aria-label="File name"]')!, "Before reset.json"); click(button("Save", dialog()));
    await vi.waitFor(() => expect(original.isConnected).toBe(false));
    expect(JSON.stringify(store.files.get("./Before reset.json"))).toContain("Save me before resetting");
    expect(host.querySelector('[data-save-state="saved"]')).not.toBeNull();
  });

  it("discards only unsaved edits when closing and restores the last saved copy on reopen", async () => {
    mockStore(); const host = mountWorkspace(); await openOriginal(host);
    input(host.querySelector("textarea")!, "Saved baseline"); click(button("Save", host));
    await vi.waitFor(() => expect(host.querySelector('[data-save-state="saved"]')).not.toBeNull());
    input(host.querySelector("textarea")!, "Unsaved later edit");
    click(host.querySelector('[aria-label="Close document window"]')!); click(button("Discard changes", dialog()));
    expect(host.querySelector(".workspace-demo__window")).toBeNull(); click(button("Reopen document", host));
    expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Saved baseline");
    expect(host.querySelector('[data-save-state="saved"]')).not.toBeNull();
  });

  it("browses nested folders, loads unchanged legacy data, saves edits, and reopens a saved copy", async () => {
    const store = mockStore(); const host = mountWorkspace(); await openOriginal(host);
    expect(host.querySelector(".workspace-demo__document--flow")).not.toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(host.querySelector("textarea")));
    expect(host.querySelector<HTMLImageElement>(".reactive-image img")?.getAttribute("src")).toBe("/original.jpg");
    input(host.querySelector("textarea")!, "Edited text"); click(button("Save", host));
    await vi.waitFor(() => expect(host.querySelector('[data-save-state="saved"]')).not.toBeNull());
    const saved = store.files.get("archive/notes/Original.json")!;
    expect(saved).toMatchObject({ id: fixture.id, type: "main-list-block", future: { retained: true } });
    expect(saved.children?.[0].text).toBe("Edited text");
    expect(saved.children?.[1].standoffProperties).toEqual(fixture.children?.[1].standoffProperties);
    click(button("Save as…", host));
    await vi.waitFor(() => expect(dialog().querySelector('[aria-busy="false"]')).not.toBeNull());
    input(dialog().querySelector('[aria-label="File name"]')!, "A copy");
    await vi.waitFor(() => expect(button("Save", dialog()).disabled).toBe(false)); click(button("Save", dialog()));
    await vi.waitFor(() => expect(store.files.has("archive/notes/A copy.json")).toBe(true));
    await vi.waitFor(() => expect(host.querySelector(".workspace-demo__window-title")?.textContent).toContain("A copy.json"));
    click(button("Open…", host));
    await vi.waitFor(() => expect(button("▤A copy.json", dialog())).toBeTruthy()); click(button("▤A copy.json", dialog())); click(button("Open", dialog()));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Edited text");
    const before = store.fetch.mock.calls.length;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(store.fetch.mock.calls.length).toBe(before + 1));
  });

  it("protects edits on reset and open, and keeps the editor intact when loading fails", async () => {
    const store = mockStore(); const host = mountWorkspace();
    const text = host.querySelector<HTMLTextAreaElement>("textarea")!; input(text, "Keep these edits");
    click(button("Reset demo", host)); click(button("Cancel", dialog())); expect(text.value).toBe("Keep these edits");
    click(button("Open…", host)); expect(dialog().textContent).toContain("Save your changes?");
    click(button("Discard changes", dialog()));
    await vi.waitFor(() => expect(document.querySelector('[data-folder="archive"]')).not.toBeNull());
    click(document.querySelector('[data-folder="archive"] .document-browser__expander')!);
    await vi.waitFor(() => expect(document.querySelector('[data-folder="archive/notes"]')).not.toBeNull());
    click(document.querySelector('[data-folder="archive/notes"]')!);
    await vi.waitFor(() => expect(button("▤Original.json", dialog())).toBeTruthy());
    store.files.clear(); click(button("▤Original.json", dialog())); click(button("Open", dialog()));
    await vi.waitFor(() => expect(dialog().textContent).toContain("Document missing"));
    expect(text.isConnected).toBe(true); expect(text.value).toBe("Keep these edits");
    click(button("Cancel", dialog()));
    const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
  });

  it("requires explicit overwrite and restores focus when the browser is cancelled", async () => {
    const store = mockStore(); const host = mountWorkspace(); await openOriginal(host);
    const trigger = button("Save as…", host); trigger.focus(); click(trigger);
    await vi.waitFor(() => expect(button("Save", dialog()).disabled).toBe(false));
    const before = store.fetch.mock.calls.filter(([address]) => address.includes("saveDocumentJson")).length;
    click(button("Save", dialog())); expect(dialog().textContent).toContain("Replace its contents?");
    click(button("Keep existing file", dialog())); click(button("Cancel", dialog()));
    expect(store.fetch.mock.calls.filter(([address]) => address.includes("saveDocumentJson"))).toHaveLength(before);
    expect(document.activeElement).toBe(trigger);
    click(trigger); await vi.waitFor(() => expect(button("Save", dialog()).disabled).toBe(false));
    click(button("Save", dialog())); click(button("Replace document", dialog()));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  });
});

describe("document browser request and keyboard handling", () => {
  it("ignores an older folder response, supports tree keys, and traps modal Tab/Escape", async () => {
    let finishSlow!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(async (address: string) => {
      const url = new URL(address, "http://localhost"); const folder = url.searchParams.get("folder");
      if (url.pathname.endsWith("listFolders")) return response({ folders: folder === "." ? ["slow", "empty"] : [] });
      if (folder === "slow") return new Promise<Response>((resolve) => { finishSlow = resolve; });
      return response({ files: [] });
    }));
    const onClose = vi.fn();
    const host = document.body.appendChild(document.createElement("div"));
    disposers.push(render(() => <DocumentBrowser mode="open" onChoose={async () => true} onClose={onClose} />, host));
    await vi.waitFor(() => expect(document.querySelector('[data-folder="slow"]')).not.toBeNull());
    click(document.querySelector('[data-folder="slow"]')!);
    await vi.waitFor(() => expect(finishSlow).toBeTypeOf("function"));
    document.querySelector('[data-folder="slow"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('[data-folder="empty"]')?.getAttribute("aria-selected")).toBe("true"));
    finishSlow(response({ files: ["Stale.json"] })); await Promise.resolve();
    expect(dialog().textContent).not.toContain("Stale.json");
    const cancel = button("Cancel", dialog()); cancel.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }); cancel.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close dialog");
    dialog().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); expect(onClose).toHaveBeenCalledTimes(1);
  });
});
