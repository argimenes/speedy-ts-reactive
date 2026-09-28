import type { AnchorCapabilities, AnchorRecord } from "../../feature-api/anchors";
import type { BlockNode } from "../../block-tree/types";

export function anchorRecord(value: unknown): AnchorRecord | undefined {
  const record = value as AnchorRecord | undefined;
  if (record?.version !== 1 || typeof record.blockId !== "string" || !record.blockId ||
      !Number.isFinite(record.offset?.x) || !Number.isFinite(record.offset?.y)) return;
  return record;
}
export const metadataAnchor = (node?: BlockNode) => (node?.payload.metadata as { anchor?: unknown } | undefined)?.anchor;
export function documentNodes(port: Pick<AnchorCapabilities, "node" | "path">, key: string) {
  const document = [...port.path(key)].reverse().find(node => node.viewType === "document-block");
  const nodes: BlockNode[] = [];
  const visit = (node?: BlockNode) => {
    if (!node || nodes.some(item => item.key === node.key)) return;
    if (node !== document && node.viewType === "document-block") return;
    nodes.push(node);
    for (const child of [...node.children, ...Object.values(node.ownedRelations)]) visit(port.node(child));
  };
  visit(document);
  return { document, nodes };
}
export function allowedTarget(port: Pick<AnchorCapabilities, "node" | "path" | "eligible">, key: string, targetKey: string): boolean {
  if (!port.eligible(key) || key === targetKey) return false;
  const { document, nodes } = documentNodes(port, key), target = nodes.find(node => node.key === targetKey);
  if (!document || !target || anchorRecord(metadataAnchor(target))) return false;
  const source = port.node(key);
  // Do not create a chain by turning an existing anchor into an anchored Block.
  if (typeof source?.payload.id === "string" && nodes.some(node => anchorRecord(metadataAnchor(node))?.blockId === source.payload.id)) return false;
  if (target === document) return true;
  if (!port.eligible(targetKey)) return false;
  return !port.path(key).some(node => node.key === targetKey) && !port.path(targetKey).some(node => node.key === key);
}
export function resolveAnchor(port: Pick<AnchorCapabilities, "node" | "path" | "eligible">, key: string, record: AnchorRecord) {
  const { document, nodes } = documentNodes(port, key);
  const targets = nodes.filter(node => node.payload.id === record.blockId);
  if (!document || targets.length !== 1 || !allowedTarget(port, key, targets[0].key)) return;
  return { document: document.key, target: targets[0].key };
}
