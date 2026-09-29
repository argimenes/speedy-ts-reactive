// B2 consumed-Markdown and resource-owned save browser qualification.
// Node 22+, CHROME_BIN and FLINT_URL supported. Isolated Chrome profile,
// In-memory fixture, no server saves. Evidence goes to artifacts/flint-b1.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-flint-check-'));
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
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; const timeout=setTimeout(()=>{pending.delete(requestId);reject(new Error('CDP timeout: '+method));},20000);pending.set(requestId,{resolve:v=>{clearTimeout(timeout);resolve(v)},reject:e=>{clearTimeout(timeout);reject(e)}}); socket.send(JSON.stringify({id:requestId,method,params,...(sessionId ? {sessionId} : {})})); });
 const {targetId} = await send('Target.createTarget',{url:'about:blank'}); const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
 await send('Network.enable',{},sessionId);
 socket.addEventListener('message', event => { const msg=JSON.parse(event.data); if(msg.method==='Network.loadingFailed') console.error(JSON.stringify(msg.params)); });
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };

 const artifacts='artifacts/flint-b2'; await mkdir(artifacts,{recursive:true});
 const checks=[], errors=[]; const check=(name,value,expected=true)=>{assert.deepEqual(value,expected,name);checks.push(name)};
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails)});
 await send('Runtime.enable',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:process.env.FLINT_URL??'http://localhost:3000/'},sessionId);
 await evaluate('new Promise(resolve=>setTimeout(resolve,1200))');
 await evaluate(`(async()=>{
   const {WorkspaceSession}=await import('/src/application/workspace-session.ts');
   const {materializeLocalWorkspace}=await import('/src/reactive-editor/workspace-manifest.ts');
   const {WorkspacePresentationView}=await import('/src/application/workspace-presentation-view.tsx');
   const md=await import('/src/qualification/native-b2/markdown.ts');
   const {installMarkdownExperiment}=await import('/src/qualification/native-b2/input.ts');
   const native=await import('/src/qualification/native-b1/resource.ts');
   const {enrollPair}=await import('/src/qualification/native-b2/coordinator.ts');
   const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();
   const {render,createComponent}=await import(source.split('"').find(p=>p.includes('/solid-js_web.js')));
   const host=document.createElement('div');host.className='workspace-demo workspace-demo--canonical';host.style.cssText='position:fixed;inset:48px 0 0;z-index:9000;background:#eee;overflow:auto';document.body.append(host);
   const session=new WorkspaceSession(materializeLocalWorkspace({id:'workspace-b2',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]}]}),{features:{compactEditorChrome:false}}),editor=session.editor;
   const bank=Object.values(editor.repository.state.contents).find(c=>c.payload.id==='bank');
   const admitted=md.admitMarkdown(editor.repository,bank.key,${JSON.stringify("**bold*\n\n[[Poe]\n\n#\n\nIME\n\n| A | B |\n| --- | --- |\n| 1 | 2 |")});
   const poe=md.admitMarkdown(editor.repository,bank.key,'Poe'); const poeContent=editor.repository.state.contents[editor.repository.state.placements[poe.placementKey].contentKey];
   const targets=[{documentId:poe.resourceId,blockId:poeContent.payload.id,title:'Poe',path:'Poe'}];
   editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
   const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
   const stop=installMarkdownExperiment(editor,document,id=>id===admitted.resourceId,()=>targets);
   const views=()=>[...editor.projections.values()].filter(p=>p!==session.projection&&p.state.nodes[p.state.rootKey]?.contentKey===editor.repository.state.placements[admitted.placementKey].contentKey);
   const para=i=>editor.node(views()[0].state.nodes[views()[0].state.rootKey].children[i]);
   const text=i=>para(i).inlineContent.map(k=>editor.node(k).payload.text).join('');
   const focus=i=>{const n=para(i),m=editor.mounts.get(n.key),end=n.inlineContent.length;editor.focus.request(n.key);m.restoreInlineSelection({anchor:end,head:end})};
   const pair=enrollPair(editor.repository,admitted.resourceId,{save:g=>new Promise(resolve=>{window.b2.generation=g;window.b2.release=()=>resolve({phase:'saved',generation:g.generation})}),recover:async()=>({phase:'failed'})},()=>targets);
   window.b2={session,editor,host,dispose,stop,views,para,text,focus,pair,md,native,admitted,targets};
 })()`);
 check('Markdown import mounts ordinary native Blocks including a table',await evaluate(`b2.views().length===1&&b2.host.querySelectorAll('[role="table"]').length===1`));
 await evaluate('b2.focus(0)'); await send('Input.insertText',{text:'*'},sessionId);
 check('native typing consumes completed bold delimiters',await evaluate(`b2.text(0)==='bold'&&b2.para(0).payload.standoffProperties.some(p=>p.type==='style/bold')`));
 await evaluate('b2.editor.repository.undo()');check('one conversion Undo restores complete literal',await evaluate('b2.text(0)'),'**bold**');
 await evaluate('new Promise(resolve=>setTimeout(resolve,30))');check('Undo does not immediately reconvert',await evaluate('b2.text(0)'),'**bold**');
 await evaluate('b2.editor.repository.redo()');check('Redo restores native semantics',await evaluate('b2.text(0)'),'bold');
 await evaluate('b2.focus(1)');await send('Input.insertText',{text:']'},sessionId);
 check('wiki conversion resolves stable Document/root identity',await evaluate(`b2.text(1)==='Poe'&&b2.para(1).payload.standoffProperties.some(p=>p.type==='codex/block-reference'&&p.value===b2.targets[0].blockId)`));
 await evaluate('b2.focus(2)');await send('Input.insertText',{text:' '},sessionId);
 check('h1 gesture consumes prefix and applies existing block style',await evaluate(`b2.text(2)===''&&b2.para(2).payload.blockProperties.some(p=>p.type==='block/font/size'&&p.value==='h1')`));
 await send('Input.insertText',{text:'Heading'},sessionId);
 await evaluate('b2.focus(3)');
 await send('Input.imeSetComposition',{text:'**漢**',selectionStart:5,selectionEnd:5},sessionId);
 await send('Input.insertText',{text:'**漢**'},sessionId);
 check('IME completes as ordinary literal text',await evaluate(`b2.text(3).includes('**漢**')&&!(b2.para(3).payload.standoffProperties??[]).some(p=>p.type==='style/bold')`));
 await evaluate(`(()=>{const input=document.createElement('input');input.id='b2-native-control';b2.host.append(input);input.value='**control*';input.focus();input.setSelectionRange(input.value.length,input.value.length)})()`);
 await send('Input.insertText',{text:'*'},sessionId);
 check('native controls retain literal typing',await evaluate(`document.querySelector('#b2-native-control').value`),'**control**');
 await evaluate(`b2.editor.commandRegistry.execute('flint.open',{targetKey:b2.session.projection.state.rootKey,args:undefined})`);
 check('two Flint occurrences share converted canonical content',await evaluate(`b2.views().length===2&&b2.views().every(v=>b2.editor.node(v.state.nodes[v.state.rootKey].children[0]).inlineContent.length===4)`));
 await evaluate(`b2.saving=b2.pair.save();b2.firstGeneration=b2.generation.native;b2.editor.commands.replaceInlineRange(b2.para(0).key,0,0,'Later ');for(const n of Object.values(b2.session.projection.state.nodes).filter(n=>n.viewType==='window-block'))b2.editor.commands.remove(n.key);b2.release()`);
 check('closing all Flint Windows does not cancel the resource-owned save',await evaluate(`b2.saving.then(r=>r.phase==='saved'&&r.dirty&&b2.views().length===0)`));
 check('captured Markdown and native both precede newer edits',await evaluate(`!b2.generation.markdown.includes('Later')&&!b2.generation.native.includes('Later')`));
 const captured=await evaluate(`({native:b2.generation.native,markdown:b2.generation.markdown,diagnostics:b2.generation.diagnostics})`);
 await writeFile(path.join(artifacts,'consumed.mutable.json'),captured.native);await writeFile(path.join(artifacts,'consumed.md'),captured.markdown);
 await evaluate(`b2.editor.commandRegistry.execute('flint.open',{targetKey:b2.session.projection.state.rootKey,args:undefined})`);
 check('reopening preserves newer canonical edits',await evaluate(`b2.text(0).startsWith('Later ')`));
 const screenshot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,'consumed-editing.png'),Buffer.from(screenshot.data,'base64'));
 if(errors.length)console.error(JSON.stringify(errors,null,2));check('no uncaught browser exceptions',errors.length,0);
 await writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2)+'\n');console.log(JSON.stringify({passed:checks.length,checks},null,2));
 await evaluate('b2.stop();b2.dispose();b2.session.dispose();b2.host.remove()');
} finally {socket?.close();chrome.kill('SIGKILL');await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true});}

// CDP/undici may retain a closing socket after Chrome has exited. All assertions
// and artifact writes above are awaited; failures never reach this success exit.
process.exit(0);
