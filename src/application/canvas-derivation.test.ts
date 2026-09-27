import { describe, expect, it } from "vitest";
import { materializeLocalWorkspace } from "../reactive-editor/workspace-manifest";
import { deriveCanvas } from "./canvas-derivation";
import type { ExistingBlockDto } from "../block-tree/types";

const fixture = (): ExistingBlockDto => ({ type: "workspace-block", children: [{ type: "image-background-block", metadata: { url: "/scene.jpg", future: 1 }, children: [
  { id: "window", type: "document-window-block", metadata: { position: { x: -120, y: 60 }, size: { w: 1000, h: 640 }, state: "minimized", zIndex: 9 }, children: [
    { id: "document", type: "document-block", children: [{ type: "plain-text-block", text: "Do not identify descendants" }] },
  ] },
  { id: "image", type: "image-block", metadata: { width: 400, height: 300 } },
  { id: "future", type: "future-block" },
] }] });

describe("Desktop to Canvas derivation", () => {
  it("uses expanded stored geometry, stops at objects and produces deterministic order/grid/camera", () => {
    const state = materializeLocalWorkspace(fixture()).state, before = structuredClone(state);
    const first = deriveCanvas(state), again = deriveCanvas(state);
    expect(first).toEqual(again); expect(state).toEqual(before);
    expect(first.identities).toEqual([]); expect(first.objects).toHaveLength(3);
    expect(first.canvas.placements.map(p => p.objectId)).toEqual(["block:image", "block:future", "block:window"]);
    expect(first.canvas.placements[2].bounds).toEqual({ x: -120, y: 60, width: 1000, height: 640 });
    expect(first.canvas.placements[0].bounds).toEqual({ x: 928, y: 32, width: 400, height: 300 });
    expect(first.canvas.placements[1].bounds.x).toBe(1360);
    expect(first.canvas.camera.zoom).toBeLessThan(1);
    expect(first.canvas.background).toEqual({ type: "image-background-block", metadata: { url: "/scene.jpg", future: 1 } });
  });
  it("allocates only missing workspace object identities in a candidate and gives empty Canvas a stable default", () => {
    const state = materializeLocalWorkspace({ type: "workspace-block", children: [{ type: "window-block", children: [{ type: "plain-text-block", text: "Child" }] }] }).state;
    const candidate = deriveCanvas(state, undefined, () => "allocated");
    expect(candidate.identities).toHaveLength(1);
    expect(candidate.identities[0].payload.id).toBe("allocated");
    expect(Object.values(state.contents).every(c => c.payload.id === undefined)).toBe(true);
    const empty = deriveCanvas(materializeLocalWorkspace({ type: "workspace-block" }).state);
    expect(empty.canvas).toEqual({ version: 1, camera: { x: 0, y: 0, zoom: 1 }, placements: [] });
  });
  it("rejects duplicate anchors and invalid geometry without mutation", () => {
    const dto = fixture(); dto.children![0].children!.push({ id: "image", type: "image-block" });
    const state = materializeLocalWorkspace(dto).state, before = JSON.stringify(state);
    expect(() => deriveCanvas(state)).toThrow("Ambiguous"); expect(JSON.stringify(state)).toBe(before);
    const invalid = fixture(); (invalid.children![0].children![0].metadata as any).size.w = 1e8;
    expect(() => deriveCanvas(materializeLocalWorkspace(invalid).state)).toThrow("geometry");
  });
  it("retains existing directory entries and refuses an existing intentionally empty layout", () => {
    const previous = { version: 1 as const, active: "desktop", objects: [{ id: "chosen-id", target: { kind: "block" as const, blockId: "window" }, future: true }, { id: "missing", target: { kind: "block" as const, blockId: "absent" } }], presentations: { desktop: { version: 1 as const, kind: "legacy-tree" as const } } };
    const state = materializeLocalWorkspace(fixture()).state;
    const result = deriveCanvas(state, previous);
    expect(result.objects.slice(0, 2)).toEqual(previous.objects);
    expect(result.canvas.placements[2].objectId).toBe("chosen-id");
    expect(() => deriveCanvas(state, { ...previous, presentations: { ...previous.presentations, canvas: { version: 1, camera: { x: 0, y: 0, zoom: 1 }, placements: [] } } })).toThrow("already exists");
  });
});
