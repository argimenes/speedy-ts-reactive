// Compact shell integration check in the production Flint composition. Ephemeral in-memory Documents;
// no user Vault is read or changed. The real workspace command and views run.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const artifacts='/tmp/flint-compact-proof';await mkdir(artifacts,{recursive:true});
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
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{nativeDocumentPersistence:false,flintProbe:false,flintSceneChrome:true}});
 const editor=session.editor;
 editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');
 editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1450,h:920},position:{x:25,y:25}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical';
 const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 window.proof={editor,session,dispose,host};
 `;},
 configureServer(server){server.middlewares.use(async(req,res,next)=>{if(req.url!=='/__flint-integration')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>'));});}
}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},45000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<300;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 const check=(name,value)=>{assert.ok(value,name);console.log('Passed: '+name);checks.push(name);};const checks=[];
 const shot=async name=>{const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,name+'.png'),Buffer.from(data,'base64'));};
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");
 await evaluate(`(async()=>{
 proof.root=proof.host.querySelector('.flint-application');
 proof.material=(await import('/src/features/flint/material/material-chrome.tsx')).materialChromePresentation(proof.root);
 const view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection);
 const doc=view.state.nodes[view.state.rootKey],text=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block');proof.text=text;proof.mount=proof.editor.mounts.get(text.key);
 proof.editor.commands.setPayloadField(doc.key,'metadata',{...JSON.parse(JSON.stringify(doc.payload.metadata)),title:'The Waste Land'});
 const names=['T. S. Eliot','Modernism','London','Thames','Myth','War','Nature','Time','Suffering','Rebirth','The Hollow Men','Memory'];
 const content='April is the cruellest month, breeding\\nLilacs out of the dead land, mixing\\nMemory and desire, stirring\\nDull roots with spring rain.\\n\\n'+names.join(' · ');
 proof.editor.commands.replaceInlineRange(text.key,0,text.inlineContent.length,content);
 for(let i=0;i<names.length;i++){const start=content.lastIndexOf(names[i]);proof.editor.linkedAnnotations.createBatch([[proof.editor.textRanges.snapshot(text.key,start,start+names[i].length)]],'codex/entity-reference','entity-'+i,{entityName:names[i]},proof.editor.repository.state.revision,'Link entity');}
 proof.before=JSON.stringify(proof.editor.repository.snapshot());proof.view=view;
 })()`);

 await wait("proof.root.querySelectorAll('[aria-label=\"Document backlinks\"] tbody tr').length===12");
 await evaluate(`proof.win=Object.values(proof.session.projection.state.nodes).find(n=>n.viewType==='window-block');proof.geometry=patch=>proof.editor.commands.setPayloadField(proof.win.key,'metadata',{...JSON.parse(JSON.stringify(proof.editor.node(proof.win.key).payload.metadata)),...patch});`);
 const click=label=>evaluate(`proof.root.querySelector('[aria-label="'+${JSON.stringify(label)}+'"]').click()`);
 const layout=await evaluate(`(()=>{const size=s=>Math.round(proof.root.querySelector(s).getBoundingClientRect().height);return {header:size('.flint-application__header'),tabs:size('.reactive-tabs__labels'),status:size('.flint-status'),rail:proof.root.querySelector('.flint-primary-rail').offsetWidth,background:getComputedStyle(proof.root).backgroundImage};})()`);
 check('reference header, rail, tabs and footer dimensions',layout.header===39&&layout.tabs===33&&layout.status===24&&layout.rail===42);
 check('flat shell without background textures or chrome canvases',layout.background==='none'&&await evaluate("!proof.root.querySelector('canvas')"));
 await shot('document-wide');
 await click('Reading density');
 check('reading preference preserves mounted editor and canonical data',await evaluate("proof.root.dataset.density==='reading'&&proof.editor.mounts.get(proof.text.key)===proof.mount&&JSON.stringify(proof.editor.repository.snapshot())===proof.before"));
 await shot('reading');await click('Reading density');
 await evaluate('proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:0,head:0})');
 await send('Input.insertText',{text:'Reading notes — '},sessionId);
 check('real browser input reaches the existing standoff editor',await evaluate("proof.mount.captureText().startsWith('Reading notes — ' )"));
 await evaluate('proof.before=JSON.stringify(proof.editor.repository.snapshot());proof.mount.restoreInlineSelection({anchor:0,head:7})');
 const drag=async(selector,dx)=>{const point=await evaluate(`(()=>{const r=proof.root.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+100};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+dx,y:point.y,button:'left',buttons:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+dx,y:point.y,button:'left',buttons:0,clickCount:1},sessionId);};
 await drag('[aria-label="Resize explorer"]',50);await drag('[aria-label="Resize inspector"]',-35);
 check('both panes resize with real pointer capture',await evaluate("proof.root.style.getPropertyValue('--flint-explorer-width')==='288px'&&proof.root.style.getPropertyValue('--flint-inspector-width')==='290px'"));
 check('pointer resizing preserves the editor selection',await evaluate('JSON.stringify(proof.mount.captureInlineSelection())===JSON.stringify({anchor:0,head:7})'));
 await click('Toggle Library');await click('Toggle Context');
 check('collapsing panels leaves the same editor and data',await evaluate("getComputedStyle(proof.root.querySelector('.flint-application__vault')).display==='none'&&getComputedStyle(proof.root.querySelector('.flint-context')).display==='none'&&proof.editor.mounts.get(proof.text.key)===proof.mount&&JSON.stringify(proof.editor.repository.snapshot())===proof.before"));
 await click('Toggle Library');await click('Toggle Context');
 await click('Show graph');
 await wait("proof.root.querySelector('.flint-material-graph[data-renderer=three] .flint-three-label')");
 check('existing Three.js graph renders all twelve entities',await evaluate("proof.root.querySelectorAll('.flint-three-label').length===13&&proof.editor.mounts.get(proof.text.key)===proof.mount"));
 await shot('graph-wide');
 await evaluate("[...proof.root.querySelectorAll('.flint-three-label')].find(n=>n.textContent==='Modernism').click();proof.root.querySelector('.flint-graph-inspection button').click()");
 await wait("proof.root.dataset.view==='document'&&proof.editor.focus.state.focusedKey===proof.text.key");
 check('graph entity navigation reuses the real editor occurrence',await evaluate('proof.editor.mounts.get(proof.text.key)===proof.mount'));
 for(const width of [900,700,500]){
   await evaluate(`proof.geometry({size:{w:${width},h:850}})`);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
   check('usable editor at '+width+'px',await evaluate("proof.root.querySelector('.flint-application__editor').clientWidth>250&&proof.root.scrollWidth<=proof.root.clientWidth+1"));
   if(width===700){check('inspector collapses at narrow window size',await evaluate("getComputedStyle(proof.root.querySelector('.flint-context')).display==='none'"));await click('Toggle Context');check('inspector can be reopened as a drawer',await evaluate("getComputedStyle(proof.root.querySelector('.flint-context')).display!=='none'"));await click('Toggle Context');}
   if(width===500){await click('Toggle Library');check('explorer can be reopened on a small window',await evaluate("getComputedStyle(proof.root.querySelector('.flint-application__vault')).display!=='none'"));}
   await shot('document-'+width);
 }
 // Exercise real PageBlocks as well as direct TextBlocks: CSS-only mocks miss
 // the nested tab/padding rules that originally squeezed the page's main column.
 await evaluate('proof.geometry({size:{w:1450,h:920}})');
 await click('Toggle Library');await click('Toggle Context');
 const frame=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 await frame();
 const measure=()=>evaluate(`(()=>{
   const content=proof.root.querySelector('.reactive-document-occurrence__content'),pane=proof.root.querySelector('.flint-application__editor');
   const page=content.querySelector('.reactive-page'),main=page?.querySelector('.reactive-page__main');
   const left=content.querySelector('.reactive-relation--leftMargin'),right=content.querySelector('.reactive-relation--rightMargin');
   const rect=n=>n?{x:n.getBoundingClientRect().x,right:n.getBoundingClientRect().right,width:n.getBoundingClientRect().width}:null;
   return {pane:rect(pane),content:rect(content),page:rect(page),main:rect(main),left:rect(left),right:rect(right),leftPosition:left&&getComputedStyle(left).position,
     flow:rect(proof.editor.mounts.get(proof.text.key)?.root),overflow:content.scrollWidth>content.clientWidth+1};
 })()`);
 let widths=await measure();
 check('direct TextBlock documents fill the tab with minimal padding',widths.flow.width>widths.pane.width-65&&!widths.overflow);
 await shot('document-full-width');
 await evaluate(`(async()=>{
   proof.menu=(await import('/src/runtime/block-menu-actions.ts')).blockMenuItems;
   proof.menu(proof.editor,proof.text.key).find(item=>item.label==='Convert to page').run();
   proof.text=proof.editor.nodeForPlacementInView(proof.text.placementKey,proof.text.viewId);
 })()`);await frame();
 widths=await measure();
 check('PageBlocks without margins do not reserve empty side columns',widths.page.width>widths.pane.width-65&&widths.main.width>widths.page.width-45);
 await evaluate(`proof.left=proof.editor.commands.ensureMargin(proof.text.key,'left');proof.editor.commands.replaceInlineRange(proof.left,0,0,'Left margin');`);await frame();
 widths=await measure();
 check('one-sided page margins leave the opposite side available for text',widths.main.right>widths.page.right-20&&widths.left.right<=widths.main.x);
 await evaluate(`proof.right=proof.editor.commands.ensureMargin(proof.text.key,'right');proof.editor.commands.replaceInlineRange(proof.right,0,0,'Right margin');`);await frame();
 widths=await measure();
 check('two-sided PageBlock margins keep most of the width for main text',widths.main.width>widths.page.width*.65&&widths.left.x>=widths.page.x&&widths.right.right<=widths.page.right&&!widths.overflow);
 await shot('page-full-width');
 await click('Reading density');await frame();widths=await measure();
 check('reading density retains full document width',widths.page.width>widths.pane.width-65&&widths.main.width>widths.page.width*.65);
 await click('Reading density');
 await evaluate(`proof.menu(proof.editor,proof.text.key).find(item=>item.label==='Pages').children.find(item=>item.label==='Add page').run();`);await frame();
 check('existing page tabs create and switch to a second full-width PageBlock',await evaluate("[...proof.root.querySelectorAll('[role=tab]')].some(tab=>tab.textContent==='Page 2'&&tab.getAttribute('aria-selected')==='true')"));
 await evaluate("[...proof.root.querySelectorAll('[role=tab]')].find(tab=>tab.textContent==='Page 1').click()");
 await click('Toggle Library');await click('Toggle Context');
 await evaluate('proof.geometry({size:{w:1100,h:920}})');await frame();widths=await measure();
 check('narrow editor panes put margins in flow even inside a wide OS window',widths.pane.width<600&&widths.leftPosition==='static'&&widths.main.width>widths.page.width-45&&!widths.overflow);
 await shot('page-narrow-editor');
 await evaluate("proof.root.querySelector('[aria-label=\"Reading density\"]').click()");
 const saved=await evaluate("JSON.parse(localStorage.getItem('mutable.flint.compact-layout.v1'))");
 await evaluate('window.compactProofReloading=true');
 await send('Page.reload',{},sessionId);await wait("!window.compactProofReloading&&window.proof&&document.querySelector('.flint-compact')");
 check('pane sizes and density restore after reload',await evaluate("document.querySelector('.flint-compact').dataset.density==='reading'&&document.querySelector('.flint-compact').style.getPropertyValue('--flint-explorer-width')==='288px'"));
 check('no uncaught browser errors',errors.length===0);
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify({checks,layout,saved,errors},null,2));
 await evaluate('proof.dispose();proof.session.dispose()');
 console.log('Evidence: '+artifacts);
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
