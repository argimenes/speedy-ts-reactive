import { describe, expect, it } from "vitest";
import { encodeWorkspace } from "../block-tree/codecs";
import {
  createWorkspaceSaveBundle,
  extractLegacyWorkspaceReferences,
  materializeWorkspace,
  parseWorkspaceManifest,
  workspaceContentHash,
  type WorkspaceManifest,
} from "./workspace-manifest";
import { ReactiveEditor } from "./editor";

const document = {
  id: "document-block-id",
  type: "document-block",
  metadata: { documentId: "document-one", folder: "research", filename: "Notes.json" },
  children: [{ id: "text", type: "standoff-editor-block", text: "Independent content", standoffProperties: [] }],
};

const workspace = {
  id: "workspace-one",
  type: "workspace-block",
  future: { retained: true },
  children: [{
    id: "background",
    type: "video-background-block",
    metadata: { url: "/video-backgrounds/rain.mp4", future: 1 },
    children: [{
      id: "window-one",
      type: "document-window-block",
      metadata: { position: { x: 20, y: 40 }, size: { w: 600, h: 500 }, state: "minimized", zIndex: 7 },
      children: [document],
    }],
  }],
};

describe("Workspace manifests", () => {
  it("externalizes Documents while preserving the BackgroundBlock and window layout", async () => {
    const editor = new ReactiveEditor(workspace);
    const bundle = await createWorkspaceSaveBundle(editor.repository.snapshot(), [], "workspace-one");
    expect(bundle.documents).toHaveLength(1);
    expect(bundle.documents[0].document).toMatchObject({
      type: "document-block",
      metadata: { documentId: "document-one", folder: "research", filename: "Notes.json" },
      children: [{ text: "Independent content" }],
    });
    expect(bundle.manifest).toMatchObject({
      kind: "speedy-workspace",
      schemaVersion: 1,
      workspaceId: "workspace-one",
      root: {
        future: { retained: true },
        children: [{
          type: "video-background-block",
          metadata: { url: "/video-backgrounds/rain.mp4", future: 1 },
          children: [{
            type: "document-window-block",
            metadata: { state: "minimized", zIndex: 7 },
            children: [{ type: "document-reference-block", metadata: { documentId: "document-one" } }],
          }],
        }],
      },
    });
    expect(JSON.stringify(bundle.manifest)).not.toContain("Independent content");
    expect(bundle.documents[0].contentHash).toBe(await workspaceContentHash(bundle.documents[0].document));
    editor.dispose();
  });

  it("hydrates repeated references as placements of one shared Document content record", async () => {
    const hash = await workspaceContentHash(document);
    const manifest: WorkspaceManifest = parseWorkspaceManifest({
      kind: "speedy-workspace", schemaVersion: 1, workspaceId: "workspace-one",
      documents: { "document-one": { documentId: "document-one", source: { kind: "document-store", folder: "research", filename: "Notes.json" }, contentHash: hash } },
      root: { type: "workspace-block", children: [{ type: "canvas-background-block", children: [
        { type: "document-window-block", id: "a", children: [{ type: "document-reference-block", metadata: { documentId: "document-one" } }] },
        { type: "document-window-block", id: "b", children: [{ type: "document-reference-block", metadata: { documentId: "document-one" } }] },
      ] }] },
    });
    const loaded = materializeWorkspace(manifest, new Map([["document-one", document]]));
    const placements = Object.values(loaded.state.placements).filter(placement => loaded.state.contents[placement.contentKey]?.viewType === "document-block");
    expect(placements).toHaveLength(2);
    expect(new Set(placements.map(placement => placement.contentKey)).size).toBe(1);
    expect(placements.map(placement => placement.kind).sort()).toEqual(["owned", "reference"]);
    const reopened = new ReactiveEditor(loaded);
    const saved = await createWorkspaceSaveBundle(reopened.repository.snapshot(), loaded.references, loaded.workspaceId);
    expect(saved.documents).toHaveLength(1);
    expect((saved.manifest.root.children?.[0].children?.[1].children?.[0] as any).type).toBe("document-reference-block");
    reopened.dispose();
  });

  it("rejects embedded Documents and converts legacy external stubs explicitly", () => {
    expect(() => parseWorkspaceManifest({
      kind: "speedy-workspace", schemaVersion: 1, workspaceId: "w", documents: {}, root: workspace,
    })).toThrow("cannot embed Document content");
    const legacy = extractLegacyWorkspaceReferences({
      type: "workspace-block",
      children: [{ type: "image-background-block", children: [{ type: "document-window-block", children: [{
        id: "legacy-document", type: "document-block", metadata: { loadFromExternal: true, folder: "archive", filename: "Old.json" }, children: [],
      }] }] }],
    });
    expect(legacy.resources["legacy-document"].source).toEqual({ kind: "document-store", folder: "archive", filename: "Old.json" });
    expect((legacy.root.children?.[0].children?.[0].children?.[0] as any).type).toBe("document-reference-block");
  });

  it("keeps unresolved resources as explicit references on a subsequent save", async () => {
    const manifest = parseWorkspaceManifest({
      kind: "speedy-workspace", schemaVersion: 1, workspaceId: "workspace-one",
      documents: { missing: { documentId: "missing", source: { kind: "document-store", folder: "research", filename: "Missing.json" } } },
      root: { type: "workspace-block", children: [{ type: "image-background-block", children: [{ type: "document-window-block", children: [{ type: "document-reference-block", metadata: { documentId: "missing" } }] }] }] },
    });
    const loaded = materializeWorkspace(manifest, new Map(), [{ documentId: "missing", kind: "missing", message: "Not found" }]);
    const bundle = await createWorkspaceSaveBundle(loaded.state, loaded.references, loaded.workspaceId);
    expect(bundle.documents).toEqual([]);
    expect(bundle.manifest.documents.missing.source.filename).toBe("Missing.json");
    expect(() => encodeWorkspace(loaded.state)).not.toThrow();
  });
});
