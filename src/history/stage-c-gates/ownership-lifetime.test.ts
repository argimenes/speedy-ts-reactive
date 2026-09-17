/** Regression cases for the retained-definition lifetime counterexamples. */
import { describe, expect, it } from "vitest";
import { decodeDocument } from "../../block-tree/codecs";
import { TreeCommands } from "../../block-tree/commands";
import { CanonicalRepository } from "../../block-tree/repository";
import { normalizeDefinitionOwnership } from "../../block-tree/definition-ownership";
import type { HistoryChanges } from "../../block-tree/compact-changes";
import type { DeepReadonly } from "../../block-tree/commit-capture";
import { applyHistoryChanges } from "../replay";
import { projectOwned } from "./resource";
import { decodeGateDocument, encodeGateDocument } from "./portable";
import { openGateEditor } from "./editor";

function fixture(rich: boolean) {
  const initial = decodeDocument({ id: "W", type: "workspace-block", children: [
    { id: "A", type: "document-block", children: [] },
    { id: "B", type: "document-block", children: [
      { id: "P", type: rich ? "standoff-editor-block" : "plain-text-block", text: "owned by B" },
      { id: "Q", type: "plain-text-block", text: "unrelated sibling" },
    ] },
  ] }).state;
  const b = Object.values(initial.contents).find(c => c.payload.id === "B")!;
  const membership = new Map<string, string>();
  const assign = (ck: string) => {
    if (membership.has(ck)) return;
    membership.set(ck, b.key);
    const c = initial.contents[ck];
    [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)].forEach(pk => assign(initial.placements[pk].contentKey));
  }; assign(b.key);
  const repository = new CanonicalRepository(normalizeDefinitionOwnership(initial, membership), { enforceBlockIdentity: true });
  const commands = new TreeCommands(repository, k => k);
  const key = (id: string) => Object.values(repository.readState().placements).find(p => repository.readState().contents[p.contentKey].payload.id === id)!.key;
  const root = initial.placements[key("B")];
  const owners = new Map<string, string>(), ids = new Map<string, string>();
  // B owned these definitions before A created a reference. Ownership is not
  // guessed from the graph after the original B placement is removed.
  const claim = (pk: string) => {
    const p = initial.placements[pk], c = initial.contents[p.contentKey];
    owners.set(c.key, "resource-B"); ids.set(pk, `semantic:${pk}`);
    [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)].forEach(claim);
  }; claim(root.key);
  const originalPlacement = key("P"), pContentKey = initial.placements[originalPlacement].contentKey;
  commands.transclude(originalPlacement, { kind: "at", parentKey: key("A"), index: 0 });
  commands.remove(originalPlacement);
  const projected = projectOwned(repository.snapshot(), "resource-B", {
    contents: owners, placementIds: ids, externalTargets: new Map(),
    root: { key: root.key, placementId: ids.get(root.key)!, contentKey: root.contentKey },
  }, 0);
  return { repository, commands, key, projected, pContentKey };
}

describe("Stage C G1 retained definition lifetime", () => {
  it("opens B's unplaced rich definition without synthetic structural occurrences", () => {
    const s = fixture(true);
    expect(s.repository.readState().contents[s.pContentKey].payload.id).toBe("P");
    expect(s.projected.contents[s.pContentKey].inlineContent.length).toBeGreaterThan(0);
    expect(Object.values(s.projected.placements).some(p => p.target.kind === "local" && p.target.contentKey === s.pContentKey)).toBe(false);
    const saved = encodeGateDocument(s.projected);
    const reopened = decodeGateDocument(JSON.parse(JSON.stringify(saved)));
    expect(encodeGateDocument(reopened)).toEqual(saved);
    const editor = openGateEditor(reopened);
    const p = Object.values(editor.repository.readState().contents).find(c => c.payload.id === "P")!;
    expect(p.inlineContent).toHaveLength("owned by B".length);
    expect(Object.values(editor.repository.readState().placements).some(edge => edge.contentKey === p.key)).toBe(false);
    expect(encodeGateDocument(editor.snapshot())).toEqual(saved);
    editor.stop();
  });

  it.each([false, true])("retains unplaced definitions during unrelated edits and undo after reload (rich=%s)", rich => {
    const s = fixture(rich);
    const reopened = openGateEditor(decodeGateDocument(JSON.parse(JSON.stringify(encodeGateDocument(s.projected)))));
    try {
      const hasP = () => Object.values(reopened.repository.readState().contents).some(c => c.payload.id === "P");
      expect(hasP()).toBe(true);
      const commands = new TreeCommands(reopened.repository, k => k);
      const q = Object.values(reopened.repository.readState().placements).find(p => reopened.repository.readState().contents[p.contentKey].payload.id === "Q")!;
      commands.remove(q.key);
      s.commands.remove(s.key("Q"));
      expect(s.repository.readState().contents[s.pContentKey].payload.id).toBe("P");
      expect(hasP()).toBe(true);
      reopened.repository.undo(); expect(hasP()).toBe(true);
      reopened.repository.redo(); expect(hasP()).toBe(true);
      expect(reopened.errors).toEqual([]);
    } finally { reopened.stop(); }
  });

  it("deletes an unplaced definition explicitly and replays deletion/undo/redo exactly", () => {
    const editor = openGateEditor(decodeGateDocument(encodeGateDocument(fixture(true).projected)));
    const commands = new TreeCommands(editor.repository, k => k);
    const initial = editor.repository.snapshot();
    const p = Object.values(initial.contents).find(c => c.payload.id === "P")!;
    const q = Object.values(initial.contents).find(c => c.payload.id === "Q")!;
    expect(() => commands.deleteUnplacedDefinition(q.key)).toThrow("local placements");
    const events: DeepReadonly<HistoryChanges>[] = [];
    editor.repository.subscribeHistoryChanges(e => events.push(e), e => { throw e; });
    commands.deleteUnplacedDefinition(p.key);
    expect(editor.repository.readState().contents[p.key]).toBeUndefined();
    expect(p.inlineContent.every(pk => !editor.repository.readState().placements[pk])).toBe(true);
    editor.repository.undo();
    expect(editor.repository.readState().contents[p.key].definitionOwnerKey).toBe(p.definitionOwnerKey);
    expect(editor.repository.canUndo()).toBe(false);
    editor.repository.redo();
    let replay = initial;
    for (const event of events) replay = applyHistoryChanges(replay, event);
    expect(replay).toEqual(editor.repository.snapshot());
    expect(events.map(e => e.cause.kind)).toEqual(["edit", "undo", "redo"]);
    expect(editor.errors).toEqual([]); editor.stop();
  });
});
