// Canvas Milestone A: native browser input in one scaled core Document Window.
// Node 22+, CHROME_BIN and BENCHMARK_URL supported. Isolated Chrome profile,
// VITE_CANVAS_MILESTONE_A=1 dev server required; in-memory fixture, no saves.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-presentation-check-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disk-cache-size=1', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
let socket;
try {
const endpoint = await new Promise((resolve, reject) => {
 let output = ''; chrome.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if(match) resolve(match[1]); });
 chrome.once('error', reject); setTimeout(() => reject(new Error('Chrome startup timed out')), 15000).unref();
});
socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
let id = 0; const pending = new Map();
socket.addEventListener('message', event => { const result = JSON.parse(event.data); if(result.id && pending.has(result.id)) { const p = pending.get(result.id); pending.delete(result.id); result.error ? p.reject(new Error(JSON.stringify(result.error))) : p.resolve(result.result); }});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId,{resolve,reject}); socket.send(JSON.stringify({id:requestId,method,params,...(sessionId ? {sessionId} : {})})); });
 const {targetId} = await send('Target.createTarget',{url:'about:blank'}); const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
 await send('Network.enable',{},sessionId);
 socket.addEventListener('message', event => { const msg=JSON.parse(event.data); if(msg.method==='Network.loadingFailed') console.error(JSON.stringify(msg.params)); });
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };



 const checks = [], geometries = [];
 const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks.push(name); };
 const near = (name, actual, expected, tolerance = .2) => { assert.ok(Math.abs(actual - expected) < tolerance, `${name}: ${actual} != ${expected}`); checks.push(name); };
 await send('Emulation.setDeviceMetricsOverride',{width:2600,height:1900,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:process.env.BENCHMARK_URL ?? 'http://127.0.0.1:5187/'},sessionId);
 await evaluate('new Promise(resolve=>setTimeout(resolve,1500))');
 await evaluate(`(async()=>{
   const {mountScaledWindowPrototype}=await import('/src/demo/scaled-window-prototype.tsx');
   const {encodeDocument}=await import('/src/block-tree/codecs.ts');
   window.makeScaledFixture=(scale,hosted=true)=>{
     window.q?.dispose();document.body.replaceChildren();
     const q=mountScaledWindowPrototype(document.body,{scale,hosted});
     const node=id=>Object.values(q.projection.state.nodes).find(n=>n.payload.id===id);
     const flow=id=>q.editor.mounts.get(node(id).key).focusElement;
     const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,50))));
     window.q={...q,node,flow,frame,authored:()=>encodeDocument(q.editor.repository.snapshot()),root:q.host.querySelector('.reactive-window'),
       caret:(id,index)=>{flow(id).focus();q.editor.mounts.get(node(id).key).restoreInlineSelection({anchor:index,head:index});},
       point:(id,index)=>{const r=flow(id).children[index].getBoundingClientRect();return{x:r.left+.1*scale,y:r.top+r.height/2};},
       text:id=>q.editor.node(node(id).key).inlineContent.map(k=>q.editor.node(k).payload.text).join(''),
     };
     return frame();
   };
 })()`);
 const key=(key,code,modifiers=0,type='keyDown')=>send('Input.dispatchKeyEvent',{type,key,code,modifiers,windowsVirtualKeyCode:({Control:17,Shift:16,ArrowRight:39,ArrowLeft:37,Escape:27,Backspace:8,Delete:46,Enter:13})[key]},sessionId);
 const mouse=(type,point,modifiers=0)=>send('Input.dispatchMouseEvent',{type,...point,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,modifiers},sessionId);
 const click=async selector=>{
   const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect(),p={x:r.left+r.width/2,y:r.top+r.height/2};if(!e.contains(document.elementFromPoint(p.x,p.y)))throw new Error('Obscured '+${JSON.stringify(selector)});return p})()`);
   await mouse('mousePressed',p);await mouse('mouseReleased',p);await evaluate('q.frame()');
 };
 const drag=async(from,to,control=false)=>{
   const start=await evaluate(`q.point(${JSON.stringify(from[0])},${from[1]})`),end=await evaluate(`q.point(${JSON.stringify(to[0])},${to[1]})`);
   if(control)await key('Control','ControlLeft',2);
   await mouse('mousePressed',start,control?2:0);await mouse('mouseMoved',end,control?2:0);await mouse('mouseReleased',end,control?2:0);
   if(control)await key('Control','ControlLeft',0,'keyUp');await evaluate('q.frame()');
 };
 const group=()=>evaluate(`(q.editor.currentTextOperation.annotationOperation()?.annotationTargets()??[]).map(r=>[q.editor.node(r.nodeKey).payload.id,r.start,r.end])`);
 const geometry=()=>evaluate(`(()=>{
   const surface=q.flow('a').closest('.reactive-standoff-surface'),r=surface.getBoundingClientRect();
   const range=document.createRange();range.setStart(q.flow('a').children[0].firstChild,0);range.setEnd(q.flow('a').children[200].firstChild,1);
   const first=[...range.getClientRects()].find(r=>r.width>0),paths=[...q.root.querySelectorAll('[data-property-type="codex/entity-reference"]')];
   const nums=paths[0]?.getAttribute('d').split(' '),svg=paths[0]?.ownerSVGElement;
   const pt=svg&&new DOMPoint(Number(nums[1]),Number(nums[2])).matrixTransform(svg.getScreenCTM());
   return{scale:q.scale,lines:paths.length,x:pt?.x,y:pt?.y,expectedX:first.left,expectedY:first.bottom+1.5*q.scale,
     localX:Number(nums?.[1]),localY:Number(nums?.[2]),rainbows:q.root.querySelectorAll('[data-property-type="style/rainbow"]').length,
     highlighters:q.root.querySelectorAll('[data-property-type="style/highlighter"]').length,width:q.root.getBoundingClientRect().width/q.scale};
 })()`);
 for(const scale of [.5,1,2]) {
   await evaluate(`makeScaledFixture(${scale})`);
   const label=`${scale}x `;
   const initial=await geometry();geometries.push(initial);
   near(label+'Window local width',initial.width,1000);
   check(label+'wrapped Entity effects',initial.lines>1,true);
   near(label+'Entity screen x',initial.x,initial.expectedX);
   near(label+'Entity screen y',initial.y,initial.expectedY);
   check(label+'rainbow lanes',initial.rainbows,initial.lines*7);
   check(label+'highlighter present',initial.highlighters>0,true);
   check(label+'wide Window stays expanded',await evaluate(`q.root.classList.contains('reactive-window--margins-collapsed')`),false);
   await evaluate(`q.before=JSON.stringify(q.editor.encodeDocument());q.cells=[...q.flow('a').children];q.caret('a',0)`);
   await send('Input.insertText',{text:'Typed '},sessionId);
   check(label+'native insertText',await evaluate(`q.text('a').startsWith('Typed Blake')`),true);
   await evaluate('q.editor.repository.undo();q.frame()');
   await drag(['a',0],['a',5]);
   check(label+'native pointer selection',await evaluate('document.getSelection().toString()'),'Blake');
   check(label+'native selection not grouped',await group(),[]);
   await evaluate(`q.caret('a',1)`);
   await key('ArrowRight','ArrowRight',8);await key('ArrowRight','ArrowRight',0,'keyUp');
   check(label+'native keyboard selection',await evaluate('document.getSelection().toString()'),'l');
   await drag(['a',0],['a',5],true);
   check(label+'Control-held Grouping',await group(),[['a',0,5]]);
   await key('Escape','Escape');await key('Escape','Escape',0,'keyUp');
   check(label+'Escape cancels Grouping',await group(),[]);
   await evaluate('q.editor.crossText.enable(true)');
   await drag(['a',2],['b',4]);
   check(label+'ordinary cross-Block selection',await evaluate(`Object.keys(q.editor.crossText.segments).length>=2`),true);
   await key('Escape','Escape');await key('Escape','Escape',0,'keyUp');
   await drag(['a',2],['b',4],true);
   check(label+'cross-Block Grouping',await group(),[['a',2,272],['b',0,4]]);
   await key('Escape','Escape');await key('Escape','Escape',0,'keyUp');
   await evaluate(`q.editor.crossText.clear();q.editor.crossText.enable(false);q.caret('a',0);q.editor.mounts.get(q.node('a').key).restoreInlineSelection({anchor:0,head:5});window.originalFetch=window.fetch;window.fetch=async url=>String(url).startsWith('/api/')?({ok:true,json:async()=>({Success:true,Results:[{id:'blake',name:'Blake'}],Count:1,Page:1,MaxPage:1})}):originalFetch(url)`);
   await key(';','Semicolon',2);await key(';','Semicolon',0,'keyUp');await key('r','KeyR');await key('r','KeyR',0,'keyUp');
   await evaluate('new Promise(r=>setTimeout(r,450))');
   check(label+'Entity panel selected query',await evaluate(`document.querySelector('.reactive-entity-search input[aria-label="Search entities"]')?.value`),'Blake');
   check(label+'panel outside transformed host',await evaluate(`!q.host.contains(document.querySelector('.reactive-entity-search'))`),true);
   await key('Escape','Escape');await key('Escape','Escape',0,'keyUp');await evaluate('q.frame();window.fetch=originalFetch');
   check(label+'Entity restores selection',await evaluate('document.getSelection().toString()'),'Blake');
   check(label+'Entity restores focus',await evaluate(`document.activeElement===q.flow('a')`),true);
   await evaluate(`q.flow('native').focus();q.flow('native').setSelectionRange(6,6)`);
   await send('Input.insertText',{text:'-'},sessionId);
   check(label+'native form editing',await evaluate(`q.flow('native').value`),'Native- text field');
   await evaluate('q.editor.repository.undo();q.caret("a",5)');
   await send('Input.imeSetComposition',{text:'語',selectionStart:1,selectionEnd:1},sessionId);
   await send('Input.insertText',{text:'語'},sessionId);await evaluate('q.frame()');
   check(label+'IME commit',await evaluate(`q.text('a').startsWith('Blake語 wrote')`),true);
   await evaluate('q.editor.repository.undo();q.frame()');
   // Owned geometry uses local units, without writing Desktop metadata.
   await evaluate('q.geometryBefore=JSON.stringify(q.authored());q.revision=q.editor.repository.state.revision');
   const start=await evaluate(`(()=>{const r=q.root.querySelector('header').getBoundingClientRect();return{x:r.left+120*q.scale,y:r.top+r.height/2}})()`);
   const end={x:start.x+40*scale,y:start.y+20*scale};
   await mouse('mousePressed',start);await mouse('mouseMoved',end);await mouse('mouseReleased',end);await evaluate('q.frame()');
   check(label+'Window move in local units',await evaluate('q.geometry.position()'),{x:52,y:32});
   const handle=await evaluate(`(()=>{const r=q.root.querySelector('.reactive-window__resize').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
   const enlarged={x:handle.x+40*scale,y:handle.y+30*scale};
   await mouse('mousePressed',handle);await mouse('mouseMoved',enlarged);await mouse('mouseReleased',enlarged);await evaluate('q.frame()');
   check(label+'Window resize in local units',await evaluate('q.geometry.expandedSize()'),{width:1040,height:670});
   check(label+'host geometry leaves authored tree/revision unchanged',await evaluate('({same:JSON.stringify(q.authored())===q.geometryBefore,revision:q.editor.repository.state.revision-q.revision})'),{same:true,revision:0});
   await evaluate(`q.geometry.resize({width:1000,height:640});q.geometry.move({x:12,y:12});q.frame()`);
   await evaluate(`q.flow('note').focus();q.flow('note').setSelectionRange(2,8,'forward')`);
   await click('[aria-label="Compact document"]');
   check(label+'Compact restores margin selection in drawer',await evaluate(`(()=>{const e=q.flow('note');return[!!e.closest('.reactive-window__margin-drawer'),document.activeElement===e,e.selectionStart,e.selectionEnd]})()`),[true,true,2,8]);
   check(label+'Compact keeps expanded host width',await evaluate('q.geometry.expandedSize().width'),1000);
   const compactWidth=await evaluate('q.root.getBoundingClientRect().width/q.scale');
   check(label+'Compact reduces local width',compactWidth<1000,true);
   await click('[aria-label="Close margins"]');await click('.document-margin-indicator');
   check(label+'margin indicator opens drawer',await evaluate(`document.activeElement===q.root.querySelector('.reactive-window__margin-drawer')`),true);
   await key('Escape','Escape');await key('Escape','Escape',0,'keyUp');await evaluate('q.frame()');
   check(label+'drawer Escape focus',await evaluate(`document.activeElement===q.root.querySelector('.document-style-bar__margins')`),true);
   await click('[aria-label="Compact document"]');
   near(label+'Compact restores width',await evaluate('q.root.getBoundingClientRect().width/q.scale'),1000);
   await evaluate(`q.geometry.resize({width:680,height:640});q.frame()`);
   check(label+'automatic narrow collapse in local units',await evaluate(`q.root.classList.contains('reactive-window--margins-collapsed')`),true);
   await click('[aria-label="Compact document"]');await click('[aria-label="Compact document"]');
   check(label+'automatic cause survives explicit toggle',await evaluate(`q.root.classList.contains('reactive-window--margins-collapsed')`),true);
   await evaluate(`q.geometry.resize({width:1000,height:640});q.frame()`);
   check(label+'automatic width restoration',await evaluate(`q.root.classList.contains('reactive-window--margins-collapsed')`),false);
   near(label+'restored effect alignment',(await geometry()).y,(await geometry()).expectedY);
   check(label+'presentation preserves Desktop metadata',await evaluate(`JSON.stringify(q.editor.encodeDocument().metadata)`),await evaluate(`JSON.stringify(JSON.parse(q.geometryBefore).metadata)`));
 }
 // Unhosted identity-frame path is the existing Desktop Window behavior.
 await evaluate('makeScaledFixture(1,false);q.caret("a",0)');
 await send('Input.insertText',{text:'Desktop '},sessionId);
 check('unhosted Desktop native typing',await evaluate(`q.text('a').startsWith('Desktop Blake')`),true);
 await evaluate('q.editor.repository.undo();q.frame()');
 const desktop=await geometry();near('unhosted Desktop effect alignment',desktop.y,desktop.expectedY);
 await evaluate('q.dispose()');
 console.log(JSON.stringify({browser:await send('Browser.getVersion'),checks,geometries},null,2));
} finally {
  // Finish the CDP close handshake before killing Chrome. Otherwise Node's
  // WebSocket can retain a closing socket after all assertions have finished.
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }));
    socket.close();
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 1000))]);
  }
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGKILL');
    await exited;
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
