// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import type { ExistingBlockDto } from "../block-tree/types";
import {
  createWorkspaceDemoDocument,
  createWorkspaceDemoEditor,
  demoSourceCounts,
  walkDemoBlocks,
} from "./workspace-demo-model";
import { WorkspaceDemo } from "./workspace-demo";
import { workspaceBuilderTypes, workspaceDocumentFixture } from "./workspace-document";

const disposers: Array<() => void> = [];

afterEach(() => {
  while (disposers.length) disposers.pop()?.();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function metadata(block: ExistingBlockDto): Record<string, unknown> {
  return (block.metadata as Record<string, unknown> | undefined) ?? {};
}

function button(label: string, root: ParentNode = document): HTMLButtonElement {
  const match = [...root.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  if (!match) throw new Error(`Button not found: ${label}`);
  return match as HTMLButtonElement;
}

function click(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

describe("workspace demo fixture", () => {
  it("loads the complete source sample, rewrites only demo media, and exports it", () => {
    expect(demoSourceCounts).toEqual({ blocks: 92, types: 27 });
    expect(workspaceBuilderTypes).toHaveLength(39);

    const document = createWorkspaceDemoDocument();
    const blocks = walkDemoBlocks(document);
    expect(new Set(blocks.map((block) => block.id)).size).toBe(92);
    expect(blocks.every((block) => block.id?.startsWith("workspace-demo-"))).toBe(true);

    const image = blocks.find((block) => block.type === "image-block")!;
    expect(metadata(image).url).not.toBe(metadata(image).originalUrl);
    expect(String(metadata(image).url)).toContain("medieval-template");
    const frame = blocks.find((block) => block.type === "iframe-block")!;
    expect(metadata(frame).url).toBe("/demo/embedded-page.html");
    const video = blocks.find((block) => block.type === "youtube-video-block")!;
    expect(metadata(video).loadOnDemand).toBeUndefined();

    const editor = createWorkspaceDemoEditor();
    const projection = editor.createView("fixture-test");
    const encoded = editor.encodeDocument();
    expect(walkDemoBlocks(encoded)).toHaveLength(92);
    expect(projection.state.nodes[projection.state.rootKey].viewType).toBe("document-block");
    expect(["universe-block", ...workspaceBuilderTypes].every((type) => editor.registry.resolve(type)?.view)).toBe(true);
    editor.dispose();

    expect(workspaceDocumentFixture.id).toBeUndefined();
    expect(metadata(walkDemoBlocks(workspaceDocumentFixture).find((block) => block.type === "image-block")!).originalUrl).toBeUndefined();
  });
});

describe("WorkspaceDemo", () => {
  function mount() {
    const host = document.body.appendChild(document.createElement("div"));
    const dispose = render(() => <WorkspaceDemo configuration={{ features: { publicHostedVersion: false } }} />, host);
    disposers.push(dispose);
    return host;
  }

  it("keeps inactive document tabs unmounted and flips card faces in one surface", () => {
    const host = mount();
    expect(host.querySelector("[data-demo-state='loaded']")).not.toBeNull();
    expect(host.textContent).not.toContain("Text on Page 2 ...");
    click(button("Page 2", host));
    expect(host.textContent).toContain("Text on Page 2 ...");
    expect(host.textContent).not.toContain("Standoff Property Text Editor");

    click(button("Page 1", host));
    click(button("C", host));
    const surface = host.querySelector(".reactive-flippable")!;
    const imageSide = surface.querySelector<HTMLElement>("[data-side-label='Image side']")!;
    const textSide = surface.querySelector<HTMLElement>("[data-side-label='Text side']")!;
    expect(imageSide.getAttribute("aria-hidden")).toBe("false");
    expect(textSide.getAttribute("aria-hidden")).toBe("true");
    click(button("Flip to text side", surface));
    expect(imageSide.getAttribute("aria-hidden")).toBe("true");
    expect(textSide.getAttribute("aria-hidden")).toBe("false");
    expect(surface.querySelectorAll(".reactive-flippable__side")).toHaveLength(2);
    expect(host.querySelector(".workspace-demo__toolbar span")?.textContent).toBe("revision 1");

    surface.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    expect(imageSide.getAttribute("aria-hidden")).toBe("false");
    expect(textSide.getAttribute("aria-hidden")).toBe("true");
    expect(host.querySelector(".workspace-demo__toolbar span")?.textContent).toBe("revision 2");
  });

  it("loads the YouTube player paused by default", () => {
    const host = mount();
    const video = host.querySelector(".reactive-video")!;
    const frame = video.querySelector("iframe")!;
    expect(frame.src).toContain("youtube-nocookie.com/embed/");
    expect(frame.src).toContain("autoplay=0");
    expect(frame.hasAttribute("autoplay")).toBe(false);
  });

  it("renders margin relations in named gutters and sticky tabs on the window edge", () => {
    const host = mount();
    expect(host.querySelector(".workspace-demo__windowbar")).not.toBeNull();
    expect(host.querySelector(".workspace-demo__stylebar")).not.toBeNull();
    expect(host.querySelector(".reactive-relation--leftMargin")?.textContent).toContain("Left margin note 1.");
    expect(host.querySelector(".reactive-relation--rightMargin")?.textContent).toContain("Right margin note 2a.");

    const sticky = host.querySelector(".reactive-sticky-tabs")!;
    expect(sticky.textContent).not.toContain("Test text for Sticky Tag #1 ...");
    click(button("Sticky tag #1", sticky));
    expect(sticky.textContent).toContain("Test text for Sticky Tag #1 ...");
    expect(button("Sticky tag #1", sticky).getAttribute("aria-selected")).toBe("true");
  });

  it("resizes the initial Document shell and exposes collapsed margins without editing the Document", async () => {
    const host = mount(), window = host.querySelector<HTMLElement>(".workspace-demo__window")!;
    window.getBoundingClientRect = () => ({ x: 100, y: 80, left: 100, top: 80, right: 900, bottom: 580, width: 800, height: 500, toJSON: () => ({}) });
    const handle = window.querySelector<HTMLElement>(".reactive-window__resize")!;
    handle.setPointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number) => handle.dispatchEvent(new MouseEvent(type, { button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    const revision = host.querySelector(".workspace-demo__toolbar span")?.textContent;

    pointer("pointerdown", 900, 580); pointer("pointermove", 800, 480);
    expect(window.style.width).toBe("700px"); expect(window.style.height).toBe("400px");
    pointer("pointerup", 800, 480);
    expect(host.querySelector(".workspace-demo__toolbar span")?.textContent).toBe(revision);

    const margins = host.querySelector<HTMLButtonElement>(".document-style-bar__margins")!;
    expect(margins.textContent).toBe("Margins (2)"); click(margins); await Promise.resolve();
    expect(window.querySelectorAll("[data-margin-drawer-item]")).toHaveLength(2);
    expect(host.querySelector(".workspace-demo__toolbar span")?.textContent).toBe(revision);
  });

  it("minimizes the demo document to the shared draggable document icon", () => {
    const host = mount(), win = host.querySelector<HTMLElement>(".workspace-demo__window")!;
    click(host.querySelector<HTMLButtonElement>('[aria-label="Minimize document window"]')!);
    const icon = host.querySelector<HTMLButtonElement>('[data-window-icon]')!;
    expect(icon.dataset.iconKind).toBe("document"); expect(icon.getAttribute("aria-label")).toContain("Restore Workspace sample document");
    expect(host.querySelector(".workspace-demo__document")).toBeNull();
    icon.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
    icon.dispatchEvent(new MouseEvent("pointermove", { button: 0, clientX: 130, clientY: 120, bubbles: true, cancelable: true }));
    icon.dispatchEvent(new MouseEvent("pointerup", { button: 0, clientX: 130, clientY: 120, bubbles: true, cancelable: true }));
    expect(win.style.transform).toBe("translate(30px, 20px)");
    click(icon); expect(host.querySelector("[data-window-icon]")).not.toBeNull();
    click(icon); expect(host.querySelector("[data-window-icon]")).toBeNull(); expect(host.querySelector(".workspace-demo__document")).not.toBeNull();
  });

  it("records editing and recreates pristine state on reset", () => {
    const host = mount();
    const original = "... and this is just a plain text block ...";
    const textarea = host.querySelector(".reactive-plain-text-block textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe(original);
    textarea.focus();
    textarea.value = `${original} changed`;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    expect(textarea.value).toContain("changed");
    expect(host.querySelector(".workspace-demo__toolbar span")?.textContent).toBe("revision 1");

    click(button("Reset demo", host));
    expect(host.querySelector(".reactive-plain-text-block textarea")).toBe(textarea);
    click(button("Discard changes"));
    const resetTextarea = host.querySelector(".reactive-plain-text-block textarea") as HTMLTextAreaElement;
    expect(resetTextarea).not.toBe(textarea);
    expect(resetTextarea.value).toBe(original);
    expect(host.querySelector(".workspace-demo__toolbar span")?.textContent).toBe("revision 0");
  });

  it("exposes distinct Workspace controls and opens them with browser-safe chords", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ workspaces: [] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const host = mount();
    expect(button("Open Workspace…", host).title).toContain("Ctrl+;");
    expect(button("Save Workspace…", host).title).toContain("Ctrl+;");
    const textarea = host.querySelector("textarea")!; textarea.focus();
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: ";", ctrlKey: true, bubbles: true, cancelable: true }));
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "o", bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Open Workspace"));
  });

  it("loads a whole Workspace into the canonical host and saves its manifest separately from its Document", async () => {
    const manifest = {
      kind: "speedy-workspace", schemaVersion: 1, workspaceId: "desk",
      documents: { doc: { documentId: "doc", source: { kind: "document-store", folder: "notes", filename: "Document.json" } } },
      root: { type: "workspace-block", children: [{ id: "background", type: "image-background-block", metadata: { url: "/image-backgrounds/green-aurora.jpg" }, children: [{ id: "window", type: "document-window-block", metadata: { title: "Loaded", position: { x: 12, y: 16 }, size: { w: 500, h: 400 }, state: "normal" }, children: [{ type: "document-reference-block", metadata: { documentId: "doc" } }] }] }] },
    };
    let savedBody: any;
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("listWorkspaces")) return new Response(JSON.stringify({ workspaces: ["Desk.json"] }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.includes("loadWorkspaceJson")) return new Response(JSON.stringify({ Success: true, Data: { workspace: manifest } }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.includes("loadDocumentJson")) return new Response(JSON.stringify({ Success: true, Data: { document: { id: "doc", type: "document-block", metadata: { documentId: "doc", folder: "notes", filename: "Document.json" }, children: [{ type: "plain-text-block", text: "Loaded Workspace document" }] } } }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.includes("saveWorkspaceBundle")) { savedBody = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ Success: true }), { status: 200, headers: { "Content-Type": "application/json" } }); }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetch);
    const host = mount(); click(button("Open Workspace…", host));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Desk.json"));
    click(document.querySelector<HTMLButtonElement>('[role="option"]')!); click(button("Open Workspace", document.querySelector('[role="dialog"]')!));
    await vi.waitFor(() => expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Loaded Workspace document"));
    expect(host.textContent).toContain("Desk.json · revision 0");

    click(button("Save Workspace", host));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Desk.json"));
    click(button("Save Workspace", document.querySelector('[role="dialog"]')!));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Replace Workspace"));
    click(button("Replace Workspace"));
    await vi.waitFor(() => expect(savedBody).toBeTruthy());
    expect(savedBody.workspace.root.children[0].type).toBe("image-background-block");
    expect(savedBody.workspace.root.children[0].children[0].children[0].type).toBe("document-reference-block");
    expect(JSON.stringify(savedBody.workspace)).not.toContain("Loaded Workspace document");
    expect(savedBody.documents[0].document.children[0].text).toBe("Loaded Workspace document");
  });
});
