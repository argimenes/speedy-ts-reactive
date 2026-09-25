import { expect, it, vi } from "vitest";
import type { TextOperationCapabilities, TextSelectionSnapshot } from "../../feature-api";
import { GroupSelection } from "./controller";
function fixture() {
  const range = { nodeKey: "a", contentKey: "content", placementKey: "placement", coordinate: "cell" as const, version: 1, start: 0, end: 3 };
  let beforeChange = () => {};
  const ports: TextOperationCapabilities = {
    ranges: { validate: vi.fn(), snapshot: (_, start, end) => ({ ...range, start, end }) },
    queries: { text: key => ({ key, viewId: "view", length: 10 }), view: () => "view", documentScope: () => "document", contains: (scope, key) => scope === "document" && key === "a" },
    annotations: { apply: vi.fn(() => ({ type: "style/bold", added: 1, references: [{ nodeKey: "a", id: "annotation" }] })) },
    edits: { delete: vi.fn(() => ({ nodeKey: "a", index: 0 })) },
    selection: { clearLive: vi.fn(), finish: vi.fn(), restoreCaret: vi.fn(), cancelGesture: vi.fn() },
    visibility: { active: () => false, ranges: () => [], removeAt: () => false, clear: vi.fn() },
    decorations: { set: vi.fn(), clear: vi.fn() },
    register: { gesture: vi.fn(), operation: vi.fn(), beforeChange: listener => { beforeChange = listener; }, command: vi.fn(), toolbar: vi.fn() },
  };
  const controller = new GroupSelection(ports); controller.attach();
  const snapshot: TextSelectionSnapshot = { ranges: [range], head: { nodeKey: "a", index: 3 } };
  return { controller, ports, snapshot, change: () => beforeChange() };
}
it("runs accumulation and completion against capabilities without an editor or DOM", () => {
  const { controller, ports, snapshot } = fixture();
  expect(controller.captureCurrent(snapshot)).toBe(true);
  expect(controller.captureCurrent(snapshot)).toBe(false);
  expect(controller.ranges()).toEqual(snapshot.ranges);
  expect(ports.selection.finish).toHaveBeenCalledWith(snapshot);
  expect(controller.removeAt("a", 1)).toBe(true); expect(controller.ranges()).toEqual([]);
  expect(ports.edits.delete).not.toHaveBeenCalled();
});
it("cancels on an external document change without acquiring edit authority", () => {
  const { controller, ports, snapshot, change } = fixture();
  controller.captureCurrent(snapshot); change();
  expect(controller.active()).toBe(false); expect(ports.selection.cancelGesture).toHaveBeenCalled();
  expect(ports.edits.delete).not.toHaveBeenCalled();
});
it("rejects stale deletion and semantic entity annotation without mutating", () => {
  const { controller, ports, snapshot } = fixture(); controller.captureCurrent(snapshot);
  expect(() => controller.apply("codex/entity-reference")).toThrow("Entity Reference");
  expect(ports.annotations.apply).not.toHaveBeenCalled();
  vi.mocked(ports.ranges.validate).mockImplementation(() => { throw Error("stale"); });
  expect(controller.deleteSelected("a")).toBe(true); expect(ports.edits.delete).not.toHaveBeenCalled();
  expect(controller.ranges()).toEqual([]);
});
