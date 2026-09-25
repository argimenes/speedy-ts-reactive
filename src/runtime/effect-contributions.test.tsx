// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "../rendering/register-core-views";
import { ReactiveTreeView } from "../rendering/reactive-tree-view";
import type { MeasuredEffect } from "./effect-contributions";
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.reverse().forEach(fn => fn()); cleanup.length = 0; vi.restoreAllMocks(); document.body.replaceChildren(); });
it("shares frozen measured fragments and legacy lanes, without touching text/caret, and remeasures on disposal", async () => {
  const editor = new ReactiveEditor({ type: "document-block", children: [{ type: "standoff-editor-block", text: "abcd", standoffProperties: [
    { id: "rainbow", type: "style/rainbow", start: 0, end: 3 },
    { id: "a", type: "test/effect", start: 0, end: 3, metadata: { retained: true } },
    { id: "b", type: "test/effect", start: 0, end: 3 },
  ] }] });
  registerCoreViews(editor); const projection = editor.createView("effects");
  const measured: MeasuredEffect[] = [];
  const definition = { type: "test/effect", laneHeight: 2, render: (input: MeasuredEffect) => { measured.push(input); return [{ key: input.key, path: "M 0 0 H 20", stroke: "purple" }]; } };
  const release = editor.effects.register(definition);
  expect(() => editor.effects.register(definition)).toThrow("already registered");
  // jsdom has no layout; provide one actual range measurement per shared range.
  const measure = vi.fn(() => [{ left: 2, top: 3, width: 40, height: 18 }]);
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: measure });
  cleanup.push(() => { delete (Range.prototype as any).getClientRects; });
  const host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!, cells = [...flow.childNodes];
  flow.focus(); const range = document.createRange(); range.setStart(cells[1].firstChild!, 0); range.collapse(true); document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
  await vi.waitFor(() => expect(measured.length).toBeGreaterThanOrEqual(2));
  const [a, b] = measured.slice(-2);
  expect([a.offset, b.offset]).toEqual([15, 18]); expect(a.fragments).toBe(b.fragments);
  expect(Object.isFrozen(a.fragments)).toBe(true); expect(Object.isFrozen(a.fragments[0])).toBe(true); expect(Object.isFrozen(a.property.metadata)).toBe(true);
  expect(() => { (a.property.metadata as any).retained = false; }).toThrow();
  expect([...flow.childNodes]).toEqual(cells); expect(document.getSelection()!.anchorNode).toBe(cells[1].firstChild);
  release(); release(); await vi.waitFor(() => expect(host.querySelectorAll('[data-property-type="test/effect"]')).toHaveLength(0));
  expect(host.querySelectorAll('[data-property-type="style/rainbow"]')).toHaveLength(7);
  expect((editor.encodeDocument().children![0].standoffProperties as Record<string, any>[])[1].metadata).toEqual({ retained: true });
});
