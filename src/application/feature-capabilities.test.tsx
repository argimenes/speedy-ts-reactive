// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createEffect } from "solid-js";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { ReactiveTreeView } from "../rendering/reactive-tree-view";
import { registerCoreViews } from "../rendering/register-core-views";
import { blockFeatureCapabilities } from "./feature-capabilities";
import type { BlockFeatureCapabilities, BlockRuntime } from "../feature-api";

describe("feature and Block runtime adapters", () => {
  it("provides self-bound detached reactive reads and cancels effects/deferred focus on disposal", async () => {
    const editor = new ReactiveEditor({ id: "doc", type: "document-block", children: [{ id: "owned", type: "pilot-block", setting: { count: 1 } }] });
    registerCoreViews(editor);
    const view = editor.createView(), key = Object.values(view.state.nodes).find(node => node.payload.id === "owned")!.key;
    let ports!: BlockFeatureCapabilities, runtime!: BlockRuntime;
    const counts: number[] = [];
    editor.featureHost.activate({ id: "pilot", activate(scope) {
      ports = blockFeatureCapabilities(editor, scope);
      ports.register.block({ type: "pilot-block", create: () => ({ type: "pilot-block" }), capabilities: [], view: props => {
        runtime = props.runtime;
        createEffect(() => counts.push((runtime.field("setting") as { count: number }).count));
        return null;
      } });
    } });
    const host = document.body.appendChild(document.createElement("div"));
    const dispose = render(() => <ReactiveTreeView editor={editor} projection={view} />, host);
    try {
      expect(runtime.nodeKey).toBe(key);
      const read = runtime.field("setting") as { count: number }; read.count = 100;
      expect(runtime.field("setting")).toEqual({ count: 1 });
      runtime.setField("setting", { count: 2 }, "Update");
      expect(counts).toEqual([1, 2]);
      expect(() => ports.blocks.insert({ type: "foreign-block" }, { kind: "at", parentKey: view.state.rootKey, index: 0 })).toThrow("unowned");
      ports.blocks.focusPlacement(editor.node(key)!.placementKey, view.viewId);
      editor.featureHost.dispose(); await Promise.resolve();
      expect(editor.focus.state.focusedKey).toBeUndefined();
      expect(() => runtime.setField("setting", {}, "After disposal")).toThrow("disposed");
      editor.commands.setPayloadField(key, "setting", { count: 3 });
      expect(counts).toEqual([1, 2]);
    } finally { dispose(); editor.dispose(); host.remove(); }
  });
});
