import { clone } from "../block-tree/clone";
import { decodeBlockTree, encodeDocument, encodeWorkspace } from "../block-tree/codecs";
import { validateRepository } from "../block-tree/repository";
import type { ContentKey, ExistingBlockDto, PlacementKey, RepositoryState } from "../block-tree/types";

export interface WorkspaceDocumentSource {
  kind: "document-store";
  folder: string;
  filename: string;
}

export interface WorkspaceDocumentResource {
  documentId: string;
  title?: string;
  source: WorkspaceDocumentSource;
  contentHash?: string;
  [name: string]: unknown;
}

export interface WorkspaceManifest {
  kind: "speedy-workspace";
  schemaVersion: 1;
  workspaceId: string;
  documents: Record<string, WorkspaceDocumentResource>;
  root: ExistingBlockDto;
  [name: string]: unknown;
}

export interface WorkspaceDocumentRegistration extends WorkspaceDocumentResource {
  contentKey?: ContentKey;
}

export interface WorkspaceDocumentWrite {
  documentId: string;
  source: WorkspaceDocumentSource;
  document: ExistingBlockDto;
  contentHash: string;
  expectedContentHash?: string;
}

export interface WorkspaceSaveBundle {
  manifest: WorkspaceManifest;
  documents: WorkspaceDocumentWrite[];
}

export interface WorkspaceLoadIssue {
  documentId: string;
  kind: "missing" | "invalid" | "identity-mismatch" | "changed";
  message: string;
}

export interface LoadedWorkspace {
  state: RepositoryState;
  manifest?: WorkspaceManifest;
  workspaceId?: string;
  references: WorkspaceDocumentRegistration[];
  issues: WorkspaceLoadIssue[];
  legacy: boolean;
}

export class WorkspaceManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceManifestError";
  }
}

function object(value: unknown, message: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceManifestError(message);
  return value as Record<string, any>;
}

function text(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new WorkspaceManifestError(message);
  return value;
}

function metadata(payload: Record<string, unknown>): Record<string, any> {
  const value = payload.metadata;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

export function validateDocumentSource(value: unknown): WorkspaceDocumentSource {
  const source = object(value, "A Workspace Document source must be an object.");
  if (source.kind !== "document-store") throw new WorkspaceManifestError(`Unsupported Workspace Document source: ${String(source.kind)}.`);
  const folder = text(source.folder, "A Workspace Document source needs a folder.");
  const filename = text(source.filename, "A Workspace Document source needs a filename.");
  if (folder.includes("\\") || folder.includes("\0") || folder.startsWith("/") || folder.split("/").includes("..")) {
    throw new WorkspaceManifestError("A Workspace Document folder must stay inside the Document store.");
  }
  if (/[\\/\0]/.test(filename) || filename.startsWith(".") || !/\.json$/i.test(filename)) {
    throw new WorkspaceManifestError("A Workspace Document filename must be a JSON filename without path separators.");
  }
  return { kind: "document-store", folder, filename };
}

function visitDto(dto: ExistingBlockDto, visit: (dto: ExistingBlockDto) => void): void {
  visit(dto);
  if (Array.isArray(dto.children)) dto.children.forEach(child => visitDto(child, visit));
  if (dto.relation && typeof dto.relation === "object") {
    for (const name of ["leftMargin", "rightMargin"]) {
      const related = dto.relation[name];
      if (related && typeof related === "object" && !Array.isArray(related)) visitDto(related as ExistingBlockDto, visit);
    }
  }
}

export function parseWorkspaceManifest(value: unknown): WorkspaceManifest {
  const input = object(value, "The Workspace file must contain a JSON object.");
  if (input.kind !== "speedy-workspace") throw new WorkspaceManifestError("The file is not a versioned Speedy Workspace manifest.");
  if (input.schemaVersion !== 1) throw new WorkspaceManifestError(`Unsupported Workspace schema version: ${String(input.schemaVersion)}.`);
  const workspaceId = text(input.workspaceId, "The Workspace needs a stable workspaceId.");
  const root = object(input.root, "The Workspace manifest needs a root Block.") as ExistingBlockDto;
  if (root.type !== "workspace-block") throw new WorkspaceManifestError("The Workspace root must be a workspace-block.");
  const rawDocuments = object(input.documents, "The Workspace manifest needs a Document resource table.");
  const documents: Record<string, WorkspaceDocumentResource> = {};
  const destinations = new Set<string>();
  for (const [key, raw] of Object.entries(rawDocuments)) {
    const resource = object(raw, `Workspace Document ${key} must be an object.`);
    const documentId = text(resource.documentId, `Workspace Document ${key} needs a documentId.`);
    if (documentId !== key) throw new WorkspaceManifestError(`Workspace Document key ${key} does not match documentId ${documentId}.`);
    const source = validateDocumentSource(resource.source);
    const destination = `${source.folder}/${source.filename}`.toLocaleLowerCase();
    if (destinations.has(destination)) throw new WorkspaceManifestError(`More than one Workspace Document targets ${source.folder}/${source.filename}.`);
    destinations.add(destination);
    documents[key] = { ...clone(resource), documentId, source } as WorkspaceDocumentResource;
  }
  visitDto(root, block => {
    if (block.type === "document-block" || block.type === "main-list-block" || block.type === "membrane-block") {
      throw new WorkspaceManifestError("A versioned Workspace manifest cannot embed Document content.");
    }
    if (block.type !== "document-reference-block") return;
    const documentId = text(metadata(block).documentId, "A Document reference needs a documentId.");
    if (!documents[documentId]) throw new WorkspaceManifestError(`Document reference ${documentId} has no resource entry.`);
    if (Array.isArray(block.children) && block.children.length) throw new WorkspaceManifestError(`Document reference ${documentId} cannot own children.`);
  });
  return { ...clone(input), kind: "speedy-workspace", schemaVersion: 1, workspaceId, documents, root: clone(root) } as WorkspaceManifest;
}

export function isWorkspaceManifest(value: unknown): value is WorkspaceManifest {
  return !!value && typeof value === "object" && !Array.isArray(value) && (value as any).kind === "speedy-workspace";
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonical((value as any)[key])}`).join(",")}}`;
}

