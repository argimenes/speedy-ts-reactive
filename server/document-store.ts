import { Router } from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

class StoreError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function validateDocument(value: unknown): asserts value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as any).type !== "string") {
    throw new StoreError(400, "The file is not a Block document.");
  }
  const block = value as Record<string, any>;
  if (block.children != null) {
    if (!Array.isArray(block.children)) throw new StoreError(400, "Document children must be an array.");
    block.children.forEach(validateDocument);
  }
  for (const name of ["leftMargin", "rightMargin"]) {
    if (block.relation?.[name] != null) validateDocument(block.relation[name]);
  }
}

export function createDocumentStoreRouter(options: {
  root: string;
  indexDocument?: (document: any, filepath: string) => Promise<void>;
}) {
  const router = Router();
  const inside = (root: string, target: string) => {
    const relative = path.relative(root, target);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new StoreError(400, "Choose a location inside the document store.");
    }
  };
  const directory = async (folder: unknown = ".") => {
    if (typeof folder !== "string" || folder.includes("\\") || folder.includes("\0") || path.isAbsolute(folder) || folder.split("/").includes("..")) {
      throw new StoreError(400, "Invalid document folder.");
    }
    const root = await fs.realpath(options.root);
    const target = await fs.realpath(path.resolve(root, folder || "."));
    inside(root, target);
    if (!(await fs.stat(target)).isDirectory()) throw new StoreError(400, "Choose a folder.");
    return { root, target };
  };
  const filename = (value: unknown) => {
    if (typeof value !== "string" || !value.trim() || /[\\/\0]/.test(value) || value.startsWith(".") || !/\.json$/i.test(value)) {
      throw new StoreError(400, "Enter a JSON filename without path separators.");
    }
    return value;
  };
  const errorResponse = (res: any, error: any) => {
    const status = error instanceof StoreError ? error.status : error?.code === "ENOENT" ? 404 : error?.code === "EEXIST" ? 409 : 500;
    const message = error instanceof StoreError ? error.message
      : status === 404 ? "The document or folder could not be found."
      : status === 409 ? "A document with this name already exists."
      : "The document store could not complete the request.";
    res.status(status).json({ Success: false, Error: message });
  };

  router.get(["/listFolders", "/listDocuments"], async (req, res) => {
    try {
      const { target } = await directory(req.query.folder ?? ".");
      const entries = await fs.readdir(target, { withFileTypes: true });
      const folders = req.path === "/listFolders";
      const names = entries.filter((entry) => !entry.name.startsWith(".") && (folders ? entry.isDirectory() : entry.isFile() && /\.json$/i.test(entry.name)))
        .map((entry) => entry.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      res.json(folders ? { folders: names } : { files: names });
    } catch (error) { errorResponse(res, error); }
  });

  router.get("/loadDocumentJson", async (req, res) => {
    try {
      const { root, target } = await directory(req.query.folder ?? "data");
      const name = filename(req.query.filename);
      const filepath = await fs.realpath(path.join(target, name));
      inside(root, filepath);
      let document: any;
      try { document = JSON.parse(await fs.readFile(filepath, "utf8")); }
      catch (error) {
        if (error instanceof SyntaxError) throw new StoreError(422, "The document contains invalid JSON.");
        throw error;
      }
      validateDocument(document);
      document.metadata = { ...document.metadata, filename: name };
      res.json({ Success: true, Data: { document } });
    } catch (error) { errorResponse(res, error); }
  });

  router.post("/saveDocumentJson", async (req, res) => {
    let temporary: string | undefined;
    try {
      const { root, target } = await directory(req.body?.folder ?? "data");
      const filepath = path.join(target, filename(req.body?.filename));
      validateDocument(req.body?.document);
      // Check existing symlinks as well as the parent before writing.
      try { inside(root, await fs.realpath(filepath)); }
      catch (error: any) { if (error?.code !== "ENOENT") throw error; }
      temporary = path.join(target, `.speedy-${randomUUID()}.tmp`);
      await fs.writeFile(temporary, JSON.stringify(req.body.document), { encoding: "utf8", flag: "wx" });
      if (req.header("If-None-Match") === "*") await fs.link(temporary, filepath);
      else await fs.rename(temporary, filepath);
      let warning: string | undefined;
      if (options.indexDocument) {
        try { await options.indexDocument(structuredClone(req.body.document), filepath); }
        catch { warning = "Document saved, but the search index could not be updated."; }
      }
      res.setHeader("X-Speedy-Revision", req.header("X-Speedy-Revision") ?? "");
      res.json({ Success: true, ...(warning ? { Warning: warning } : {}) });
    } catch (error) { errorResponse(res, error); }
    finally { if (temporary) await fs.unlink(temporary).catch(() => undefined); }
  });
  return router;
}
