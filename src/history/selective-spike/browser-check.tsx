import { render } from "solid-js/web";
import { freeze } from "../../block-tree/commit-capture";
import { HistoricalPreview } from "../../rendering/block-history";
import { CompactPreviewView } from "./preview-view";
const worker = new Worker(new URL("./browser.worker.ts", import.meta.url), { type: "module" });
let next = 0, dispose: (() => void) | undefined;
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
worker.onmessage = ({ data }) => { const task = pending.get(data.id)!; pending.delete(data.id); data.error ? task.reject(Error(data.error)) : task.resolve(data); };
const rpc = (data: object) => new Promise<any>((resolve, reject) => { const id = ++next; pending.set(id, { resolve, reject }); worker.postMessage({ ...data, id }); });
const host = document.body.appendChild(document.createElement("div"));
const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
let metadata: any;
(window as any).selectiveCheck = {
  async init(name: string) { metadata = (await rpc({ kind: "init", name })).metadata; return metadata; },
  async run(reader: string, sequence: number, cold: boolean, compact = false, kind = "select") {
    const start = performance.now(); dispose?.(); host.replaceChildren();
    const reply = await rpc({ kind, reader, sequence, cold, compact }), received = performance.now();
    const body = freeze(reply.body), frozen = performance.now();
    dispose = render(() => compact ? <><CompactPreviewView value={body.selected} /><CompactPreviewView value={body.after} /></> : <><HistoricalPreview result={body.selected} /><HistoricalPreview result={body.after} /></>, host);
    await paint(); const end = performance.now();
    const texts = [...host.querySelectorAll(".block-history-text")].map(p => p.textContent);
    if (texts[0] !== metadata.texts[sequence] || texts[1] !== metadata.texts[metadata.identity.headSequence]) throw Error("Preview/live-text oracle mismatch");
    return { reader, sequence, cold, compact, totalMs: end - start, roundTripMs: received - start, freezeMs: frozen - received, renderMs: end - frozen,
      workerMs: reply.workerMs, projectionMs: reply.projectionMs, diagnostics: reply.diagnostics, jsonBytes: new TextEncoder().encode(JSON.stringify(body)).length,
      html: host.innerHTML };
  },
  verify: (sequence: number) => rpc({ kind: "verify", reader: "selective", sequence }),
};
