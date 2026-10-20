// @vitest-environment jsdom
/** Boundary probes against the unchanged D1 contract. No proposed v5 validator. */
import { describe, expect, it } from "vitest";
import { desktopOf, importLegacyDesktop, validateManagedDesktop } from "../../src/persistence/managed-desktop";
import { materializeLocalWorkspace, createWorkspaceSaveBundle, materializeWorkspace, workspaceContentHash } from "../../src/reactive-editor/workspace-manifest";
import { WorkspaceSession } from "../../src/application/workspace-session";

function fixture() {
  const root = importLegacyDesktop({
    id: "workspace", type: "workspace-block", children: [
      { id: "flint-window", type: "window-block", children: [
        { id: "flint", type: "flint-application-block", children: [
          { id: "row", type: "tab-row-block", children: [
            { id: "tab-a", type: "tab-block", metadata: { documentTarget: { version: 1, documentId: "document-a" } }, children: [] },
            { id: "tab-b", type: "tab-block", metadata: { documentTarget: { version: 1, documentId: "document-b" } }, children: [] },
          ] },
        ] },
      ] },
      { id: "bank", type: "workspace-object-bank-block", children: ["a", "b"].map(id => ({
        id: `root-${id}`, type: "document-block", metadata: { documentId: `document-${id}`, filename: `${id}.json`, folder: "." },
        children: [{ id: `text-${id}`, type: "standoff-editor-block", text: `Document ${id}` }],
      })) },
    ],
  }, block => ({ anchor: block.id, view: `view-${crypto.randomUUID()}`, window: `window-${crypto.randomUUID()}` }));
  const d = desktopOf(root)!;
  d.version = 4;
  d.layouts = [];
  d.layout = { kind: "split-tree", version: 1, floating: d.windows.map(w => w.restoreKey), normalOrder: d.windows.map(w => w.restoreKey), pinnedOrder: [] };
  root.metadata.workspacePresentation.presentations.desktop = d;
  return { kind: "speedy-local-workspace", schemaVersion: 2, workspaceId: "e1-proof", root };
}

describe("E1.0 unchanged D1 persistence boundaries", () => {
  it("captures the Flint application anchor, not each internal Document session", () => {
    const value = fixture(), d = validateManagedDesktop(desktopOf(value.root));
    expect(d.views).toHaveLength(1);
    expect(d.windows).toHaveLength(1);
    expect(d.views[0].appId).toBe("flint");
    expect(d.views[0].resources).toEqual([]);
    expect(value.root.children[0].children[0].children[0].children).toHaveLength(2);
  });

  it("rejects a standalone Document view record with no desktop window", () => {
    const d = structuredClone(desktopOf(fixture().root)!);
    d.views.push({ ...d.views[0], restoreKey: `view-${crypto.randomUUID()}`, anchorBlockId: "inner-document", appId: "ink", resources: [{ kind: "document", scope: "workspace", documentId: "document-a" }] });
    expect(() => validateManagedDesktop(d)).toThrow("Orphan view descriptor");
  });

  it("rejects two window records owning the same view record", () => {
    const d = structuredClone(desktopOf(fixture().root)!);
    d.windows.push({ ...d.windows[0], restoreKey: `window-${crypto.randomUUID()}` });
    expect(() => validateManagedDesktop(d)).toThrow("Missing or multiply-owned view descriptor");
  });

  it("unknown extension data is preserved but does not validate host relationships", () => {
    const d: any = structuredClone(desktopOf(fixture().root)!);
    // Deliberately impossible references. Acceptance is a negative control:
    // forward-compatible JSON retention is not a host-contract validator.
    d.documentHosts = [{ view: "missing-view", host: { kind: "flint-tab", applicationView: "missing-app" } }];
    expect(validateManagedDesktop(d).documentHosts).toEqual(d.documentHosts);
    expect(validateManagedDesktop(d).windows).toHaveLength(1);
  });

  it("current readers reject the proposed future Desktop version before interpretation", () => {
    const value = fixture();
    value.root.metadata.workspacePresentation.presentations.desktop.version = 5;
    expect(() => materializeLocalWorkspace(value)).toThrow("Unsupported managed Desktop version");
  });

  it.each(["local", "server"] as const)("preserves existing canonical resources and anchor identities through %s round trip", async mode => {
    const value = fixture(), session = new WorkspaceSession(materializeLocalWorkspace(value), { features: { entityReferences: false } });
    const editor = session.editor;
    let reopened: WorkspaceSession | undefined;
    try {
      const saved = editor.persistence.captureWorkspace();
      const documentsOnServer = value.root.children[1].children;
      const registrations = await Promise.all(documentsOnServer.map(async (d: any) => ({
        documentId: d.metadata.documentId,
        source: { kind: "document-store" as const, folder: ".", filename: d.metadata.filename },
        contentHash: await workspaceContentHash(d),
      })));
      const bundle = mode === "server" ? await createWorkspaceSaveBundle(saved.repository, registrations, "e1", undefined, { root: saved.document }) : undefined;
      const loaded = bundle ? materializeWorkspace(bundle.manifest, new Map(documentsOnServer.map((d: any) => [d.metadata.documentId, d])))
        : materializeLocalWorkspace(JSON.parse(JSON.stringify(saved.localValue)));
      reopened = new WorkspaceSession(loaded, { features: { entityReferences: false } });
      const documents = Object.values(reopened.editor.repository.state.contents).filter(c => c.viewType === "document-block");
      expect(documents).toHaveLength(2);
      expect(documents.map(c => (c.payload.metadata as any).documentId).sort()).toEqual(["document-a", "document-b"]);
      expect(desktopOf(reopened.editor.persistence.captureWorkspace().document)!.views.map(v => v.restoreKey))
        .toEqual(desktopOf(saved.document)!.views.map(v => v.restoreKey));
      if (bundle) expect(bundle.documents).toHaveLength(0); // Managed manifests never write Document content.
    } finally { reopened?.dispose(); session.dispose(); }
  });
});
