// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { WorkspaceSession } from "./workspace-session";
import { createInitialWorkspace } from "./initial-workspace";
import { workspaceOpen } from "./workspace-open";
import { materializeLocalWorkspace } from "../reactive-editor/workspace-manifest";
import { documentFormats, readDocumentFormat } from "../features/document-formats/model";

describe("Document formats", () => {
  it.each(["desktop", "canvas"] as const)("creates and round-trips all formats with edited content in %s", mode => {
    const session = new WorkspaceSession(materializeLocalWorkspace(createInitialWorkspace()), { features: { canvasWorkspace: true } });
    let reopened: WorkspaceSession | undefined;
    try {
      session.selectPresentation(mode);
      for (const format of documentFormats) workspaceOpen(session).newDocument(format.id);
      const docs = Object.values(session.projection.state.nodes).filter(n => n.viewType === "document-block");
      expect(docs).toHaveLength(9);
      for (const doc of docs) {
        const format = readDocumentFormat(doc.payload.metadata)!;
        expect(format).toMatchObject({ version: 1, format: expect.any(String), template: expect.any(String), theme: expect.any(String) });
        const child = Object.values(session.projection.state.nodes).find(n => n.viewType === "standoff-editor-block" && session.editor.blockQueries.ancestors(n.key).some(a => a.key === doc.key))!;
        session.editor.commands.replaceInlineRange(child.key, 0, child.inlineContent.length, `Edited ${format.format}`);
      }
      const saved = session.editor.persistence.captureWorkspace().document;
      reopened = new WorkspaceSession(materializeLocalWorkspace(JSON.parse(JSON.stringify(saved))), { features: { canvasWorkspace: true } });
      expect(reopened.editor.persistence.captureWorkspace().document).toEqual(saved);
      if (mode === "canvas") expect(reopened.canvasRoots()).toHaveLength(9);
    } finally { reopened?.dispose(); session.dispose(); }
  });
  it("retains ordinary creation and rejects format creation when disabled", () => {
    const session = new WorkspaceSession(materializeLocalWorkspace(createInitialWorkspace()), { features: { documentFormats: false } });
    try {
      workspaceOpen(session).newDocument();
      expect(Object.values(session.projection.state.nodes).find(n => n.viewType === "document-block")?.children).toHaveLength(1);
      const before = session.editor.encodeDocument();
      expect(() => workspaceOpen(session).newDocument("journal")).toThrow("disabled");
      expect(session.editor.encodeDocument()).toEqual(before);
      expect(readDocumentFormat({ documentFormat: { version: 2, format: "journal" } })).toBeUndefined();
    } finally { session.dispose(); }
  });
});
