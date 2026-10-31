/** Browser qualification: real Flint/session hosts; native files and APIs are in memory. */
import { render } from 'solid-js/web';
import { createEffect, createRoot } from 'solid-js';
import { ReactiveEditor } from '../reactive-editor/editor';
import { WorkspaceSession } from './workspace-session';
import { WorkspacePresentationView } from './workspace-presentation-view';
import { materializeLocalWorkspace } from '../reactive-editor/workspace-manifest';
import { nativeDocumentSession } from '../persistence/native-session';
import { captureNative, nativeText } from '../persistence/native-resource';
import { ReactiveTreeView } from '../rendering/reactive-tree-view';
import type { ExistingBlockDto } from '../block-tree/types';
import '../index.css';
import '../demo/workspace-demo.css';

const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
async function until(predicate:()=>boolean,label:string){const end=performance.now()+10000;while(!predicate()){if(performance.now()>end)throw Error(label);await new Promise(r=>setTimeout(r,20));}}
async function trusted(action:Record<string,unknown>):Promise<any>{return new Promise((resolve,reject)=>{(globalThis as any).__tabsResume=(value:any)=>value.error?reject(Error(value.error)):resolve(value.result);(globalThis as any).tabsInput(JSON.stringify(action));});}
async function click(el:Element,button='left'){el.scrollIntoView({block:'nearest',inline:'nearest'});const r=el.getBoundingClientRect();await trusted({type:'click',button,x:r.x+r.width/2,y:r.y+r.height/2});}
export const paragraph=(id:string,length=220):ExistingBlockDto=>({id,type:'standoff-editor-block',text:('Annotated text wraps while the same editor and caret remain mounted. ').repeat(5).slice(0,length),standoffProperties:[{id:id+'-bold',type:'style/bold',start:0,end:8}],relation:{leftMargin:{type:'left-margin-block',children:[{type:'standoff-editor-block',text:'A margin annotation.'}]}}});
function tabs(id:string,nested=false):ExistingBlockDto{return {id,type:'tab-row-block',children:[{id:id+'-a',type:'tab-block',metadata:{active:true,name:'First tab — a label that can wrap'},children:[paragraph(id+'-text',340),...(nested?[{type:'table-block',children:[{type:'table-row-block',children:[{type:'table-cell-block',children:[{type:'container-block',children:[tabs('nested')]}]}]}]} as ExistingBlockDto]:[])]},{id:id+'-b',type:'tab-block',metadata:{name:'Second'},children:[paragraph(id+'-second')]}]};}
export function resource(id:string,children:ExistingBlockDto[]){const identify=(dto:ExistingBlockDto)=>{dto.id??=crypto.randomUUID();dto.children?.forEach(identify);for(const value of Object.values(dto.relation??{}))if(value&&typeof value==='object'&&'type' in value)identify(value as ExistingBlockDto);};children.forEach(identify);const seed=new ReactiveEditor({id,type:'document-block',metadata:{documentId:id,title:id},children});try{return nativeText(captureNative(seed.repository.readState(),id));}finally{seed.dispose();}}
const stats=(values:number[])=>{const a=[...values].sort((a,b)=>a-b);return {samples:a.length,median:a[Math.floor(a.length/2)],p95:a[Math.min(a.length-1,Math.floor(a.length*.95))],max:a.at(-1)};};
export async function qualifyTabOrientation(){
  const checks:string[]=[],check=(value:unknown,label:string)=>{if(!value)throw Error(label);checks.push(label);};
  const resources=new Map([['primary',resource('primary',[tabs('authored-row',true)])],['unrelated',resource('unrelated',[paragraph('unrelated-text')])]]);
  await trusted({type:'fixture',text:resources.get('primary')});
  const originalFetch=window.fetch;let networkRequests=0;
  window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    networkRequests++;const url=String(input),ok=(Data:unknown)=>new Response(JSON.stringify({Success:true,Data}),{headers:{'Content-Type':'application/json'}});
    if(url==='/api/native/open'){const id=JSON.parse(String(init?.body)).location.filename.replace('.mutable.json','');return ok({kind:'native',resourceId:id,native:resources.get(id),baseline:{nativeHash:'fixture-'+id,markdownHash:null,generation:null},readOnly:false});}
    if(url==='/api/native/vault/default')return ok({vault:'/in-memory-tabs'});
    return new Response(JSON.stringify({Success:false,Error:'No backend in orientation qualification'}),{status:503,headers:{'Content-Type':'application/json'}});
  }) as typeof fetch;
  const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[{type:'canvas-background-block',children:[]},{type:'workspace-object-bank-block',children:[]}]}),{features:{entityReferences:false,nativeKnowledge:false,flintMaterialChrome:false,flintProbe:false,desktopApplicationIcons:false}});
  const {editor}=session,native=nativeDocumentSession(editor),cleanups:(()=>void)[]=[];
  const host=document.body.appendChild(document.createElement('main'));host.className='workspace-demo workspace-demo--canonical';host.dataset.windowWorkArea='';
  const stop=render(()=><WorkspacePresentationView session={session}/>,host);const input=editor.installGateway(document);
  const eventPaints:any[]=[];const eventObserver=new PerformanceObserver(list=>{for(const entry of list.getEntries())if(entry.name==='click')eventPaints.push({start:entry.startTime,duration:entry.duration});});
  eventObserver.observe({type:'event',buffered:true,durationThreshold:16} as PerformanceObserverInit);
  try {
    for(const id of resources.keys())await native.open({folder:'.',filename:id+'.mutable.json'});
    await editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
    await until(()=>!!host.querySelector('[data-block-id="authored-row"]'),'Flint authored Tabs');await frame();
    const node=(id:string)=>Object.values(session.projection.state.nodes).find(n=>n.payload.id===id)!;
    const row=node('authored-row'),root=()=>host.querySelector<HTMLElement>('[data-block-id="authored-row"]')!;
    const outer=host.querySelector<HTMLElement>('.flint-application__editor > .reactive-tabs')!;
        const app=Object.values(session.projection.state.nodes).find(n=>n.viewType==='flint-application-block')!,outerNode=editor.node(app.children[0])!;
    const change=(key:string,value:string)=>editor.commandRegistry.execute('tabs.orientation.'+value,{targetKey:key,args:undefined});
    const geometry=(el:HTMLElement,orientation:string)=>{
      const labels=el.querySelector<HTMLElement>(':scope > .reactive-tabs__labels')!,panel=el.querySelector<HTMLElement>(':scope > .reactive-tabs__panel:not([hidden])');
      if(!panel)return false;const a=labels.getBoundingClientRect(),b=panel.getBoundingClientRect();
      const buttons=[...labels.querySelectorAll<HTMLElement>('[role=tab]')];
      return el.dataset.tabOrientation===orientation && (orientation==='vertical'?b.x>=a.right-1&&buttons.every((button,i)=>!i||button.getBoundingClientRect().y>buttons[i-1].getBoundingClientRect().y):b.y>=a.bottom-1);
    };
    const flows=[...host.querySelectorAll<HTMLElement>('.reactive-standoff-flow')],original=flows[0];
    await click(original);const focused=editor.focus.state.focusedKey!,mount=editor.mounts.get(focused)!;mount.restoreInlineSelection!({anchor:5,head:12});
    const identities=()=>[...editor.projections.values()].flatMap(v=>Object.values(v.state.nodes).filter(n=>editor.mounts.get(n.key)).map(n=>[n.key,editor.mounts.get(n.key)!.generation]));
    const beforeIdentities=JSON.stringify(identities());
    change(row.key,'vertical');await frame();
    check(geometry(root(),'vertical'),'Ordinary vertical labels stack left with content on the right');
    check(root().querySelector('.reactive-tabs__labels')!.getBoundingClientRect().width<=7*parseFloat(getComputedStyle(document.documentElement).fontSize)+.1,'Vertical label column has the reduced 7rem maximum width');
    check(host.querySelector('[data-block-id="nested"]')?.getAttribute('data-tab-orientation')==='horizontal','Horizontal Tabs remain horizontal inside a vertical row and table cell');
    check(mount.focusElement===original&&JSON.stringify(mount.captureInlineSelection?.())===JSON.stringify({anchor:5,head:12}),'Orientation preserves mounted editor, focus and selected range');
    check(JSON.stringify(identities())===beforeIdentities,'Orientation does not remount any existing editor');
    change(node('nested').key,'vertical');change(row.key,'horizontal');await frame();check(geometry(root(),'horizontal')&&geometry(host.querySelector('[data-block-id="nested"]')!,'vertical'),'Mixed nesting works in the reverse direction');
    change(node('nested').key,'horizontal');

    const layoutLatencies:number[]=[],clickStarts:number[]=[],interactionLayouts:any[]=[];
    let expected:{el:HTMLElement;orientation:string;name:string}|undefined;
    const clicked=(event:MouseEvent)=>{if(!expected||!(event.target as Element)?.closest('[role=menuitem]')||!(event.target as Element).textContent?.match(/^(Horizontal|Vertical)$/))return;
      const pending=expected;expected=undefined;clickStarts.push(event.timeStamp);
      const verify=()=>{if(geometry(pending.el,pending.orientation)){const latency=performance.now()-event.timeStamp;layoutLatencies.push(latency);interactionLayouts.push({name:pending.name,orientation:pending.orientation,clickStart:event.timeStamp,clickToVerifiedLayoutMs:latency});}else requestAnimationFrame(verify);};requestAnimationFrame(verify);
    };
    document.addEventListener('click',clicked,true);cleanups.push(()=>document.removeEventListener('click',clicked,true));
    async function menuChange(el:HTMLElement,orientation:string,flint=false){
      await click(el.querySelector('[role=tab]')!,'right');await until(()=>!!document.querySelector('[role=menu]'),'context menu');
      const item=[...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(el=>el.textContent?.startsWith('Tab orientation'));check(!!item,(flint?'Flint':'Ordinary')+' context menu exposes Tab orientation');await click(item!);
      const target=[...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(el=>el.textContent===(orientation==='vertical'?'Vertical':'Horizontal'))!;
      expected={el,orientation,name:flint?'Flint Document host':document.querySelectorAll('[data-block-id="authored-row"]').length>1?'Shared row with 15 native Documents':'Ordinary row'};const count=layoutLatencies.length;await click(target);await until(()=>layoutLatencies.length>count,'verified oriented layout');
    }
    await menuChange(root(),'vertical');await menuChange(root(),'horizontal');
    await menuChange(outer,'vertical',true);check(geometry(outer,'vertical'),'Specialised Flint host uses vertical layout');
    check(original.isConnected&&host.contains(original),'Flint orientation retains its Document editor');
    await trusted({type:'screenshot',name:'flint-vertical'});
    await menuChange(outer,'horizontal',true);
    const secondTab=outer.querySelectorAll<HTMLButtonElement>(':scope > .reactive-tabs__labels [role=tab]')[1];await click(secondTab);await frame();await click(outer.querySelector('[role=tab]')!);await frame();check(host.contains(original),'Flint tab switching preserves the visited Document session');

    const counters={snapshots:0,builds:0,childTreeUpdates:0,unrelatedProjectionUpdates:0,unrelatedStatusUpdates:0};
    const patches:(()=>void)[]=[];const instrument=(object:any,key:string,count:keyof typeof counters)=>{const original=object[key];object[key]=function(...args:any[]){counters[count]++;return original.apply(this,args);};patches.push(()=>object[key]=original);};
    const watched=new Set<any>();const watch=()=>{for(const view of editor.projections.values())if(!watched.has(view)){watched.add(view);instrument(view,'build','builds');instrument(view,'updateStructural','childTreeUpdates');}};
    instrument(editor.repository,'snapshot','snapshots');watch();
    const unrelated=editor.createView('unrelated-proof',node('unrelated').placementKey);instrument(unrelated,'setState','unrelatedProjectionUpdates');
    createRoot(dispose=>{cleanups.push(dispose);createEffect(()=>{native.status('unrelated');counters.unrelatedStatusUpdates++;});});
    const measurements:any[]=[];
    async function measure(name:string,targetKey=row.key,element=root()){watch();for(const key of Object.keys(counters) as (keyof typeof counters)[])counters[key]=0;const requests=networkRequests,command:number[]=[],layout:number[]=[];
      for(let i=0;i<20;i++){const orientation=i%2?'horizontal':'vertical',start=performance.now();change(targetKey,orientation);command.push(performance.now()-start);await frame();check(geometry(element,orientation),name+' layout '+i);layout.push(performance.now()-start);}
      const counts={...counters,networkRequests:networkRequests-requests};check(Object.values(counts).every(n=>n===0),name+' has no snapshots, child-tree rebuilds, unrelated updates or requests');measurements.push({name,commandMs:stats(command),commandToVerifiedLayoutMs:stats(layout),counts});
    }
    await measure('single row');
    await measure('Flint Document Tab host',outerNode.key,outer);
    editor.commands.transclude(row.key,{kind:'at',parentKey:node('primary').key,index:1});await frame();
    const viewer=document.body.appendChild(document.createElement('aside'));viewer.style.cssText='position:fixed;right:8px;top:48px;width:340px;height:550px;overflow:auto;background:white;z-index:300;border:1px solid #999';
    const live=editor.createView('live-viewer',node('primary').placementKey);const stopLive=render(()=><ReactiveTreeView editor={editor} projection={live}/>,viewer);cleanups.push(()=>{stopLive();viewer.remove();});
    await measure('shared row: two placements and a live viewer');
    check(document.querySelectorAll('[data-block-id="authored-row"]').length===4,'Shared row has four mounted occurrences');
    for(let i=0;i<12;i++){const id='other-'+i;resources.set(id,resource(id,[paragraph(id+'-text',100)]));await native.open({folder:'.',filename:id+'.mutable.json'});}
    resources.set('large-annotated',resource('large-annotated',Array.from({length:80},(_,i)=>paragraph('large-'+i,220))));await native.open({folder:'.',filename:'large-annotated.mutable.json'});
    await measure('shared row plus 13 unrelated Documents (one with 80 annotated paragraphs)');
    await menuChange(root(),'vertical');await menuChange(root(),'horizontal');
    change(row.key,'vertical');await frame();check([...document.querySelectorAll<HTMLElement>('[data-block-id="authored-row"]')].every(el=>geometry(el,'vertical')),'All shared occurrences adopt the same orientation without reconstruction');
    editor.repository.undo();await frame();check([...document.querySelectorAll<HTMLElement>('[data-block-id="authored-row"]')].every(el=>el.dataset.tabOrientation==='horizontal'),'Undo updates every shared occurrence');editor.repository.redo();await frame();
    const labelRight=root().querySelector('.reactive-tabs__labels')!.getBoundingClientRect().right;
    check([...root().querySelectorAll<HTMLElement>('.reactive-relation--leftMargin')].every(el=>el.getBoundingClientRect().left>=labelRight),'Margin annotations remain inside the content panel without covering labels');
    await trusted({type:'screenshot',name:'shared-vertical'});
    patches.reverse().forEach(stop=>stop());
    stopLive();viewer.remove();cleanups.pop();
    await trusted({type:'viewport',width:900,height:720});await frame();
    check(geometry(root(),'vertical'),'Vertical layout survives narrower viewport');
    await click(original);await trusted({type:'text',text:' typed after orientation'});await frame();check(original.textContent?.includes('typed after orientation'),'Trusted browser typing remains usable after orientation and history');
    await trusted({type:'composition',text:'日本'});const composingGeneration=editor.mounts.get(focused)!.generation;
    change(row.key,'horizontal');await frame();change(row.key,'vertical');await frame();
    check(editor.mounts.get(focused)!.generation===composingGeneration&&document.activeElement===original,'Changing orientation retains the editor during IME composition');
    await trusted({type:'text',text:'日本'});await frame();check(original.textContent?.includes('日本'),'IME composition commits after orientation changes');
    editor.commands.structuralTransaction('Overflow fixture',()=>{for(let i=0;i<24;i++)editor.commands.insert({type:'tab-block',metadata:{name:'Additional label '+i},children:[]},{kind:'at',parentKey:row.key,index:i+2});});
    await frame();const labelList=root().querySelector<HTMLElement>(':scope > .reactive-tabs__labels')!;
    check(labelList.scrollHeight>labelList.clientHeight,'Many vertical labels scroll within their height constraint');
    const longLabel=labelList.querySelector<HTMLElement>('[role=tab]')!;
    check(longLabel.scrollWidth<=longLabel.clientWidth+1&&getComputedStyle(longLabel).whiteSpace==='normal','Long labels wrap without horizontal clipping');
    await click(labelList.querySelector('[role=tab]:last-child')!);await frame();check(labelList.querySelector('[role=tab]:last-child')?.getAttribute('aria-selected')==='true','Last overflowed Tab remains reachable and selectable');
    await trusted({type:'screenshot',name:'vertical-overflow'});
    await new Promise(r=>setTimeout(r,120));
    return {interactions:interactionLayouts.map(entry=>({...entry,clickToNextPaintMs:eventPaints.find(e=>Math.abs(e.start-entry.clickStart)<2)?.duration})),checks:checks.filter(c=>!c.match(/ layout \d+$/)),passed:checks.length,measurements,clickToVerifiedLayoutMs:stats(layoutLatencies),clickToNextPaintEvents:eventPaints.filter(e=>clickStarts.some(start=>Math.abs(start-e.start)<2)),eventTimingNote:'Event Timing measures browser click-to-next-paint duration with 8 ms quantisation and a 16 ms reporting threshold. Verified-layout timings end at the first animation callback with correct geometry, not an arbitrary two-frame wait or a physical-display guarantee.',nativeDocuments:resources.size,sharedMountedOccurrences:4};
  } finally {eventObserver.disconnect();cleanups.reverse().forEach(stop=>stop());input();stop();session.dispose();host.remove();window.fetch=originalFetch;}
}
