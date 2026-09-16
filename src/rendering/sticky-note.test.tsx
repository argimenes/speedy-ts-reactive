// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import { createWorkspaceSaveBundle } from "../reactive-editor/workspace-manifest";
import { blockMenuItems } from "../runtime/block-menu-actions";
import { stickyNoteDto } from "../runtime/sticky-notes";

const cleanup: Array<() => void> = [];
afterEach(() => { while (cleanup.length) cleanup.pop()?.(); document.body.replaceChildren(); localStorage.clear(); });

function setup() {
  const editor = new ReactiveEditor({ id: "workspace", type: "workspace-block", children: [
    { id: "background", type: "image-background-block", metadata: { url: "/background.jpg" }, children: [] },
  ] });
  registerCoreViews(editor);
  const projection = editor.createView("sticky-test"), host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host);
  cleanup.push(() => { dispose(); editor.dispose(); });
  return { editor, projection, host };
}

describe("Sticky Note", () => {
  it("discards a blank draft without repository history or saved content", () => {
    const { editor, projection } = setup();
    const before = editor.repository.snapshot(), revision = editor.repository.state.revision;
    expect(editor.stickyNotes.create()).toBeTruthy();
    const draft = document.querySelector<HTMLElement>('.reactive-sticky-draft')!;
    expect(draft).toBeTruthy();
    const textarea = draft.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.value = "  \n "; textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(document.querySelector('.reactive-sticky-draft')).toBeTruthy();
    expect(editor.repository.state.revision).toBe(revision);
    draft.querySelector<HTMLButtonElement>('[aria-label="Close sticky note"]')!.click();
    expect(document.querySelector('.reactive-sticky-draft')).toBeNull();
    expect(editor.repository.snapshot()).toEqual(before);
    expect(editor.repository.canUndo()).toBe(false);
    expect(projection.state.nodes[projection.state.rootKey].children).toHaveLength(1);
  });

  it("promotes meaningful text, parks a non-empty note and reopens it", async () => {
    const { editor, projection, host } = setup();
    editor.stickyNotes.create();
    const textarea = document.querySelector<HTMLTextAreaElement>('.reactive-sticky-draft textarea')!;
    textarea.value = "Hello note";
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, data: "Hello note", inputType: "insertText" }));
    await vi.waitFor(() => expect(document.querySelector('.reactive-window--sticky')).toBeTruthy());
    expect(host.contains(document.querySelector('.reactive-window--sticky'))).toBe(false);
    expect((document.querySelector('.reactive-window--sticky') as HTMLElement).style.zIndex).toBe("10");
    expect(document.querySelector('.reactive-sticky-draft')).toBeNull();
    const window = Object.values(projection.state.nodes).find(node => node.viewType === "window-block" && (node.payload.metadata as any)?.stickyNote)!;
    const note = projection.state.nodes[window.children[0]];
    expect(note.viewType).toBe("sticky-note-block");
    expect(projection.state.nodes[note.children[0]].inlineContent.length).toBeGreaterThan(0);
    const bundle = await createWorkspaceSaveBundle(editor.repository.snapshot());
    expect(JSON.stringify(bundle.manifest.root)).toContain("sticky-note-block");
    expect(bundle.documents).toHaveLength(0);
    document.querySelector<HTMLButtonElement>('.reactive-window--sticky [aria-label="Close sticky note"]')!.click();
    expect(editor.stickyNotes.closedWindows()).toEqual([window.key]);
    expect(document.querySelector<HTMLElement>('.reactive-window--sticky')!.hidden).toBe(true);
    editor.stickyNotes.reopen(window.key);
    expect(document.querySelector<HTMLElement>('.reactive-window--sticky')!.hidden).toBe(false);
  });

  it("uses the browser-safe creation chord from a focused Block", () => {
    const { editor, projection } = setup();
    const background = projection.state.nodes[projection.state.nodes[projection.state.rootKey].children[0]];
    const mount = editor.mounts.get(background.key)!;
    mount.focusElement.focus();
    const uninstall = editor.installGateway(document);
    cleanup.push(uninstall);
    const first = new KeyboardEvent("keydown", { key: ";", ctrlKey: true, bubbles: true, cancelable: true });
    mount.focusElement.dispatchEvent(first);
    const second = new KeyboardEvent("keydown", { key: "n", bubbles: true, cancelable: true });
    mount.focusElement.dispatchEvent(second);
    expect(first.defaultPrevented).toBe(true);
    expect(second.defaultPrevented).toBe(true);
    expect(document.querySelector('.reactive-sticky-draft')).toBeTruthy();
  });

  it("exposes creation in the background and Document menus, and discards a cleared note", async () => {
    const { editor, projection } = setup();
    const background = projection.state.nodes[projection.state.nodes[projection.state.rootKey].children[0]];
    const backgroundItem = blockMenuItems(editor, background.key).find(item => item.label === "New Sticky Note");
    expect(backgroundItem?.disabled).toBe(false);
    backgroundItem?.run?.();
    const textarea = document.querySelector<HTMLTextAreaElement>('.reactive-sticky-draft textarea')!;
    textarea.value = "Temporary"; textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('.reactive-window--sticky')).toBeTruthy());
    const window = Object.values(projection.state.nodes).find(node => node.viewType === "window-block" && (node.payload.metadata as any)?.stickyNote)!;
    const text = projection.state.nodes[projection.state.nodes[window.children[0]].children[0]];
    editor.commands.replaceInlineRange(text.key, 0, text.inlineContent.length, "");
    document.querySelector<HTMLButtonElement>('.reactive-window--sticky [aria-label="Close sticky note"]')!.click();
    expect(editor.node(window.key)).toBeUndefined();
    expect(editor.stickyNotes.closedWindows()).toHaveLength(0);

    const placement = editor.commands.insert({ id: "doc", type: "document-block", children: [{ id: "paragraph", type: "standoff-editor-block", text: "Text" }] }, { kind: "at", parentKey: background.key, index: background.children.length });
    const documentNode = editor.nodeForPlacementInView(placement, projection.viewId)!;
    const menu = blockMenuItems(editor, documentNode.children[0]);
    expect(menu.find(item => item.label === "New Sticky Note")?.disabled).toBe(false);
    expect(menu.find(item => item.label === "Add Block")?.children?.some(item => item.label === "Insert Sticky Note Here")).toBe(true);
  });

  it("renders an embedded note in flow and persists its own resized dimensions", () => {
    const { editor, projection } = setup();
    const background = projection.state.nodes[projection.state.nodes[projection.state.rootKey].children[0]];
    const documentPlacement = editor.commands.insert({ id: "embedded-doc", type: "document-block", children: [] }, { kind: "at", parentKey: background.key, index: background.children.length });
    const documentNode = editor.nodeForPlacementInView(documentPlacement, projection.viewId)!;
    const notePlacement = editor.commands.insert(stickyNoteDto("In the page"), { kind: "at", parentKey: documentNode.key, index: 0 });
    const note = editor.nodeForPlacementInView(notePlacement, projection.viewId)!;
    const card = document.querySelector<HTMLElement>(`.reactive-sticky-note[data-client-id="${note.key}"]`)!;
    expect(card).toBeTruthy();
    expect(card.style.height).toBe("280px");
    const handle = card.querySelector<HTMLElement>('[aria-label="Resize sticky note"]')!;
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect((editor.node(note.key)!.payload.metadata as any).size).toEqual({ width: 280, height: 290 });
    expect(card.style.height).toBe("290px");
  });
});
