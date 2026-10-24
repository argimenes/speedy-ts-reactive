// Real-Flint structural container and reverse checks. Reads one native fixture into memory.
// No saves, load generation, or canonical service writes.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixturePath=process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink';
const fixture=await readFile(fixturePath);
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/reverse-surfaces-proof';await mkdir(artifacts,{recursive:true});
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
 import '/src/index.css';
 import '/src/demo/workspace-demo.css';
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{directDomCharacterCells:${process.env.BENCHMARK_DIRECT_CELLS!=='false'},nativeDocumentPersistence:false,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,flintSceneChrome:true}});
 const editor=session.editor;
 const bank=editor.commands.insert({type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:session.projection.state.rootKey,index:0});
 const {admitNative}=await import('/src/persistence/native-resource.ts');
 admitNative(editor.repository,new Uint8Array(await (await fetch('/__letter')).arrayBuffer()),editor.repository.readState().placements[bank].contentKey);
 editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');
 editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1450,h:920},position:{x:25,y:25}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical';
 const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 window.proof={editor,session,dispose,host};
 `;},
 configureServer(server){server.middlewares.use(async(req,res,next)=>{if(req.url==='/__letter'){res.setHeader('Content-Type','application/json');res.end(fixture);return;}if(req.url!=='/__flint-integration')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>'));});}
}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',...(process.env.BENCHMARK_NATIVE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']),'--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
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

 const click=async expression=>{const p=await evaluate(`(()=>{const el=${expression};if(!el)throw Error('Control missing');el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1},sessionId);await evaluate('new Promise(r=>requestAnimationFrame(r))');};
 const button=label=>`[...document.querySelectorAll('.block-selection-inspector button')].find(b=>b.textContent===${JSON.stringify(label)})`;
 await evaluate(`proof.editor.commands.transaction('Proof paragraphs',()=>{let after=proof.text.placementKey;proof.ids=['reverse-a','reverse-b','reverse-c'];for(const id of proof.ids)after=proof.editor.commands.insert({type:'standoff-editor-block',id,text:id+' editable text'},{kind:id==='reverse-a'?'before':'after',anchorKey:after})});proof.byId=id=>Object.values(proof.view.state.nodes).find(n=>n.payload.id===id);proof.rects=()=>proof.ids.map(id=>{const n=proof.byId(id),el=proof.editor.mounts.get(n.key).focusElement,r=el.getBoundingClientRect();return{height:r.height,top:r.top}});proof.editor.mounts.get(proof.byId('reverse-a').key).root.scrollIntoView({block:'center'});proof.before=proof.rects()`);
 await click(`proof.editor.mounts.get(proof.byId('reverse-a').key).root.querySelector(':scope > .block-selection-handle')`);
 // Extend with the real Shift-click range gesture.
 const p=await evaluate(`(()=>{const el=proof.editor.mounts.get(proof.byId('reverse-c').key).root.querySelector(':scope > .block-selection-handle');const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
 for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1,modifiers:8},sessionId);
 check('real handle selection spans three contiguous Blocks',await evaluate('proof.editor.blockSelection.state.items.length===3'));
 await click(button('Group into Container'));
 await evaluate(`proof.group=proof.editor.projections.get(proof.view.viewId).parentOf(proof.byId('reverse-a').key);proof.after=proof.rects()`);
 check('group retains child identities and ordinary flow spacing',await evaluate(`proof.group.viewType==='container-block'&&proof.after.every((r,i)=>Math.abs(r.height-proof.before[i].height)<1&&Math.abs((r.top-proof.after[0].top)-(proof.before[i].top-proof.before[0].top))<1)`));
 await click(`proof.editor.mounts.get(proof.group.key).root.querySelector(':scope > .block-selection-handle')`);await click(button('Flip'));
 await evaluate(`proof.group=proof.byId(proof.group.payload.id);proof.surface=proof.editor.surfaces.nearest(proof.group.key);proof.front=proof.byId('reverse-a');proof.frontDom=proof.editor.mounts.get(proof.front.key).root;proof.back=proof.editor.node(proof.editor.node(proof.editor.node(proof.surface.children[1]).children[0]).children[0]);proof.backMount=proof.editor.mounts.get(proof.back.key);proof.backDom=proof.backMount.root;proof.backMount.focus();proof.backMount.restoreInlineSelection({anchor:0,head:0})`);
 await send('Input.insertText',{text:'Private reverse notes with an editable caret'},sessionId);
 check('reverse accepts real editor typing',await evaluate("proof.backMount.captureText()==='Private reverse notes with an editable caret'"));
 await evaluate(`proof.counts={snapshot:0,commit:0};for(const name of ['snapshot','commit']){const original=proof.editor.repository[name].bind(proof.editor.repository);proof.editor.repository[name]=(...args)=>{proof.counts[name]++;return original(...args)}}proof.backMount.restoreInlineSelection({anchor:8,head:15})`);
 // Panel button activation should also restore a selection when focus is in the panel.
 await click(`proof.editor.mounts.get(proof.surface.key).root.querySelector(':scope > .block-selection-handle')`);await click(button('Flip'));await click(button('Flip'));
 check('panel flips retain editing DOM and selection',await evaluate('proof.editor.mounts.get(proof.front.key).root===proof.frontDom&&proof.editor.mounts.get(proof.back.key).root===proof.backDom&&proof.backMount.captureInlineSelection().anchor===8&&proof.backMount.captureInlineSelection().head===15'));
 check('face switching takes no repository snapshots or commits',await evaluate('proof.counts.snapshot===0&&proof.counts.commit===0'));
 check('inactive face is inert and reverse takes its natural height',await evaluate(`(()=>{const faces=[...proof.editor.mounts.get(proof.surface.key).root.children].filter(el=>el.hasAttribute('data-surface-face'));return faces[0].inert&&!faces[1].inert&&faces[1].getBoundingClientRect().height>0})()`));
 await evaluate(`proof.editor.blockSelection.clear();proof.editor.surfaces.run('surface.create',proof.back.key)`);await evaluate(`proof.back=proof.byId(proof.back.payload.id);proof.nested=proof.editor.surfaces.nearest(proof.back.key);proof.editor.surfaces.run('surface.flip',proof.back.key)`);
 check('nested reverse targets the inner surface',await evaluate('proof.nested.key!==proof.surface.key&&proof.editor.viewChildren[proof.nested.key]===proof.nested.children[1]&&proof.editor.viewChildren[proof.surface.key]===proof.surface.children[1]'));
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
 check('nested surfaces reserve separate non-overlapping corner gutters',await evaluate(`(()=>{const outer=proof.editor.mounts.get(proof.surface.key).root.querySelector(':scope > .surface-fold').getBoundingClientRect(),inner=proof.editor.mounts.get(proof.nested.key).root.querySelector(':scope > .surface-fold').getBoundingClientRect();return inner.bottom<=outer.top+1})()`));
 check('reduced motion disables flip animation',await evaluate(`getComputedStyle(proof.editor.mounts.get(proof.nested.key).root.querySelector('.reversible-face--active')).animationName==='none'`));
 await evaluate(`proof.editor.surfaces.run('surface.flip',proof.back.key);proof.editor.surfaces.run('surface.flip',proof.surface.key);`);
 await evaluate(`(async()=>{const {resourceBlock}=await import('/src/interchange/resource-url.ts');const {resourceSurface}=await import('/src/interchange/resource-surface.ts');const native=resourceSurface(resourceBlock('https://youtu.be/M7lc1UVf-VE').native);proof.videoSurface=proof.editor.nodeForPlacementInView(proof.editor.commands.insertFragment(native,{kind:'after',anchorKey:proof.surface.placementKey})[0],proof.view.viewId);proof.video=proof.editor.node(proof.editor.node(proof.videoSurface.children[0]).children[0]);proof.iframe=proof.editor.mounts.get(proof.video.key).root.querySelector('iframe');proof.editor.surfaces.run('surface.flip',proof.video.key)})()`);
 check('video reverse preserves the exact iframe',await evaluate("proof.editor.mounts.get(proof.video.key).root.querySelector('iframe')===proof.iframe"));
 check('resource attributes and editable initial metadata coexist on the back',await evaluate(`proof.editor.mounts.get(proof.videoSurface.key).root.textContent.includes('Source: https://youtu.be/M7lc1UVf-VE')&&proof.video.payload.sourceUrl==='https://youtu.be/M7lc1UVf-VE'`));
 // Returning to an application/browser tab must not discard the loaded player.
 await evaluate(`proof.playerWindow=proof.iframe.contentWindow;proof.playerRevision=proof.editor.repository.state.revision;proof.playerCounts={...proof.counts}`);
 for(const [name,value] of [['hidden',''],['aria-hidden','true'],['data-view','graph']]){
  await evaluate(`(async()=>{const root=proof.root,name=${JSON.stringify(name)},value=${JSON.stringify(value)},before=root.getAttribute(name);root.setAttribute(name,value);await new Promise(r=>setTimeout(r,0));if(before===null)root.removeAttribute(name);else root.setAttribute(name,before);await new Promise(r=>setTimeout(r,0));})()`);
 }
 check('returning from hidden and graph views retains the same loaded video player',await evaluate(`proof.editor.mounts.get(proof.video.key).root.querySelector('iframe')===proof.iframe&&proof.iframe.contentWindow===proof.playerWindow`));
 const {targetId:awayTarget}=await send('Target.createTarget',{url:'about:blank'});
 const {sessionId:awaySession}=await send('Target.attachToTarget',{targetId:awayTarget,flatten:true});
 await send('Page.bringToFront',{},awaySession);await wait('document.hidden');
 await send('Page.bringToFront',{},sessionId);await wait('!document.hidden');await send('Target.closeTarget',{targetId:awayTarget});
 check('real browser tab departure and return retain player identity without document work',await evaluate(`proof.editor.mounts.get(proof.video.key).root.querySelector('iframe')===proof.iframe&&proof.iframe.contentWindow===proof.playerWindow&&proof.editor.repository.state.revision===proof.playerRevision&&proof.counts.commit===proof.playerCounts.commit&&proof.counts.snapshot===proof.playerCounts.snapshot`));
 // Already-open viewer: verify its browsing context, not merely iframe identity.
 await evaluate(`proof.editor.blockSelection.clear();proof.livePlacement=proof.editor.commands.insert({type:'iframe-block',id:'live-frame',metadata:{url:'about:blank'}},{kind:'after',anchorKey:proof.videoSurface.placementKey});proof.live=proof.byId('live-frame');proof.liveRoot=proof.editor.mounts.get(proof.live.key).root;proof.liveFrame=proof.liveRoot.querySelector('iframe')`);
 await wait('proof.liveFrame.contentDocument?.readyState==="complete"');
 await evaluate(`proof.liveDoc=proof.liveFrame.contentDocument;proof.liveFrame.contentWindow.retainedToken='still running';proof.loads=0;proof.liveFrame.addEventListener('load',()=>proof.loads++);proof.editor.surfaces.run('surface.create',proof.live.key)`);
 await evaluate('new Promise(r=>setTimeout(r,100))');
 check('initial conversion preserves iframe document and running context without reload',await evaluate(`proof.editor.mounts.get(proof.live.key).root===proof.liveRoot&&proof.liveRoot.querySelector('iframe')===proof.liveFrame&&proof.liveFrame.contentDocument===proof.liveDoc&&proof.liveFrame.contentWindow.retainedToken==='still running'&&proof.loads===0&&!!proof.editor.surfaces.nearest(proof.live.key)`));
 await evaluate(`proof.editor.repository.undo()`);await evaluate('new Promise(r=>setTimeout(r,100))');
 check('undo conversion preserves the same live iframe',await evaluate(`proof.liveFrame.contentDocument===proof.liveDoc&&proof.loads===0&&!proof.editor.surfaces.nearest(proof.live.key)`));
 await evaluate(`(async()=>{
  const {pdfFixture}=await import('/src/pdf/fixtures.ts'),{pdfBlock}=await import('/src/pdf/block.ts'),{HttpApplicationServices}=await import('/src/runtime/application-services.ts');
  const bytes=pdfFixture(),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const snapshot={version:1,kind:'pdf',snapshotId:crypto.randomUUID(),identityId:crypto.randomUUID(),entityId:crypto.randomUUID(),resourceId:crypto.randomUUID(),sourceUrl:'https://papers.example/work.pdf',endpoint:'https://papers.example/work.pdf',retrievedAt:'2026-10-24T00:00:00Z',asset:{kind:'managed',cavernId:'fixture',assetId:'sha256:'+digest},inspection:{kind:'pdf-inspection',pages:2,label:'Continuity PDF',version:'fixture'}};
  const call=HttpApplicationServices.prototype.call;proof.pdfReads=0;HttpApplicationServices.prototype.call=function(method,...args){if(method==='pdf.read'){proof.pdfReads++;return Promise.resolve({bytes,snapshot});}return call.call(this,method,...args);};
  proof.pdfNode=proof.editor.nodeForPlacementInView(proof.editor.commands.insertFragment(pdfBlock(snapshot).native,{kind:'after',anchorKey:proof.live.placementKey})[0],proof.view.viewId);
  proof.pdfRoot=proof.editor.mounts.get(proof.pdfNode.key).root;[...proof.pdfRoot.querySelectorAll('button')].find(b=>b.textContent==='Open retained PDF').click();
 })()`);
 await wait(`proof.pdfRoot.querySelector('.textLayer')?.textContent.includes('Academic PDF page 1')`);
 await evaluate(`[...proof.pdfRoot.querySelectorAll('button')].find(b=>b.textContent==='Next PDF page').click()`);
 await wait(`proof.pdfRoot.querySelector('.textLayer')?.textContent.includes('Academic PDF page 2')`);
 await evaluate(`proof.pdfCanvas=proof.pdfRoot.querySelector('canvas');proof.pdfViewport=proof.pdfRoot.querySelector('[aria-label="PDF viewport"]');proof.pdfViewport.scrollTop=80;proof.pdfScroll=proof.pdfViewport.scrollTop;proof.editor.surfaces.run('surface.create',proof.pdfNode.key)`);
 await evaluate('new Promise(r=>requestAnimationFrame(r))');
 check('initial conversion preserves an open PDF page, canvas, scroll and read session',await evaluate(`proof.editor.mounts.get(proof.pdfNode.key).root===proof.pdfRoot&&proof.pdfRoot.querySelector('canvas')===proof.pdfCanvas&&proof.pdfRoot.querySelector('.textLayer').textContent.includes('Academic PDF page 2')&&proof.pdfViewport.scrollTop===proof.pdfScroll&&proof.pdfReads===1`));
 await evaluate(`proof.editor.surfaces.run('surface.flip',proof.pdfNode.key);proof.editor.surfaces.run('surface.flip',proof.pdfNode.key)`);
 check('PDF remains on the same page after flips without reopening',await evaluate(`proof.pdfRoot.querySelector('canvas')===proof.pdfCanvas&&proof.pdfRoot.querySelector('.textLayer').textContent.includes('Academic PDF page 2')&&proof.pdfReads===1`));
 await evaluate(`(async()=>{proof.findRevision=proof.editor.repository.state.revision;proof.editor.find.open(proof.front.key);proof.editor.find.setQuery('Private reverse notes');await proof.editor.find.flush();await proof.editor.find.navigate(1)})()`);
 check('real search worker finds and reveals hidden reverse text without a document edit',await evaluate(`proof.editor.find.state.result?.matches.length===1&&!proof.backDom.closest('[aria-hidden="true"]')&&proof.editor.repository.state.revision===proof.findRevision`));
 await evaluate(`proof.editor.find.close(false);proof.sourcePlacement=proof.editor.commands.insert({id:'source-preview',type:'mutable/markdown-source-block',text:'**Existing preview**',sourceFormat:{version:1,format:'markdown',profile:'mutable-markdown-source-v1'}},{kind:'after',anchorKey:proof.editor.surfaces.nearest(proof.pdfNode.key).placementKey});proof.sourceNode=proof.byId('source-preview');proof.sourceRoot=proof.editor.mounts.get(proof.sourceNode.key).root;[...proof.sourceRoot.querySelectorAll('button')].find(b=>b.textContent==='Preview').click()`);
 await wait(`!!proof.sourceRoot.querySelector('iframe')`);
 await evaluate(`proof.sourceFrame=proof.sourceRoot.querySelector('iframe');proof.sourceFrame.focus();proof.editor.surfaces.run('surface.create',proof.sourceNode.key)`);
 await evaluate(`proof.editor.surfaces.run('surface.flip',proof.sourceNode.key)`);await evaluate(`proof.editor.surfaces.run('surface.flip',proof.sourceNode.key)`);
 check('source preview survives initial conversion and focus restoration without switching back to edit mode',await evaluate(`proof.sourceRoot.querySelector('iframe')===proof.sourceFrame&&proof.sourceRoot.querySelector('textarea').hidden`));
 // Final refinement qualification: actual corner pointer/keyboard interaction.
 const corner=key=>`proof.editor.mounts.get(${key}).root.querySelector(':scope > .surface-fold')`;
 const screenshot=async name=>{await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,name+'.png'),Buffer.from(r.data,'base64')));};
 await evaluate(`proof.pdfSurface=proof.editor.surfaces.nearest(proof.pdfNode.key);proof.editor.surfaces.run('surface.flip',proof.video.key)`);
 await click(corner('proof.videoSurface.key'));

 check('front corner pointer shows video reverse without replacing iframe',await evaluate(`proof.editor.viewChildren[proof.videoSurface.key]===proof.videoSurface.children[1]&&proof.editor.mounts.get(proof.video.key).root.querySelector('iframe')===proof.iframe`));
 await screenshot('video-reverse');
 await click(corner('proof.videoSurface.key'));
 check('back corner pointer returns to video front',await evaluate(`proof.editor.viewChildren[proof.videoSurface.key]===proof.videoSurface.children[0]`));
 await click(corner('proof.pdfSurface.key'));check('PDF corner exposes its reverse',await evaluate(`proof.editor.viewChildren[proof.pdfSurface.key]===proof.pdfSurface.children[1]`));await evaluate(`proof.editor.mounts.get(proof.pdfSurface.key).root.querySelector('.reversible-face--active').scrollIntoView({block:'center'})`);await screenshot('pdf-reverse');await click(corner('proof.pdfSurface.key'));
 check('corner flips preserve managed PDF canvas, scroll, page and one read',await evaluate(`proof.pdfRoot.querySelector('canvas')===proof.pdfCanvas&&proof.pdfRoot.querySelector('.textLayer').textContent.includes('page 2')&&proof.pdfViewport.scrollTop===proof.pdfScroll&&proof.pdfReads===1`));
 await evaluate(`(async()=>{const {resourceSurface}=await import('/src/interchange/resource-surface.ts');const image={id:'corner-image',type:'image-block',src:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="220"><rect width="480" height="220" fill="#d9d0e4"/><text x="30" y="110" font-size="24">Reverse surface image</text></svg>'),sourceUrl:'https://images.example/original.png',title:'Image with editable notes'};proof.imagePlacement=proof.editor.commands.insert({...image,metadata:{url:image.src}},{kind:'after',anchorKey:proof.pdfSurface.placementKey});proof.imageNode=proof.byId('corner-image');proof.editor.surfaces.run('surface.create',proof.imageNode.key);proof.imageSurface=proof.editor.surfaces.nearest(proof.imageNode.key);proof.imageRoot=proof.editor.mounts.get(proof.imageNode.key).root;proof.image=proof.imageRoot.querySelector('img');})()`);
 await click(corner('proof.imageSurface.key'));check('image corner exposes its reverse',await evaluate(`proof.editor.viewChildren[proof.imageSurface.key]===proof.imageSurface.children[1]`));await screenshot('image-reverse');await click(corner('proof.imageSurface.key'));
 check('image corner returns to front and retains image without old controls',await evaluate(`proof.editor.viewChildren[proof.imageSurface.key]===proof.imageSurface.children[0]&&proof.imageRoot.querySelector('img')===proof.image&&!proof.host.querySelector('.reactive-flippable__flip')`));
 await evaluate(`proof.cornerRoot=proof.editor.mounts.get(proof.imageSurface.key).root;proof.corner=proof.cornerRoot.querySelector(':scope > .surface-fold');proof.flipRevision=proof.editor.repository.state.revision;proof.flipCounts={...proof.counts};proof.saveCalls=0;proof.flipExecute=proof.editor.commandRegistry.execute.bind(proof.editor.commandRegistry);proof.editor.commandRegistry.execute=(id,...args)=>{if(/save/i.test(id))proof.saveCalls++;return proof.flipExecute(id,...args)};proof.corner.focus();`);
 for(const [key,code,keyCode] of [['Enter','Enter',13],[' ','Space',32]]){
  await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:keyCode,text:key==='Enter'?'\r':' ',unmodifiedText:key==='Enter'?'\r':' '},sessionId);
  await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:keyCode},sessionId);
  check('native '+code+' flips once and keeps corner keyboard focus',await evaluate(`document.activeElement===proof.corner&&proof.editor.viewChildren[proof.imageSurface.key]===proof.imageSurface.children[${key==='Enter'?1:0}]`));
 }
 check('keyboard focus visible and reduced motion still respected',await evaluate(`getComputedStyle(proof.corner).outlineStyle!=='none'&&getComputedStyle(proof.cornerRoot.querySelector('.reversible-face--active')).animationName==='none'`));
 await click(`proof.root.querySelector('[aria-label="Reading density"]')`);
 await click(corner('proof.imageSurface.key'));await click(corner('proof.imageSurface.key'));
 check('corners work in Flint reading density',await evaluate(`proof.root.dataset.density==='reading'&&proof.editor.viewChildren[proof.imageSurface.key]===proof.imageSurface.children[0]`));
 await evaluate(`proof.editor.mounts.get(proof.front.key).focus();proof.editor.mounts.get(proof.front.key).restoreInlineSelection({anchor:1,head:4})`);
 await click(corner('proof.imageSurface.key'));await click(corner('proof.imageSurface.key'));
 check('corner flips make no revisions, snapshots, commits or Save commands',await evaluate(`proof.editor.repository.state.revision===proof.flipRevision&&proof.counts.snapshot===proof.flipCounts.snapshot&&proof.counts.commit===proof.flipCounts.commit&&proof.saveCalls===0`));
 check('36px gutter holds the full corner target below the face without covering the image',await evaluate(`(()=>{const root=proof.cornerRoot,button=proof.corner,r=root.getBoundingClientRect(),face=root.querySelector('.reversible-face--active').getBoundingClientRect(),b=button.getBoundingClientRect();return Math.abs(r.bottom-face.bottom-36)<1&&b.top>=face.bottom-1&&Math.abs(b.bottom-r.bottom)<1&&Math.abs(b.right-r.right)<1&&b.width>=36&&b.height>=36})()`));
 const clearFollowingControls=()=>evaluate(`(()=>{const r=proof.cornerRoot.getBoundingClientRect(),b=proof.corner.getBoundingClientRect(),following=proof.editor.mounts.get(proof.editor.surfaces.nearest(proof.sourceNode.key).key).root.getBoundingClientRect();return following.top>=r.bottom-1&&[...proof.sourceRoot.querySelectorAll('button,input,textarea,iframe')].every(el=>{const c=el.getBoundingClientRect();return c.width===0||c.height===0||c.left>=b.right||c.right<=b.left||c.top>=b.bottom||c.bottom<=b.top})})()`);
 check('front corner leaves following source-preview controls unobstructed',await clearFollowingControls());
 await click(corner('proof.imageSurface.key'));
 check('reverse corner leaves following source-preview controls unobstructed',await clearFollowingControls());
 await click(corner('proof.imageSurface.key'));
 await evaluate(`proof.cornerRoot.style.width='260px';proof.cornerRoot.scrollIntoView({block:'center'})`);
 check('corner tracks resized block edge and remains pointer reachable',await evaluate(`(()=>{const r=proof.cornerRoot.getBoundingClientRect(),b=proof.corner.getBoundingClientRect();return Math.abs(b.right-r.right)<1&&Math.abs(b.bottom-r.bottom)<1&&proof.corner.contains(document.elementFromPoint(b.left+b.width/2,b.top+b.height/2))})()`));
 check('resized gutter still clears the following source-preview controls',await clearFollowingControls());
 await screenshot('image-front-corner');
 await evaluate(`proof.cornerRoot.style.width='';`);
 await evaluate(`(async()=>{const {inspectUri}=await import('/src/interchange/uri.ts');proof.genericPlacement=proof.editor.commands.insert({id:'automatic-video',type:'mutable/video-block',video:inspectUri('https://vimeo.com/76979871').video},{kind:'after',anchorKey:proof.videoSurface.placementKey});proof.genericVideo=proof.editor.mounts.get(proof.byId('automatic-video').key).root;})()`);
 check('generic VideoBlock loads its player automatically without autoplay',await evaluate(`!!proof.genericVideo.querySelector('iframe')&&proof.genericVideo.querySelector('iframe').src.includes('autoplay=0')&&proof.genericVideo.querySelector('button').textContent==='Stop player'`));
 const audit=await evaluate(`(async()=>{const {triggerKey,keyboard}=await import('/src/input/bindings.ts');return ['y','k','u'].flatMap(key=>[['Ctrl','Meta'],['Ctrl','Shift']].map(mods=>({key,modifiers:mods,conflicts:proof.editor.bindings.list().filter(a=>proof.editor.bindings.effective(a.id).some(t=>t.kind==='keyboard'&&triggerKey(t)===triggerKey(keyboard(key,...mods)))).map(a=>a.id)})))})()`);
 await writeFile(path.join(artifacts,'shortcut-audit.json'),JSON.stringify(audit,null,2));check('six proposed platform-specific shortcuts have no registered default conflict',audit.every(a=>a.conflicts.length===0));
 check('no browser exceptions',errors.length===0);
 await writeFile(path.join(artifacts,'reverse-surfaces.json'),JSON.stringify({browser:await send('Browser.getVersion'),checks,errors},null,2));
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'reverse-surfaces.png'),Buffer.from(r.data,'base64')));
 await evaluate('proof.dispose();proof.session.dispose()');
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
