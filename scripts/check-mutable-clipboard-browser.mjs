// Isolated real Chrome clipboard/worker qualification. In-memory documents only.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const profile = await mkdtemp(path.join(tmpdir(), 'mutable-clipboard-'));
const vite = await createServer({ plugins: [{
  name: 'mutable-clipboard-proof',
  resolveId(id) { if (id === '/__clipboard.js') return '\0clipboard-proof'; },
  load(id) { if (id === '\0clipboard-proof') return `
    import {render} from 'solid-js/web'; import {createComponent} from 'solid-js';
    import {ReactiveEditor} from '/src/reactive-editor/editor.ts';
    import {registerCoreViews} from '/src/rendering/register-core-views.ts';
    import {ReactiveTreeView} from '/src/rendering/reactive-tree-view.tsx';
    import {exportClipboard,NATIVE_MIME} from '/src/interchange/transport.ts';
    import {plainFragment} from '/src/interchange/serializer.ts';
    import '/src/index.css';
    const editor=new ReactiveEditor({id:'doc',type:'document-block',children:[
      {id:'a',type:'standoff-editor-block',text:'Rome abc',standoffProperties:[{id:'old',type:'codex/entity-reference',value:'rome',start:0,end:3}]},
      {id:'b',type:'standoff-editor-block',text:'target'}]});
    editor.clipboard.setContext(()=>({cavernId:'proof',session:'proof'}));registerCoreViews(editor);
    const projection=editor.createView('proof');render(()=>createComponent(ReactiveTreeView,{editor,projection}),document.getElementById('root'));editor.installGateway(document);
    const node=id=>Object.values(projection.state.nodes).find(n=>n.payload.id===id);
    const select=(id,start,end=start)=>{const n=node(id),m=editor.mounts.get(n.key);m.focus();m.restoreInlineSelection({anchor:start,head:end});editor.selections.setPrimary(n.key,n.contentKey,n.viewId,start,end);return m.focusElement;};
    const paste=(data)=>{const transfer=new DataTransfer();for(const [type,value] of Object.entries(data))transfer.setData(type,value);document.activeElement.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer}));};
    window.proof={editor,node,select,paste,exportClipboard,plainFragment,NATIVE_MIME,texts:()=>editor.encodeDocument().children.map(c=>c.text)};
  `; },
  configureServer(server) { server.middlewares.use(async (req, res, next) => {
    if (req.url !== '/__clipboard') return next(); res.setHeader('Content-Type', 'text/html');
    res.end(await server.transformIndexHtml(req.url, '<html><body><div id="root"></div><script type="module" src="/__clipboard.js"></script></body></html>'));
  }); },
}], server: { host: '127.0.0.1', port: 0, hmr: false } });
await vite.listen();
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let out = ''; chrome.stderr.on('data', data => { out += data; const match = out.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
    chrome.once('error', reject); setTimeout(() => reject(Error('Chrome startup timeout')), 15000).unref();
  });
  socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(), errors = [], externalRequests = [];
  socket.addEventListener('message', event => {
    const m = JSON.parse(event.data), p = pending.get(m.id);
    if (p) { pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('clipboard-probe.invalid')) externalRequests.push(m.params.request.url);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(Error('CDP timeout: ' + method)); }, 45000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    socket.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value;
  };
  const wait = expression => evaluate(`(async()=>{for(let i=0;i<300;i++){if(${expression})return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+${JSON.stringify(expression)}+'; '+proof?.editor.clipboard.message())})()`);
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  await send('Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await send('Runtime.enable', {}, sessionId); await send('Page.bringToFront', {}, sessionId);
  await send('Network.enable', {}, sessionId);
  await send('Network.setBlockedURLs', { urls: ['*clipboard-probe.invalid*'] }, sessionId);
  await send('Page.navigate', { url: origin + '/__clipboard' }, sessionId); await wait('window.proof');
  const key = async (letter, shift = false) => {
    const details = { key: letter, code: 'Key' + letter.toUpperCase(), windowsVirtualKeyCode: letter.toUpperCase().charCodeAt(0), modifiers: 4 | (shift ? 8 : 0) };
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...details, commands: [letter === 'c' ? 'copy' : letter === 'x' ? 'cut' : shift ? 'pasteAndMatchStyle' : 'paste'] }, sessionId); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...details }, sessionId);
  };
  await evaluate(`proof.select('a',0,4)`); await key('c'); await wait("proof.editor.clipboard.message().startsWith('Copied')");
  const formats = await evaluate(`(async()=>{const items=await navigator.clipboard.read();return items.flatMap(i=>i.types)})()`);
  assert.ok(formats.includes('text/plain') && formats.includes('text/html'));
  await evaluate(`proof.select('b',1,3)`); await key('v'); await wait("proof.texts()[1]==='tRomeget'");
  assert.equal(await evaluate(`proof.node('b').payload.standoffProperties[0].value`), 'rome');
  assert.notEqual(await evaluate(`proof.node('b').payload.standoffProperties[0].id`), 'old');
  await evaluate(`proof.editor.repository.undo();proof.select('b',0)`); await key('v', true); await wait("proof.texts()[1]==='Rometarget'");
  assert.deepEqual(await evaluate(`JSON.parse(JSON.stringify(proof.node('b').payload.standoffProperties))`), []);
  await evaluate(`proof.editor.repository.undo();proof.select('a',0,4)`); await key('x'); await wait("proof.texts()[0]===' abc'");
  assert.equal(await evaluate('!!proof.editor.clipboard.recovery()'), true);
  await evaluate(`proof.editor.repository.undo();proof.select('b',0)`);
  // Real worker path, with a native carrier and enough atoms to exceed the async threshold.
  await evaluate(`proof.paste(proof.exportClipboard(proof.plainFragment('x'.repeat(18000))))`);
  await wait("proof.texts()[1].length===18006");
  await evaluate('proof.editor.repository.undo()'); assert.deepEqual(await evaluate('proof.texts()'), ['Rome abc', 'target']);
  // Reject completion when the user keeps typing during preparation.
  await evaluate(`proof.select('b',0);proof.paste(proof.exportClipboard(proof.plainFragment('x'.repeat(18000))));proof.editor.commands.replaceInlineRange(proof.node('b').key,0,0,'!')`);
  await wait("proof.editor.clipboard.message().includes('Destination changed')"); assert.deepEqual(await evaluate('proof.texts()'), ['Rome abc', '!target']);
  // External rich HTML uses the same worker/undo path and existing Block views.
  await evaluate(`proof.editor.repository.undo();proof.select('b',0,6);navigator.clipboard.write([new ClipboardItem({'text/html':new Blob(['<h2>Heading</h2><ol start="3"><li>first</li><li>second</li></ol><table><tr><th>Header</th><td>Cell</td></tr></table>'],{type:'text/html'}),'text/plain':new Blob(['Heading\\nfirst\\nsecond\\nHeader\\tCell'],{type:'text/plain'})})])`);
  await key('v');
  await wait(`document.querySelectorAll('.reactive-imported-list-marker').length===2`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.reactive-imported-list-marker')].map(n=>n.textContent)`), ['3.', '4.']);
  assert.equal(await evaluate(`document.querySelector('[role="columnheader"]').textContent.includes('Header')`), true);
  await evaluate('proof.editor.repository.undo()'); assert.deepEqual(await evaluate('proof.texts()'), ['Rome abc', 'target']);
  await evaluate(`proof.select('b',0,6);proof.paste({'text/html':'<b>'+('x'.repeat(18000))+'</b>'})`);
  await wait("proof.texts()[1].length===18000");
  assert.equal(await evaluate(`proof.node('b').payload.standoffProperties[0].type`), 'style/bold');
  await evaluate('proof.editor.repository.undo()'); assert.deepEqual(await evaluate('proof.texts()'), ['Rome abc', 'target']);
  await evaluate(`proof.select('b',0,6);proof.paste({'text/html':'<p onclick="window.__clipboardExecuted=true">A<img src="https://clipboard-probe.invalid/a.png" onerror="window.__clipboardExecuted=true" alt="map">B</p><script>window.__clipboardExecuted=true</script><style>@import "https://clipboard-probe.invalid/a.css";</style><iframe src="https://clipboard-probe.invalid/frame"></iframe>'})`);
  await evaluate(`new Promise(resolve=>setTimeout(resolve,150))`);
  assert.equal(await evaluate(`!!window.__clipboardExecuted`), false);
  assert.equal(await evaluate(`Object.values(proof.editor.repository.readState().contents).filter(c=>c.viewType==='image-cell'&&c.payload.src==='').length`), 1);
  assert.deepEqual(externalRequests, []);
  await evaluate('proof.editor.repository.undo()'); assert.deepEqual(await evaluate('proof.texts()'), ['Rome abc', 'target']);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: (await send('Browser.getVersion')).product, formats, nativeKeyboardCopyPaste: true, plainKeyboardPaste: true, acknowledgedCut: true, workerPasteAndUndo: true, staleWorkerCancelled: true, semanticHtmlRendering: true, htmlWorkerUndo: true, inertImages: true, externalRequests, errors }, null, 2));
} finally {
  socket?.close();
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) { const exited = new Promise(resolve => chrome.once('exit', resolve)); chrome.kill('SIGKILL'); await exited; }
  await vite.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