export async function workspaceContentHash(document: ExistingBlockDto): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(document)));
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function workspaceDocumentContentKeys(state: RepositoryState): ContentKey[] {
  const result: ContentKey[] = [];
  const seenPlacements = new Set<PlacementKey>();
  const seenDocuments = new Set<ContentKey>();
  const walk = (placementKey: PlacementKey) => {
    if (seenPlacements.has(placementKey)) return;
    seenPlacements.add(placementKey);
    const placement = state.placements[placementKey];
    const content = placement && state.contents[placement.contentKey];
    if (!content) return;
    if (content.viewType === "document-block") {
      if (!seenDocuments.has(content.key)) result.push(content.key);
      seenDocuments.add(content.key);
      return;
    }
    content.children.forEach(walk);
    Object.values(content.ownedRelations).forEach(walk);
  };
  walk(state.rootPlacementKey);
  return result;
}

function sourceFor(contentKey: ContentKey, payload: Record<string, unknown>, registrations: WorkspaceDocumentRegistration[]): WorkspaceDocumentSource {
  const meta = metadata(payload);
  const documentId = String(meta.documentId ?? payload.id ?? "");
  const registered = registrations.find(item => item.contentKey === contentKey || item.documentId === documentId);
  if (registered) return validateDocumentSource(registered.source);
  if (typeof meta.folder === "string" && typeof meta.filename === "string") {
    return validateDocumentSource({ kind: "document-store", folder: meta.folder, filename: meta.filename });
  }
  throw new WorkspaceManifestError(`Document ${documentId || contentKey} has no external file location. Save the Document before saving its Workspace.`);
}

