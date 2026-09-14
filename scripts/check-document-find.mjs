// Isolated Chrome fixture; no saved documents or database writes.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-find-'));
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
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(new Error('Timed out: ' + method)); }, 30000);
    pending.set(key, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id: key, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value;
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url: process.env.BENCHMARK_URL ?? 'http://localhost:3000/' }, sessionId);
  await evaluate('new Promise(resolve => setTimeout(resolve, 1200))');
  await evaluate(`(async () => {
    const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');
    const {registerCoreViews}=await import('/src/rendering/register-core-views.ts');
    const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
    const source=await (await fetch('/src/rendering/reactive-tree-view.tsx')).text();
    const webPath=source.split('"').find(part=>part.startsWith('/node_modules/.vite/deps/solid-js_web.js'));
    const {render,createComponent}=await import(webPath);
    window.makeFindFixture = (size=3, data) => {
      const host=document.createElement('div');host.className='workspace-demo';host.style.cssText='position:fixed;inset:0;padding:50px;background:white;z-index:9000;overflow:auto';document.body.append(host);
      const editor=new ReactiveEditor(data ?? {type:'document-block',children:[{id:'page',type:'page-block',children:[
        ...Array.from({length:size},(_,i)=>({id:'p'+i,type:'standoff-editor-block',text:'Hello 😀 world. '+ 'Hello passage. '.repeat(8)})),
        {id:'tabs',type:'tab-row-block',children:[{type:'tab-block',metadata:{name:'First'},children:[]},{id:'hiddenTab',type:'tab-block',metadata:{name:'Hidden'},children:[{id:'hidden',type:'standoff-editor-block',text:'Hello hidden passage'}]}]}
      ]}]});
      registerCoreViews(editor);const projection=editor.createView('find-browser');
      const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);
      window.findCheck={editor,host,dispose,node:id=>Object.values(projection.state.nodes).find(n=>n.payload.id===id)};
    };
    makeFindFixture();
  })()`);
  const initial = await evaluate(`(async () => {
    const {editor,node}=findCheck, mount=editor.mounts.get(node('p0').key);
    mount.focus();mount.restoreInlineSelection({anchor:0,head:5});
    editor.bindings.assign('find.open',[{kind:'keyboard',key:'f',modifiers:['Meta']}]);
    mount.focusElement.dispatchEvent(new KeyboardEvent('keydown',{key:'f',metaKey:true,bubbles:true,cancelable:true}));
    await editor.find.flush();await new Promise(r=>setTimeout(r,250));
    return {open:editor.find.state.open,query:editor.find.state.query,matches:editor.find.state.result.matches.length,paths:findCheck.host.querySelectorAll('.reactive-search-layer path').length,history:editor.repository.canUndo(),hiddenMounted:!!editor.mounts.get(node('hidden').key),debug:{rect:mount.root.getBoundingClientRect().toJSON(),decorations:editor.decorations.nodes[node('p0').key]?.length,flow:mount.focusElement.textContent}};
  })()`);
  assert.equal(initial.open,true);assert.equal(initial.query,'Hello');assert.equal(initial.matches,28);assert.ok(initial.paths>0,JSON.stringify(initial));assert.equal(initial.history,false);assert.equal(initial.hiddenMounted,false);
  const navigation = await evaluate(`(async()=>{
    const {editor,node}=findCheck;await editor.find.navigate(-1);await new Promise(r=>setTimeout(r,80));
    const result={mounted:!!editor.mounts.get(node('hidden').key),history:editor.repository.canUndo(),focus:document.activeElement.getAttribute('aria-label'),active:editor.find.state.active,scope:editor.find.state.scope.rootKey===node('page').key};
    editor.find.close();result.closed=!editor.find.state.open;result.selected=getSelection().toString();return result;
  })()`);
  assert.equal(navigation.mounted,true);assert.equal(navigation.history,false);assert.equal(navigation.focus,'Find text');assert.equal(navigation.scope,true);assert.equal(navigation.selected,'Hello');
  const candidates = await evaluate(`(async()=>{
    const {editor,node}=findCheck;
    editor.find.open(node('p0').key);editor.find.setQuery('Hello');await editor.find.flush();
    window.originalEntityFetch=window.fetch;window.fetch=async(url,options)=>String(url).includes('/api/findAgentsBy')?{ok:true,json:async()=>({Success:true,Results:[{id:'blake',name:'Vernon Blake'}],Count:1,Page:1,MaxPage:1})}:originalEntityFetch(url,options);
    const {openEntitySearch}=await import('/src/runtime/entity-search.ts');
    openEntitySearch(editor,[{nodeKey:node('p0').key,start:0,end:5}]);
    window.entityPanel=()=>document.querySelector('[role=dialog][aria-label="Search entities"]');
    window.entityButton=label=>[...entityPanel().querySelectorAll('button')].find(b=>b.textContent.startsWith(label));
    entityButton('Find other occurrences').click();
    for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,100));if(entityPanel().textContent.includes('28 selected / 28 unique targets')&&document.querySelector('[data-candidate-exclusion]'))break;}
    const control=editor.mounts.get(node('p0').key).root.querySelector('[data-candidate-exclusion]');
    if(!control)throw new Error('No exclusion controls: '+entityPanel().textContent);
    const flow=editor.mounts.get(node('p0').key).focusElement,rect=flow.children[0].getBoundingClientRect();
    flow.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:rect.left+2,clientY:rect.top+2}));
    window.beforeExclusionFocus=document.activeElement;window.beforeExclusionSelection=getSelection().toString();
    const r=control.getBoundingClientRect();
    return {count:entityPanel().textContent.includes('28 selected / 28 unique targets'),opacity:getComputedStyle(control).opacity,x:r.left+r.width/2,y:r.top+r.height/2,history:editor.repository.canUndo(),findOpen:editor.find.state.open};
  })()`);
  assert.equal(candidates.count,true);assert.equal(candidates.opacity,'1');assert.equal(candidates.history,false);assert.equal(candidates.findOpen,true);
  for (const type of ['mouseMoved','mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent',{type,x:candidates.x,y:candidates.y,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1},sessionId);
  const binding = await evaluate(`(async()=>{
    const {editor,node}=findCheck;await new Promise(r=>setTimeout(r,100));
    const excluded=entityPanel().textContent.includes('27 selected / 28 unique targets'),caretPreserved=getSelection().toString()===beforeExclusionSelection,focusPreserved=document.activeElement===beforeExclusionFocus;
    const first=editor.decorations.nodes[node('p0').key],findUntouched=first.filter(d=>d.owner==='document-find').length===9;
    entityButton('Undo exclusion').click();const restored=entityPanel().textContent.includes('28 selected / 28 unique targets');
    await new Promise(r=>setTimeout(r,100));
    const keyboardControl=editor.mounts.get(node('p0').key).root.querySelector('[data-candidate-exclusion]');keyboardControl.focus();
    keyboardControl.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await Promise.resolve();
    const keyboardExcluded=!!entityPanel()&&entityPanel().textContent.includes('27 selected / 28 unique targets')&&!editor.repository.canUndo();
    entityButton('Undo exclusion').click();
    entityButton('Select').click();
    const nominatedWithoutWrite=!editor.repository.canUndo()&&!!entityPanel();
    entityButton('Bind 28').click();await new Promise(r=>setTimeout(r,100));
    const properties=[...editor.projections.values()][0].state.nodes;
    const refs=Object.values(properties).filter(n=>n.viewType==='standoff-editor-block').flatMap(n=>n.payload.standoffProperties??[]);
    const distinct=new Set(refs.map(p=>p.id)).size;
    editor.repository.undo();
    const undoCleared=Object.values(properties).filter(n=>n.viewType==='standoff-editor-block').every(n=>!n.payload.standoffProperties?.length);
    window.fetch=originalEntityFetch;editor.find.close();
    return {excluded,caretPreserved,focusPreserved,findUntouched,restored,keyboardExcluded,nominatedWithoutWrite,refs:refs.length,distinct,closed:!entityPanel(),undoCleared};
  })()`);
  assert.equal(binding.excluded,true);assert.equal(binding.caretPreserved,true);assert.equal(binding.focusPreserved,true);assert.equal(binding.findUntouched,true);assert.equal(binding.restored,true);assert.equal(binding.keyboardExcluded,true);assert.equal(binding.nominatedWithoutWrite,true);assert.equal(binding.refs,28);assert.equal(binding.distinct,28);assert.equal(binding.closed,true);assert.equal(binding.undoCleared,true);
  const worker = await evaluate(`(async()=>{
    const {runSearchWorker}=await import('/src/runtime/search-worker.ts');
    const source=[{contentKey:'timeout',coordinate:'utf16',version:0,runs:[{text:'a'.repeat(32)+'!'}]}];
    const start=performance.now();let message='';try {await runSearchWorker(source,'(a+)+$',{regex:true});}catch(e){message=e.message;}
    const elapsed=performance.now()-start;
    const recovered=await runSearchWorker(source,'!',{});
    return {message,elapsed,recovered:recovered[0].matches.length};
  })()`);
  assert.match(worker.message,/5-second budget/);assert.ok(worker.elapsed<7500);assert.equal(worker.recovered,1);
  const performanceReport = await evaluate(`(async()=>{
    findCheck.dispose();findCheck.editor.dispose();findCheck.host.remove();makeFindFixture(300);
    const {editor,node}=findCheck,key=node('p0').key;
    let snapshots=0;const original=editor.repository.snapshot.bind(editor.repository);editor.repository.snapshot=()=>{snapshots++;return original();};
    const bench=()=>{const times=[];for(let i=0;i<20;i++){const start=performance.now();editor.commands.replaceInlineRange(key,0,0,'x');times.push(performance.now()-start);}times.sort((a,b)=>a-b);return {p95:times[18],max:times[19]};};
    const closed=bench();editor.find.open(key);editor.find.setQuery('Hello');await editor.find.flush();await new Promise(r=>setTimeout(r,100));
    const matches=editor.find.state.result.matches.length;const highlighted=bench();await editor.find.flush();
    editor.find.toggleHighlights();const hidden=bench();await editor.find.flush();
    const result={paragraphs:300,matches,closed,highlighted,hidden,snapshots,refreshed:editor.find.state.result.matches.length};
    findCheck.dispose();editor.dispose();findCheck.host.remove();return result;
  })()`);
  assert.equal(performanceReport.matches,2701);assert.equal(performanceReport.refreshed,2701);assert.equal(performanceReport.snapshots,0);
  const stored = JSON.parse(await readFile(new URL('../data/siena.json', import.meta.url), 'utf8'));
  await evaluate(`makeFindFixture(0, ${JSON.stringify(stored)})`);
  const storedReport = await evaluate(`(async()=>{
    const {editor}=findCheck;
    const nodes=[...editor.projections.values()][0].state.nodes;
    const node=Object.values(nodes).filter(n=>n.viewType==='standoff-editor-block').sort((a,b)=>b.inlineContent.length-a.inlineContent.length)[0];
    const before=JSON.stringify(editor.encodeDocument());
    editor.find.open(node.key);editor.find.setQuery('the');await editor.find.flush();
    const matches=editor.find.state.result.matches.length;
    const samples=[],frames=[];let snapshots=0;const original=editor.repository.snapshot.bind(editor.repository);editor.repository.snapshot=()=>{snapshots++;return original();};
    for(let i=0;i<10;i++){const start=performance.now();editor.commands.replaceInlineRange(node.key,10,10,'x');samples.push(performance.now()-start);await new Promise(requestAnimationFrame);frames.push(performance.now()-start);}
    const splitStart=performance.now();editor.commands.splitStandoff(node.key,Math.floor(node.inlineContent.length/2));const splitMs=performance.now()-splitStart;
    await editor.find.flush();editor.repository.undo();for(let i=0;i<10;i++)editor.repository.undo();
    const snapshotCalls=snapshots;editor.repository.snapshot=original;
    const restored=JSON.stringify(editor.encodeDocument())===before;
    const result={fixture:'data/siena.json (read-only source; edits in disposable memory)',longestParagraphCells:node.inlineContent.length,matches,meanModelEditMs:samples.reduce((a,b)=>a+b)/samples.length,maxModelEditMs:Math.max(...samples),meanEditToFrameMs:frames.reduce((a,b)=>a+b)/frames.length,splitModelMs:splitMs,snapshots:snapshotCalls,restored};
    findCheck.dispose();editor.dispose();findCheck.host.remove();return result;
  })()`);
  assert.equal(storedReport.snapshots,0);assert.equal(storedReport.restored,true);assert.ok(storedReport.matches>0);
  console.log(JSON.stringify({initial,navigation,candidates,binding,worker,performance:performanceReport,stored:storedReport},null,2));
} finally {
  socket?.close();
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) { const exited = new Promise(resolve => chrome.once('exit', resolve)); chrome.kill('SIGKILL'); await exited; }
  // Chrome helpers can retain inherited pipes after the browser exits on macOS.
  // Close only this disposable browser's stdio so the test runner can terminate.
  chrome.stdin?.destroy(); chrome.stdout?.destroy(); chrome.stderr?.destroy();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
