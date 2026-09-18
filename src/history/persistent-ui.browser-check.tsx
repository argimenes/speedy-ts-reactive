/** Dedicated browser seam fixture, loaded only by check-persistent-block-history. */
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { PersistenceService } from "../reactive-editor/persistence";
import { registerCoreViews } from "../rendering/register-core-views";
import { ReactiveTreeView } from "../rendering/reactive-tree-view";
import { encodeDocument } from "../block-tree/codecs";
import { decodeDurableWire, replayDurablePath, resourceToRepository } from "./durable-core";
import { createSessionHistorySource } from "./ui-session-source";
import type { ResourceSnapshot, ResourceTransition } from "./stage-c-gates/resource";

const filename = "large-document.json", folder = ".";
const loaded = await PersistenceService.loadDocument(filename, folder);
const editor = new ReactiveEditor(loaded);
registerCoreViews(editor);
const projection = editor.createView("persistent-browser-check");
editor.persistence.markCurrentRevisionSaved(loaded);
editor.blockHistory.attachLocation({ folder, filename });
editor.installGateway(document);
const root = document.createElement("main"); document.body.append(root);
render(() => <><button id="save-check" onClick={() => void editor.persistence.saveDocument(filename, folder)}>Save</button><ReactiveTreeView editor={editor} projection={projection} /></>, root);

const oracle = () => encodeDocument(editor.repository.snapshot());
const text = () => {
  const state = editor.repository.readState();
  const paragraph = Object.values(state.contents).find(c => c.payload.id === "paragraph-large")!;
  return paragraph.inlineContent.map(key => state.contents[state.placements[key].contentKey].payload.text).join("");
};
async function historical(sequence: number, segmentId: string) {
  const recording = editor.blockHistory.state.recording!;
  const location = { folder, filename, resourceId: "document-large", memoirId: recording.memoirId };
  const post = async (action: string, data: any) => {
    const r = await fetch(`/api/history/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location, ...data }) });
    const value = await r.json(); if (!r.ok || !value.Success) throw new Error(value.Error); return value.Data;
  };
  const path = await post("path", { sequence, segmentId });
  const bytes = new Uint8Array(path.checkpoint.byteLength); let offset = 0;
  for (const chunk of path.checkpoint.chunks) {
    const data = await post("chunk", { hash: chunk.hash });
    const part = Uint8Array.from(atob(data.dataBase64), c => c.charCodeAt(0)); bytes.set(part, offset); offset += part.length;
  }
  const state = replayDurablePath(decodeDurableWire(new TextDecoder().decode(bytes)) as ResourceSnapshot,
    path.records.map((wire: string) => decodeDurableWire(wire) as ResourceTransition));
  return { oracle: encodeDocument(resourceToRepository(state)), checkpointSequence: path.checkpointSequence, pathLength: path.records.length, baselineBytes: path.checkpoint.byteLength };
}
let temporaryBoundary = "";
try { createSessionHistorySource(editor.repository, editor.repository.state.rootPlacementKey).dispose(); }
catch (error) { temporaryBoundary = String(error); }
(window as any).persistentCheck = { editor, oracle, text, historical, temporaryBoundary,
  status: () => JSON.parse(JSON.stringify(editor.blockHistory.state.recording ?? {})),
  get saved() { return editor.persistence.state; },
};