export async function createWorkspaceSaveBundle(
  state: RepositoryState,
  registrations: WorkspaceDocumentRegistration[] = [],
  workspaceId: string = globalThis.crypto.randomUUID(),
): Promise<WorkspaceSaveBundle> {
  const rootContent = state.contents[state.placements[state.rootPlacementKey]?.contentKey];
  if (rootContent?.viewType !== "workspace-block") throw new WorkspaceManifestError("Save Workspace requires a workspace-block root.");
  const encoded = encodeWorkspace(state);
  const documents: WorkspaceDocumentWrite[] = [];
  const resources: Record<string, WorkspaceDocumentResource> = {};
  const identityOwners = new Map<string, ContentKey>();

  const externalize = async (placementKey: PlacementKey, dto: ExistingBlockDto): Promise<ExistingBlockDto> => {
    const placement = state.placements[placementKey];
    const content = placement && state.contents[placement.contentKey];
    if (!content) throw new WorkspaceManifestError(`Workspace contains a missing placement ${placementKey}.`);
    if (content.viewType === "document-reference-block") {
      const documentId = text(metadata(content.payload).documentId, "An unresolved Document reference needs a documentId.");
      const registered = registrations.find(item => item.documentId === documentId);
      if (!registered) throw new WorkspaceManifestError(`Document reference ${documentId} has no registered external location.`);
      resources[documentId] = {
        ...clone(registered),
        contentKey: undefined,
        documentId,
        source: validateDocumentSource(registered.source),
      };
      delete (resources[documentId] as Record<string, unknown>).contentKey;
      return { type: "document-reference-block", metadata: { documentId } };
    }
    if (content.viewType === "document-block") {
      const meta = metadata(content.payload);
      const documentId = text(meta.documentId ?? content.payload.id, `Document ${content.key} needs a stable documentId.`);
      const source = sourceFor(content.key, content.payload, registrations);
      const identityOwner = identityOwners.get(documentId);
      if (identityOwner && identityOwner !== content.key) {
        throw new WorkspaceManifestError(`Different live Documents claim the same documentId ${documentId}.`);
      }
      identityOwners.set(documentId, content.key);
      if (!resources[documentId]) {
        const document = encodeDocument(state, placementKey);
        const documentMetadata = metadata(document as Record<string, unknown>);
        document.metadata = { ...documentMetadata, documentId, folder: source.folder, filename: source.filename };
        delete (document.metadata as Record<string, unknown>).loadFromExternal;
        const contentHash = await workspaceContentHash(document);
        const registered = registrations.find(item => item.contentKey === content.key || item.documentId === documentId);
        resources[documentId] = {
          documentId,
          ...(registered?.title || meta.title ? { title: String(registered?.title ?? meta.title) } : {}),
          source,
          contentHash,
        };
        documents.push({
          documentId,
          source,
          document,
          contentHash,
          ...(registered?.contentHash ? { expectedContentHash: registered.contentHash } : {}),
        });
      } else if (JSON.stringify(resources[documentId].source) !== JSON.stringify(source)) {
        throw new WorkspaceManifestError(`Document ${documentId} is registered at more than one location.`);
      }
      return { type: "document-reference-block", metadata: { documentId } };
    }
    const output = clone(dto);
    if (Array.isArray(output.children)) {
      const children: ExistingBlockDto[] = [];
      for (let index = 0; index < output.children.length; index += 1) {
        children.push(await externalize(content.children[index], output.children[index]));
      }
      output.children = children;
    }
    if (output.relation && typeof output.relation === "object") {
      for (const [name, relatedPlacement] of Object.entries(content.ownedRelations)) {
        const related = output.relation[name];
        if (related && typeof related === "object" && !Array.isArray(related)) {
          output.relation[name] = await externalize(relatedPlacement, related as ExistingBlockDto);
        }
      }
    }
    return output;
  };

  const root = await externalize(state.rootPlacementKey, encoded);
  const manifest = parseWorkspaceManifest({ kind: "speedy-workspace", schemaVersion: 1, workspaceId, documents: resources, root });
  return { manifest, documents };
}

function dtoIdentity(dto: ExistingBlockDto): string | undefined {
  const meta = metadata(dto as Record<string, unknown>);
  return typeof meta.documentId === "string" ? meta.documentId : typeof dto.id === "string" ? dto.id : undefined;
}

export function documentIdentity(dto: ExistingBlockDto): string | undefined {
  return dtoIdentity(dto);
}

