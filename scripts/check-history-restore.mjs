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

const output = process.env.HISTORY_PERSISTENT_RESULT ?? 'BLOCK_HISTORY_RESTORE_CHECK.json';
try { await access(output); throw Error(`Refusing to overwrite ${output}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const directory = await mkdtemp(path.join(tmpdir(), 'codex-persistent-ui-'));
const browser = await isolatedBrowser();
const result = { passed: false, started: new Date().toISOString(), assertions: [], phases: [], errors: [] };
const progress = value => { result.phases.push({ at: new Date().toISOString(), value }); console.log(value); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const initialText = 'a'.repeat(25_000);
await writeFile(path.join(directory, 'large-document.json'), JSON.stringify({ id: 'document-large', type: 'document-block', children: [
  { id: 'paragraph-large', type: 'standoff-editor-block', text: initialText,
    blockProperties: [{ type: 'block/alignment/left ' }, { id: 'font', type: 'block/font/size', value: 'normal', metadata: {}, isDeleted: false }],
    standoffProperties: [
      { id: 'bold-range', type: 'style/bold', start: 0, end: 4, value: '', text: 'aaaa', metadata: {}, plugin: null, isDeleted: false },
      { id: 'colour-range', type: 'text/colour', start: 0, end: 4, value: '#123456', metadata: {}, attributes: {} },
      { id: 'super-range', type: 'style/superscript', start: 5, end: 8 },
    ] },
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
    const editor=window.persistentCheck.editor, state=editor.repository.readState();
    const content=Object.values(state.contents).find(c=>c.payload.id==='paragraph-large');
    const key=Object.values(state.placements).find(p=>p.contentKey===content.key).key;
    editor.commands.transaction('Edit text and formatting',()=>{
      flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:${JSON.stringify(value)}}));
      editor.commands.setPayloadField(key,'standoffProperties',[{type:'style/underline',start:0,end:4}]);
      editor.commands.setPayloadField(key,'blockProperties',[{type:'block/font/size',value:'h4'}]);
    }); })()`);
};
const authored = oracle => {
  const block = structuredClone(oracle.children[0]);
  for (const field of ['standoffProperties', 'blockProperties']) for (const property of block[field] ?? []) delete property.id;
  return block;
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
  progress('Enrollment and baseline oracle ready.');
  const oracles = [await page.evaluate('window.persistentCheck.oracle()')];
  await closeHistory(); await insert(' edited'); await verified(1);
  oracles.push(await page.evaluate('window.persistentCheck.oracle()'));
  assert.notDeepEqual(oracles[1].children[0].standoffProperties,oracles[0].children[0].standoffProperties);
  assert.notDeepEqual(oracles[1].children[0].blockProperties,oracles[0].children[0].blockProperties);
  progress('Reading current identity.');
  const identity = await page.evaluate(`(() => {const s=window.persistentCheck.editor.repository.readState(); const c=Object.values(s.contents).find(c=>c.payload.id==='paragraph-large'); const p=Object.values(s.placements).find(p=>p.contentKey===c.key); return {blockId:c.payload.id,contentKey:c.key,placementKey:p.key,placementId:p.placementId,revision:s.revision};})()`);
  progress('Edit verified; opening selection.');
  await openHistory();
  const entries = await page.evaluate('JSON.parse(JSON.stringify(window.persistentCheck.editor.blockHistory.state.entries))');
  await page.evaluate(`window.persistentCheck.editor.blockHistory.select(${JSON.stringify(entries[0].revisionId)})`);
  await wait('window.persistentCheck.editor.blockHistory.state.result && !window.persistentCheck.editor.blockHistory.state.selecting');
  assert.equal(await page.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Restore this Block…').disabled`), false);
  await page.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Restore this Block…').click()`);
  progress('Restore preparation requested.');
  await wait('window.persistentCheck.editor.blockHistory.state.restoreConfirmation');
  progress('Confirmation prepared.');
  assert.equal(await page.evaluate('window.persistentCheck.editor.repository.state.revision'), identity.revision);
  const confirmation = await page.evaluate(`document.querySelector('[aria-label="Confirm Block restore"]').textContent`);
  assert.ok(confirmation.includes(entries[0].revisionId)); assert.ok(confirmation.includes('does not rewind or truncate'));
  await page.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm Restore this Block').click()`);
  progress('Restore confirmed; waiting for durable capture.');
  await verified(2);
  assert.equal(await page.evaluate('window.persistentCheck.text()'), initialText);
  const restoredIdentity = await page.evaluate(`(() => {const s=window.persistentCheck.editor.repository.readState();const c=s.contents[${JSON.stringify(identity.contentKey)}],p=s.placements[${JSON.stringify(identity.placementKey)}];return {blockId:c.payload.id,contentKey:c.key,placementKey:p.key,placementId:p.placementId,revision:s.revision};})()`);
  assert.deepEqual(restoredIdentity, {...identity,revision:identity.revision+1});
  oracles.push(await page.evaluate('window.persistentCheck.oracle()'));
  assert.deepEqual(authored(oracles[2]),authored(oracles[0]));
  result.ordinaryTextAndFormattingRestored=true;
  await page.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Show latest revisions').click()`);
  await wait('window.persistentCheck.editor.blockHistory.state.entries.length === 3 && !window.persistentCheck.editor.blockHistory.state.selecting');
  assert.equal(await page.evaluate('window.persistentCheck.editor.blockHistory.state.entries[2].label'), 'Restore this Block');
  assert.equal(await page.evaluate('window.persistentCheck.editor.blockHistory.state.entries[2].cause'), 'edit');
  await closeHistory();
  await page.evaluate('window.persistentCheck.editor.repository.undo()'); await verified(3);
  assert.equal(await page.evaluate('window.persistentCheck.text()'), initialText+' edited');
  oracles.push(await page.evaluate('window.persistentCheck.oracle()'));
  assert.deepEqual(oracles[3],oracles[1]);
  await page.evaluate('window.persistentCheck.editor.repository.redo()'); await verified(4);
  oracles.push(await page.evaluate('window.persistentCheck.oracle()')); assert.deepEqual(oracles[4],oracles[2]);
  await page.evaluate('document.querySelector("#save-check").click()');
  await wait('!window.persistentCheck.saved.saving && window.persistentCheck.saved.lastSavedRevision === 4');
  progress('Confirmed restore created one normal revision; History, Undo, Redo and semantic identities verified.');
  await browser.kill(); await stopServer(); await startServer(); page=await browser.launch(); await page.navigate(url);
  await wait('window.persistentCheck && window.persistentCheck.status().phase === "recording"');
  assert.deepEqual(await page.evaluate('window.persistentCheck.oracle()'),oracles[4]);
  await openHistory();
  const state=await page.evaluate('JSON.parse(JSON.stringify({entries:window.persistentCheck.editor.blockHistory.state.entries,segmentId:window.persistentCheck.editor.blockHistory.state.segmentId}))');
  assert.equal(state.segmentId,segmentId); assert.equal(state.entries.length,5);
  assert.deepEqual(state.entries.map(e=>e.cause),['baseline','edit','edit','undo','redo']);
  assert.equal(state.entries[0].revisionId,entries[0].revisionId); assert.equal(state.entries[1].revisionId,entries[1].revisionId);
  for (const [sequence, expected] of oracles.entries()) {
    const revisionId=state.entries[sequence].revisionId;
    await page.evaluate(`window.persistentCheck.editor.blockHistory.select(${JSON.stringify(revisionId)})`);
    await wait('window.persistentCheck.editor.blockHistory.state.result && !window.persistentCheck.editor.blockHistory.state.selecting');
    const actual=await page.evaluate(`window.persistentCheck.historical(${sequence},${JSON.stringify(segmentId)})`);
    assert.deepEqual(actual.oracle,expected);
    assert.equal(await page.evaluate(`document.querySelector('[aria-label="Selected historical state"] .block-history-text').textContent`),expected.children[0].text);
    assert.equal(await page.evaluate('window.persistentCheck.text()'),initialText);
    assert.equal(await page.evaluate('!!window.persistentCheck.editor.blockHistory.state.result.selected.fragment'),false);
    result.assertions.push({sequence,revisionId,exactFullAuthoredDocument:true,immutableEvidence:true,compactPreview:true});
  }
  result.identityPreserved=true;result.singleUndoableRestore=true;result.restart=true;
  result.passed=true;result.browser=page.version.product;
  progress('All five revisions remain exact after restart, including the original source and pre-restore version.');
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
