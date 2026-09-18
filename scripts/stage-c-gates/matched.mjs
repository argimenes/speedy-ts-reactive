// Final bounded foreground comparison, not a replacement sustained/stress trace.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isolatedBrowser } from './browser.mjs';
import { costPreflight } from './cost-preflight.mjs';
import { openStore, admitMemoir, openWriter, readCheckpoint, scanFrames } from './store.mjs';
import { atDirectory, closeFilesystemWorkers } from './filesystem.mjs';
import { matchedStatistics } from './matched-statistics.mjs';

const outputPath = process.env.G3_OUTPUT ?? 'BLOCK_SCOPED_HISTORY_STAGE_C_G3_MATCHED_20260918.json';
try { await access(outputPath); throw Error('Refusing to overwrite result'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const command = (...args) => execFileSync(args[0], args.slice(1), { encoding: 'utf8' }).trim();
const sourceFiles = ['matched.mjs', 'matched-browser.ts', 'matched-statistics.mjs', 'cost-worker.ts', 'browser.mjs', 'cost-observation.ts', 'store.mjs'].map(p => 'scripts/stage-c-gates/' + p)
  .concat(['src/history/stage-c-gates/cost-fixture.ts', 'src/history/stage-c-gates/resource.ts', 'src/history/stage-c-gates/incremental.ts', 'src/block-tree/repository.ts', 'src/block-tree/commands.ts', 'src/block-tree/undo-storage.ts']);
const hashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async p => [p, createHash('sha256').update(await readFile(p)).digest('hex')])));
const output = { task: 'Final bounded G3 matched foreground comparison', started: new Date().toISOString(), sourceRevision: command('git', 'rev-parse', 'HEAD'), sourceSha256: await hashes(),
  host: { cpu: command('sysctl', '-n', 'machdep.cpu.brand_string'), platform: command('uname', '-a'), node: process.version, resources: await costPreflight() },
  protocol: { lengths: [100, 5600, 25000], warmupPairs: 30, measuredPairs: 120, pairTargetIntervalMs: 200, armTasks: 'separate zero-delay timer tasks', order: 'compact/candidate then candidate/compact, balanced at each edit position',
    criterion: 'p95 of paired candidate-minus-compact whole-command time <=4ms; no added time or candidate callback >50ms', outliers: 'all retained; fixed warm-up retained separately', worker: 'unchanged full validation, strict IDB, real native store append; 64 message cap' },
  cases: [], powerAssertions: [] };
