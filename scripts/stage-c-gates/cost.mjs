// G3 feasibility harness only. Temporary browser, filesystem and HTTP origin.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { isolatedBrowser } from './browser.mjs';
import { costPreflight } from './cost-preflight.mjs';
import { openStore, admitMemoir, openWriter, readCheckpoint } from './store.mjs';
import { closeFilesystemWorkers } from './filesystem.mjs';
import { summary } from '../preplan-spike/support.mjs';
const hostResources = await costPreflight();
const duration = Number(process.env.G3_SECONDS ?? 600);
assert(Number.isSafeInteger(duration) && duration >= 10 && duration <= 600);
const scripts = await Promise.all(['browser', 'worker'].map(async name => {
  const result = await build({ entryPoints: [`scripts/stage-c-gates/cost-${name}.ts`], bundle: true, format: 'esm', platform: 'browser', write: false, logLevel: 'silent' }); return result.outputFiles[0].text;
}));
const pure = await build({ stdin: { contents: `export {encodeWire,decodeWire} from './src/history/preplan-spike/wire'; export {applyExactRecords} from './src/history/apply-records'; export {validateResource,replayResource} from './src/history/stage-c-gates/resource';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent' });
const module = { exports: {} }; new Function('require', 'module', 'exports', pure.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports); const api = module.exports;
const directory = await mkdtemp(join(tmpdir(), 'codex-stage-c-g3-')), browser = await isolatedBrowser();
await writeFile(join(directory, 'document.json'), '{"gate":"G3"}');
const identity = { resourceId: 'resource-g3', memoirId: randomUUID(), enrollmentId: randomUUID() };
const store = await openStore(directory, true), memoir = await admitMemoir(store, identity, 'document.json'), writer = await openWriter(memoir, { enrollmentId: identity.enrollmentId });
let offline = false, baseline, checkpoint, maxRequest = 0, accepted = 0;
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><script type="module" src="/browser.js"></script>'); return; }
    if (request.url === '/browser.js' || request.url === '/worker.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(scripts[request.url === '/browser.js' ? 0 : 1]); return; }
    if (request.url === '/offline' || request.url === '/online') { offline = request.url === '/offline'; response.end('{}'); return; }
    if (request.url === '/append' && offline) { response.statusCode = 503; response.end('{}'); return; }
    const chunks = []; let size = 0; const limit = request.url === '/baseline' ? 20 * 1024 * 1024 : 128 * 1024;
    for await (const bytes of request) { size += bytes.length; if (size > limit) throw Error('Gate HTTP cap'); chunks.push(bytes); }
    const body = Buffer.concat(chunks); response.setHeader('Content-Type', 'application/json');
    if (request.url === '/baseline') {
      assert.equal(baseline, undefined); baseline = api.decodeWire(body.toString()); api.validateResource(baseline);
      checkpoint = await writer.publishCheckpoint(body); await writer.append(writer.token, writer.head, [{ kind: 'baseline', id: 'baseline', checkpoint }]); response.end('{}'); return;
    }
    if (request.url === '/append') {
      maxRequest = Math.max(size, maxRequest); const records = JSON.parse(body);
      const ack = await writer.append(writer.token, writer.head, records); accepted += ack.duplicate ? 0 : records.length; response.end(JSON.stringify(ack)); return;
    }
    response.statusCode = 404; response.end('{}');
  } catch (error) { response.statusCode = 500; response.end(JSON.stringify({ error: String(error.stack ?? error) })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browserVersion, lastStatus;
try {
  const page = await browser.launch(); browserVersion = page.version; await page.navigate(`http://127.0.0.1:${server.address().port}`);
  for (let i = 0; i < 100 && !await page.evaluate('typeof window.run === "function"'); i++) await new Promise(resolve => setTimeout(resolve, 50));
  await page.evaluate(`void window.run(${duration})`);
  let result;
  for (let i = 0; i < duration / 5 + 90; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const status = lastStatus = await page.evaluate('({completed:report.completed,errors:report.errors,progress:report.progress})');
    if (status.errors.length) throw Error(JSON.stringify(status));
    if (i % 12 === 0) console.log(JSON.stringify({ gate: 'G3 running', ...status }));
    if (status.completed) { result = await page.evaluate('report'); break; }
  }
  assert(result, 'Browser deadline'); assert.deepEqual(result.errors, []); assert.equal(accepted, duration * 5);
  const oracle = api.decodeWire(result.oracleWire), workerFinal = api.decodeWire(result.worker.finalWire);
  assert.deepEqual(workerFinal, oracle); assert.equal(result.worker.count, accepted);
  const storedBaseline = api.decodeWire((await readCheckpoint(memoir, checkpoint)).toString()); assert.deepEqual(storedBaseline, baseline);
  let state = structuredClone(storedBaseline), parent = 'baseline', revisionCount = 0;
  const records = writer.frames.map(f => JSON.parse(f.payload));
  for (const record of records) if (record.kind === 'revision') {
    assert.equal(record.stateParent, parent); const event = api.decodeWire(record.wire);
    assert.equal(event.commitId, record.id); assert.equal(event.beforeRevision, state.revision);
    if (revisionCount % 250 === 0) {
      // Compare checked in-place execution against the independent clone/validate
      // replay wrapper at regularly spaced exact states.
      const replayed = api.replayResource(state, event);
      api.applyExactRecords(state, event); state.revision = event.afterRevision; state.rootPlacementKey = event.root.after;
      assert.deepEqual(state, replayed);
    } else { api.applyExactRecords(state, event); state.revision = event.afterRevision; state.rootPlacementKey = event.root.after; }
    parent = record.id; revisionCount++;
  }
  api.validateResource(state); assert.deepEqual(state, oracle);
  const matrices = result.matrices.map(m => ({ length: m.length, mode: m.mode, edit: summary(m.edit), callback: m.callback.length ? summary(m.callback) : null }));
  const worker = result.worker.metrics;
  const output = { gate: 'G3 command/worker/outbox/server feasibility', hostResources, date: new Date().toISOString(), node: process.version, browser: page.version.product,
    durationSeconds: duration, revisions: accepted, baselineBytes: result.baselineBytes, matrices,
    sustained: { callback: summary(result.callback), edit: summary(result.edits), historyAddedOver50ms: result.callback.filter(n => n > 50).length, maxInFlight: result.maxInFlight,
      verify: summary(worker.verify), encode: summary(worker.encode), idb: summary(worker.idb), append: summary(worker.append), packetBytes: { min: Math.min(...worker.bytes), max: Math.max(...worker.bytes) },
      maxOutboxBytes: worker.maxBytes, maxOutboxCount: worker.maxCount, oldestPendingMs: worker.maxAge, drainMs: result.drainMs, maxAppendRequestBytes: maxRequest, heap: result.heap },
    exactness: { allWirePacketsDecoded: revisionCount, allStateParentsAndPreimagesChecked: true, sampledIndependentReplays: Math.ceil(revisionCount / 250), finalOracleEquality: true, finalOutboxCount: 0 },
    gateCaps: { workerMessages: 64, packetWireBytes: 102400, outboxBytes: 16777216, outboxRecords: 4096, batchRecords: 32 },
    limits: ['Gate-only format/endpoints; actual editor commands without rendering/input-device latency', 'Native store has finite whole-journal scans; no production archive scalability claim', 'Existing unbounded undo allocations retained in every mode; heap includes editor and browser overhead', 'Single local Chrome/macOS host; process/fsync evidence is not power-loss certification', duration < 600 ? 'Short smoke only: does not satisfy the ten-minute gate' : 'Ten-minute fixed rate workload; full G3 matrix and P6 remain separate obligations'] };
  const path = process.env.G3_OUTPUT ?? '/tmp/codex-stage-c-g3-cost.json'; await writeFile(path, JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify({ output: path, ...output, matrices: undefined, sustained: { ...output.sustained, heap: undefined } }, null, 2));
} catch (error) {
  const path = process.env.G3_OUTPUT ?? '/tmp/codex-stage-c-g3-cost.json';
  await writeFile(path, JSON.stringify({ gate: 'G3 command/worker/outbox/server feasibility', passed: false, date: new Date().toISOString(), node: process.version,
    browser: browserVersion, requestedSeconds: duration, acceptedRevisions: accepted, lastStatus, error: String(error.stack ?? error), diagnostics: browser.diagnostics }, null, 2) + '\n');
  throw error;
} finally { await writer.close(); await closeFilesystemWorkers(); await browser.close(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
