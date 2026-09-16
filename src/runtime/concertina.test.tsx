// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "../rendering/register-core-views";
import { ReactiveTreeView } from "../rendering/reactive-tree-view";
import { deriveConcertinaPresentation } from "./concertina-derivation";
import { DEFAULT_CONCERTINA_SETTINGS, resolveConcertinaSettings } from "./concertina-settings";
import { blockKeysToPositionMarkers, entityRangesToPositionMarkers, normalisePositionMarkers, searchMatchesToPositionMarkers } from "./document-position-markers";
import { resolveSearchScope, type SearchRange } from "./text-search";

const cleanup: Array<() => void> = [];
afterEach(() => { while (cleanup.length) cleanup.pop()?.(); document.body.replaceChildren(); });

function setup() {
  const editor = new ReactiveEditor({ type: "document-block", children: [{ id: "page", type: "page-block", children: [
    { id: "a", type: "standoff-editor-block", text: "Alpha beta" },
    { id: "b", type: "standoff-editor-block", text: "No result" },
    { id: "c", type: "standoff-editor-block", text: "Alpha again" },
  ] }, { id: "other-page", type: "page-block", children: [
    { id: "other", type: "standoff-editor-block", text: "Alpha elsewhere" },
  ] }] });
  registerCoreViews(editor); const projection = editor.createView("concertina-test"), host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(item => item.payload.id === id)!;
  const range = (id: string, start: number, end: number): SearchRange => {
    const item = node(id);
    return { nodeKey: item.key, contentKey: item.contentKey, placementKey: item.placementKey, version: 0, start, end, coordinate: "cell" };
  };
  return { editor, projection, host, node, range };
}

describe("concertina marker pipeline", () => {
  it("normalises shared text, entity and Block markers without mutating source values", () => {
    const { node, range } = setup();
    const entity = entityRangesToPositionMarkers("entity-1", [range("a", 0, 5)]);
    const text = searchMatchesToPositionMarkers([{ id: "match-1", context: "Alpha", ranges: [range("c", 0, 5)] }]);
    const blocks = blockKeysToPositionMarkers([node("b").key]);
    const markers = normalisePositionMarkers([...entity, ...text, ...blocks, entity[0]]);
    expect(markers).toHaveLength(3);
    expect(markers.map(item => item.anchor.kind)).toEqual(["text-range", "text-range", "block"]);
    expect(markers[0].group).toBe("entity-1"); expect(markers[1].group).toBe("match-1");
    expect(Object.isFrozen(markers)).toBe(true); expect(Object.isFrozen(markers[0])).toBe(true);
  });

  it("uses validated immutable defaults with 48px context on both sides", () => {
    const input = { contextBeforePx: 64, maximumExcerptHeightPx: 100, preferredExcerptHeightPx: Number.NaN };
    const settings = resolveConcertinaSettings(input);
    expect(DEFAULT_CONCERTINA_SETTINGS.contextBeforePx).toBe(48);
    expect(DEFAULT_CONCERTINA_SETTINGS.contextAfterPx).toBe(48);
    expect(settings.contextBeforePx).toBe(64); expect(settings.contextAfterPx).toBe(48);
    expect(settings.maximumExcerptHeightPx).toBe(120); expect(settings.preferredExcerptHeightPx).toBe(120);
    expect(input.maximumExcerptHeightPx).toBe(100); expect(Object.isFrozen(settings)).toBe(true);
  });

  it("derives maximal unmatched branches and rejects stale/out-of-scope anchors", () => {
    const { editor, projection, node, range } = setup();
    const scope = resolveSearchScope(editor, node("a").key, "page");
    const markers = [...entityRangesToPositionMarkers("entity-1", [range("a", 0, 5)]), ...blockKeysToPositionMarkers(["missing"])];
    const derived = deriveConcertinaPresentation({ owner: "test", viewId: projection.viewId, scope, markers }, projection);
    expect(derived.protectedKeys.has(node("a").key)).toBe(true);
    expect(derived.hiddenBranchRoots).toEqual(new Set([node("b").key, node("c").key]));
    expect(derived.diagnostics).toHaveLength(1);
  });

  it("never applies a current-Page request to another Page", async () => {
    const { editor, node, range } = setup();
    const scope = resolveSearchScope(editor, node("a").key, "page");
    const otherRoot = editor.mounts.get(node("other").key)!.root as HTMLElement;
    const markers = entityRangesToPositionMarkers("alpha", [range("a", 0, 5), range("other", 0, 5)]);
    editor.concertina.activate({ owner: "page-only", viewId: scope.viewId, scope, markers });
    await vi.waitFor(() => expect((editor.mounts.get(node("b").key)!.root as HTMLElement).hidden).toBe(true));
    expect(otherRoot.hidden).toBe(false);
    expect(otherRoot.closest("[data-concertina-hidden]")).toBeNull();
    expect(editor.concertina.state.diagnostics).toContain("Ignored out-of-scope marker alpha:1.");
  });
});

describe("concertina session presentation", () => {
  it("hides unmatched Blocks, clips a tall match, then restores without history", async () => {
    const { editor, node } = setup();
    const a = editor.mounts.get(node("a").key)!.root as HTMLElement;
    const b = editor.mounts.get(node("b").key)!.root as HTMLElement;
    const surface = a.querySelector<HTMLElement>(".reactive-standoff-surface")!;
    Object.defineProperty(surface, "scrollHeight", { configurable: true, value: 500 });
    surface.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500, toJSON: () => ({}) });
    const cell = surface.querySelector<HTMLElement>(".reactive-standoff-flow > span")!;
    cell.getBoundingClientRect = () => ({ x: 0, y: 250, left: 0, top: 250, right: 80, bottom: 275, width: 80, height: 25, toJSON: () => ({}) });
    const scope = resolveSearchScope(editor, node("a").key, "page");
    const before = editor.repository.snapshot(), revision = editor.repository.state.revision;
    const range: SearchRange = { nodeKey: node("a").key, contentKey: node("a").contentKey, placementKey: node("a").placementKey, version: 0, start: 0, end: 1, coordinate: "cell" };
    editor.concertina.activate({ owner: "test", viewId: scope.viewId, scope, markers: entityRangesToPositionMarkers("entity", [range]) });
    await vi.waitFor(() => expect(b.hidden).toBe(true));
    expect(surface.classList.contains("reactive-concertina-viewport")).toBe(true);
    expect(surface.style.getPropertyValue("--concertina-height")).toBe("200px");
    expect(surface.scrollTop).toBeGreaterThan(0);
    expect(editor.repository.state.revision).toBe(revision);
    editor.concertina.deactivate("test");
    expect(b.hidden).toBe(false); expect(surface.classList.contains("reactive-concertina-viewport")).toBe(false);
    expect(editor.repository.snapshot()).toEqual(before);
  });
});
