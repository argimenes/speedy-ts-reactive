// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { ContainerBlockView } from "./container-block-view";
import { PlainTextBlockView } from "./plain-text-block-view";
import { ReactiveTreeView } from "./reactive-tree-view";

const disposers: Array<() => void> = [];
afterEach(() => {
  while (disposers.length) disposers.pop()?.();
  document.body.replaceChildren();
});

describe("PlainTextBlockView", () => {
  it("records native input once and updates a linked view", async () => {
    const editor = new ReactiveEditor({
      type: "document-block",
      children: [
        {
          id: "plain-1",
          type: "plain-text-block",
          text: "Editable notes",
          metadata: {},
          blockProperties: [],
          children: [],
        },
      ],
    });
    editor.registry.register({
      type: "document-block",
      view: ContainerBlockView,
      capabilities: ["container"],
    });
    editor.registry.register({
      type: "plain-text-block",
      view: PlainTextBlockView,
      capabilities: ["native-text"],
    });
    const first = editor.createView("first-view");
    const second = editor.createView("second-view");
    const firstHost = document.body.appendChild(document.createElement("div"));
    const secondHost = document.body.appendChild(document.createElement("div"));
    const disposeFirst = render(() => <ReactiveTreeView editor={editor} projection={first} />, firstHost);
    const disposeSecond = render(() => <ReactiveTreeView editor={editor} projection={second} />, secondHost);
    const disposeGateway = editor.installGateway(document);
    disposers.push(disposeGateway, disposeFirst, disposeSecond, () => editor.dispose());

    const firstTextarea = firstHost.querySelector("textarea")!;
    const secondTextarea = secondHost.querySelector("textarea")!;
    firstTextarea.focus();
    firstTextarea.value = "Editable notes!";
    firstTextarea.setSelectionRange(15, 15);
    firstTextarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));

    expect(editor.repository.state.revision).toBe(1);
    expect(secondTextarea.value).toBe("Editable notes!");
    expect((editor.encodeDocument().children as any[])[0].text).toBe("Editable notes!");
    expect((editor.encodeDocument().metadata as any).focus).toEqual({
      blockId: "plain-1",
      caret: 15,
    });
    expect(editor.mounts.selection(first.state.nodes[first.state.rootKey].children[0])).toEqual({
      start: 15,
      end: 15,
      direction: "none",
    });
  });

  it("keeps Enter native inside the textarea", () => {
    const editor = new ReactiveEditor({
      type: "document-block",
      children: [{ type: "plain-text-block", text: "line" }],
    });
    editor.registry.register({ type: "document-block", view: ContainerBlockView, capabilities: [] });
    editor.registry.register({ type: "plain-text-block", view: PlainTextBlockView, capabilities: [] });
    const projection = editor.createView();
    const host = document.body.appendChild(document.createElement("div"));
    const disposeRender = render(
      () => <ReactiveTreeView editor={editor} projection={projection} />,
      host,
    );
    const disposeGateway = editor.installGateway(document);
    disposers.push(disposeGateway, disposeRender, () => editor.dispose());
    const textarea = host.querySelector("textarea")!;
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    textarea.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
