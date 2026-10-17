// Isolated Chrome clipboard/worker qualification; temporary Cavern assets and native reload.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import express from 'express';
import sharp from 'sharp';
import { createManagedAssetService } from '../server/managed-assets-router.mjs';
import { closeFilesystemWorkers } from './stage-c-gates/filesystem.mjs';
const profile = await mkdtemp(path.join(tmpdir(), 'mutable-clipboard-'));
const assetRoot = await mkdtemp(path.join(tmpdir(), 'mutable-clipboard-assets-'));
const assetService = createManagedAssetService({ root: assetRoot, cavernId: 'proof', session: 'proof' });
await assetService.recover();
const assetApp = express(); assetApp.use(express.json());
assetApp.use('/api/assets',(req,res,next)=>req.header('X-Mutable-Cavern') === 'proof' ? next() : res.sendStatus(409));
assetApp.use('/api/assets', assetService.router);
const imageBytes = await sharp({ create:{width:3,height:2,channels:3,background:'#c06020'} }).png().toBuffer();
const imageBase64 = imageBytes.toString('base64');
// Optional live regression for a consented remote image; ordinary qualification stays network-independent.
const remoteImageUrl = process.env.CLIPBOARD_REMOTE_IMAGE_URL;
const vite = await createServer({ plugins: [{
  name: 'mutable-clipboard-proof',
  resolveId(id) { if (id === '/__clipboard.js') return '\0clipboard-proof'; },
  load(id) { if (id === '\0clipboard-proof') return `
    import {render} from 'solid-js/web'; import {createComponent} from 'solid-js';
    import {ReactiveEditor} from '/src/reactive-editor/editor.ts';
    import {registerCoreViews} from '/src/rendering/register-core-views.ts';
    import {ReactiveTreeView} from '/src/rendering/reactive-tree-view.tsx';
    import {exportClipboard,NATIVE_MIME} from '/src/interchange/transport.ts';
    import {captureNative,nativeEnvelope,admitNative} from '/src/persistence/native-resource.ts';
    import {plainFragment} from '/src/interchange/serializer.ts';
    import '/src/index.css';
    document.addEventListener('paste',event=>{const f=event.clipboardData?.files[0];if(f)window.receivedImageBytes=f.arrayBuffer().then(b=>Array.from(new Uint8Array(b)));},true);
    const editor=new ReactiveEditor({id:'doc',type:'document-block',children:[
      {id:'a',type:'standoff-editor-block',text:'Rome abc',standoffProperties:[{id:'old',type:'codex/entity-reference',value:'rome',start:0,end:3}]},
      {id:'b',type:'standoff-editor-block',text:'target'}]});
    editor.clipboard.setContext(()=>({cavernId:'proof',session:'proof'}));registerCoreViews(editor);
    const projection=editor.createView('proof');const disposeView=render(()=>createComponent(ReactiveTreeView,{editor,projection}),document.getElementById('root'));editor.installGateway(document);
    const node=id=>Object.values(projection.state.nodes).find(n=>n.payload.id===id);
    const select=(id,start,end=start)=>{const n=node(id),m=editor.mounts.get(n.key);m.focus();m.restoreInlineSelection({anchor:start,head:end});editor.selections.setPrimary(n.key,n.contentKey,n.viewId,start,end);return m.focusElement;};
    const paste=(data)=>{const transfer=new DataTransfer();for(const [type,value] of Object.entries(data))transfer.setData(type,value);document.activeElement.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer}));};
    window.proof={editor,node,select,paste,reopen:bytes=>{
      disposeView();editor.dispose();
      const fresh=new ReactiveEditor({id:'bank',type:'workspace-object-bank-block',children:[]},{features:{directDomCharacterCells:false}});fresh.clipboard.setContext(()=>({cavernId:'proof',session:'proof'}));registerCoreViews(fresh);
      const bank=Object.values(fresh.repository.readState().contents).find(c=>c.viewType==='workspace-object-bank-block');
      const admitted=admitNative(fresh.repository,bytes,bank.key);const view=fresh.createView('reopened',admitted.placementKey);
      render(()=>createComponent(ReactiveTreeView,{editor:fresh,projection:view}),document.getElementById('root'));fresh.installGateway(document);
    },captureNative,nativeEnvelope,admitNative,exportClipboard,plainFragment,NATIVE_MIME,texts:()=>editor.encodeDocument().children.map(c=>c.text)};
  `; },
  configureServer(server) { server.middlewares.use(assetApp); server.middlewares.use(async (req, res, next) => {
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
  await wait('!!proof.editor.clipboard.imagePrompt()');
  await evaluate(`proof.editor.clipboard.chooseImages([])`);
  await wait(`Object.values(proof.editor.repository.readState().contents).some(c=>c.viewType==='image-cell'&&c.payload.src==='')`);
  assert.equal(await evaluate(`!!window.__clipboardExecuted`), false);
  assert.equal(await evaluate(`Object.values(proof.editor.repository.readState().contents).filter(c=>c.viewType==='image-cell'&&c.payload.src==='').length`), 1);
  assert.deepEqual(externalRequests, []);
  await evaluate('proof.editor.repository.undo()'); assert.deepEqual(await evaluate('proof.texts()'), ['Rome abc', 'target']);
  // Explicit Markdown uses the real OS read, existing menu and cancellable worker.
  await evaluate(`proof.select('b',0,6);navigator.clipboard.writeText('# Markdown\\n\\n3. item\\n4. next\\n\\n| A | B |\\n| - | - |\\n| x | y |')`);
  await evaluate(`proof.editor.overlays.open({ownerKey:proof.node('b').key,viewType:'context-menu',anchor:{x:20,y:20}})`);
  await wait(`[...document.querySelectorAll('[role="menuitem"]')].some(n=>n.textContent==='Paste as Markdown')`);
  await evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find(n=>n.textContent==='Paste as Markdown').click()`);
  await wait(`document.querySelectorAll('.reactive-imported-list-marker').length===2`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.reactive-imported-list-marker')].map(n=>n.textContent)`), ['3.', '4.']);
  assert.equal(await evaluate(`proof.editor.encodeDocument().children[1].blockProperties[0].type`), 'block/font/size/h1');
  assert.equal(await evaluate(`document.querySelector('[role="columnheader"]').textContent.includes('A')`), true);
  await evaluate('proof.editor.repository.undo()'); assert.deepEqual(await evaluate('proof.texts()'), ['Rome abc', 'target']);
  await evaluate('proof.editor.repository.redo()');
  assert.equal(await evaluate(`!!document.querySelector('[role="columnheader"]')`), true);
  await evaluate('proof.editor.repository.undo()');
  // MIME recognition, inert images and raw HTML share the same policies as HTML.
  await evaluate(`proof.select('b',0,6);proof.paste({'text/markdown':'A![map](https://clipboard-probe.invalid/md.png "Map")B\\n\\n<script>window.__clipboardExecuted=true</script>'})`);
  await wait('!!proof.editor.clipboard.imagePrompt()');
  await evaluate(`proof.editor.clipboard.chooseImages([])`);
  await wait(`Object.values(proof.editor.repository.readState().contents).some(c=>c.viewType==='image-cell'&&c.payload.src==='')`);
  assert.equal(await evaluate(`!!window.__clipboardExecuted`), false);
  assert.equal(await evaluate(`document.querySelector('.reactive-inline-image img').hasAttribute('src')`), false);
  await evaluate('proof.editor.repository.undo()'); assert.deepEqual(await evaluate('proof.texts()'), ['Rome abc', 'target']);
  await evaluate(`proof.select('b',0,6);proof.paste({'text/plain':'**literal**'})`);
  assert.deepEqual(await evaluate('proof.texts()'), ['Rome abc', '**literal**']);
  await evaluate('proof.editor.repository.undo()');
  await evaluate(`proof.select('b',0,6);proof.paste({'text/markdown':'**'+('x'.repeat(18000))+'**'})`);
  await wait("proof.texts()[1].length===18000");
  await evaluate('proof.editor.repository.undo()'); assert.deepEqual(await evaluate('proof.texts()'), ['Rome abc', 'target']);
  if (remoteImageUrl) {
    const html = `<img src="${remoteImageUrl.replaceAll('&','&amp;').replaceAll('"','&quot;')}" alt="Remote image regression">`;
    await evaluate(`proof.editor.commands.replaceInlineRange(proof.node('b').key,0,6,'');proof.select('b',0);proof.paste({'text/html':${JSON.stringify(html)}})`);
    await wait('!!proof.editor.clipboard.imagePrompt()');
    assert.deepEqual(await evaluate('proof.texts()'), ['Rome abc', '']);
    assert.deepEqual(await evaluate('proof.editor.clipboard.imagePrompt().urls'), [remoteImageUrl]);
    await evaluate(`[...document.querySelectorAll('[data-mutable-image-consent] button')].find(b=>b.textContent==='Download selected images').click()`);
    await wait(`document.querySelector('.reactive-inline-image img')?.naturalWidth>0`);
    const ref=await evaluate(`Object.values(proof.editor.repository.readState().contents).find(c=>c.viewType==='image-cell').payload.asset`);
    const stored=await assetService.store.get(ref.assetId,'proof');
    assert.ok(stored.bytes.length>0);assert.equal(stored.manifest.byteLength,stored.bytes.length);
    await evaluate('proof.editor.repository.undo()');assert.deepEqual(await evaluate('proof.texts()'), ['Rome abc', '']);
    await evaluate('proof.editor.repository.redo()');await wait(`document.querySelector('.reactive-inline-image img')?.naturalWidth>0`);
    await evaluate('proof.editor.repository.undo();proof.editor.repository.undo()');assert.deepEqual(await evaluate('proof.texts()'), ['Rome abc', 'target']);
    console.log('Consented remote image download, managed display and Undo/Redo: passed', JSON.stringify({bytes:stored.bytes.length,mediaType:stored.manifest.mediaType}));
  }
  // A real OS image-only clipboard import: original bytes -> Cavern -> runtime URL.
  await evaluate(`proof.select('b',0,6);proof.paste({'text/html':'<p>before</p><p></p><p>after</p>'});navigator.clipboard.write([new ClipboardItem({'image/png':new Blob([Uint8Array.from(atob(${JSON.stringify(imageBase64)}),c=>c.charCodeAt(0))],{type:'image/png'})})])`);
  assert.deepEqual(await evaluate('proof.texts()'),['Rome abc','before','','after']);
  const emptyPoint=await evaluate(`(()=>{const n=Object.values(proof.editor.projections.get('proof').state.nodes).find(n=>n.viewType==='standoff-editor-block'&&!n.inlineContent.length);proof.emptyKey=n.key;const el=proof.editor.mounts.get(n.key).focusElement;el.scrollIntoView();const r=el.getBoundingClientRect();return {x:r.left+10,y:r.top+r.height/2};})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...emptyPoint},sessionId);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...emptyPoint},sessionId);
  // Empty contenteditable hosts can retain focus without a native caret range.
  await evaluate(`document.getSelection().removeAllRanges();proof.editor.selections.clearExcept();`);
  assert.equal(await evaluate(`document.activeElement===proof.editor.mounts.get(proof.emptyKey).focusElement`),true);
  assert.equal(await evaluate(`!!proof.editor.mounts.get(proof.emptyKey).captureInlineSelection()`),false);
  await key('v');
  await wait(`document.querySelector('.reactive-inline-image img')?.naturalWidth===3`);
  await evaluate('proof.editor.repository.undo()');assert.deepEqual(await evaluate('proof.texts()'),['Rome abc','before','','after']);
  await evaluate('proof.editor.repository.redo()');await wait(`document.querySelector('.reactive-inline-image img')?.naturalWidth===3`);
  await evaluate('proof.editor.repository.undo();proof.editor.repository.undo()');assert.deepEqual(await evaluate('proof.texts()'),['Rome abc','target']);
  console.log('Empty TextBlock image Command-V and Undo/Redo: passed');
  await evaluate(`proof.select('b',0,6);navigator.clipboard.write([new ClipboardItem({'image/png':new Blob([Uint8Array.from(atob(${JSON.stringify(imageBase64)}),c=>c.charCodeAt(0))],{type:'image/png'})})])`);
  await key('v');
  await wait(`document.querySelector('.reactive-inline-image img')?.naturalWidth===3`);
  const reference=await evaluate(`Object.values(proof.editor.repository.readState().contents).find(c=>c.viewType==='image-cell').payload.asset`);
  assert.equal(reference.cavernId,'proof');
  assert.deepEqual((await assetService.store.get(reference.assetId,'proof')).bytes,Buffer.from(await evaluate('window.receivedImageBytes')));
  const imageState=await evaluate(`JSON.stringify(proof.nativeEnvelope(proof.captureNative(proof.editor.repository.readState(),'doc')))`);
  assert.ok(imageState.includes(reference.assetId));assert.equal(imageState.includes('blob:'),false);
  await evaluate('proof.editor.repository.undo()');assert.deepEqual(await evaluate('proof.texts()'),['Rome abc','target']);
  await evaluate('proof.editor.repository.redo()');await wait(`document.querySelector('.reactive-inline-image img')?.naturalWidth===3`);
  // Native recopy resolves an admitted asset but gives the pasted Cell a fresh identity.
  await evaluate(`proof.select('b',0,1)`);await key('c');await wait(`proof.editor.clipboard.message().startsWith('Copied')`);
  const firstImageKey=await evaluate(`Object.values(proof.editor.repository.readState().contents).find(c=>c.viewType==='image-cell').key`);
  await evaluate(`proof.select('a',0)`);await key('v');await wait(`document.querySelectorAll('.reactive-inline-image img').length===2`);
  assert.equal(await evaluate(`new Set(Object.values(proof.editor.repository.readState().contents).filter(c=>c.viewType==='image-cell').map(c=>c.key)).size`),2);
  assert.equal(await evaluate(`Object.values(proof.editor.repository.readState().contents).filter(c=>c.viewType==='image-cell').every(c=>c.payload.asset?.assetId===${JSON.stringify(reference.assetId)})`),true, JSON.stringify(await evaluate(`({message:proof.editor.clipboard.message(),images:Object.values(proof.editor.repository.readState().contents).filter(c=>c.viewType==='image-cell').map(c=>c.payload)})`)));
  await evaluate('proof.editor.repository.undo();proof.editor.repository.undo()');assert.deepEqual(await evaluate('proof.texts()'),['Rome abc','target']);
  // Reopen native bytes through the real codec, then resolve the same portable original.
  await evaluate(`proof.reopen(new TextEncoder().encode(${JSON.stringify(imageState)}))`);
  await wait(`document.querySelector('.reactive-inline-image img')?.naturalWidth===3`);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log(JSON.stringify({ browser: (await send('Browser.getVersion')).product, formats, nativeKeyboardCopyPaste: true, plainKeyboardPaste: true, acknowledgedCut: true, workerPasteAndUndo: true, staleWorkerCancelled: true, semanticHtmlRendering: true, htmlWorkerUndo: true, markdownMenuAndOsRead: true, markdownMime: true, markdownWorkerUndo: true, managedImageOsPaste: true, managedImageUndoRedo: true, managedImageNativeReload: true, inertImages: true, externalRequests, errors }, null, 2));
} finally {
  socket?.close();
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) { const exited = new Promise(resolve => chrome.once('exit', resolve)); chrome.kill('SIGKILL'); await exited; }
  await vite.close(); await assetService.close(); await closeFilesystemWorkers(); await rm(assetRoot,{recursive:true,force:true}); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
