// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";

const disposers: Array<() => void> = [];
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(() => {
  while (disposers.length) disposers.pop()?.();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("stable surface background", () => {
  it("changes the background descriptor without remounting content", () => {
    const editor = new ReactiveEditor({
      type: "workspace-block",
      children: [
        {
          id: "background",
          type: "image-background-block",
          metadata: { url: "/first.jpg" },
          children: [
            {
              id: "window",
              type: "document-window-block",
              metadata: { title: "Document", position: { x: 0, y: 0 }, size: { w: 400, h: 300 } },
              children: [
                {
                  id: "doc",
                  type: "document-block",
                  children: [{ id: "plain", type: "plain-text-block", text: "mounted", children: [] }],
                },
              ],
            },
          ],
        },
      ],
    });
    registerCoreViews(editor);
    const projection = editor.createView("surface-view");
    const host = document.body.appendChild(document.createElement("div"));
    const disposeRender = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host);
    disposers.push(disposeRender, () => editor.dispose());
    const textarea = host.querySelector("textarea")!;
    const root = projection.state.nodes[projection.state.rootKey];
    const background = projection.state.nodes[root.children[0]];

    editor.commands.setBackground(background.key, {
      id: "video-background",
      type: "video-background-block",
      metadata: { url: "/second.mp4" },
      children: [],
    });

    expect(host.querySelector("video")?.getAttribute("src")).toBe("/second.mp4");
    expect(host.querySelector("textarea")).toBe(textarea);
    const encoded = editor.encodeWorkspace();
    expect((encoded.children as any[])[0].type).toBe("video-background-block");
    expect((encoded.children as any[])[0].children[0].id).toBe("window");
  });
});
