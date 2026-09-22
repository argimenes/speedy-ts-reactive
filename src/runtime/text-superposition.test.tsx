// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { ReactiveTreeView } from "../rendering/reactive-tree-view";
import { registerCoreViews } from "../rendering/register-core-views";
import { textSuperpositionDemoDocument } from "../demo/text-superposition-demo";
import { createTextSuperposition, textSuperpositions } from "./text-superposition";

const cleanup: Array<() => void> = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); document.body.replaceChildren(); });

function mount() {
  const descriptor = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [{ left: 20, top: 20, width: 80, height: 18 }] });
  cleanup.push(() => descriptor ? Object.defineProperty(Range.prototype, "getClientRects", descriptor) : Reflect.deleteProperty(Range.prototype, "getClientRects"));
  const editor = new ReactiveEditor(textSuperpositionDemoDocument, { features: { textSuperposition: true } });
  registerCoreViews(editor);
  const projection = editor.createView("superposition-test");
  const host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host);
  const disposeGateway = editor.installGateway(document);
  cleanup.push(() => { disposeGateway(); dispose(); editor.dispose(); });
  return { editor, projection, host };
}

describe("text superposition", () => {
  it("projects a differently sized, styled alternative and keeps its real TextBlock in the measured editor layer", async () => {
    const { editor, host } = mount();
    await new Promise(resolve => setTimeout(resolve, 25));
    const projection = host.querySelector<HTMLElement>(".reactive-superposition-projection")!;
    expect(projection.textContent).toBe("frightened beyond reason");
    expect(projection.querySelector<HTMLElement>("span")?.style.fontStyle).toBe("italic");
    expect(host.querySelector(".reactive-standoff-flow")?.contains(projection)).toBe(true);
    const panel = host.querySelector<HTMLElement>(".reactive-superposition-editor")!;
    expect(panel).not.toBeNull();
    expect(host.querySelector(".reactive-standoff-flow")?.contains(panel)).toBe(false);
    const alternativeFlow = panel.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    expect(alternativeFlow.textContent).toBe("frightened beyond reason");
    expect(editor.encodeDocument().children?.[0].text).toContain("afraid");

    alternativeFlow.focus();
    const caret = document.createRange(); caret.setStart(alternativeFlow, alternativeFlow.childNodes.length); caret.collapse(true);
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(caret);
    alternativeFlow.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "!" }));
    await Promise.resolve();
    expect(panel.querySelector(".reactive-standoff-flow")?.textContent).toBe("frightened beyond reason!");
    expect((((editor.encodeDocument().children?.[0].relation as Record<string, any>)["superposition:demo-afraid"]) as any).text).toBe("frightened beyond reason!");

    panel.querySelector<HTMLButtonElement>("button")!.click();
    await Promise.resolve();
    expect(host.querySelector(".reactive-superposition-projection")).toBeNull();
    expect(host.querySelectorAll(".reactive-superposition-source-cell")).toHaveLength(0);
    expect(editor.encodeDocument().children?.[0].text).toContain("afraid");
  });

  it("creates, edits, switches, hides and reloads a genuine owned alternative Block", () => {
    const editor = new ReactiveEditor({ type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "We are afraid.", standoffProperties: [], children: [] }] }, { features: { textSuperposition: true } });
    registerCoreViews(editor); const projection = editor.createView("model-test");
    cleanup.push(() => editor.dispose());
    const owner = projection.state.nodes[projection.state.nodes[projection.state.rootKey].children[0]];
    const property = createTextSuperposition(editor, owner, 7, 12);
    const alternativeKey = owner.ownedRelations[property.alternatives[0]];
    expect(alternativeKey).toBeTruthy();
    editor.commands.replaceInlineRange(alternativeKey, 0, 0, "scared");
    expect(editor.commandRegistry.canExecute("superposition.toggleReading", { targetKey: alternativeKey, args: undefined })).toBe(true);
    editor.commandRegistry.execute("superposition.toggleReading", { targetKey: alternativeKey, args: undefined });
    editor.commandRegistry.execute("superposition.toggleVisibility", { targetKey: alternativeKey, args: undefined });
    const current = textSuperpositions(owner)[0];
    expect(current).toMatchObject({ active: property.alternatives[0], visible: false });
    const saved = editor.encodeDocument();
    expect((saved.children?.[0].relation as Record<string, any>)[property.alternatives[0]].text).toBe("scared");
    const restored = new ReactiveEditor(saved, { features: { textSuperposition: true } });
    expect(restored.encodeDocument()).toEqual(saved); restored.dispose();

    editor.commands.replaceInlineRange(owner.key, 7, 13, "");
    expect(textSuperpositions(owner)).toEqual([]);
    expect(owner.ownedRelations[property.alternatives[0]]).toBeUndefined();
  });

  it("keeps the experimental UI disabled by default while preserving persisted data", () => {
    const editor = new ReactiveEditor(textSuperpositionDemoDocument);
    expect(editor.features.textSuperposition).toBe(false);
    expect(editor.encodeDocument()).toEqual(textSuperpositionDemoDocument);
    editor.dispose();
  });
});
