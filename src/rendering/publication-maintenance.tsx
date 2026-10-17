import {createSignal,createEffect,on,For,Show} from 'solid-js';
import type {ApplicationServices} from '../application-services/contracts';
import type {MaintenanceList,MaintenanceReview,MaintenanceTarget} from '../application-services/publication-maintenance';
export function PublicationMaintenance(props:{siteId:string;api:ApplicationServices;signal:AbortSignal;busy:boolean;run:(fn:()=>Promise<unknown>)=>Promise<void>;changed:()=>Promise<void>}){
 const [listing,setListing]=createSignal<MaintenanceList>(),[review,setReview]=createSignal<MaintenanceReview>();
 createEffect(on(()=>props.siteId,()=>{setListing(undefined);setReview(undefined);}));
 const list=async(offset=0)=>{setListing(await props.api.call('publication.maintenance.list',{siteId:props.siteId,offset},props.signal));setReview(undefined);};
 const inspect=(target:MaintenanceTarget)=>props.run(async()=>setReview(await props.api.call('publication.maintenance.inspect',{siteId:props.siteId,target},props.signal)));
 return <details><summary>Release and job maintenance</summary><p>Historical releases can contain content excluded from the current site. Deletion affects only this Vault's publication artifacts, not exported copies or managed asset originals. Remove referencing jobs before deleting an inactive release. Removing a completed job also removes its reusable projection cache.</p>
 <button disabled={props.busy} onClick={()=>void props.run(()=>list())}>Inspect retained publication data</button>
 <For each={listing()?.targets??[]}>{t=><p>{t.kind} {t.id.slice(0,12)} <button disabled={props.busy} onClick={()=>void inspect(t)}>Review deletion</button></p>}</For>
 <Show when={listing()?.next!==undefined}><button disabled={props.busy} onClick={()=>void props.run(()=>list(listing()!.next))}>Next retained items</button></Show>
 <Show when={review()}>{r=><section aria-label="Deletion review"><p>{r().target.kind} {r().target.id} · {r().bytes.toLocaleString()} retained bytes · {r().files} files. {r().pending?'Interrupted deletion; continue cleanup.':''}</p><For each={r().blocked}>{reason=><p>{reason}</p>}</For>
 <p>Active releases and executing/recoverable jobs are protected. Local previews are revoked on release deletion; another host's preview or export lease can block deletion.</p>
 <button disabled={props.busy||!!r().blocked.length} onClick={()=>void props.run(async()=>{await props.api.call('publication.maintenance.delete',{review:r()},props.signal);await props.changed();await list();})}>Confirm deletion of reviewed data</button></section>}</Show>
 </details>;
}
