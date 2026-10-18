// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../reactive-editor/editor';
import {registerCoreViews} from './register-core-views';
import {ReactiveTreeView} from './reactive-tree-view';
import * as worker from '../runtime/interchange-worker';
const clean:Array<()=>void>=[];afterEach(()=>{clean.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});
const tick=()=>new Promise(r=>setTimeout(r,20));
function mount(){
 const article={version:1,kind:'article',entityId:crypto.randomUUID(),snapshotId:crypto.randomUUID(),revision:123,site:'en.wikipedia.org',qid:'Q42',title:'Article',retrievedAt:'2026-10-18'};
 const editor=new ReactiveEditor({id:'doc',type:'document-block',children:[{id:'article',type:'mutable/web-article-block',article,text:'<p>A <b>writer</b>.</p><script>evil()</script>',metadata:{provenance:{snapshotId:article.snapshotId,revision:123,sourceUrl:'https://en.wikipedia.org/wiki/A'}}},{id:'text',type:'standoff-editor-block',text:'typing'}]});editor.clipboard.setContext(()=>({cavernId:'fixture',session:'test'}));registerCoreViews(editor);const projection=editor.createView('wiki');const host=document.body.appendChild(document.createElement('div'));clean.push(()=>editor.dispose(),render(()=><ReactiveTreeView editor={editor} projection={projection}/>,host),editor.installGateway(document));
 return {editor,host,projection,key:()=>Object.values(projection.state.nodes).find(n=>n.payload.id==='article')!.key,article,button:(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent?.startsWith(text))!};
}
it('renders offline in a script-free sandbox without network/history; unrelated typing never recompiles',async()=>{
 const request=vi.fn();vi.stubGlobal('fetch',request);const prepare=vi.spyOn(worker,'runInterchange'),f=mount();await vi.waitFor(()=>expect(f.host.querySelector('iframe')).not.toBeNull());const frame=f.host.querySelector('iframe')!;expect(frame.getAttribute('sandbox')).toBe('');expect(frame.srcdoc).not.toContain('evil()');expect(request).not.toHaveBeenCalled();expect(f.editor.repository.canUndo()).toBe(false);
 const count=prepare.mock.calls.length,n=Object.values(f.projection.state.nodes).find(n=>n.payload.id==='text')!,snapshots=vi.spyOn(f.editor.repository,'snapshot');f.editor.commands.replaceInlineRange(n.key,0,0,'!');await tick();expect(prepare).toHaveBeenCalledTimes(count);expect(request).not.toHaveBeenCalled();expect(snapshots).not.toHaveBeenCalled();
});
it('converts to native standoff text retaining provenance and exact one-step Undo/Redo',async()=>{
 const f=mount(),before=f.editor.encodeDocument();const op=f.editor.interchange.convertSourceBlock(f.key());await vi.waitFor(()=>expect(f.editor.interchange.question()).toBeTruthy());f.editor.interchange.respond([]);await op;
 const first=f.editor.encodeDocument().children![0];expect(first.type).toBe('standoff-editor-block');expect(first.metadata).toMatchObject({provenance:{snapshotId:f.article.snapshotId,revision:123}});expect(first.text).toContain('writer');f.editor.repository.undo();expect(f.editor.encodeDocument()).toEqual(before);f.editor.repository.redo();expect(f.editor.encodeDocument().children![0].type).toBe('standoff-editor-block');
});
it('requires explicit acquisition and individual acceptance without document mutation',async()=>{
 const f=mount(),snapshotId=crypto.randomUUID(),statement={id:'Q42$a',property:'P31',label:'instance of',summary:'Q5',rank:'normal',supported:true,value:{},qualifiers:{},references:[],diagnostics:[]};
 const request=vi.fn(async(url:any)=>new Response(JSON.stringify({Success:true,Data:String(url).endsWith('.enrich')?{snapshot:{snapshotId},projection:{qid:'Q42',revision:456,label:'Subject',statements:[statement],diagnostics:[]},reviews:[],existingClaims:[{guid:'old',expression:'Contrary authored fact',typename:'authored'}]}:{statementId:statement.id,decision:'accepted',claimGuid:'claim'}}),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',request);await tick();expect(request).not.toHaveBeenCalled();const revision=f.editor.repository.state.revision;f.button('Acquire Wikidata').click();await vi.waitFor(()=>expect(f.button('Accept as Claim')).toBeTruthy());expect(request).toHaveBeenCalledTimes(1);expect(f.host.textContent).toContain('Contrary authored fact');f.button('Accept as Claim').click();await vi.waitFor(()=>expect(f.host.textContent).toContain('Created a source-imported Claim'));expect(request).toHaveBeenCalledTimes(2);expect(f.editor.repository.state.revision).toBe(revision);
});
it('cancels conversion or stale conversion without altering the capture',async()=>{
 const f=mount(),before=f.editor.encodeDocument();const op=f.editor.interchange.convertSourceBlock(f.key());await vi.waitFor(()=>expect(f.editor.interchange.question()).toBeTruthy());f.editor.interchange.respond(undefined);await op;expect(f.editor.encodeDocument()).toEqual(before);
});
