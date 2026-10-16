import { PackageDataReader } from '../interchange/package/data';
declare const VIEWER_WORKER:string;
const input=document.querySelector<HTMLInputElement>('#package')!,body=document.querySelector<HTMLElement>('#document')!,status=document.querySelector<HTMLElement>('#status')!,context=document.querySelector<HTMLDialogElement>('#context')!,detail=document.querySelector<HTMLElement>('#detail')!,warnings=document.querySelector<HTMLElement>('#warnings')!;
let generation=0,worker:Worker|undefined,workerUrl:string|undefined,timer:ReturnType<typeof setTimeout>|undefined,reader:PackageDataReader|undefined;
function release(){worker?.terminate();worker=undefined;if(workerUrl)URL.revokeObjectURL(workerUrl);workerUrl=undefined;clearTimeout(timer);}
function close(){generation++;release();body.replaceChildren();warnings.replaceChildren();detail.replaceChildren();reader=undefined;context.close();status.textContent='Choose an Ink package. All reading stays on this device.';input.value='';}
function present(record:Record<string,string|null>,records:Record<string,Array<Record<string,string|null>>>,boundaries:unknown[]){
 detail.replaceChildren();const heading=document.createElement('h3');heading.textContent=record.name??record.expression??'Packaged record';detail.append(heading);
 if(record.description){const text=document.createElement('p');text.textContent=record.description;detail.append(text);}
 const fields=(row:Record<string,string|null>)=>{const list=document.createElement('dl');for(const [key,value]of Object.entries(row)){if(value===null)continue;const term=document.createElement('dt'),definition=document.createElement('dd');term.textContent=key;definition.textContent=value;list.append(term,definition);}return list;};
 for(const [name,rows]of [['Record fields',[record]],...Object.entries(records)] as Array<[string,Array<Record<string,string|null>>]>){if(!rows.length)continue;const group=document.createElement('details'),label=document.createElement('summary');label.textContent=`${name} (${rows.length})`;group.append(label,...rows.map(fields));if(name==='Claim')group.open=true;detail.append(group);}
 const group=document.createElement('details'),label=document.createElement('summary'),text=document.createElement('pre');label.textContent='Export boundaries';text.textContent=boundaries.map(v=>JSON.stringify(v)).join('\n');group.append(label,text);detail.append(group);context.showModal();
}
async function open(file:File){close();const run=generation;status.textContent='Validating package…';try{
 if(file.size>64*1024*1024)throw Error('Package exceeds 64 MiB.');const data=await file.arrayBuffer();if(run!==generation)return;
 workerUrl=URL.createObjectURL(new Blob([VIEWER_WORKER],{type:'text/javascript'}));worker=new Worker(workerUrl);
 timer=setTimeout(()=>{if(run===generation){release();status.textContent='Package processing exceeded 30 seconds.';}},30000);
 worker.onerror=()=>{if(run!==generation)return;release();status.textContent='Package worker could not run in this browser.';};
 worker.onmessage=event=>{if(run!==generation)return;release();const result=event.data;if(result.error){status.textContent=result.error;return;}
  // Only the trusted, bounded semantic serializer emits HTML. Source markup never enters this sink.
  reader=new PackageDataReader(result.data);body.innerHTML=result.html;status.textContent=`${result.inventory.blocks} Blocks · ${result.inventory.annotations} annotations · read-only archival copy`;
  warnings.textContent=[...result.diagnostics.map((d:any)=>d.detail),...result.data.unresolved.map((v:any)=>JSON.stringify(v)),...result.data.excluded.map((v:any)=>JSON.stringify(v))].join('\n');
 };
 worker.postMessage(new Uint8Array(data),[data]);
}catch(error){if(run!==generation)return;release();status.textContent=String(error);}}
input.onchange=()=>{const file=input.files?.[0];if(file)void open(file);};
document.querySelector('#close')!.addEventListener('click',close);document.querySelector('#dismiss')!.addEventListener('click',()=>context.close());
body.addEventListener('click',event=>{const element=event.target instanceof Element?event.target:undefined,entity=element?.closest<HTMLElement>('[data-ink-entity]');if(entity){const result=reader?.entity(entity.dataset.inkEntity!);if(result?.entity)present(result.entity,result.records,result.boundaries);else{detail.textContent=`Entity ${entity.dataset.inkEntity} is absent from this package. No network lookup is performed.`;context.showModal();}return;}
 const claim=element?.closest<HTMLElement>('[data-ink-claim]');if(claim){const result=reader?.claim(claim.dataset.inkClaim!);if(result?.claim)present(result.claim,result.records,result.boundaries);else{detail.textContent=`Claim ${claim.dataset.inkClaim} is absent from this package. No network lookup is performed.`;context.showModal();}return;}
 const link=element?.closest<HTMLAnchorElement>('a');if(link&&!link.getAttribute('href')?.startsWith('#')){event.preventDefault();if(confirm(`Open this external link in a new tab?\n${link.href}`))window.open(link.href,'_blank','noopener,noreferrer');}});
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>{e.preventDefault();const file=e.dataTransfer?.files[0];if(file)void open(file);});window.addEventListener('pagehide',release);
