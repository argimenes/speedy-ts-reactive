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

const output = process.env.HISTORY_SELECTION_RESULT ?? 'BLOCK_HISTORY_PRODUCTION_RESULTS.json';
try { await access(output); throw Error(`Refusing to overwrite ${output}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const directory = await mkdtemp(path.join(tmpdir(), 'codex-persistent-ui-'));
let browser = await isolatedBrowser();
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
  page = await browser.launch(); result.browser = page.version.product;
  for (const [name, length, surround] of [['surround-500', 200, 500], ['surround-5000', 200, 5000], ['surround-25000', 200, 25000], ['single-25000', 25000, 0]]) {
    const filename = `${name}-document.json`;
    await writeFile(path.join(directory, filename), JSON.stringify({ id: 'document-large', type: 'document-block', children: [
      { id: 'paragraph-large', type: 'standoff-editor-block', text: 'a'.repeat(length), standoffProperties: [{ id: 'bold-range', type: 'style/bold', start: 0, end: 4 }] },
      ...Array.from({length: surround / 100}, (_, i) => ({ id: `surround-${i}`, type: 'standoff-editor-block', text: 'b'.repeat(100) })),
    ] }));
    await page.navigate(url + '?file=' + filename);
    await wait('window.persistentCheck && document.querySelector("[data-block-id=paragraph-large] [contenteditable=true]")');
    await openHistory(); await wait('!!window.persistentCheck.editor.blockHistory.state.selectionTiming');
    const initialFallback = await page.evaluate('JSON.parse(JSON.stringify(window.persistentCheck.editor.blockHistory.state.selectionTiming))');
    await closeHistory();
    const status = () => page.evaluate(`(async () => {
      const recording=window.persistentCheck.status();
      const r=await fetch('/api/history/selectiveStatus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:{folder:'.',filename:${JSON.stringify(filename)},resourceId:'document-large',memoirId:recording.memoirId},segmentId:recording.segmentId})});
      return (await r.json()).Data;
    })()`);
    const ready = async sequence => {
      const end=Date.now()+120000;
      while(Date.now()<end) { const value=await status(); if(value.failure) throw Error(value.failure); if(value.ready.includes(sequence)) return value; await sleep(250); }
      throw Error('Derived maintenance timeout '+JSON.stringify(await status()));
    };
    await ready(0);
    const texts = [await page.evaluate('window.persistentCheck.text()')];
    await insert('X'); texts.push(await page.evaluate('window.persistentCheck.text()')); await verified(1); await ready(1);
    await page.evaluate('window.persistentCheck.editor.repository.undo()'); texts.push(await page.evaluate('window.persistentCheck.text()')); await verified(2); await ready(2);
    await page.evaluate('window.persistentCheck.editor.repository.redo()'); texts.push(await page.evaluate('window.persistentCheck.text()')); await verified(3);
    const maintenance = await ready(3);
    await openHistory(); await wait('!!window.persistentCheck.editor.blockHistory.state.selectionTiming');
    const entries = await page.evaluate('JSON.parse(JSON.stringify(window.persistentCheck.editor.blockHistory.state.entries))');
    assert.equal(entries.length, 4);
    const samples = [{ kind: 'cold', sequence: 3, timing: await page.evaluate('JSON.parse(JSON.stringify(window.persistentCheck.editor.blockHistory.state.selectionTiming))') }];
    for (const sequence of [0, 1, 2, 1, 3]) {
      await page.evaluate(`window.persistentCheck.editor.blockHistory.select(${JSON.stringify(entries[sequence].revisionId)})`);
      await wait('!!window.persistentCheck.editor.blockHistory.state.selectionTiming');
      assert.equal(await page.evaluate(`document.querySelector('[aria-label="Selected historical state"] .block-history-text').textContent`), texts[sequence]);
      assert.equal(await page.evaluate(`document.querySelector('[aria-label="Latest recorded state"] .block-history-text').textContent`), texts[3]);
      assert.equal(await page.evaluate('window.persistentCheck.text()'), texts[3]);
      samples.push({ kind: 'warm', sequence, timing: await page.evaluate('JSON.parse(JSON.stringify(window.persistentCheck.editor.blockHistory.state.selectionTiming))') });
    }
    const graphAbsent = await page.evaluate('!window.persistentCheck.editor.blockHistory.state.result.selected.fragment && !window.persistentCheck.editor.blockHistory.state.result.comparison.after.fragment');
    assert.equal(graphAbsent, true);
    for (const sample of samples) assert.equal(sample.timing.route, surround ? 'selective' : 'full');
    const authoritative = await page.evaluate('window.persistentCheck.historical(3, window.persistentCheck.status().segmentId).then(v=>({baselineBytes:v.baselineBytes}))');
    const replayInfo = await page.evaluate(`(async()=>{ const r=window.persistentCheck.status(); const v=await fetch('/api/history/path',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:{folder:'.',filename:${JSON.stringify(filename)},resourceId:'document-large',memoirId:r.memoirId},segmentId:r.segmentId,sequence:3})});const p=(await v.json()).Data;return {recordBytes:p.records.map(w=>new TextEncoder().encode(w).length)};})()`);
    result.fixtures ??= []; result.fixtures.push({ name, length, surround, baselineBytes:authoritative.baselineBytes, compactRevisionBytes:replayInfo.recordBytes,
      initialFallback, maintenance, samples, exactPreviewAndLiveInvariance: true, compactBoundary:graphAbsent });
    progress(JSON.stringify({name, times: samples.map(s => Math.round(s.timing.totalMs))}));
    await page.evaluate('window.persistentCheck.editor.dispose()');
    await page.navigate('about:blank');
    // IDs intentionally match across fixture sizes, but their archives are separate.
    await browser.kill(); await browser.close();
    if (name !== 'single-25000') { browser = await isolatedBrowser(); page = await browser.launch(); }
  }
  result.passed = true;
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
