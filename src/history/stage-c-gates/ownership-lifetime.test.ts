/** Passing counterexample tests, not passing G1 exit criteria. See gate report. */
import { describe, expect, it } from "vitest";
import { decodeDocument } from "../../block-tree/codecs";
import { TreeCommands } from "../../block-tree/commands";
import { CanonicalRepository } from "../../block-tree/repository";
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
  const repository = new CanonicalRepository(initial, { enforceBlockIdentity: true });
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

describe("Stage C G1 ownership lifetime counterexamples", () => {
  it("cannot open B's retained unplaced rich definition using the current rooted editor invariant", () => {
    const s = fixture(true);
    expect(s.repository.readState().contents[s.pContentKey].payload.id).toBe("P");
    expect(s.projected.contents[s.pContentKey].inlineContent.length).toBeGreaterThan(0);
    expect(Object.values(s.projected.placements).some(p => p.target.kind === "local" && p.target.contentKey === s.pContentKey)).toBe(false);
    const saved = encodeGateDocument(s.projected);
    const reopened = decodeGateDocument(JSON.parse(JSON.stringify(saved)));
    expect(encodeGateDocument(reopened)).toEqual(saved);
    // A semantic definition-table round trip succeeds, but the actual editor
    // rejects the owned inline placements not reachable from B's structural root.
    expect(() => openGateEditor(reopened)).toThrow("unreachable from the root");
  });

  it("silently prunes an unplaced leaf after standalone reload, although the same Workspace edit retains it", () => {
    const s = fixture(false);
    const reopened = openGateEditor(decodeGateDocument(JSON.parse(JSON.stringify(encodeGateDocument(s.projected)))));
    try {
      const hasP = () => Object.values(reopened.repository.readState().contents).some(c => c.payload.id === "P");
      expect(hasP()).toBe(true);
      const commands = new TreeCommands(reopened.repository, k => k);
      const q = Object.values(reopened.repository.readState().placements).find(p => reopened.repository.readState().contents[p.contentKey].payload.id === "Q")!;
      commands.remove(q.key);
      s.commands.remove(s.key("Q"));
      // Same explicit operation on Q, different lifetime for B-owned P, solely
      // because A's foreign placement is absent from the reopened repository.
      expect(s.repository.readState().contents[s.pContentKey].payload.id).toBe("P");
      expect(hasP()).toBe(false);
      reopened.repository.undo(); expect(hasP()).toBe(true);
      expect(reopened.errors).toEqual([]);
    } finally { reopened.stop(); }
  });
});
