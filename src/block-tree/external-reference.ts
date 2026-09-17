/** Stage C G1 candidate. Internal semantic reference, not a frozen wire schema. */
export interface ExternalTarget {
  kind: "block" | "definition" | "asset";
  targetId: string;
  source: { scope: "document" | "workspace"; resourceId: string } | { scope: "unknown" };
  version: { kind: "unpinned" } | { kind: "revision"; memoirId: string; segmentId: string; revisionId: string };
  targetPlacementId?: string;
  targetRoute?: readonly string[];
}

export interface ExternalDefinitionLink {
  format: "codex-external-definition-gate";
  version: 1;
  target: ExternalTarget;
}

/** Provenance travels with the authored annotation element, so reorder/undo do
 * not bind an old array index to a different reference. Unknown tags are data. */
export function externalDefinitionLink(property: Record<string, unknown>): ExternalTarget | undefined {
  const value = property.externalDefinition as ExternalDefinitionLink | undefined;
  if (!value || value.format !== "codex-external-definition-gate") return;
  if (value.version !== 1) throw new Error("Unsupported external definition link version");
  validateTarget(value.target);
  if (value.target.kind !== "definition" || value.target.targetId !== property.annotationId) {
    throw new Error("External definition provenance does not match the authored reference");
  }
  return value.target;
}

export function externalAssetLink(property: Record<string, unknown>): ExternalTarget | undefined {
  const value = property.externalAsset as { format?: string; version?: number; target?: unknown } | undefined;
  if (!value || value.format !== "codex-external-asset-gate") return;
  if (value.version !== 1) throw new Error("Unsupported external asset link version");
  validateTarget(value.target);
  if (value.target.kind !== "asset" || value.target.targetId !== property.assetId) throw new Error("External asset provenance does not match the authored reference");
  return value.target;
}

function requireValid(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error(`External reference: ${reason}`);
}
const id = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
export function validateTarget(value: unknown): asserts value is ExternalTarget {
  requireValid(value !== null && typeof value === "object" && !Array.isArray(value), "invalid target descriptor");
  const target = value as ExternalTarget;
  requireValid(["block", "definition", "asset"].includes(target.kind) && id(target.targetId), "invalid external identity");
  requireValid(target.source && (target.source.scope === "unknown" ||
    ["document", "workspace"].includes(target.source.scope) && "resourceId" in target.source && id(target.source.resourceId)), "invalid source identity");
  requireValid(target.version && (target.version.kind === "unpinned" || target.version.kind === "revision" &&
    id(target.version.memoirId) && id(target.version.segmentId) && id(target.version.revisionId)), "invalid version evidence");
  requireValid(target.targetPlacementId === undefined || id(target.targetPlacementId), "invalid target placement");
  requireValid(target.targetRoute === undefined || Array.isArray(target.targetRoute) && target.targetRoute.every(id), "invalid target route");
}
