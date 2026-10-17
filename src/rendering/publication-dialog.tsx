import {createSignal,For,Show,onCleanup,onMount,untrack} from 'solid-js';
import {DocumentDialog} from '../demo/document-dialog';
import {DocumentBrowser} from '../demo/document-browser';
import {HttpApplicationServices} from '../runtime/application-services';
import type {ReactiveEditor} from '../reactive-editor/editor';
import type {NativeLocation} from '../application-services/contracts';
import type {PublicationJob,PublicationSite,PublicationProfile} from '../application-services/publication-contracts';
import './publication-dialog.css';
/** Mounted only by an explicit Flint menu action. No editor subscriptions or snapshots. */
export function PublicationDialog(props:{editor:ReactiveEditor;initial?:NativeLocation;close:()=>void}){
 const context=()=>{const c=props.editor.readAssetContext();if(!c.cavernId||!c.session)throw Error('Open a Cavern first');return {cavernId:c.cavernId,session:c.session};};
 const api=new HttpApplicationServices(context),lifetime=new AbortController();let draftId=crypto.randomUUID();let timer:ReturnType<typeof setTimeout>|undefined;const grants=new Set<string>();
 const [sites,setSites]=createSignal<PublicationSite[]>([]),[selected,setSelected]=createSignal(''),[location,setLocation]=createSignal<NativeLocation|undefined>(untrack(()=>props.initial));
 const [profile,setProfile]=createSignal<PublicationProfile>({title:'Published document',route:'index.html',images:true,outboundLinks:false,includeMargins:false});
 const [job,setJob]=createSignal<PublicationJob>(),[jobs,setJobs]=createSignal<PublicationJob[]>([]),[nextJobs,setNextJobs]=createSignal<string>(),[error,setError]=createSignal(''),[busy,setBusy]=createSignal(false),[choose,setChoose]=createSignal(false),[saved,setSaved]=createSignal(false),[routeReview,setRouteReview]=createSignal(false),[preview,setPreview]=createSignal('');
 const site=()=>sites().find(s=>s.id===selected());
 const running=()=>['running','reviewing'].includes(job()?.state??'');
 const refresh=async()=>{const r=await api.call('publication.sites.list',{},lifetime.signal);setSites(r.sites);};
 const run=async(fn:()=>Promise<unknown>)=>{if(busy())return;setBusy(true);setError('');try{await fn();}catch(e){if(!lifetime.signal.aborted)setError(String((e as Error).message));}finally{if(!lifetime.signal.aborted)setBusy(false);}};
 const follow=(next:PublicationJob)=>{if(lifetime.signal.aborted)return;clearTimeout(timer);setJob(next);if(['running','reviewing'].includes(next.state))timer=setTimeout(()=>{void api.call('publication.jobs.inspect',{id:next.id},lifetime.signal).then(follow).catch(e=>{if(!lifetime.signal.aborted)setError(String(e));});},750);else void refresh().catch(()=>{});};
 const pick=(id:string)=>{if(!id)draftId=crypto.randomUUID();clearTimeout(timer);setNextJobs(undefined);setSelected(id);setJob(undefined);setPreview('');setSaved(false);setRouteReview(false);const s=sites().find(s=>s.id===id);if(s){setProfile({...s.profile});setLocation({...s.location});void run(async()=>{const page=await api.call('publication.jobs.list',{siteId:id},lifetime.signal);setJobs(page.jobs);setNextJobs(page.next);});}else setJobs([]);};
 const change=(patch:Partial<PublicationProfile>)=>{setProfile({...profile(),...patch});setRouteReview(false);setJob(undefined);};
 onMount(()=>void run(refresh));
 onCleanup(()=>{clearTimeout(timer);lifetime.abort();for(const grant of grants)void api.call('publication.preview.close',{grant}).catch(()=>{});});
 const saveProfile=()=>run(async()=>{if(!location())throw Error('Select a saved native document');const s=site();const next=await api.call('publication.sites.write',{id:s?.id??draftId,expectedRevision:s?.revision??-1,location:location()!,profile:profile(),reviewedRoute:profile().route},lifetime.signal);await refresh();setSelected(next.id);setRouteReview(false);setJob(undefined);});
 const review=()=>run(async()=>{const s=site();if(!s||!saved())throw Error('Confirm the saved-native input');if(JSON.stringify(profile())!==JSON.stringify(s.profile)||JSON.stringify(location())!==JSON.stringify(s.location))throw Error('Review and save the profile changes first');follow(await api.call('publication.review.create',{id:crypto.randomUUID(),siteId:s.id,expectedRevision:s.revision},lifetime.signal));});
 const openPreview=(release:string)=>run(async()=>{const s=site();if(!s)return;const r=await api.call('publication.releases.preview',{siteId:s.id,release},lifetime.signal);grants.add(r.grant);setPreview(r.url);});
 const download=(release:string)=>run(async()=>{const s=site();if(!s)return;const r=await api.call('publication.releases.export',{siteId:s.id,release},lifetime.signal);const url=URL.createObjectURL(new Blob([Uint8Array.from(r.bytes)],{type:r.mediaType})),a=document.createElement('a');a.href=url;a.download=r.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 return <><Show when={choose()}><DocumentBrowser mode="open" initialLocation={location()} onClose={()=>setChoose(false)} onChoose={async l=>{setLocation(l);setChoose(false);setSaved(false);setRouteReview(false);setJob(undefined);return true;}}/></Show>
 <DocumentDialog title="Publish to Web" onClose={props.close} resizable={{initial:{width:760,height:700},minimum:{width:400,height:400}}}>
 <div class="publication-dialog">
 <p>Select → Review → Build → Preview → Export. Builds use saved Ink only and do not upload to a web host.</p>
 <fieldset disabled={busy()||running()}><legend>Select site and saved document</legend>
 <label>Publication site<select value={selected()} onChange={e=>pick(e.currentTarget.value)}><option value="">New independent site</option><For each={sites()}>{s=><option value={s.id}>{s.profile.title} · {s.id.slice(0,8)}</option>}</For></select></label>
 <p>Source: {location()?`${location()!.folder}/${location()!.filename}`:'Choose a saved document'}</p><button onClick={()=>setChoose(true)}>Choose saved Ink…</button>
 <label>Public title<input value={profile().title} onInput={e=>change({title:e.currentTarget.value})}/></label>
 <label>Public page URL<input value={profile().route} onInput={e=>change({route:e.currentTarget.value})}/></label>
 <p>The URL belongs to this site. Document edits, title changes and renames do not change it.</p>
 <label><input type="checkbox" checked={profile().images} onChange={e=>change({images:e.currentTarget.checked})}/>Include managed images (original metadata is retained)</label>
 <label><input type="checkbox" checked={profile().outboundLinks} onChange={e=>change({outboundLinks:e.currentTarget.checked})}/>Enable authored HTTP(S) links</label>
 <label><input type="checkbox" checked={profile().includeMargins} onChange={e=>change({includeMargins:e.currentTarget.checked})}/>Include supported page margins</label>
 <button onClick={()=>setRouteReview(true)}>Review site settings</button>
 <Show when={routeReview()}><p>Save this site's scope and disclosure settings? Public route: {site()?.profile.route??'(new site)'} → {profile().route}. This does not build or deploy a website.</p><button onClick={()=>void saveProfile()}>Confirm and save site settings</button></Show>
 <label><input type="checkbox" checked={saved()} onChange={e=>setSaved(e.currentTarget.checked)}/>Use the saved native version. Unsaved edits are excluded; use Command-S / Control-S in the document first if needed.</label>
 <button disabled={!site()||!saved()} onClick={()=>void review()}>Review publication</button>
 </fieldset>
 <Show when={job()}>{j=><section aria-label="Publication review"><p role="status">{j().state} — {j().phase}</p><Show when={j().error}><p role="alert">{j().error}</p></Show>
 <Show when={j().review}>{r=><><p>Public title: {r().profile.title} · URL: {r().profile.route}. {r().omittedAnnotations} annotation contributions and {r().omittedBlocks} Blocks/relations omitted.</p><details><summary>Review public reading text</summary><pre>{r().text}</pre></details><ul><For each={r().diagnostics}>{d=><li>{d}</li>}</For></ul><details><summary>Files and original images ({r().files.length})</summary><For each={r().files}>{f=><p>{f.path} — {f.size} bytes</p>}</For></details></>}</Show>
 <Show when={j().state==='awaiting-approval'}><button disabled={busy()} onClick={()=>void run(async()=>follow(await api.call('publication.build.start',{id:j().id,expectedRevision:j().revision,reviewDigest:j().review!.digest},lifetime.signal)))}>Approve reviewed content and build</button></Show>
 <Show when={['interrupted','failed'].includes(j().state)}><button disabled={busy()} onClick={()=>void run(async()=>follow(await api.call('publication.jobs.resume',{id:j().id,expectedRevision:j().revision},lifetime.signal)))}>Resume after revalidation</button></Show>
 <Show when={!['completed','cancelled'].includes(j().state)}><button disabled={busy()} onClick={()=>void run(async()=>follow(await api.call('publication.jobs.cancel',{id:j().id},lifetime.signal)))}>Cancel job</button></Show>
 <Show when={j().release}><button disabled={busy()} onClick={()=>void openPreview(j().release!)}>Prepare isolated preview</button><button disabled={busy()} onClick={()=>void download(j().release!)}>Export site ZIP</button></Show>
 </section>}</Show>
 <Show when={preview()}><p><a href={preview()} target="_blank" rel="noopener noreferrer">Open isolated preview</a> (expires in 15 minutes; closing this dialog revokes access)</p></Show>
 <Show when={site()}><details><summary>Retained releases ({site()!.releases.length})</summary><For each={site()!.releases}>{r=><p>{r.slice(0,12)} {r===site()!.active?'(active)':''} <button disabled={busy()} onClick={()=>void openPreview(r)}>Preview</button><button disabled={busy()} onClick={()=>void download(r)}>Export ZIP</button></p>}</For></details></Show>
 <Show when={jobs().length||nextJobs()}><details><summary>Saved jobs</summary><For each={jobs()}>{j=><button disabled={busy()||running()} onClick={()=>void run(async()=>follow(await api.call('publication.jobs.inspect',{id:j.id},lifetime.signal)))}>{j.id.slice(0,8)} — {j.state}</button>}</For><Show when={nextJobs()}><button disabled={busy()} onClick={()=>void run(async()=>{const page=await api.call('publication.jobs.list',{siteId:selected(),after:nextJobs()},lifetime.signal);setJobs([...jobs(),...page.jobs]);setNextJobs(page.next);})}>Load more jobs</button></Show></details></Show>
 <p role="alert">{error()}</p><p>Closing this dialog does not cancel an admitted job. Reopen the site to inspect or resume it. No native document or Undo history is changed.</p><button onClick={props.close}>Close</button>
 </div></DocumentDialog></>;
}
