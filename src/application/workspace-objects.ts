import type { ContentRecord, RepositoryState } from "../block-tree/types";
import type { WorkspaceObject, WorkspacePresentation } from "../reactive-editor/workspace-presentation";

const containers = new Set(["workspace-block", "workspace-object-bank-block", "image-background-block", "video-background-block", "youtube-video-background-block", "canvas-background-block"]);
const objectId = (target: WorkspaceObject["target"]) => `${target.kind}:${encodeURIComponent(target.kind === "block" ? target.blockId : target.documentId)}`;

/** Shared authored-root discovery only; no presentation geometry or admission policy. */
export function discoverWorkspaceObjects(state: RepositoryState, previous?: WorkspacePresentation, allocate: () => string = () => crypto.randomUUID()) {
  const candidates: ContentRecord[] = [], identities: ContentRecord[] = [];
  let background: { type: string; metadata: Record<string, unknown> } | undefined;
  const walk = (key: string) => {
    const content = state.contents[state.placements[key].contentKey];
    if (containers.has(content.viewType)) {
      if (!background && !["workspace-block", "workspace-object-bank-block"].includes(content.viewType)) background = { type: content.viewType, metadata: structuredClone(content.payload.metadata ?? {}) as Record<string, unknown> };
      content.children.forEach(walk);
    } else candidates.push(content);
  };
  walk(state.rootPlacementKey);
  if (new Set(candidates.map(content => content.key)).size !== candidates.length) throw new Error("Ambiguous repeated workspace object occurrence.");
  const blockAnchors = new Map<string, number>();
  const index = (key: string) => {
    const c = state.contents[state.placements[key].contentKey];
    if (["document-block", "document-reference-block"].includes(c.viewType)) return;
    if (typeof c.payload.id === "string") blockAnchors.set(c.payload.id, (blockAnchors.get(c.payload.id) ?? 0) + 1);
    [...c.children, ...Object.values(c.ownedRelations)].forEach(index);
  };
  index(state.rootPlacementKey);
  const objects = structuredClone(previous?.objects ?? []), targets = new Set<string>();
  const entries = candidates.map((content, sourceOrder) => {
    const meta = (content.payload.metadata ?? {}) as Record<string, any>;
    const document = content.viewType === "document-block" || content.viewType === "document-reference-block";
    let id = document ? meta.documentId ?? content.payload.id : content.payload.id;
    if (id === undefined) {
      id = allocate();
      if (blockAnchors.has(id)) throw new Error(`Allocated identity collides with an existing Block: ${id}.`);
      blockAnchors.set(id, 1);
      identities.push({ ...content, payload: document ? { ...content.payload, metadata: { ...meta, documentId: id } } : { ...content.payload, id } });
    }
    if (typeof id !== "string" || !id.trim()) throw new Error("A workspace object has an invalid authored identity.");
    if (!document && (blockAnchors.get(id) ?? 0) > 1) throw new Error(`Ambiguous workspace object anchor: ${id}.`);
    const target: WorkspaceObject["target"] = document ? { kind: "document", documentId: id } : { kind: "block", blockId: id };
    const anchor = objectId(target);
    if (targets.has(anchor)) throw new Error(`Ambiguous workspace object anchor: ${id}.`);
    targets.add(anchor);
    const hosted = objects.filter(object => object.desktopHostBlockId === id && objectId(object.target) !== anchor);
    if (hosted.length) {
      const inner = content.children.length === 1 ? state.contents[state.placements[content.children[0]].contentKey] : undefined;
      if (!inner || hosted.some(object => object.target.kind === "block" ? inner.payload.id !== object.target.blockId : ((inner.payload.metadata as any)?.documentId ?? inner.payload.id) !== object.target.documentId)) throw new Error(`Desktop host mapping does not match its owned object: ${id}.`);
    }
    const matches = objects.filter(object => objectId(object.target) === anchor || hosted.includes(object));
    if (matches.length > 1) throw new Error(`Multiple directory objects target ${id}.`);
    let object = matches[0];
    if (!object) {
      if (objects.some(item => item.id === anchor)) throw new Error(`Directory identity collision: ${anchor}.`);
      object = { id: anchor, target, label: String(meta.title ?? content.viewType) }; objects.push(object);
    }
    return { object, content, sourceOrder };
  });
  return { objects, entries, identities, background };
}
