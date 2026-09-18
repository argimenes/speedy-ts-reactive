import { costFixture } from "../../src/history/stage-c-gates/cost-fixture";
import { encodeWire } from "../../src/history/preplan-spike/wire";
const report: any = { errors: [], completed: false, matrices: [] };
(window as any).report = report;
const stages: Record<string, { count: number; totalMs: number; maxMs: number; lastMs: number }> = {};
const epoch = () => performance.timeOrigin + performance.now();
function measure(name: string, ms: number) {
  const s = stages[name] ??= { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
  s.count++; s.totalMs += ms; s.maxMs = Math.max(s.maxMs, ms); s.lastMs = ms;
}
report.mainStages = stages;
const telemetry = () => ({ source: "main", at: Date.now(), progress: report.progress, errors: report.errors, maxInFlight: report.maxInFlight,
  mainStages: stages, worker: report.workerTelemetry, heap: report.heap?.at(-1), queueFailure: report.queueFailure, phase: report.phase });
let telemetryInFlight: Promise<unknown> | undefined;
function publishTelemetry() {
  if (telemetryInFlight) return telemetryInFlight;
  telemetryInFlight = fetch("/telemetry", { method: "POST", body: JSON.stringify(telemetry()) })
    .then(response => response.text()).catch(() => {}).finally(() => { telemetryInFlight = undefined; });
  return telemetryInFlight;
}
setInterval(() => { if (report.progress && !report.completed) void publishTelemetry(); }, 5000);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
(window as any).run = async (durationSeconds: number) => {
  try {
    for (const length of [100, 5600, 25000]) for (const mode of ["off", "compact", "candidate"]) {
      const s = costFixture(length), callback: number[] = [], edit: number[] = [];
      if (mode !== "off") s.repository.subscribeHistoryChanges(e => {
        const start = performance.now(); if (mode === "candidate") s.capture.capture(e); callback.push(performance.now() - start);
      }, error => { throw error; });
      for (let i = 0; i < 60; i++) { const start = performance.now(); s.edit(i); edit.push(performance.now() - start); if (i % 10 === 0) await tick(); }
      report.matrices.push({ length, mode, callback, edit });
    }
    const s = costFixture(25000), worker = new Worker("/worker.js", { type: "module" });
    let inFlight = 0, finish: any, ready: () => void;
    const sent = new Map<string, number>();
    const initialized = new Promise<void>(resolve => ready = resolve);
    worker.onerror = e => report.errors.push(String(e.message));
    worker.onmessage = ({ data }) => {
      if (data.error) report.errors.push(data.error);
      if (data.ready) { report.baselineBytes = data.baselineBytes; ready(); }
      if (data.telemetry) report.workerTelemetry = data.telemetry;
      if (data.captured) {
        inFlight--; const posted = sent.get(data.captured);
        if (posted !== undefined) { measure("main.captureToWorkerAck", epoch() - posted); sent.delete(data.captured); }
        if (data.capturedAt) measure("workerToMain.ackDelivery", epoch() - data.capturedAt);
      }
      if (data.done) finish = data;
    };
    worker.postMessage({ kind: "init", baseline: s.baseline }); await initialized;
    report.callback = []; report.edits = []; report.maxInFlight = 0; report.heap = [];
    s.repository.subscribeHistoryChanges(e => {
      const start = performance.now(), event = s.capture.capture(e);
      measure("main.capture", performance.now() - start);
      if (event) {
        if (inFlight >= 64) {
          report.queueFailure = { at: Date.now(), inFlight, oldestInFlightMs: epoch() - (sent.values().next().value ?? epoch()), rejectedCommitId: event.commitId };
          throw Error("Gate worker queue cap");
        }
        inFlight++; report.maxInFlight = Math.max(inFlight, report.maxInFlight);
        const postedAt = epoch(); sent.set(event.commitId, postedAt);
        worker.postMessage({ event, created: Date.now(), postedAt }); measure("main.postMessage", epoch() - postedAt);
      }
      report.callback.push(performance.now() - start); measure("main.callback", performance.now() - start);
    }, e => report.errors.push(String(e)));
    const start = performance.now(), total = durationSeconds * 5;
    for (let i = 0; i < total; i++) {
      if (report.errors.length) throw Error(report.errors.join("\n"));
      const elapsed = performance.now() - start, wait = i * 200 - elapsed;
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      // Actual server refuses appends for this interval; IDB continues capturing.
      if (i === Math.floor(total * .3)) { await fetch("/offline", { method: "POST" }); report.phase = "offline"; worker.postMessage({ kind: "network", phase: "offline" }); }
      if (i === Math.floor(total * .4)) { await fetch("/online", { method: "POST" }); report.phase = "reconnected"; worker.postMessage({ kind: "network", phase: "reconnected" }); }
      measure("main.scheduleLateness", Math.max(0, performance.now() - start - i * 200));
      const at = performance.now(); s.edit(i); report.edits.push(performance.now() - at); measure("main.edit", performance.now() - at);
      if (i % 50 === 0) report.heap.push({ edit: i, used: (performance as any).memory?.usedJSHeapSize });
      report.progress = { edits: i + 1, total, inFlight, elapsedMs: performance.now() - start };
    }
    report.phase = "finalDrain";
    const drain = performance.now();
    for (let i = 0; i < 1200 && !finish; i++) { worker.postMessage({ kind: "finish" }); await new Promise(resolve => setTimeout(resolve, 100)); }
    if (!finish) throw Error("Gate drain deadline");
    report.drainMs = performance.now() - drain;
    const repository = s.repository as any;
    report.undoStorage = repository.historyStorage?.diagnostics([...repository.undoStack, ...repository.redoStack]);
    report.oracleWire = encodeWire(s.final());
    if (report.oracleWire !== finish.finalWire) {
      // Property insertion order can differ after exact mutations. Compare decoded
      // values in the Node harness; canonical wire order isn't state equivalence.
      report.workerWire = finish.finalWire;
    }
    report.worker = finish; worker.terminate(); report.completed = true;
  } catch (error: any) { report.errors.push(String(error?.stack ?? error)); report.completed = true; await publishTelemetry(); }
};