export function materializeWorkspace(
  manifest: WorkspaceManifest,
  loaded: Map<string, ExistingBlockDto>,
  issues: WorkspaceLoadIssue[] = [],
): LoadedWorkspace {
  const references: WorkspaceDocumentRegistration[] = [];
  const expand = (dto: ExistingBlockDto): ExistingBlockDto => {
    if (dto.type === "document-reference-block") {
      const documentId = String(metadata(dto as Record<string, unknown>).documentId ?? "");
      const resource = manifest.documents[documentId];
      const document = loaded.get(documentId);
      if (!resource || !document) return clone(dto);
      const copy = clone(document);
      copy.metadata = { ...metadata(copy as Record<string, unknown>), documentId };
      return copy;
    }
    const copy = clone(dto);
    if (Array.isArray(copy.children)) copy.children = copy.children.map(expand);
    if (copy.relation && typeof copy.relation === "object") {
      for (const name of ["leftMargin", "rightMargin"]) {
        const related = copy.relation[name];
        if (related && typeof related === "object" && !Array.isArray(related)) copy.relation[name] = expand(related as ExistingBlockDto);
      }
    }
    return copy;
  };
  const decoded = decodeBlockTree(expand(manifest.root));
  const state = decoded.state;
  const first = new Map<string, ContentKey>();
  const ordered: PlacementKey[] = [];
  const walk = (key: PlacementKey, active = new Set<ContentKey>()) => {
    const placement = state.placements[key];
    const content = placement && state.contents[placement.contentKey];
    if (!content || active.has(content.key)) return;
    ordered.push(key);
    const next = new Set(active).add(content.key);
    content.children.forEach(child => walk(child, next));
    Object.values(content.ownedRelations).forEach(child => walk(child, next));
  };
  walk(state.rootPlacementKey);
  for (const placementKey of ordered) {
    const placement = state.placements[placementKey];
    const content = placement && state.contents[placement.contentKey];
    if (!content || content.viewType !== "document-block") continue;
    const documentId = String(metadata(content.payload).documentId ?? content.payload.id ?? "");
    const resource = manifest.documents[documentId];
    if (!resource) continue;
    const existing = first.get(documentId);
    if (!existing) {
      first.set(documentId, content.key);
      references.push({ ...clone(resource), contentKey: content.key });
      continue;
    }
    const descendants = new Set<PlacementKey>();
    const contents = new Set<ContentKey>();
    const collect = (key: PlacementKey) => {
      const childPlacement = state.placements[key];
      const childContent = childPlacement && state.contents[childPlacement.contentKey];
      if (!childContent || contents.has(childContent.key)) return;
      descendants.add(key); contents.add(childContent.key);
      childContent.children.forEach(collect);
      childContent.inlineContent.forEach(collect);
      Object.values(childContent.ownedRelations).forEach(collect);
    };
    content.children.forEach(collect);
    content.inlineContent.forEach(collect);
    Object.values(content.ownedRelations).forEach(collect);
    descendants.forEach(key => delete state.placements[key]);
    contents.forEach(key => delete state.contents[key]);
    delete state.contents[content.key];
    state.placements[placementKey] = { ...placement, contentKey: existing, kind: "reference" };
  }
  for (const resource of Object.values(manifest.documents)) {
    if (!references.some(reference => reference.documentId === resource.documentId)) references.push(clone(resource));
  }
  validateRepository(state);
  return { state, manifest: clone(manifest), workspaceId: manifest.workspaceId, references, issues: clone(issues), legacy: false };
}

export interface LegacyWorkspaceReferences {
  root: ExistingBlockDto;
  resources: Record<string, WorkspaceDocumentResource>;
}

export function extractLegacyWorkspaceReferences(dto: ExistingBlockDto): LegacyWorkspaceReferences {
  const resources: Record<string, WorkspaceDocumentResource> = {};
  const convert = (block: ExistingBlockDto): ExistingBlockDto => {
    const meta = metadata(block as Record<string, unknown>);
    if (["document-block", "main-list-block", "membrane-block"].includes(String(block.type)) && meta.loadFromExternal === true) {
      const documentId = String(meta.documentId ?? block.id ?? globalThis.crypto.randomUUID());
      const source = validateDocumentSource({ kind: "document-store", folder: meta.folder ?? "data", filename: meta.filename });
      resources[documentId] = { documentId, ...(meta.title ? { title: String(meta.title) } : {}), source };
      return { type: "document-reference-block", metadata: { documentId } };
    }
    const copy = clone(block);
    if (Array.isArray(copy.children)) copy.children = copy.children.map(convert);
    if (copy.relation && typeof copy.relation === "object") {
      for (const name of ["leftMargin", "rightMargin"]) {
        const related = copy.relation[name];
        if (related && typeof related === "object" && !Array.isArray(related)) copy.relation[name] = convert(related as ExistingBlockDto);
      }
    }
    return copy;
  };
  return { root: convert(dto), resources };
}