const power = () => command('pmset', '-g', 'assertions').split('\n').filter(line => /caffeinate|PreventUserIdleDisplaySleep|PreventUserIdleSystemSleep/.test(line)).join('\n');
function samplePower() {
  const value = power(); output.powerAssertions.push({ at: Date.now(), value });
  for (const kind of ['PreventUserIdleDisplaySleep', 'PreventUserIdleSystemSleep']) assert(value.split('\n').some(line => line.includes('caffeinate') && line.includes(kind)), 'Run under caffeinate -di');
}
const script = async entry => (await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'browser', write: false, logLevel: 'silent' })).outputFiles[0].text;
const [browserScript, workerScript] = await Promise.all([script('scripts/stage-c-gates/matched-browser.ts'), script('scripts/stage-c-gates/cost-worker.ts')]);
const pure = await build({ stdin: { contents: "export {decodeWire} from './src/history/preplan-spike/wire'; export {replayResource,validateResource} from './src/history/stage-c-gates/resource';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent' });
const module = { exports: {} }; new Function('require', 'module', 'exports', pure.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports); const api = module.exports;

async function runCase(length) {
  samplePower();
  const directory = await mkdtemp(join(tmpdir(), 'codex-g3-matched-')), browser = await isolatedBrowser();
  await writeFile(join(directory, 'document.json'), '{}');
  const identity = { resourceId: 'resource-g3', memoirId: randomUUID(), enrollmentId: randomUUID() };
  const store = await openStore(directory, true), memoir = await admitMemoir(store, identity, 'document.json'), writer = await openWriter(memoir, { enrollmentId: identity.enrollmentId });
  let baseline, checkpoint, accepted = 0;
  const server = createServer(async (request, response) => {
    try {
      if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><script type="module" src="/browser.js"></script>'); return; }
      if (['/browser.js', '/worker.js'].includes(request.url)) { response.setHeader('Content-Type', 'text/javascript'); response.end(request.url === '/browser.js' ? browserScript : workerScript); return; }
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; assert(size <= (request.url === '/baseline' ? 20 * 1024 * 1024 : 128 * 1024)); chunks.push(chunk); }
      const body = Buffer.concat(chunks); response.setHeader('Content-Type', 'application/json');
      if (request.url === '/telemetry') { response.end('{}'); return; }
      if (request.url === '/baseline') {
        assert.equal(baseline, undefined); baseline = api.decodeWire(body.toString()); api.validateResource(baseline);
        checkpoint = await writer.publishCheckpoint(body); await writer.append(writer.token, writer.head, [{ kind: 'baseline', id: 'baseline', checkpoint }]); response.end('{}'); return;
      }
      if (request.url === '/append') {
        const records = JSON.parse(body), ack = await writer.append(writer.token, writer.head, records);
        accepted += ack.duplicate ? 0 : records.length; response.end(JSON.stringify(ack)); return;
      }
      response.statusCode = 404; response.end('{}');
    } catch (error) { response.statusCode = 500; response.end(JSON.stringify({ error: String(error.stack ?? error) })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let result;
  try {
    const page = await browser.launch(); output.host.browser = page.version.product;
    await page.navigate(`http://127.0.0.1:${server.address().port}`);
    for (let i = 0; i < 100 && !await page.evaluate('typeof window.run === "function"'); i++) await new Promise(resolve => setTimeout(resolve, 50));
    await page.evaluate(`void window.run(${length})`);
    for (let i = 0; i < 120; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const status = await page.evaluate('({completed:report.completed,progress:report.progress})');
      if (i % 10 === 0) { samplePower(); console.log(JSON.stringify({ length, ...status })); }
      if (status.completed) { result = await page.evaluate('report'); break; }
    }
    assert(result, 'Matched comparison deadline'); assert.deepEqual(result.errors, []);
    assert.equal(accepted, 150); assert.equal(result.acknowledgements, 150);
    assert.equal(result.worker.pipeline.captured, 150); assert.equal(result.worker.pipeline.acknowledged, 150);
    assert.deepEqual(result.worker.pipeline.outbox, { bytes: 0, count: 0 });
    assert.deepEqual(api.decodeWire(result.worker.finalWire), api.decodeWire(result.oracleWire));
    const physical = scanFrames((await atDirectory(memoir.directory, { kind: 'read', name: 'journal.jsonl', maxBytes: 32 * 1024 * 1024 })).data);
    assert.equal(physical.incompleteTail, false); assert.deepEqual(physical.frames, writer.frames);
    assert.deepEqual(api.decodeWire((await readCheckpoint(memoir, checkpoint)).toString()), baseline);
    const statistics = matchedStatistics(result.samples);
    const { oracleWire, worker, ...details } = result;
    return { ...details, statistics, worker: { pipeline: worker.pipeline }, physicalFrames: physical.frames.length, finalOracleEquality: true, browserDiagnostics: browser.diagnostics };
  } catch (error) { return { length, passed: false, error: String(error.stack ?? error), partial: result, browserDiagnostics: browser.diagnostics }; }
  finally { await writer.close(); await closeFilesystemWorkers(); await browser.close(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
}
try {
  for (const length of output.protocol.lengths) {
    const result = await runCase(length); output.cases.push(result);
    console.log(JSON.stringify({ length, error: result.error, statistics: result.statistics }));
    if (result.error || !result.statistics.passed) break; // Never retry/select a favorable case.
  }
  output.passed = output.cases.length === 3 && output.cases.every(result => result.statistics?.passed);
} catch (error) { output.passed = false; output.error = String(error.stack ?? error); }
finally {
  output.finished = new Date().toISOString(); output.sourceSha256After = await hashes();
  assert.deepEqual(output.sourceSha256After, output.sourceSha256);
  await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n');
}
console.log(JSON.stringify({ outputPath, passed: output.passed }));
if (!output.passed) process.exitCode = 1;
