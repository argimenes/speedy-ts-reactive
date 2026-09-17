import { describe, expect, it } from "vitest";
import { clone } from "../../block-tree/clone";
import { decodeDocument } from "../../block-tree/codecs";
import { TreeCommands } from "../../block-tree/commands";
import { captureBlocks, cloneBlocks } from "../../block-tree/clipboard";
import { resolveLinkedProperty } from "../../block-tree/linked-annotations";
import { CanonicalRepository } from "../../block-tree/repository";
import type { HistoryChanges } from "../../block-tree/compact-changes";
import type { DeepReadonly } from "../../block-tree/commit-capture";
import { externalDefinitionLink, type ExternalDefinitionLink } from "../../block-tree/external-reference";
import { projectOwned, replayResource, sameOwnedState, transition, type ResourceSnapshot } from "./resource";
import { decodeGateDocument, encodeGateDocument } from "./portable";
import { decodeWire, encodeWire } from "../preplan-spike/wire";

const link: ExternalDefinitionLink = { format: "codex-external-definition-gate", version: 1,
  target: { kind: "definition", targetId: "D", source: { scope: "workspace", resourceId: "workspace-resource" }, version: { kind: "unpinned" } } };
const annotation = (id: string) => ({ id, annotationId: "D", start: 0, end: 0, externalDefinition: clone(link) });

describe("Stage C G1 external definition provenance", () => {
  it("captures local annotation changes without foreign-only revisions and survives reorder, replacement, wire, save and undo", () => {
    const source = decodeDocument({ id: "workspace", type: "workspace-block", metadata: { workspaceId: "workspace-resource" },
      linkedAnnotations: { D: { type: "style/bold", value: "foreign-before" } }, children: [
        { id: "A", type: "document-block", linkedAnnotations: { D: { type: "style/italics", value: "local-conflict" } }, children: [
          { id: "p", type: "standoff-editor-block", text: "abc", standoffProperties: [annotation("one"), annotation("two")] },
        ] },
      ] }).state;
    const repository = new CanonicalRepository(source, { enforceBlockIdentity: true }), commands = new TreeCommands(repository, k => k);
    const key = (id: string) => Object.values(repository.readState().placements).find(p => repository.readState().contents[p.contentKey].payload.id === id)!.key;
    const root = repository.readState().placements[key("A")];
    const owned = new Map<string, string>(), ids = new Map<string, string>();
    // Unambiguous initial tree admission, before any references can cross resources.
    const claim = (pk: string) => {
      const p = source.placements[pk], c = source.contents[p.contentKey]; owned.set(c.key, "resource-A"); ids.set(pk, `semantic:${pk}`);
      [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)].forEach(claim);
    }; claim(root.key);
    const evidence = { contents: owned, placementIds: ids, externalTargets: new Map(), root: { key: root.key, contentKey: root.contentKey, placementId: ids.get(root.key)! } };
    let mirror = projectOwned(source, "resource-A", evidence, 0);
    const initial = mirror, errors: unknown[] = [], captured: DeepReadonly<HistoryChanges>[] = [];
    repository.subscribeHistoryChanges(event => {
      const after = projectOwned(repository.snapshot(), "resource-A", evidence, mirror.revision);
      const delta = transition(mirror, after, event);
      if (delta) {
        captured.push(event); mirror = replayResource(mirror, decodeWire(encodeWire(delta)) as typeof delta);
        const expected = clone(after) as ResourceSnapshot; expected.revision++;
        expect(sameOwnedState(mirror, expected)).toBe(true);
      }
    }, error => errors.push(error));
    expect(resolveLinkedProperty(repository.readState(), annotation("one")).value).toBe("foreign-before");
    commands.setPayloadField(repository.readState().rootPlacementKey, "linkedAnnotations", { D: { type: "style/bold", value: "foreign-after" } });
    expect(captured).toHaveLength(0); expect(sameOwnedState(initial, mirror)).toBe(true);
    commands.setPayloadField(repository.readState().rootPlacementKey, "linkedAnnotations", {});
    expect(captured).toHaveLength(0);
    commands.setPayloadField(key("p"), "standoffProperties", [annotation("two"), annotation("one")]);
    commands.setPayloadField(key("p"), "standoffProperties", [{ ...annotation("new"), start: 1, end: 1 }]);
    repository.undo(); repository.undo();
    expect(captured).toHaveLength(4);
    const saved = encodeGateDocument(mirror), reopened = decodeGateDocument(JSON.parse(JSON.stringify(saved)));
    const properties = Object.values(reopened.contents).find(c => c.payload.id === "p")!.payload.standoffProperties as any[];
    expect(properties.map(p => p.id)).toEqual(["one", "two"]);
    expect(properties.map(externalDefinitionLink)).toEqual([link.target, link.target]);
    expect(encodeGateDocument(reopened)).toEqual(saved);
    expect(errors).toEqual([]);
    expect(encodeWire(mirror)).not.toContain("foreign-after");
  });

  it("never substitutes a conflicting local definition and preserves provenance during canonical copy", () => {
    const state = decodeDocument({ id: "A", type: "document-block", metadata: { documentId: "resource-A" },
      linkedAnnotations: { D: { value: "wrong-local-value" } }, children: [
        { id: "p", type: "standoff-editor-block", text: "a", standoffProperties: [annotation("one")] },
      ] }).state;
    expect(resolveLinkedProperty(state, annotation("one"))).toEqual(annotation("one"));
    const paragraph = Object.values(state.placements).find(p => state.contents[p.contentKey].payload.id === "p")!;
    const copied = cloneBlocks(captureBlocks(state, [paragraph.key]));
    expect(copied.linkedAnnotations).toEqual({});
    const property = (Object.values(copied.state.contents).find(c => c.viewType === "standoff-editor-block")!.payload.standoffProperties as any[])[0];
    expect(property.id).not.toBe("one"); expect(property.annotationId).toBe("D");
    expect(externalDefinitionLink(property)).toEqual(link.target);
  });

  it("rejects stale/mismatched provenance and unknown required versions", () => {
    expect(() => externalDefinitionLink({ ...annotation("one"), annotationId: "other" })).toThrow("does not match");
    expect(() => externalDefinitionLink({ ...annotation("one"), externalDefinition: { ...link, version: 2 } })).toThrow("version");
    expect(externalDefinitionLink({ annotationId: "D", externalDefinition: { arbitrary: "opaque" } })).toBeUndefined();
  });
});
