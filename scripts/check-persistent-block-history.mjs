/** Focused real-browser integration; isolated app servers, profile and Document. */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { access, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { isolatedBrowser } from './stage-c-gates/browser.mjs';

const output = process.env.HISTORY_PERSISTENT_RESULT ?? 'BLOCK_HISTORY_PERSISTENT_CHECK.json';
try { await access(output); throw Error(`Refusing to overwrite ${output}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const directory = await mkdtemp(path.join(tmpdir(), 'codex-persistent-ui-'));
const browser = await isolatedBrowser();
const result = { passed: false, started: new Date().toISOString(), assertions: [], phases: [], errors: [] };
const progress = value => { result.phases.push({ at: new Date().toISOString(), value }); console.log(value); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const initialText = 'a'.repeat(25_000);
await writeFile(path.join(directory, 'large-document.json'), JSON.stringify({ id: 'document-large', type: 'document-block', children: [
  { id: 'paragraph-large', type: 'standoff-editor-block', text: initialText, standoffProperties: [{ id: 'bold-range', type: 'style/bold', start: 0, end: 4 }] },
] }));
const childFile = path.join(directory, 'native-server.mjs');
await writeFile(childFile, `import express from ${JSON.stringify(pathToFileURL(path.resolve('node_modules/express/index.js')).href)};
import { createHistoryService } from ${JSON.stringify(pathToFileURL(path.resolve('dist/server/history-router.js')).href)};
import { createDocumentStoreRouter } from ${JSON.stringify(pathToFileURL(path.resolve('dist/server/document-store.js')).href)};
const app=express(), history=createHistoryService({root:process.env.HISTORY_CHECK_ROOT});
app.use('/api/history',history.router); app.use(express.json({limit:'32mb'}));
app.use('/api',createDocumentStoreRouter({root:process.env.HISTORY_CHECK_ROOT,history}));
const server=app.listen(Number(process.env.HISTORY_CHECK_PORT||0),'127.0.0.1',()=>process.send({port:server.address().port}));
`);
let child, serverPort, vite, page;
const startServer = async () => {
  child = fork(childFile, [], { cwd: process.cwd(), env: { ...process.env, HISTORY_CHECK_ROOT: directory, HISTORY_CHECK_PORT: String(serverPort ?? 0) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  child.stdout.on('data', bytes => console.log(`native: ${String(bytes).trim()}`));
  child.stderr.on('data', bytes => { result.nativeLog = `${result.nativeLog ?? ''}${bytes}`.slice(-16_384); });
  serverPort = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Native server startup timeout')), 15_000);
    child.once('message', message => { clearTimeout(timer); resolve(message.port); }); child.once('exit', code => { clearTimeout(timer); reject(Error(`Native startup exit ${code}: ${result.nativeLog}`)); }); });
};
const stopServer = async () => { if (!child || child.exitCode !== null || child.signalCode !== null) return; const ended = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await ended; };
const wait = async (expression, timeout = 120_000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await page.evaluate(expression)) return; await sleep(250); }
  throw Error(`Condition timed out: ${expression}\n${await page.evaluate('JSON.stringify({body:document.body.innerText.slice(-2000),status:window.persistentCheck?.status(),error:window.persistentCheck?.editor.blockHistory.state.error,recordingError:window.persistentCheck?.editor.blockHistory.state.recordingError})')}`);
};
const openHistory = async () => {
  await page.evaluate(`document.querySelector('[data-block-id=paragraph-large]').dispatchEvent(new MouseEvent('contextmenu',{button:2,bubbles:true,cancelable:true}))`);
  await wait('document.querySelector(".reactive-block-menu")', 10_000);
  await page.evaluate(`[...document.querySelectorAll('.reactive-block-menu button')].find(button=>button.textContent==='History…').click()`);
  await wait('window.persistentCheck.editor.blockHistory.state.result && !window.persistentCheck.editor.blockHistory.state.selecting');
  assert.equal(await page.evaluate('window.persistentCheck.editor.blockHistory.state.storage'), 'persistent');
};
const closeHistory = async () => { await page.evaluate(`document.querySelector('[aria-label="Close Block history"]').click()`); await wait('!document.querySelector(".block-history-panel")', 5000); };
const insert = async value => {
  await page.evaluate(`(() => { const flow=document.querySelector('[data-block-id=paragraph-large] [contenteditable=true]'); flow.focus();
    const range=document.createRange();range.selectNodeContents(flow);range.collapse(false);const selection=document.getSelection();selection.removeAllRanges();selection.addRange(range);
    flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:${JSON.stringify(value)}})); })()`);
};
const verified = sequence => wait(`window.persistentCheck.status().verified === ${sequence} && window.persistentCheck.status().pendingCount === 0 && window.persistentCheck.status().pendingCapture === 0`);

try {
  await startServer();
  vite = await createServer({ configFile: false, plugins: [solidPlugin(), { name: 'persistent-history-fixture', configureServer(server) {
    server.middlewares.use('/__persistent-history-check', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><title>Persistent history seam check</title></head><body><script type="module" src="/src/history/persistent-ui.browser-check.tsx"></script></body></html>'); });
  } }], server: { host: '127.0.0.1', port: 0, hmr: false, watch: { ignored: ['**/*'] }, proxy: { '/api': `http://127.0.0.1:${serverPort}` } }, logLevel: 'error' });
  await vite.listen(); const url = `http://127.0.0.1:${vite.httpServer.address().port}/__persistent-history-check`;
  page = await browser.launch(); await page.navigate(url);
  await wait('window.persistentCheck && document.querySelector("[data-block-id=paragraph-large] [contenteditable=true]")');
  assert.match(await page.evaluate('window.persistentCheck.temporaryBoundary'), /finite session-history baseline\/state budget/);
  progress('25,000-character Document exceeds temporary adapter budget; opening real History context menu.');
  await openHistory();
  const segmentId = await page.evaluate('window.persistentCheck.status().segmentId');
  const baseline = await page.evaluate('window.persistentCheck.historical(0,window.persistentCheck.status().segmentId)');
  assert.ok(baseline.baselineBytes > 8 * 1024 * 1024); result.baselineBytes = baseline.baselineBytes;
  const oracles = [await page.evaluate('window.persistentCheck.oracle()')];
  await closeHistory();
  await insert(' edited'); oracles.push(await page.evaluate('window.persistentCheck.oracle()')); await verified(1);
  await page.evaluate('window.persistentCheck.editor.repository.undo()'); oracles.push(await page.evaluate('window.persistentCheck.oracle()')); await verified(2);
  await page.evaluate('window.persistentCheck.editor.repository.redo()'); oracles.push(await page.evaluate('window.persistentCheck.oracle()')); await verified(3);
  await page.evaluate('document.querySelector("#save-check").click()');
  await wait('!window.persistentCheck.saved.saving && window.persistentCheck.saved.lastSavedRevision === 3');
  const saved = JSON.parse(await readFile(path.join(directory, 'large-document.json'), 'utf8'));
  assert.equal(saved.format, 'codex-history-document'); assert.equal(saved.saved.segmentId, segmentId);
  progress('InputGateway edit, ordinary undo/redo and portable save verified.');
  await insert(' unsaved'); oracles.push(await page.evaluate('window.persistentCheck.oracle()')); await verified(4);
  // Stop the native process, commit one more exact edit to strict browser IDB,
  // then kill the entire browser without pagehide/dispose. No test-only outbox.
  await stopServer(); await insert(' offline'); oracles.push(await page.evaluate('window.persistentCheck.oracle()'));
  await wait('window.persistentCheck.status().browserCommitted === 5 && window.persistentCheck.status().pendingCount === 1');
  result.beforeCrash = await page.evaluate('window.persistentCheck.status()');
  await browser.kill(); progress('One offline edit is strict-IDB committed; browser and server killed.');
  await startServer(); page = await browser.launch(); await page.navigate(url);
  await wait('window.persistentCheck && window.persistentCheck.status().phase === "recording"');
  assert.equal(await page.evaluate('window.persistentCheck.text()'), initialText + ' edited');
  assert.deepEqual(await page.evaluate('window.persistentCheck.oracle()'), oracles[3]);
  await openHistory();
  assert.equal(await page.evaluate('window.persistentCheck.editor.blockHistory.state.segmentId'), segmentId);
  // CDP returnByValue does not preserve Array identity for Solid store proxies.
  const state = await page.evaluate('JSON.parse(JSON.stringify({entries:window.persistentCheck.editor.blockHistory.state.entries.map(e=>({revisionId:e.revisionId,cause:e.cause})),sessions:window.persistentCheck.editor.blockHistory.state.sessions,status:window.persistentCheck.status()}))');
  result.reopened = state;
  assert.equal(state.entries.length, 6); assert.deepEqual(state.entries.map(entry => entry.cause), ['baseline', 'edit', 'undo', 'redo', 'edit', 'edit']);
  assert.equal(state.sessions.length, 2); assert.equal(state.sessions.find(s => s.segmentId === segmentId).headSequence, 5);
  for (const [sequence, expected] of oracles.entries()) {
    const revisionId = state.entries[sequence].revisionId;
    await page.evaluate(`document.querySelector('[data-history-revision="${revisionId}"]').click()`);
    await wait(`window.persistentCheck.editor.blockHistory.state.selectedRevisionId === ${JSON.stringify(revisionId)} && !!window.persistentCheck.editor.blockHistory.state.result && !window.persistentCheck.editor.blockHistory.state.selecting`);
    const actual = await page.evaluate(`window.persistentCheck.historical(${sequence},${JSON.stringify(segmentId)})`);
    assert.deepEqual(actual.oracle, expected);
    const expectedText = expected.children[0].text;
    assert.equal(await page.evaluate(`document.querySelector('[aria-label="Selected historical state"] .block-history-text').textContent`), expectedText);
    assert.equal(await page.evaluate('window.persistentCheck.text()'), initialText + ' edited');
    assert.equal(await page.evaluate('document.querySelector(".block-history-panel [contenteditable=true], .block-history-panel iframe") === null'), true);
    result.assertions.push({ sequence, revisionId, exactFullAuthoredDocument: true, immutablePreviewText: true, liveSavedContentUnchanged: true, pathLength: actual.pathLength, checkpointSequence: actual.checkpointSequence });
  }
  assert.equal(await page.evaluate('window.persistentCheck.status().pendingCount'), 0);
  result.passed = true; result.browser = page.version.product;
  progress('All six exact revisions recovered across browser/server restart, including unsaved and offline history; live Document remains the saved revision.');
} catch (error) {
  result.errors.push(String(error?.stack ?? error));
  if (page) { try { result.failurePage = await page.evaluate('({body:document.body.innerText.slice(-2000),recording:window.persistentCheck?.status(),historyError:window.persistentCheck?.editor.blockHistory.state.error,recordingError:window.persistentCheck?.editor.blockHistory.state.recordingError})'); } catch {} }
  console.error(error); process.exitCode = 1;
} finally {
  result.finished = new Date().toISOString(); result.browserDiagnostics = browser.diagnostics;
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  await browser.close(); await vite?.close(); await stopServer();
  await rm(directory, { recursive: true, force: true });
}
