// Isolated Chrome fixture. No document-store writes or changes to the user's browser.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-cross-selection-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = ''; chrome.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
    chrome.once('error', reject); setTimeout(() => reject(new Error('Chrome startup timeout')), 15000).unref();
  });
  socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map();
  socket.addEventListener('message', event => { const r = JSON.parse(event.data), p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(new Error(JSON.stringify(r.error))) : p.resolve(r.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const key = ++id; const timer=setTimeout(()=>{pending.delete(key);reject(new Error('Timed out: '+method+' '+JSON.stringify(params).slice(0,180)));},30000); pending.set(key, { resolve: value=>{clearTimeout(timer);resolve(value);}, reject: error=>{clearTimeout(timer);reject(error);} }); socket.send(JSON.stringify({ id: key, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value;
  };
  const mouse = (type, p, buttons = 0) => send('Input.dispatchMouseEvent', { type, ...p, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: 1 }, sessionId);
  const key = async (key, modifiers = 0) => {
    const vk = {ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Escape:27,Backspace:8,Enter:13}[key];
    const details = {key,code:key.length===1?'Key'+key.toUpperCase():key,modifiers,...(vk?{windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk}:{})};
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...details }, sessionId);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...details }, sessionId);
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url: process.env.BENCHMARK_URL ?? 'http://localhost:3000/' }, sessionId);
  await evaluate('new Promise(resolve => setTimeout(resolve, 1200))');
  if (process.env.ACTUAL_APP) {
    const checkbox = await evaluate(`(() => {const e=document.querySelector('[aria-label="Experimental cross-Block text selection"]');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await mouse('mousePressed',checkbox,1);await mouse('mouseReleased',checkbox);
    const point = async text => evaluate(`(() => {const flow=[...document.querySelectorAll('.reactive-standoff-flow')].find(f=>f.textContent.startsWith(${JSON.stringify(text)}));flow.scrollIntoView({block:'center'});const r=flow.children[3].getBoundingClientRect();return {x:r.left+1,y:r.top+r.height/2};})()`);
    const a = await point('Once upon'), b = await point('... while');
    await evaluate(`window.actualCapture=[];window.addEventListener('gotpointercapture',e=>actualCapture.push(e.target.getAttribute('data-block-type')),true);const originalCapture=Element.prototype.setPointerCapture;Element.prototype.setPointerCapture=function(id){const result=originalCapture.call(this,id);actualCapture.push('requested:'+this.getAttribute('data-block-type')+':'+this.hasPointerCapture(id)+':'+this.isConnected);return result;}`);
    await mouse('mouseMoved',a);await mouse('mousePressed',a,1);await mouse('mouseMoved',{x:a.x+4,y:a.y+2},1);await mouse('mouseMoved',b,1);await mouse('mouseReleased',b);
    const actual = await evaluate(`({checked:document.querySelector('[aria-label="Experimental cross-Block text selection"]').checked,readonly:[...document.querySelectorAll('.reactive-standoff-flow[contenteditable="false"]')].map(e=>e.textContent),status:[...document.querySelectorAll('.document-style-bar [role="status"]')].map(e=>e.textContent),selection:getSelection().toString(),capture:actualCapture})`);
    assert.equal(actual.checked,true);assert.equal(actual.readonly.length,2);assert.ok(actual.readonly[0].startsWith('Once upon'));assert.ok(actual.readonly[1].startsWith('... while'));assert.ok(actual.capture.includes('requested:standoff-editor-block:true:true'),JSON.stringify(actual));
    await send('Page.reload',{},sessionId);await new Promise(resolve=>setTimeout(resolve,1200));
    assert.equal(await evaluate('document.querySelector(\'[aria-label="Experimental cross-Block text selection"]\').checked'),true);
    assert.equal(await evaluate('document.querySelectorAll(\'.reactive-standoff-flow[contenteditable="false"]\').length'),0);
    await evaluate('document.querySelector(\'[aria-label="Experimental cross-Block text selection"]\').click()');
    await send('Page.reload',{},sessionId);await new Promise(resolve=>setTimeout(resolve,1200));
    assert.equal(await evaluate('document.querySelector(\'[aria-label="Experimental cross-Block text selection"]\').checked'),false);
    actual.preferenceReload={optIn:true,optOut:true,selectionNotPersisted:true};
    console.log(JSON.stringify(actual,null,2));
    process.exitCode = 0;
  } else {
  // Native feasibility baseline: independent editing hosts, as in the current editor.
  await evaluate(`(() => {
    const host = document.createElement('div'); host.id = 'native-probe'; host.style.cssText = 'position:fixed;inset:0;background:white;padding:100px;z-index:9999;font:24px monospace';
    host.innerHTML = '<div id="probe-a" contenteditable="true">First paragraph</div><div id="probe-b" contenteditable="true">Second paragraph</div>'; document.body.append(host);
  })()`);
  const probePoint = id => evaluate(`(() => {const r=document.getElementById('${id}').getBoundingClientRect();return {x:r.x+45,y:r.y+r.height/2};})()`);
  const a = await probePoint('probe-a'), b = await probePoint('probe-b');
  await mouse('mousePressed', a, 1); await mouse('mouseMoved', b, 1); await mouse('mouseReleased', b);
  const nativeDrag = await evaluate(`({anchor:getSelection().anchorNode?.parentElement.id,head:getSelection().focusNode?.parentElement.id,text:getSelection().toString()})`);
  await evaluate(`(() => {const a=document.getElementById('probe-a');a.focus();getSelection().setPosition(a.firstChild,a.textContent.length);})()`);
  await key('ArrowRight', 8);
  const nativeShift = await evaluate(`({anchor:getSelection().anchorNode?.parentElement.id,head:getSelection().focusNode?.parentElement.id,text:getSelection().toString()})`);
  await evaluate(`document.getElementById('native-probe').remove()`);
  const report = { browser: await send('Browser.getVersion'), nativeDrag, nativeShift };
  if (!process.env.CROSS_IMPLEMENTED) { console.log(JSON.stringify(report, null, 2)); }
  else {
    await evaluate(`(async () => {
      const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');
      const {registerCoreViews}=await import('/src/rendering/register-core-views.ts');
      const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
      const {DocumentStyleBar}=await import('/src/rendering/document-style-bar.tsx');
      const source=await (await fetch('/src/rendering/reactive-tree-view.tsx')).text();
      const webPath=source.split('"').find(part=>part.startsWith('/node_modules/.vite/deps/solid-js_web.js'));
      const {render,createComponent}=await import(webPath);
      const host=document.createElement('div');host.className='workspace-demo';host.style.cssText='position:fixed;inset:0;padding:60px 120px;background:white;z-index:10000;overflow:auto';document.body.append(host);
      const editor=new ReactiveEditor({type:'document-block',children:['a','b','c'].map(id=>({id,type:'standoff-editor-block',text:'Paragraph '+id+' — select across Blocks.'}))});
      registerCoreViews(editor);const projection=editor.createView('cross-browser');
      const dispose=render(()=>[createComponent(DocumentStyleBar,{editor}),createComponent(ReactiveTreeView,{editor,projection})],host);editor.installGateway(document);
      window.crossCheck={editor,host,dispose,node:id=>Object.values(projection.state.nodes).find(n=>n.payload.id===id)};
      window.crossPage=(data)=>{
        const host=document.createElement('div');host.className='workspace-demo';host.style.cssText='position:fixed;inset:0;padding:10px 50px;background:white;z-index:10000;overflow:auto';document.body.append(host);
        const editor=new ReactiveEditor(data);registerCoreViews(editor);const projection=editor.createView('real-page-browser');
        const dispose=render(()=>[createComponent(DocumentStyleBar,{editor}),createComponent(ReactiveTreeView,{editor,projection})],host);editor.installGateway(document);
        window.crossCheck={editor,host,dispose,node:id=>Object.values(projection.state.nodes).find(n=>n.payload.id===id)};
      };
      window.crossLarge=()=>{
        const host=document.createElement('div');host.className='workspace-demo';host.style.cssText='position:fixed;inset:0;padding:60px 120px;background:white;z-index:10000;overflow:auto';document.body.append(host);
        const editor=new ReactiveEditor({type:'document-block',children:Array.from({length:300},(_,i)=>({id:'p'+i,type:'standoff-editor-block',text:'Long document paragraph '+i+' with enough text to select.'}))});
        registerCoreViews(editor);const projection=editor.createView('cross-large');
        const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);
        window.crossCheck={editor,host,dispose,node:id=>Object.values(projection.state.nodes).find(n=>n.payload.id===id)};
      };
    })()`);
    const boundary = (id, index) => evaluate(`(() => {const {editor,node}=crossCheck;const mount=editor.mounts.get(node('${id}').key),p=mount.inlineBoundary(${index});const r=document.createRange();r.setStart(p.node,p.offset);r.collapse(true);const b=r.getClientRects()[0];return {x:b.left+1,y:b.top+b.height/2};})()`);
    const drag = async (a, b) => { await mouse('mousePressed', a, 1); await mouse('mouseMoved', { x: a.x + 5, y: a.y + 3 }, 1); await mouse('mouseMoved', b, 1); await mouse('mouseReleased', b); };
    const original = await evaluate('crossCheck.editor.encodeDocument().children');
    await evaluate(`crossCheck.host.querySelector('[aria-label="Experimental cross-Block text selection"]').click()`);
    await drag(await boundary('a', 3), await boundary('c', 8));
    assert.deepEqual(await evaluate('Object.values(crossCheck.editor.crossText.segments).filter(Boolean).map(s=>[crossCheck.editor.node(s.nodeKey).payload.id,s.start,s.end])'), [['a',3,35],['b',0,35],['c',0,8]]);
    assert.deepEqual(await evaluate('crossCheck.editor.encodeDocument().children'), original);
    assert.equal(await evaluate('crossCheck.editor.repository.state.revision'), 0);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.ok(await evaluate('crossCheck.host.querySelectorAll(".reactive-selection-layer path").length > 0'));
    const bold = await evaluate(`(() => {const r=crossCheck.host.querySelector('[data-annotation-type="style/bold"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await mouse('mousePressed', bold, 1); await mouse('mouseReleased', bold);
    assert.deepEqual(await evaluate('crossCheck.editor.encodeDocument().children.map(b=>b.standoffProperties.map(p=>[p.type,p.start,p.end]))'), [[['style/bold',3,34]],[['style/bold',0,34]],[['style/bold',0,7]]]);
    const formatted = await evaluate('crossCheck.editor.encodeDocument()');
    await drag(await boundary('a', 3), await boundary('c', 8));
    await send('Input.insertText', { text: 'REPLACED' }, sessionId);
    assert.deepEqual(await evaluate('crossCheck.editor.encodeDocument().children.map(b=>b.text)'), [original[0].text.slice(0,3)+'REPLACED'+original[2].text.slice(8)]);
    await evaluate('crossCheck.editor.repository.undo()');
    assert.deepEqual(await evaluate('crossCheck.editor.encodeDocument().children'), formatted.children);
    await drag(await boundary('a', 3), await boundary('c', 8));
    await key('Enter');
    assert.deepEqual(await evaluate('crossCheck.editor.encodeDocument().children.map(b=>b.text)'), [original[0].text.slice(0,3),original[2].text.slice(8)]);
    await evaluate('crossCheck.editor.repository.undo()');
    await drag(await boundary('a', 3), await boundary('c', 8));
    await key('Backspace');
    assert.deepEqual(await evaluate('crossCheck.editor.encodeDocument().children.map(b=>b.text)'), [original[0].text.slice(0,3)+original[2].text.slice(8)]);
    await evaluate('crossCheck.editor.repository.undo()');
    await drag(await boundary('a', 3), await boundary('c', 8));
    report.replacement = {typing:true,enter:true,backspace:true,atomicUndo:true};
    await evaluate(`(()=>{const data=new DataTransfer();data.setData('text/plain','first\\r\\nsecond');document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));})()`);
    assert.deepEqual(await evaluate('crossCheck.editor.encodeDocument().children.map(b=>b.text)'), [original[0].text.slice(0,3)+'first','second'+original[2].text.slice(8)]);
    await evaluate('crossCheck.editor.repository.undo()');
    await drag(await boundary('a', 3), await boundary('c', 8));
    const copied = await evaluate(`(()=>{const data=new DataTransfer();document.activeElement.dispatchEvent(new ClipboardEvent('cut',{clipboardData:data,bubbles:true,cancelable:true}));return data.getData('text/plain');})()`);
    assert.equal(copied,[original[0].text.slice(3),original[1].text,original[2].text.slice(0,8)].join('\n'));
    assert.equal(await evaluate('crossCheck.editor.encodeDocument().children.length'),1);
    await evaluate('crossCheck.editor.repository.undo()');
    await drag(await boundary('a', 3), await boundary('c', 8));
    await send('Input.imeSetComposition', { text: '中', selectionStart: 1, selectionEnd: 1 }, sessionId);
    assert.deepEqual(await evaluate('crossCheck.editor.encodeDocument().children'),formatted.children);
    await send('Input.insertText', { text: '中文' }, sessionId);
    assert.deepEqual(await evaluate('crossCheck.editor.encodeDocument().children.map(b=>b.text)'),[original[0].text.slice(0,3)+'中文'+original[2].text.slice(8)]);
    await evaluate('crossCheck.editor.repository.undo()');
    await drag(await boundary('a', 3), await boundary('c', 8));
    report.replacement.clipboardEvents=true;report.replacement.composition=true;
    report.focusBeforeEscape = await evaluate('({tag:document.activeElement.tagName,html:document.activeElement.outerHTML.slice(0,300)})');
    await key('Escape');
    assert.equal(await evaluate('!!crossCheck.editor.crossText.range()'), false, JSON.stringify(report.focusBeforeEscape));
    await evaluate(`(() => {const {editor,node}=crossCheck,m=editor.mounts.get(node('a').key);m.focus();m.restoreInlineSelection({anchor:32,head:35});})()`);
    await key('ArrowRight', 8);
    assert.equal(await evaluate('crossCheck.editor.node(crossCheck.editor.crossText.range().head.occurrenceKey).payload.id'), 'b');
    await key('ArrowRight', 8); await key('ArrowLeft', 8);
    assert.equal(await evaluate('crossCheck.editor.crossText.range().head.boundary.index'), 0);
    await key('Escape');
    await evaluate(`(() => {const {editor,node}=crossCheck,m=editor.mounts.get(node('a').key);m.focus();m.restoreInlineSelection({anchor:10,head:10});})()`);
    await key('ArrowDown', 8);
    assert.equal(await evaluate('crossCheck.editor.node(crossCheck.editor.crossText.range().head.occurrenceKey).payload.id'), 'b');
    await key('ArrowUp', 8);
    assert.equal(await evaluate('!!crossCheck.editor.crossText.range()'), false, JSON.stringify(await evaluate('crossCheck.editor.crossText.range()')));
    await evaluate(`(() => {const {editor,node}=crossCheck,m=editor.mounts.get(node('b').key);m.focus();m.restoreInlineSelection({anchor:4,head:4});})()`);
    for(let i=0;i<8;i++) await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37,nativeVirtualKeyCode:37,modifiers:8,autoRepeat:i>0},sessionId);
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',modifiers:8},sessionId);
    assert.equal(await evaluate('crossCheck.editor.crossText.range() && crossCheck.editor.node(crossCheck.editor.crossText.range().head.occurrenceKey).payload.id'),'a');
    await key('Escape');
    await drag(await boundary('c', 8), await boundary('a', 3));
    assert.equal(await evaluate('crossCheck.editor.node(crossCheck.editor.crossText.range().anchor.occurrenceKey).payload.id'), 'c');
    report.cross = { pointer: true, reverse: true, keyboard: true, toolbar: true, guards: true, highlights: true };
    await evaluate('crossCheck.editor.repository.undo()');
    assert.deepEqual(await evaluate('crossCheck.editor.encodeDocument().children'), original);
    await evaluate('crossCheck.dispose();crossCheck.editor.dispose();crossCheck.host.remove()');
    await evaluate('crossLarge()');
    report.performance = await evaluate(`(() => {
      const {editor,node}=crossCheck, a=node('p0'), b=node('p19'), mount=editor.mounts.get(a.key);
      mount.focus();mount.restoreInlineSelection({anchor:1,head:3});
      const local=[];for(let i=0;i<100;i++){const start=performance.now();mount.captureInlineSelection();local.push(performance.now()-start);}
      let snapshots=0;const snapshot=editor.repository.snapshot.bind(editor.repository);editor.repository.snapshot=()=>{snapshots++;return snapshot();};
      editor.crossText.enable(true);const times=[];
      for(let i=0;i<100;i++){const start=performance.now();editor.crossText.set(editor.crossText.position(a.key,1),editor.crossText.position(b.key,2+i%20));times.push(performance.now()-start);}
      editor.repository.snapshot=snapshot;
      local.sort((a,b)=>a-b);times.sort((a,b)=>a-b);
      editor.crossText.clear();return {paragraphs:300,selected:20,nativeLocalCaptureP95:local[95],modelUpdateP95:times[95],snapshots,revision:editor.repository.state.revision};
    })()`);
    assert.equal(report.performance.snapshots, 0);assert.equal(report.performance.revision, 0);assert.ok(report.performance.modelUpdateP95 < 50);
    // Holding a drag at the document scroller's edge advances the selection.
    const edgeStart=await boundary('p0',3), edgeEnd={x:edgeStart.x+20,y:875};
    await mouse('mousePressed',edgeStart,1);await mouse('mouseMoved',edgeEnd,1);
    await evaluate('new Promise(resolve=>setTimeout(resolve,400))');
    await mouse('mouseReleased',edgeEnd);
    assert.ok(await evaluate('crossCheck.host.scrollTop > 0'));
    report.cross.autoscroll=true;
    await evaluate('crossCheck.dispose();crossCheck.editor.dispose();crossCheck.host.remove()');
    await evaluate(`(async () => {
      const {workspaceDocumentFixture}=await import('/src/demo/workspace-document.ts');
      const row=structuredClone(workspaceDocumentFixture.children.find(b=>b.type==='document-tab-row-block'));
      row.children=row.children.slice(0,1);const page=row.children[0].children[0];
      page.children=page.children.slice(0,3);page.children.forEach((b,i)=>b.id=['a','b','c'][i]);
      crossPage({type:'document-block',children:[row]});crossCheck.editor.crossText.enable(true);
      // Reproduce engines pinning BOTH native caret APIs to the starting host.
      const p=crossCheck.editor.mounts.get(crossCheck.node('a').key).inlineBoundary(3);
      document.caretPositionFromPoint=()=>({offsetNode:p.node,offset:p.offset});
      document.caretRangeFromPoint=()=>{const r=document.createRange();r.setStart(p.node,p.offset);r.collapse(true);return r;};
    })()`);
    await drag(await boundary('a',3),await boundary('c',8));
    assert.equal(await evaluate('crossCheck.editor.node(crossCheck.editor.crossText.range().head.occurrenceKey).payload.id'),'c');
    let away=await boundary('b',2);await mouse('mousePressed',away,1);await mouse('mouseReleased',away);
    assert.equal(await evaluate('!!crossCheck.editor.crossText.range()'),false);
    await drag(await boundary('c',8),await boundary('a',3));
    assert.equal(await evaluate('crossCheck.editor.node(crossCheck.editor.crossText.range().head.occurrenceKey).payload.id'),'a');
    await evaluate(`(()=>{crossCheck.editor.crossText.clear();const {editor,node}=crossCheck,n=node('a'),m=editor.mounts.get(n.key);m.focus();m.restoreInlineSelection({anchor:1,head:4});editor.selections.setPrimary(n.key,n.contentKey,n.viewId,1,4);})()`);
    away=await boundary('c',2);await mouse('mousePressed',away,1);await mouse('mouseReleased',away);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(await evaluate('!!crossCheck.editor.selections.sets[crossCheck.node("a").key]'),false);
    assert.equal(await evaluate('crossCheck.editor.mounts.get(crossCheck.node("a").key).root.querySelectorAll(".reactive-selection-layer path").length'),0);
    report.realDemoPage={clampedCaretFallbackBothDirections:true,crossClickAway:true,localClickAway:true};
    await evaluate('crossCheck.dispose();crossCheck.editor.dispose();crossCheck.host.remove()');
    console.log(JSON.stringify(report, null, 2));
  }
  }
} finally {
  socket?.close();
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) { const exited = new Promise(resolve => chrome.once('exit', resolve)); chrome.kill('SIGKILL'); await exited; }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
