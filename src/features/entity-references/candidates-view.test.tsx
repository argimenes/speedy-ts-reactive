import {mockResolver} from './resolver-test-support';
import {entityTestApi,registerEntityTestViews} from './test-support';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import {openEntitySearch} from './entity-search';
import {matchSources} from '../../runtime/search-matching';
import {keyboard} from '../../input/bindings';
import {EntityCandidates} from './entity-candidates';
vi.mock('../../runtime/search-worker',()=>({runSearchWorker:async(s:any,q:string,o:any)=>matchSources(s,q,o)}));
const cleanup:Array<()=>void>=[];
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();vi.useRealTimers();localStorage.clear();});
async function setup(selected=true,unsupported=false){
 const editor=new ReactiveEditor({type:'document-block',children:[{id:'a',type:'standoff-editor-block',text:'he the HE'},{id:'b',type:unsupported?'code-mirror-block':'standoff-editor-block',text:'he'}]});
 registerEntityTestViews(editor);const view=editor.createView('ler-review'),host=document.body.appendChild(document.createElement('div'));
 const dispose=render(()=><ReactiveTreeView editor={editor} projection={view}/>,host);editor.installGateway(document);cleanup.push(()=>{dispose();editor.dispose();});
 const node=(id='a')=>Object.values(view.state.nodes).find(n=>n.payload.id===id)!;
 const api=entityTestApi(editor),mock=mockResolver();api.entities=()=>mock.service;
 editor.mounts.get(node().key)!.focus();openEntitySearch(api,[{nodeKey:node().key,start:0,end:selected?2:0}]);
 const panel=()=>document.querySelector<HTMLElement>('.ler-instrument')!;
 const field=(label:string)=>panel().querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
 const input=(label:string,value:string)=>{field(label).value=value;field(label).dispatchEvent(new InputEvent('input',{bubbles:true}));};
 const button=(label:string)=>{const find=()=>[...panel().querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim().startsWith(label));if(!find())panel().querySelector<HTMLButtonElement>('[aria-label="Commands and help"]')!.click();return find()!;};
 const key=(key:string,options:KeyboardEventInit={},target:Element=panel().querySelector('[role=listbox]')??panel())=>{const e=new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options});target.dispatchEvent(e);return e;};
 input('Search entities','Blake');await vi.advanceTimersByTimeAsync(220);
 return {editor,api,node,panel,field,input,button,key,...mock};
}
it('expands immutable A case-insensitively, preserves prepared context and commits with one Undo',async()=>{
 const f=await setup();f.key('Enter',{shiftKey:true});await vi.advanceTimersByTimeAsync(0);
 expect(f.editor.repository.canUndo()).toBe(false);f.key('a',{ctrlKey:true});await vi.advanceTimersByTimeAsync(220);
 expect(f.field('Mention text').value).toBe('he');expect(f.field('Search entities').value).toBe('Blake');
 expect(f.panel().querySelector('.ler-context')?.textContent).toContain('Original: he');expect(f.panel().querySelector('.ler-context')?.textContent).toContain('Vernon Blake');
 expect(f.panel().textContent).toContain('3 selected / 3 unique targets');f.button('Bind 3').click();await vi.advanceTimersByTimeAsync(0);
 expect(f.panel()).toBeNull();expect(f.node().payload.standoffProperties).toHaveLength(2);expect(f.node('b').payload.standoffProperties).toHaveLength(1);
 f.editor.repository.undo();expect(f.node().payload.standoffProperties).toBeUndefined();expect(f.node('b').payload.standoffProperties).toBeUndefined();
 f.editor.repository.redo();expect(f.node().payload.standoffProperties).toHaveLength(2);
});
it('Enter links an expanded collection directly rather than silently nominating',async()=>{
 const f=await setup();f.key('a',{ctrlKey:true});await vi.advanceTimersByTimeAsync(220);f.button('← Results').click();
 f.key('Enter');await vi.advanceTimersByTimeAsync(0);expect(f.panel()).toBeNull();expect(f.node().payload.standoffProperties).toHaveLength(2);
});
it('keeps arbitrary C matches unchecked and permits reviewed partial coverage',async()=>{
 const f=await setup(false,true);f.button('Prepare entity').click();await vi.advanceTimersByTimeAsync(0);f.button('Review other mention text').click();
 f.input('Mention text','he');await vi.advanceTimersByTimeAsync(220);
 expect(f.panel().textContent).toContain('Search coverage is incomplete');expect(f.button('Select all eligible').disabled).toBe(true);
 expect(f.panel().querySelectorAll('[data-candidate-row] input:checked')).toHaveLength(0);
 f.panel().querySelector<HTMLInputElement>('[aria-label="Include mention: he"]')!.click();f.button('Bind 1').click();await vi.advanceTimersByTimeAsync(0);
 expect(f.panel()).toBeNull();expect(f.node().payload.standoffProperties).toHaveLength(1);
});
it('retains preview exclusions, can undo exclusions and never falls back from zero accepted ranges',async()=>{
 const f=await setup();f.button('Prepare entity').click();await vi.advanceTimersByTimeAsync(0);f.button('Expand original selection').click();await vi.advanceTimersByTimeAsync(220);
 f.panel().querySelector<HTMLInputElement>('[aria-label="Include mention: he"]')!.click();expect(f.panel().textContent).toContain('2 selected / 3');
 f.button('Undo exclusion').click();expect(f.panel().textContent).toContain('3 selected / 3');
 f.button('Select none').click();expect(f.button('Bind 0').disabled).toBe(true);f.button('← Results').click();f.key('Enter');await vi.advanceTimersByTimeAsync(0);
 expect(f.editor.repository.canUndo()).toBe(false);expect(f.panel().textContent).toContain('Check at least one');
});
it('invalidates edited accepted ranges, permits explicit exclusion and retains unaffected ranges',async()=>{
 const f=await setup();f.button('Prepare entity').click();await vi.advanceTimersByTimeAsync(0);f.button('Expand original selection').click();await vi.advanceTimersByTimeAsync(220);
 const selected=vi.spyOn(EntityCandidates.prototype,'selected'),count=vi.spyOn(EntityCandidates.prototype as any,'countSelection'),snapshot=vi.spyOn(f.editor.repository,'snapshot');
 f.editor.commands.replaceInlineRange(f.node('b').key,0,0,'x');
 await vi.advanceTimersByTimeAsync(0);
 expect(selected).not.toHaveBeenCalled();expect(count).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();
 expect(f.panel()).toBeTruthy();expect(f.panel().textContent).toContain('An accepted range changed');expect(f.button('Bind 2').disabled).toBe(true);
 const boxes=[...f.panel().querySelectorAll<HTMLInputElement>('[data-candidate-row] input')];boxes.at(-1)!.click();
 f.button('Bind 2').click();await vi.advanceTimersByTimeAsync(0);expect(f.panel()).toBeNull();expect(f.node('b').payload.standoffProperties).toBeUndefined();
});
it('keeps text-field select-all native and dispatches a remapped command in command context',async()=>{
 const f=await setup();expect(f.key('a',{ctrlKey:true},f.field('Search entities')).defaultPrevented).toBe(false);
 f.editor.bindings.assign('entity.candidates.selectAll',[keyboard('e','Alt')]);expect(f.key('e',{altKey:true}).defaultPrevented).toBe(true);await vi.advanceTimersByTimeAsync(220);
 expect(f.field('Mention text').value).toBe('he');expect(f.panel().textContent).toContain('3 selected / 3');
});
it('supports pause/resume and cancellation without restoring late decorations',async()=>{
 const f=await setup();f.button('Prepare entity').click();await vi.advanceTimersByTimeAsync(0);f.button('Review other mention text').click();await vi.advanceTimersByTimeAsync(220);
 const toggle=f.field('Search additional occurrences');toggle.click();f.input('Mention text','the');await vi.advanceTimersByTimeAsync(220);
 expect(f.panel().querySelectorAll('[data-candidate-row]')).toHaveLength(0);toggle.click();await vi.advanceTimersByTimeAsync(220);expect(f.panel().querySelectorAll('[data-candidate-row]')).toHaveLength(2);
 f.input('Mention text','he');f.button('Cancel').click();await vi.advanceTimersByTimeAsync(500);expect(f.panel()).toBeNull();expect(Object.values(f.editor.decorations.nodes).flat().filter(d=>d.type==='editor/entity-candidate')).toHaveLength(0);
});
it('opens without selected text and never infers a caret word or commits preparation',async()=>{
 const f=await setup(false);f.button('Prepare entity').click();await vi.advanceTimersByTimeAsync(0);
 expect(f.panel().textContent).toContain('(no selection)');expect(f.panel().textContent).toContain('0 accepted ranges');expect(f.editor.repository.canUndo()).toBe(false);
 f.key('Enter');await vi.advanceTimersByTimeAsync(0);expect(f.panel().textContent).toContain('select text first');expect(f.editor.repository.canUndo()).toBe(false);
});
it('expands only owned text, excludes foreign transclusions and deduplicates owned presentations',async()=>{
 const f=await setup(),root=f.editor.blockQueries.ancestorPath(f.node().key).find(n=>n.viewType==='document-block')!;
 f.editor.commands.insert({id:'foreign-doc',type:'document-block',children:[{id:'foreign-text',type:'standoff-editor-block',text:'he'}]},{kind:'at',parentKey:root.key,index:0});
 f.editor.commands.transclude(f.node('foreign-text').key,{kind:'at',parentKey:root.key,index:0});
 f.editor.commands.transclude(f.node('b').key,{kind:'at',parentKey:root.key,index:0});
 f.button('Prepare entity').click();await vi.advanceTimersByTimeAsync(0);f.button('Expand original selection').click();await vi.advanceTimersByTimeAsync(220);
 expect(f.panel().querySelectorAll('[data-candidate-row]')).toHaveLength(3);
 expect(f.panel().textContent).toContain('2 locations, one annotation target');
 f.button('Bind 3').click();await vi.advanceTimersByTimeAsync(0);
 expect(f.node('foreign-text').payload.standoffProperties).toBeUndefined();
 expect(f.node('b').payload.standoffProperties).toHaveLength(1);expect(f.node().payload.standoffProperties).toHaveLength(2);
});
