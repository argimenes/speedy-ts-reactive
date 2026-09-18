import { costFixture } from "../../src/history/stage-c-gates/cost-fixture";
import { CanonicalRepository } from "../../src/block-tree/repository";
import { TreeCommands } from "../../src/block-tree/commands";
import { encodeDocument } from "../../src/block-tree/codecs";
import { equal } from "../../src/block-tree/commit-capture";
import { encodeWire } from "../../src/history/preplan-spike/wire";
import { observePage } from "./cost-observation";

const report: any = { completed: false, errors: [], samples: [], warmupPairs: 30, measuredPairs: 120 };
(window as any).report = report;
const observation = observePage();
const check = (value: unknown, message: string) => { if (!value) throw Error(message); };
(window as any).run = async (length: number) => {
  let worker: Worker | undefined;
  try {
    const candidate = costFixture(length);
    const compact = new CanonicalRepository(candidate.repository.snapshot(), { enforceBlockIdentity: true });
    const commands = new TreeCommands(compact, key => key);
    const state = compact.readState(), root = state.placements[state.rootPlacementKey];
    const paragraph = state.contents[root.contentKey].children[0];
    check(equal(compact.snapshot(), candidate.repository.snapshot()), "Starting states differ");
    worker = new Worker("/worker.js", { type: "module" });
    let ready: () => void, done: any, inFlight = 0, acknowledgements = 0, events = 0;
    const pending = new Set<string>(), initialized = new Promise<void>(resolve => ready = resolve);
    report.maxInFlight = 0;
    worker.onerror = event => report.errors.push(event.message);
    worker.onmessage = ({ data }) => {
      if (data.error) report.errors.push(data.error);
      if (data.ready) ready();
      if (data.captured) {
        if (!pending.delete(data.captured)) report.errors.push("Duplicate/unknown acknowledgement");
        inFlight--; acknowledgements++;
      }
      if (data.done) done = data;
    };
    worker.postMessage({ kind: "init", baseline: candidate.baseline }); await initialized;
    let current: any;
    // Transparent timing wrappers on both repositories; no operations or values change.
    for (const repository of [compact, candidate.repository]) for (const method of ["prepareCapture", "deliverCapture"]) {
      const target = repository as any, original = target[method];
      target[method] = function (...args: any[]) {
        const start = performance.now();
        try { return original.apply(this, args); } finally { if (current) current[method] += performance.now() - start; }
      };
    }
    compact.subscribeHistoryChanges(() => {
      const start = performance.now(); current.callback += performance.now() - start;
    }, error => report.errors.push(String(error)));
    candidate.repository.subscribeHistoryChanges(event => {
      const start = performance.now(), captured = candidate.capture.capture(event);
      current.capture += performance.now() - start;
      check(captured, "Missing candidate capture"); check(inFlight < 64, "Gate worker queue cap");
      const postedAt = performance.timeOrigin + performance.now();
      pending.add(captured.commitId); events++; inFlight++; report.maxInFlight = Math.max(report.maxInFlight, inFlight);
      worker!.postMessage({ event: captured, created: Date.now(), postedAt });
      current.transfer += performance.timeOrigin + performance.now() - postedAt;
      current.callback += performance.now() - start;
    }, error => report.errors.push(String(error)));
    const start = performance.now();
    for (let index = 0; index < 150; index++) {
      await observation.wait(Math.max(0, start + index * 200 - performance.now()), "pair", { index });
      const order = index % 2 ? ["candidate", "compact"] : ["compact", "candidate"];
      const sample: any = { index, measured: index >= 30, position: index % 3, order, targetMs: index * 200 };
      for (const mode of order) {
        await observation.wait(0, "arm");
        check(document.visibilityState === "visible", "Foreground condition lost");
        check(!report.errors.length, report.errors.join("\n"));
        current = { prepareCapture: 0, deliverCapture: 0, callback: 0, capture: 0, transfer: 0 };
        const before = performance.now();
        if (mode === "candidate") candidate.edit(index);
        else { const at = [0, Math.floor(length / 2), length - 1][index % 3]; commands.replaceInlineRange(paragraph, at, at + 1, index % 2 ? "Y" : "Z"); }
        current.edit = performance.now() - before;
        current.otherCommandWork = current.edit - current.prepareCapture - current.deliverCapture;
        sample[mode] = current; current = undefined;
      }
      check(compact.readState().revision === index + 1 && candidate.repository.readState().revision === index + 1, "Revision/step mismatch");
      check((compact as any).undoStack.length === index + 1 && (candidate.repository as any).undoStack.length === index + 1, "Undo granularity mismatch");
      check(!report.errors.length, report.errors.join("\n"));
      sample.differenceMs = sample.candidate.edit - sample.compact.edit;
      report.samples.push(sample); report.progress = { pairs: index + 1, length };
    }
    check(equal(encodeDocument(compact.snapshot()), encodeDocument(candidate.repository.snapshot())), "Final authored state mismatch");
    report.parity = { startingExactState: true, everyRevisionAndUndoStep: true, finalAuthoredState: true, independentGeneratedCellIds: true };
    for (let i = 0; i < 1200 && !done; i++) { worker.postMessage({ kind: "finish" }); await observation.wait(100, "drain"); }
    check(done && events === 150 && acknowledgements === 150 && inFlight === 0 && pending.size === 0, "Incomplete drain");
    report.oracleWire = encodeWire(candidate.final()); report.worker = done; report.events = events; report.acknowledgements = acknowledgements;
    report.scheduling = observation.snapshot(); report.length = length;
  } catch (error: any) { report.errors.push(String(error?.stack ?? error)); report.scheduling = observation.snapshot(); }
  finally { worker?.terminate(); observation.stop(); report.completed = true; }
};
