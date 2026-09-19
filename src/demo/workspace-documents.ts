import { createSignal, onCleanup, onMount } from "solid-js";
import type { ExistingBlockDto } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { PersistenceService, type DocumentLocation } from "../reactive-editor/persistence";
import { decodeDocument } from "../block-tree/codecs";
import { decodeHistoryDocument, isHistoryDocument } from "../history/durable-core";
import { openJsonFile, saveJsonFile, type BrowserFileHandle } from "./browser-json-file";

type PendingAction = { label: string; action: () => void };
export interface LocalDocumentFile { filename: string; handle?: BrowserFileHandle }

function localDocument(value: unknown): ExistingBlockDto {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as ExistingBlockDto).type !== "string") {
    throw new Error("The selected JSON file is not a Block document.");
  }
  const document = value as ExistingBlockDto;
  if (isHistoryDocument(document)) decodeHistoryDocument(document);
  else decodeDocument(document);
  return document;
}

export function createWorkspaceDocuments(editor: ReactiveEditor, options: {
  location?: DocumentLocation;
  localFile?: LocalDocumentFile;
  onOpen: (document: ExistingBlockDto, location: DocumentLocation) => void;
  onOpenLocal: (document: ExistingBlockDto, file: LocalDocumentFile) => void;
}) {
  const [location, setLocation] = createSignal(options.location);
  const [localFile, setLocalFile] = createSignal(options.localFile);
  if (options.location) editor.blockHistory.attachLocation(options.location);
  const [browser, setBrowser] = createSignal<"open" | "save">();
  const [pending, setPending] = createSignal<PendingAction>();
  const [afterSave, setAfterSave] = createSignal<PendingAction>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [conflict, setConflict] = createSignal(false);
  const lifetime = new AbortController();
  const dirty = () => editor.repository.state.revision !== (editor.persistence.state.lastSavedRevision ?? 0);
  const busy = () => loading() || editor.persistence.state.saving;
  const saveAs = (continuation?: PendingAction) => {
    setError(""); setConflict(false); setAfterSave(continuation); setBrowser("save");
  };
  const finishSave = (continuation?: PendingAction) => {
    if (continuation && dirty()) {
      setError("The saved copy is up to date with the earlier revision, but newer edits still need saving.");
      setPending(continuation);
    } else continuation?.action();
  };
  const save = async (continuation?: PendingAction) => {
    if (busy() || editor.features.publicHostedVersion) return;
    const target = location();
    if (!target) { saveAs(continuation); return; }
    setError("");
    if (await editor.persistence.saveDocument(target.filename, target.folder)) {
      if (!lifetime.signal.aborted) finishSave(continuation);
    } else if (!lifetime.signal.aborted) {
      setError(editor.persistence.state.error || "The document could not be saved.");
      if (continuation) setPending(continuation);
    }
  };
  const guard = (label: string, action: () => void) => {
    if (busy()) return;
    setError("");
    if (dirty()) setPending({ label, action });
    else action();
  };
  const open = () => guard("open another document", () => { setError(""); setBrowser("open"); });
  const saveLocal = async (continuation?: PendingAction, saveAs = false) => {
    if (busy()) return;
    setLoading(true); setError("");
    try {
      const current = localFile();
      const saved = await saveJsonFile(editor.encodeDocument(), {
        suggestedName: saveAs ? current?.filename ?? location()?.filename ?? "Document.json" : current?.filename ?? location()?.filename ?? "Document.json",
        handle: current?.handle,
        saveAs,
      });
      if (!saved || lifetime.signal.aborted) return;
      setLocalFile(saved);
      editor.persistence.markCurrentRevisionSaved(editor.encodeDocument());
      finishSave(continuation);
    } catch (reason) {
      if (!lifetime.signal.aborted) { setError(reason instanceof Error ? reason.message : String(reason)); if (continuation) setPending(continuation); }
    } finally { if (!lifetime.signal.aborted) setLoading(false); }
  };
  const openLocal = () => guard("open another document", () => void (async () => {
    if (busy()) return;
    setLoading(true); setError("");
    try {
      const selected = await openJsonFile();
      if (!selected || lifetime.signal.aborted) return;
      options.onOpenLocal(localDocument(selected.value), { filename: selected.filename, handle: selected.handle });
    } catch (reason) {
      if (!lifetime.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    } finally { if (!lifetime.signal.aborted) setLoading(false); }
  })());
  const choose = async (target: DocumentLocation, overwrite: boolean) => {
    if (busy()) return false;
    setError(""); setConflict(false);
    if (browser() === "save") {
      const saved = await editor.persistence.saveDocument(target.filename, target.folder, { createOnly: !overwrite });
      if (lifetime.signal.aborted) return false;
      if (!saved) { setError(editor.persistence.state.error || "The document could not be saved."); setConflict(editor.persistence.state.status === 409); return false; }
      setLocation(target); setBrowser(undefined);
      const continuation = afterSave(); setAfterSave(undefined); finishSave(continuation);
      return true;
    }
    setLoading(true);
    const request = new AbortController();
    const abort = () => request.abort();
    lifetime.signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 20000);
    try {
      const document = await PersistenceService.loadDocument(target.filename, target.folder, request.signal);
      if (lifetime.signal.aborted) return false;
      options.onOpen(document, target);
      return true;
    } catch (error) {
      if (!lifetime.signal.aborted) setError(request.signal.aborted ? "Loading timed out. Please try again." : error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      clearTimeout(timeout); lifetime.signal.removeEventListener("abort", abort);
      if (!lifetime.signal.aborted) setLoading(false);
    }
  };

  const definitions = [
    { id: "document.open", label: "Open document", execute: editor.features.publicHostedVersion ? openLocal : open },
    { id: "document.save", label: "Save document", execute: editor.features.publicHostedVersion ? () => saveLocal() : () => save() },
    { id: "document.saveAs", label: "Save document as", execute: editor.features.publicHostedVersion ? () => saveLocal(undefined, true) : () => saveAs() },
  ];
  definitions.forEach((definition) => editor.commandRegistry.register({ ...definition, canExecute: () => !busy() && !browser() && !pending() }));
  const run = (id: string, storage: "server" | "local" = editor.features.publicHostedVersion ? "local" : "server") => {
    if (busy() || pending()) return;
    if (storage === "server") {
      if (id === "document.open") open();
      else if (!editor.features.publicHostedVersion && id === "document.save") void save();
      else if (!editor.features.publicHostedVersion && id === "document.saveAs") saveAs();
      return;
    }
    if (id === "document.open") openLocal();
    else if (id === "document.save") void saveLocal();
    else if (id === "document.saveAs") void saveLocal(undefined, true);
  };
  const runRegistered = (id: string) => {
    const projection = editor.projections.values().next().value;
    if (!projection) return;
    const context = { targetKey: projection.state.rootKey, args: undefined };
    if (editor.commandRegistry.canExecute(id, context)) void editor.commandRegistry.execute(id, context);
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key !== "s" && !(key === "o" && !event.shiftKey)) return;
    event.preventDefault();
    runRegistered(key === "o" ? "document.open" : event.shiftKey ? "document.saveAs" : "document.save");
  };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (dirty() || busy() || editor.blockHistory.hasPendingCapture()) { event.preventDefault(); event.returnValue = ""; }
  };
  onMount(() => {
    document.addEventListener("keydown", keyDown, true);
    window.addEventListener("beforeunload", beforeUnload);
  });
  onCleanup(() => {
    lifetime.abort(); document.removeEventListener("keydown", keyDown, true);
    window.removeEventListener("beforeunload", beforeUnload);
  });
  return {
    location, localFile, browser, pending, dirty, busy, error, conflict, run, guard, choose,
    closeBrowser: () => { if (!busy()) { setBrowser(undefined); setAfterSave(undefined); setError(""); } },
    cancelPending: () => { if (!busy()) { setPending(undefined); setError(""); } },
    discardPending: () => { const next = pending(); setPending(undefined); next?.action(); },
    savePending: () => { const next = pending(); setPending(undefined); if (editor.features.publicHostedVersion || localFile()) void saveLocal(next); else void save(next); },
  };
}
