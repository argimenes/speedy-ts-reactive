/** Shared G3 command fixture; not imported by the application. */
import { decodeDocument } from "../../block-tree/codecs";
import { normalizeDefinitionOwnership } from "../../block-tree/definition-ownership";
import { CanonicalRepository } from "../../block-tree/repository";
import { TreeCommands } from "../../block-tree/commands";
import { projectOwned } from "./resource";
import { IncrementalResourceCapture } from "./incremental";

export function costFixture(length: number) {
  const raw = decodeDocument({ id: "document", type: "document-block", children: [{ id: "paragraph", type: "standoff-editor-block", text: "x".repeat(length) }] }).state;
  const root = raw.placements[raw.rootPlacementKey];
  const state = normalizeDefinitionOwnership(raw, new Map(Object.keys(raw.contents).map(key => [key, root.contentKey])));
  for (const p of Object.values(state.placements)) if (p.kind !== "inline") p.placementId = `semantic:${p.key}`;
  const evidence = { contents: new Map(Object.keys(state.contents).map(key => [key, "resource-g3"])), placementIds: new Map<string, string>(), externalTargets: new Map(),
    root: { key: root.key, contentKey: root.contentKey, placementId: state.placements[root.key].placementId! } };
  const repository = new CanonicalRepository(state, { enforceBlockIdentity: true }), commands = new TreeCommands(repository, k => k);
  const paragraphKey = state.contents[root.contentKey].children[0];
  const baseline = projectOwned(state, "resource-g3", evidence, 0), capture = new IncrementalResourceCapture(baseline);
  return { repository, commands, baseline, capture, edit(index: number) {
    const at = [0, Math.floor(length / 2), length - 1][index % 3];
    commands.replaceInlineRange(paragraphKey, at, at + 1, index % 2 ? "Y" : "Z");
  }, final() {
    // Full projection is a final oracle only, never a commit callback.
    const current = repository.snapshot();
    const contents = new Map(Object.keys(current.contents).map(key => [key, "resource-g3"]));
    return projectOwned(current, "resource-g3", { ...evidence, contents }, capture.localRevision);
  } };
}
