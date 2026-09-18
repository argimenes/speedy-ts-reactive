// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import { HistoricalPreview } from "./block-history";
import { BlockHistorySession } from "../runtime/block-history";
import { createSessionHistorySource, type HistorySelectionResult, type ReadonlyHistorySession } from "../history/ui-session-source";

const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); document.body.replaceChildren(); vi.restoreAllMocks(); });
function setup() {
  const editor = new ReactiveEditor({ id: "doc", type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "Hello", standoffProperties: [{ id: "bold", type: "style/bold", start: 0, end: 1 }] }] });
  registerCoreViews(editor);
  const view = editor.createView("history-test"), key = Object.values(view.state.nodes).find(n => n.payload.id === "p")!.key;
  const host = document.body.appendChild(document.createElement("div"));
  cleanup.push(() => editor.dispose(), render(() => <ReactiveTreeView editor={editor} projection={view} />, host));
  editor.installGateway(document);
  return { editor, view, key, host };
}
const ready = (editor: ReactiveEditor) => vi.waitFor(() => { expect(editor.blockHistory.state.error).toBe(""); expect(editor.blockHistory.state.result).toBeDefined(); });

describe("initial Block history panel", () => {
  it("opens from the Block menu, records edit/undo/redo, selects past states and restores focus without mutation", async () => {
    const { editor, key, host } = setup();
    editor.focus.request(key); editor.mounts.get(key)!.restoreInlineSelection!({ anchor: 1, head: 3 });
    const initial = editor.repository.snapshot();
    host.querySelector<HTMLElement>('[data-block-id="p"]')!.dispatchEvent(new MouseEvent("contextmenu", { button: 2, bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector(".reactive-block-menu")).not.toBeNull());
    const history = [...document.querySelectorAll<HTMLButtonElement>('.reactive-block-menu button')].find(b => b.textContent === "History…")!;
    expect(history.disabled).toBe(false); history.click(); await ready(editor);
    expect(document.querySelector(".reactive-block-menu")).toBeNull();
    expect(document.querySelector('[role="dialog"][aria-label="Block history"]')).not.toBeNull();
    expect(document.querySelector(".block-history-badge")?.textContent).toBe("Session-only");
    expect(editor.blockHistory.state.entries).toHaveLength(1);
    expect(editor.repository.snapshot()).toEqual(initial); expect(editor.repository.canUndo()).toBe(false);
    document.querySelector<HTMLElement>(".block-history-panel")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect(editor.focus.state.focusedKey).toBe(key));
    expect(editor.mounts.get(key)!.captureInlineSelection!()).toEqual({ anchor: 1, head: 3 });

    editor.commands.replaceInlineRange(key, 5, 5, "!"); editor.repository.undo(); editor.repository.redo();
    const current = editor.repository.snapshot();
    editor.commandRegistry.execute("history.open", { targetKey: key, args: undefined }); await ready(editor);
    expect(editor.blockHistory.state.entries.map(e => e.cause)).toEqual(["baseline", "edit", "undo", "redo"]);
    const baseline = document.querySelector<HTMLButtonElement>("[data-history-revision]")!; baseline.focus(); baseline.click();
    await vi.waitFor(() => expect(document.querySelector('[aria-label="Selected historical state"] .block-history-text')?.textContent).toBe("Hello"));
    expect(document.querySelector('[aria-label="Latest recorded state"] .block-history-text')?.textContent).toBe("Hello!");
    expect(document.querySelector('.block-history-comparison-summary')?.textContent).toContain("Content or properties changed");
    expect(document.querySelector('.block-history-text .history-bold')?.textContent).toBe("He");
    baseline.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('[aria-label="Selected historical state"] .block-history-text')?.textContent).toBe("Hello!"));
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
    expect(editor.repository.snapshot()).toEqual(current);
    expect(document.querySelector('.block-history-panel [contenteditable=true], .block-history-panel textarea, .block-history-panel iframe')).toBeNull();
    const preview = document.querySelector<HTMLElement>('.block-history-preview')!; preview.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }); preview.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false); // Native Tab can reach Recording status.
    const summary = document.querySelector<HTMLElement>('.block-history-panel summary')!; summary.focus();
    summary.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close Block history");
  });

  it("ignores superseded and closed asynchronous results even if a source resolves after cancellation", async () => {
    const { editor, key } = setup();
    const pending = new Map<string, (value: HistorySelectionResult) => void>();
    const result = (id: string): HistorySelectionResult => { const selected = { status: "unknown-block" as const, revisionId: id, blockId: "p" }; return { selected, comparison: { before: selected, after: selected, comparable: false, changes: [] } }; };
    const session: ReadonlyHistorySession = { storage: "session-only", headRevisionId: "latest", status: "available", message: "Session-only", timeline: async () => ({ headRevisionId: "latest", entries: [] }), select: id => new Promise(resolve => pending.set(id, resolve)) };
    const dispose = vi.fn();
    const controller = new BlockHistorySession(editor, () => ({ open: async () => session, dispose })); cleanup.push(() => controller.dispose());
    controller.open(key); await vi.waitFor(() => expect(pending.has("latest")).toBe(true));
    const old = controller.select("old"), newer = controller.select("new");
    pending.get("new")!(result("new")); await newer;
    pending.get("old")!(result("old")); await old;
    expect(controller.state.result?.selected.revisionId).toBe("new");
    const closing = controller.select("closed"); controller.close(false); pending.get("closed")!(result("closed")); await closing;
    expect(controller.state.open).toBe(false); expect(controller.state.result).toBeUndefined();
    pending.get("latest")!(result("latest")); await Promise.resolve();
    expect(controller.state.result).toBeUndefined();
  });

  it("renders a historical subtree with inert tool placeholders and literal text", async () => {
    const editor = new ReactiveEditor({ id: "doc", type: "document-block", children: [
      { id: "p", type: "plain-text-block", text: "<img src=x onerror=alert(1)>" },
      { id: "timer", type: "timer-block", metadata: { running: true } },
      { id: "remote", type: "iframe-block", metadata: { url: "https://example.invalid/" } },
    ] });
    cleanup.push(() => editor.dispose());
    const source = createSessionHistorySource(editor.repository, editor.repository.state.rootPlacementKey); cleanup.push(() => source.dispose());
    const session = await source.open({ blockId: "doc" }), selection = await session.select(session.headRevisionId);
    const host = document.body.appendChild(document.createElement("div"));
    cleanup.push(render(() => <HistoricalPreview result={selection.selected} />, host));
    expect(host.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(host.querySelectorAll('.block-history-placeholder')).toHaveLength(2);
    expect(host.querySelector('iframe,img,audio,video,input,textarea,[contenteditable]')).toBeNull();
  });
});
