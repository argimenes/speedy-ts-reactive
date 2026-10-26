// Real-Flint adaptive annotation bar checks. Reads one native fixture into memory.
// No saves, load generation, or canonical service writes.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixturePath=process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink';
const fixture=await readFile(fixturePath);
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/annotation-bar-proof';await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'flint-integration-'));
const vite=await createServer({plugins:[{
 name:'flint-integration-proof',
 resolveId(id){if(id==='/__flint-proof.js')return '\0flint-proof';},
 load(id){if(id==='\0flint-proof')return `
 import {render} from 'solid-js/web';
 import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';
 import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';
 import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
 import '/src/assets/reset.css';
 import '/src/index.css';
 import '/src/demo/workspace-demo.css';
 localStorage.setItem('mutable.flint.compact-layout.v1',JSON.stringify({density:'reading'}));
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{directDomCharacterCells:${process.env.BENCHMARK_DIRECT_CELLS!=='false'},nativeDocumentPersistence:true,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,flintSceneChrome:true}});
 const editor=session.editor;
 const bank=editor.commands.insert({type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:session.projection.state.rootKey,index:0});
 const {admitNative}=await import('/src/persistence/native-resource.ts');
 admitNative(editor.repository,new Uint8Array(await (await fetch('/__letter')).arrayBuffer()),editor.repository.readState().placements[bank].contentKey);
 editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');
 editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1450,h:920},position:{x:25,y:25}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical workspace-demo--system-bar compact-document-workspace';host.setAttribute('data-window-work-area','');
 const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 window.proof={editor,session,dispose,host};
 `;},
 configureServer(server){server.middlewares.use(async(req,res,next)=>{if(req.url==='/__letter'){res.setHeader('Content-Type','application/json');res.end(fixture);return;}if(req.url!=='/__flint-integration')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>'));});}
}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--window-size=1500,990','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',...(process.env.BENCHMARK_NATIVE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']),'--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},60000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{if(process.env.AUTOCOMPLETE_TRACE)console.log('EVAL '+expression.slice(0,180));const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<900;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 await send('Page.bringToFront',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");
 await evaluate(`proof.root=proof.host.querySelector('.flint-application');proof.view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection);proof.text=Object.values(proof.view.state.nodes).filter(n=>n.viewType==='standoff-editor-block'&&proof.editor.mounts.get(n.key)).sort((a,b)=>b.inlineContent.length-a.inlineContent.length)[0];proof.mount=proof.editor.mounts.get(proof.text.key);proof.flow=proof.mount.root.querySelector('.reactive-standoff-flow')??proof.mount.root;proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:100,head:100});`);
 const checks=[];
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};

 const click=async expression=>{const p=await evaluate(`(()=>{const el=${expression};if(!el)throw Error('Control missing');if(el.disabled)throw Error('Control disabled: '+el.textContent);el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);if(!el.contains(hit))throw Error('Control covered: '+el.textContent+' by '+hit?.outerHTML.slice(0,280));return{x,y}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1},sessionId);await evaluate('new Promise(r=>requestAnimationFrame(r))');};
 await evaluate(`proof.bar=proof.root.querySelector('[data-annotation-bar-state]');proof.policy=value=>{const select=proof.bar.querySelector('[aria-label="Annotation bar presentation"]');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}))};proof.scroll=proof.bar.parentElement.querySelector('.reactive-document-occurrence__content');proof.state=()=>proof.bar.dataset.annotationBarState`);
 check('loaded Flint Document shows Compact even with saved Reading density',await evaluate(`proof.root.dataset.density==='reading'&&proof.state()==='compact'&&proof.bar.dataset.annotationBarPolicy==='compact'&&!proof.bar.querySelector('.annotation-bar__reveal')`));
 await evaluate(`proof.scroll.scrollTop=0;proof.top=proof.bar.getBoundingClientRect().top;proof.scroll.scrollTop=700`);await evaluate('new Promise(r=>requestAnimationFrame(r))');
 check('long Document scroll keeps annotation bar below Flint tabs',await evaluate(`proof.scroll.scrollTop>0&&Math.abs(proof.bar.getBoundingClientRect().top-proof.top)<1&&proof.bar.getBoundingClientRect().bottom<=proof.scroll.getBoundingClientRect().top+1`));

 await evaluate(`proof.policy('expanded')`);
 check('manual Expanded exposes all canonical annotations',await evaluate(`proof.state()==='expanded'&&proof.bar.querySelectorAll('[data-annotation-type]').length>=30`));
 await evaluate(`proof.policy('hidden')`);
 check('Hidden keeps only accessible reveal and policy controls',await evaluate(`proof.state()==='hidden'&&!!proof.bar.querySelector('.annotation-bar__reveal')&&!proof.bar.querySelector('[data-annotation-type]')`));
 await evaluate(`proof.bar.querySelector('.annotation-bar__reveal').focus()`);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'},sessionId);
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
 check('keyboard reveal selects Compact',await evaluate(`proof.state()==='compact'&&localStorage.getItem('mutable.ink.annotation-bar.v1')==='compact'`));
 await evaluate(`proof.policy('expanded')`);await click(`proof.root.querySelector('[aria-label="Flint application menu"]')`);await click(`proof.root.querySelector('[aria-label="Reading density"]')`);
 check('density toggle preserves Expanded',await evaluate(`proof.state()==='expanded'&&localStorage.getItem('mutable.ink.annotation-bar.v1')==='expanded'`));
 await click(`proof.root.querySelector('[aria-label="Flint application menu"]')`);await click(`proof.root.querySelector('[aria-label="Reading density"]')`);
 check('Reading density does not conceal the annotation bar',await evaluate(`proof.root.dataset.density==='reading'&&proof.state()==='expanded'`));
 await evaluate(`proof.policy('compact');proof.editor.caretModes.select('block-focus')`);
 check('Block Focus keeps Compact visible',await evaluate(`proof.state()==='compact'&&!proof.bar.querySelector('.annotation-bar__reveal')`));
 await evaluate(`proof.editor.caretModes.select('reading-spotlight')`);
 check('Reading Spotlight keeps Compact visible',await evaluate(`proof.state()==='compact'&&!proof.bar.querySelector('.annotation-bar__reveal')`));
 await evaluate(`proof.editor.caretModes.select('normal')`);
 await evaluate(`proof.policy('compact');proof.scroll.scrollTop=0;proof.mount.root.scrollIntoView({block:'center'});proof.mount.focus();proof.mount.restoreInlineSelection({anchor:100,head:107});document.dispatchEvent(new Event('selectionchange'))`);
 await click(`proof.bar.querySelector('[data-annotation-type="style/bold"]')`);
 check('pointer formatting preserves the intended editor selection',await evaluate(`proof.editor.node(proof.text.key).payload.standoffProperties.some(p=>p.type==='style/bold'&&p.start===100&&p.end===106)`));
 await evaluate(`proof.editorRegion=proof.root.querySelector('.flint-application__editor');proof.originalRegionStyle=proof.editorRegion.getAttribute('style');proof.editorRegion.style.cssText='flex:none;width:280px;min-width:280px'`);
 await evaluate('new Promise(r=>setTimeout(r,300))');
 const narrow=await evaluate(`(()=>{const root=proof.bar.getBoundingClientRect(),els=[...proof.bar.querySelectorAll('.annotation-bar__style,.compact-toolbar__persistent button,.compact-toolbar__more,.annotation-bar__policy')];return {width:root.width,controls:els.map(el=>({name:el.getAttribute('aria-label')||el.textContent,left:el.getBoundingClientRect().left-root.left,right:el.getBoundingClientRect().right-root.left,width:el.getBoundingClientRect().width})),fits:els.every(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.left>=root.left&&r.right<=root.right+1})}})()`);
 console.log('NARROW',JSON.stringify(narrow));check('style, bold, italic, More and policy fit a 280px pane',narrow.fits);
 await click(`proof.bar.querySelector('.compact-toolbar__more')`);
 check('overflow escapes pane clipping and exposes toolsets and editor options',await evaluate(`(()=>{const popup=document.querySelector('.compact-toolbar__panel'),r=popup.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&!!popup.querySelector('[aria-label="Overflow toolset"]')&&!!popup.querySelector('[aria-label="Caret Mode"]')})()`));
 await click(`document.querySelector('[aria-label="Close tools"]')`);
 await evaluate(`proof.editorRegion.setAttribute('style',proof.originalRegionStyle??'');proof.policy('auto')`);
 await evaluate(`proof.detachment=proof.session.documentSessions.detachment;proof.documentSession=proof.session.documentSessions.sessions().find(s=>s.projection===proof.view)`);
 await click(`proof.root.querySelector('[aria-label^="Document actions:"]')`);
 await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Detach Document')`);
 await wait(`proof.detachment.windows()[0]&&!proof.detachment.windows()[0].state.pending`);
 await evaluate(`proof.detached=proof.detachment.windows()[0];proof.frame=proof.bar.closest('.reactive-window');proof.scroll=proof.bar.closest('.reactive-window__content')`);
 check('detached Document retains the exact annotation bar and editing DOM',await evaluate(`proof.frame&&proof.editor.mounts.get(proof.text.key)===proof.mount&&proof.state()==='compact'`));
 await click(`proof.frame.querySelector('[aria-label="Maximize window"]')`);
 await wait(`proof.state()==='expanded'`);
 check('spacious maximised detached Document resolves Expanded',true);
 await evaluate(`proof.occurrence=proof.bar.parentElement;proof.occurrence.style.width='960px'`);await evaluate('new Promise(r=>setTimeout(r,300))');
 const expandedFit=await evaluate(`({width:proof.bar.getBoundingClientRect().width,height:proof.bar.getBoundingClientRect().height,scrollWidth:proof.bar.scrollWidth,clientWidth:proof.bar.clientWidth,state:proof.state()})`);
 console.log('EXPANDED FIT',JSON.stringify(expandedFit));
 check('expanded controls wrap without horizontal overflow at the 960px threshold',expandedFit.state==='expanded'&&expandedFit.scrollWidth<=expandedFit.clientWidth+1);
 check('scrolled Block handles cannot paint above the annotation bar',await evaluate(`getComputedStyle(proof.occurrence.querySelector('.reactive-document-occurrence__content')).isolation==='isolate'`));
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'expanded.png'),Buffer.from(r.data,'base64')));
 await evaluate(`proof.occurrence.style.width=''`);await evaluate('new Promise(r=>setTimeout(r,300))');
 await evaluate(`proof.scroll.scrollTop=700`);await evaluate('new Promise(r=>requestAnimationFrame(r))');
 check('detached annotation bar clears its Save/Return chrome while scrolling',await evaluate(`proof.bar.getBoundingClientRect().top>=proof.frame.querySelector('.detached-document-toolbar').getBoundingClientRect().bottom-1`));
 await click(`proof.frame.querySelector('[aria-label="Restore window"]')`);await wait(`proof.state()==='compact'`);
 check('restored detached Document returns to Compact',true);
 await evaluate(`proof.session.windowManager.layout.snap(proof.detached.id,'left')`);await evaluate('new Promise(r=>setTimeout(r,300))');
 check('tiled Document stays Compact with the exact editor session',await evaluate(`proof.session.windowManager.layout.isTiled(proof.detached.id)&&proof.state()==='compact'&&proof.editor.mounts.get(proof.text.key)===proof.mount`));
 await evaluate(`proof.session.windowManager.layout.float(proof.detached.id)`);
 await evaluate(`proof.policy('expanded')`);await click(`proof.frame.querySelector('[aria-label="Maximize window"]')`);await click(`proof.frame.querySelector('[aria-label="Restore window"]')`);
 check('manual Expanded survives maximise and restore',await evaluate(`proof.state()==='expanded'`));
 await evaluate(`proof.policy('auto')`);
 // Fullscreen uses the actual browser API with a trusted activation.
 await evaluate(`proof.fullscreenButton=document.createElement('button');proof.fullscreenButton.textContent='Fullscreen proof';proof.fullscreenButton.style.cssText='position:fixed;left:0;top:0;z-index:2147483647';document.body.append(proof.fullscreenButton);proof.fullscreenButton.addEventListener('click',()=>proof.frame.requestFullscreen())`);
 await click(`proof.fullscreenButton`);await wait(`document.fullscreenElement===proof.frame&&proof.state()==='expanded'`);
 check('actual full-screen Document resolves Expanded under Auto',true);
 await evaluate(`proof.policy('compact')`);await click(`proof.bar.querySelector('.compact-toolbar__more')`);
 check('More stays usable inside native full-screen',await evaluate(`(()=>{const panel=proof.frame.querySelector('.compact-toolbar__panel'),button=panel?.querySelector('button'),r=button?.getBoundingClientRect();return !!button&&button.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})()`));
 await click(`proof.frame.querySelector('[aria-label="Close tools"]')`);await evaluate(`proof.policy('auto')`);
 await evaluate(`document.exitFullscreen()`);await wait(`!document.fullscreenElement&&proof.state()==='compact'`);await evaluate(`new Promise(r=>setTimeout(r,250))`);await evaluate(`proof.fullscreenButton.remove()`);
 await click(`[...proof.frame.querySelectorAll('button')].find(b=>b.textContent.trim()==='Return to Flint')`);await wait(`!proof.detachment.windows().length`);
 check('Return retains bar, editor, and Auto policy',await evaluate(`proof.root.contains(proof.bar)&&proof.editor.mounts.get(proof.text.key)===proof.mount&&proof.state()==='compact'`));
 await evaluate(`proof.counts={snapshot:0,commit:0};for(const name of ['snapshot','commit']){const original=proof.editor.repository[name].bind(proof.editor.repository);proof.editor.repository[name]=(...args)=>{proof.counts[name]++;return original(...args)}}proof.revision=proof.editor.repository.state.revision;proof.policy('expanded');proof.policy('hidden');proof.policy('compact');proof.policy('auto')`);
 check('presentation changes create no snapshots, commits or content revision',await evaluate(`proof.counts.snapshot===0&&proof.counts.commit===0&&proof.editor.repository.state.revision===proof.revision`));
 await evaluate('new Promise(r=>setTimeout(r,300))');
 check('returned fixed bar sits above the Flint Document scrollport',await evaluate(`Math.abs(proof.bar.getBoundingClientRect().bottom-proof.bar.parentElement.querySelector('.reactive-document-occurrence__content').getBoundingClientRect().top)<1`));
 check('Document page tabs retain ordinary non-sticky positioning',await evaluate(`(()=>{const tabs=[...proof.bar.parentElement.querySelectorAll('.reactive-document-occurrence__content .reactive-tabs__labels')];return tabs.length>0&&tabs.every(el=>!['sticky','fixed'].includes(getComputedStyle(el).position))})()`));
 // Exercise the actual long story page, not just the shorter Wikipedia page.
 await click(`proof.bar.parentElement.querySelector('.reactive-document-occurrence__content [role="tab"]')`);
 // Native fullscreen can reset headless Chrome's input viewport independently
 // of the emulated CSS viewport; restore both before sending wheel gestures.
 await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Emulation.setVisibleSize',{width:1500,height:990},sessionId);
 const scrollEvidence=[];
 for(const maximized of [false,true]) {
   if(maximized) await click(`proof.root.closest('.reactive-window').querySelector('[aria-label="Maximize window"]')`);
   for(const policy of ['compact','expanded']) {
     await evaluate(`proof.policy('${policy}');proof.scroll=proof.bar.parentElement.querySelector('.reactive-document-occurrence__content');proof.scroll.scrollTop=0`);
     await evaluate('new Promise(r=>setTimeout(r,180))');
     const before=await evaluate(`({bar:proof.bar.getBoundingClientRect().top,content:proof.scroll.getBoundingClientRect().toJSON(),maximum:proof.scroll.scrollHeight-proof.scroll.clientHeight,counts:{...proof.counts},revision:proof.editor.repository.state.revision})`);
     check(`${policy} ${maximized?'maximised':'floating'} Document has a bounded content scrollport`,before.maximum>1000);
     for(const delta of [450,100000,-100000]) {
       await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.content.left+before.content.width/2,y:before.content.top+before.content.height/2},sessionId);
       await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:before.content.left+before.content.width/2,y:before.content.top+before.content.height/2,deltaX:0,deltaY:delta},sessionId);
       await evaluate('new Promise(r=>setTimeout(r,700))');
       const state=await evaluate(`(()=>{const r=proof.bar.getBoundingClientRect(),port=proof.scroll.getBoundingClientRect(),button=proof.bar.querySelector('[data-annotation-type="style/bold"]'),b=button.getBoundingClientRect();return {bar:r.top,bottom:r.bottom,content:port.top,scroll:proof.scroll.scrollTop,maximum:proof.scroll.scrollHeight-proof.scroll.clientHeight,reachable:button.contains(document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)),outerScroll:proof.root.closest('.reactive-window__content').scrollTop,counts:{...proof.counts},revision:proof.editor.repository.state.revision}})()`);
       scrollEvidence.push({maximized,policy,delta,...state,unchanged:state.counts.snapshot===before.counts.snapshot&&state.counts.commit===before.counts.commit&&state.revision===before.revision});
       check(`${policy} ${maximized?'maximised':'floating'} wheel ${delta} keeps bar fixed and clickable`,Math.abs(state.bar-before.bar)<1&&Math.abs(state.bottom-state.content)<1&&state.reachable&&state.outerScroll===0&&(delta===450?state.scroll>0:delta>0?Math.abs(state.scroll-state.maximum)<2:state.scroll===0));
     }
   }
 }
 await evaluate(`proof.policy('compact');proof.scroll.scrollTop=700`);
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'maximised-scroll.png'),Buffer.from(r.data,'base64')));
 check('wheel scrolling creates no snapshots, commits or content revision',scrollEvidence.every(sample=>sample.unchanged));
 check('no browser exceptions',errors.length===0);
 await writeFile(path.join(artifacts,'annotation-bar.json'),JSON.stringify({browser:await send('Browser.getVersion'),checks,narrow,expandedFit,scrollEvidence,errors},null,2));
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'annotation-bar.png'),Buffer.from(r.data,'base64')));
 await evaluate('proof.dispose();proof.session.dispose()');
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
