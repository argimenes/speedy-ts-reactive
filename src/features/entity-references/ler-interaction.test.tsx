import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import {entityTestApi,registerEntityTestViews} from './test-support';
import {mockResolver} from './resolver-test-support';
import {openEntitySearch} from './entity-search';
import {keyboard} from '../../input/bindings';
const cleanup:Array<()=>void>=[];
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();vi.useRealTimers();localStorage.clear();});
async function fixture(){
 const editor=new ReactiveEditor({type:'document-block',children:[{id:'source',type:'standoff-editor-block',text:'Liszt'},
  {id:'linked',type:'standoff-editor-block',text:'he Liszt',standoffProperties:[{id:'he',type:'codex/entity-reference',value:'liszt',start:0,end:1},{id:'name',type:'codex/entity-reference',value:'liszt',start:3,end:7}]},
  {id:'other',type:'standoff-editor-block',text:'Marie',standoffProperties:[{id:'m',type:'codex/entity-reference',value:'marie',start:0,end:4}]},
 ]});
 registerEntityTestViews(editor);const view=editor.createView('ler-interaction'),host=document.body.appendChild(document.createElement('div'));
 const dispose=render(()=><ReactiveTreeView editor={editor} projection={view}/>,host);editor.installGateway(document);cleanup.push(()=>{dispose();editor.dispose();});
 const node=(id:string)=>Object.values(view.state.nodes).find(n=>n.payload.id===id)!;
 const api=entityTestApi(editor),mock=mockResolver('Franz Liszt','liszt');mock.entities.get('liszt')!.aliases=[{id:'f',name:'Franz',origin:'curated',revision:0}];mock.entities.set('marie',{id:'marie',name:"Marie d’Agoult",revision:0,aliases:[]});api.entities=()=>mock.service;
 editor.mounts.get(node('source').key)!.focus();openEntitySearch(api,[{nodeKey:node('source').key,start:0,end:5}]);await vi.advanceTimersByTimeAsync(220);
 const panel=()=>document.querySelector<HTMLElement>('.ler-instrument')!,input=()=>panel().querySelector<HTMLInputElement>('[aria-label="Search entities"]')!;
 const key=(key:string,options:KeyboardEventInit={},target:Element=panel().querySelector('[role=listbox]')!)=>{const e=new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options});target.dispatchEvent(e);return e;};
 const select=(label:string,value:string)=>{const e=panel().querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));};
 const text=(value:string)=>{input().value=value;input().dispatchEvent(new InputEvent('input',{bubbles:true}));};
 return {editor,api,node,panel,input,key,select,text,...mock};
}
it('opens in Command mode, cycles operators immediately and hands ordinary typing to the input',async()=>{
 const f=await fixture();expect(document.activeElement?.getAttribute('role')).toBe('listbox');
 f.key('*',{shiftKey:true});expect(f.panel().querySelector<HTMLSelectElement>('[aria-label="Entity match"]')!.value).toBe('exact');
 f.key('@',{shiftKey:true});expect(f.panel().querySelector<HTMLSelectElement>('[aria-label="Entity stream"]')!.value).toBe('name');
 f.key('~',{shiftKey:true});expect(f.panel().querySelector<HTMLSelectElement>('[aria-label="Entity scope"]')!.value).toBe('live');
 expect(f.key('x').defaultPrevented).toBe(false);expect(document.activeElement).toBe(f.input());
 expect(f.input().selectionStart).toBe(0);expect(f.input().selectionEnd).toBe(f.input().value.length);
 expect(f.editor.repository.canUndo()).toBe(false);
});
it('keeps punctuation, numeric input, modifiers and IME native inside fields',async()=>{
 const f=await fixture();f.key('F2');
 for(const key of ['1','*','@','~','/','|'])expect(f.key(key,{},f.input()).defaultPrevented).toBe(false);
 expect(f.key('Backspace',{ctrlKey:true},f.input()).defaultPrevented).toBe(false);
 expect(f.key('Enter',{isComposing:true},f.input()).defaultPrevented).toBe(false);
 expect(f.key('a',{metaKey:true},f.input()).defaultPrevented).toBe(false);
 expect(f.key('1',{ctrlKey:true}).defaultPrevented).toBe(false);expect(f.editor.repository.canUndo()).toBe(false);
 f.key('Escape',{},f.input());await vi.advanceTimersByTimeAsync(0);expect(document.activeElement?.getAttribute('role')).toBe('listbox');expect(f.panel()).toBeTruthy();f.key('Escape');expect(f.panel()).toBeNull();
});
it('opens live entities unfiltered, uses aliases and mention strings, and restores B independently',async()=>{
 const f=await fixture();f.text('Unrelated graph query');f.select('Entity scope','live');await vi.advanceTimersByTimeAsync(0);
 expect(f.input().value).toBe('');expect(f.panel().querySelectorAll('[role=option]')).toHaveLength(2);expect(f.panel().textContent).toContain('2 entities · 3 linked occurrences');
 f.select('Entity stream','alias');f.text('Franz');expect(f.panel().querySelectorAll('[role=option]')).toHaveLength(1);
 f.select('Entity stream','mention');f.text('he');expect(f.panel().querySelector('[role=option]')?.textContent).toContain('Franz Liszt');
 f.select('Entity scope','vault');expect(f.input().value).toBe('Unrelated graph query');expect(f.panel().querySelector('[data-entity-target]')?.textContent).toBe('Liszt');
});
it('filters cached live data without document scans, snapshots or further canonical reads',async()=>{
 const f=await fixture();f.select('Entity scope','live');await vi.advanceTimersByTimeAsync(0);
 const text=vi.spyOn(f.api,'text'),inventory=vi.spyOn(f.api,'documentAnnotations'),snapshot=vi.spyOn(f.editor.repository,'snapshot');vi.mocked(f.service.get).mockClear();vi.mocked(f.service.search).mockClear();
 for(const q of ['F','Fr','Fra','Fran','Franz'])f.text(q);await vi.advanceTimersByTimeAsync(300);
 expect(text).not.toHaveBeenCalled();expect(inventory).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();expect(f.service.get).not.toHaveBeenCalled();expect(f.service.search).not.toHaveBeenCalled();
});
it('keeps live filtering current after unsaved mention edits without refreshing canonical metadata',async()=>{
 const f=await fixture();f.select('Entity scope','live');await vi.advanceTimersByTimeAsync(0);vi.mocked(f.service.get).mockClear();
 f.editor.commands.replaceInlineRange(f.node('linked').key,1,1,'i');await vi.advanceTimersByTimeAsync(0);f.select('Entity stream','mention');f.text('hie');
 expect(f.panel().querySelectorAll('[role=option]')).toHaveLength(1);expect(f.panel().textContent).toContain('3 linked occurrences');expect(f.service.get).not.toHaveBeenCalled();
 f.editor.repository.undo();await vi.advanceTimersByTimeAsync(0);expect(f.panel().querySelectorAll('[role=option]')).toHaveLength(0);
});
it('distinguishes inspection and preparation and keeps the original visible through both',async()=>{
 const f=await fixture();f.key('ArrowRight');await vi.advanceTimersByTimeAsync(0);expect(f.panel().querySelector('[aria-label="Canonical Entity details"]')).toBeTruthy();expect(f.panel().querySelector('.ler-prepared')).toBeNull();
 f.key('Escape',{},f.panel());await vi.advanceTimersByTimeAsync(0);f.key('Enter',{shiftKey:true});await vi.advanceTimersByTimeAsync(0);
 expect(f.panel().querySelector('.ler-prepared')?.getAttribute('data-entity-id')).toBe('liszt');expect(f.panel().querySelector('[data-entity-target]')?.textContent).toBe('Liszt');expect(f.editor.repository.canUndo()).toBe(false);
});
it('retains unaffected result DOM and selection while another entity surface changes',async()=>{
 const f=await fixture();f.select('Entity scope','live');await vi.advanceTimersByTimeAsync(0);
 f.key('ArrowDown');
 const marie=f.panel().querySelector('[aria-label="Select Marie d’Agoult"]');
 expect(marie?.getAttribute('aria-selected')).toBe('true');
 f.editor.commands.replaceInlineRange(f.node('linked').key,1,1,'i');await vi.advanceTimersByTimeAsync(0);
 expect(f.panel().querySelector('[aria-label="Select Marie d’Agoult"]')).toBe(marie);
 expect(marie?.getAttribute('aria-selected')).toBe('true');
});
it('reveals keyboard-selected rows with bounded frame reads and preserves query focus',async()=>{
 const f=await fixture();f.select('Entity scope','live');await vi.advanceTimersByTimeAsync(30);
 const body=f.panel().querySelector<HTMLElement>('.ler-body')!,rows=[...f.panel().querySelectorAll<HTMLElement>('[role=option]')];
 Object.defineProperties(body,{offsetHeight:{value:100},clientHeight:{value:100}});
 const viewport=vi.spyOn(body,'getBoundingClientRect').mockImplementation(()=>new DOMRect(0,0,200,100));
 const reads=rows.map((row,i)=>vi.spyOn(row,'getBoundingClientRect').mockImplementation(()=>new DOMRect(0,i*120-body.scrollTop,200,40)));
 f.key('ArrowDown');f.key('ArrowUp');
 expect(viewport).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(20);
 expect(viewport).toHaveBeenCalledTimes(1);expect(reads[0]).toHaveBeenCalledTimes(1);expect(reads[1]).not.toHaveBeenCalled();
 f.key('ArrowDown');await vi.advanceTimersByTimeAsync(20);expect(body.scrollTop).toBe(60);
 f.input().focus();f.key('ArrowUp',{},f.input());await vi.advanceTimersByTimeAsync(20);
 expect(body.scrollTop).toBe(0);expect(document.activeElement).toBe(f.input());
 viewport.mockClear();reads.forEach(read=>read.mockClear());f.text('Franz');await vi.advanceTimersByTimeAsync(30);
 expect(viewport).not.toHaveBeenCalled();reads.forEach(read=>expect(read).not.toHaveBeenCalled());
});
it.each([{metaKey:true},{ctrlKey:true}])('toggles Query / Command with %j and retains query, caret and selection',async modifiers=>{
 const f=await fixture();f.key('F2');f.input().setSelectionRange(1,3);
 const value=f.input().value,selected=f.panel().querySelector('[aria-selected=true]');
 expect(f.key('.',{...modifiers,isComposing:true},f.input()).defaultPrevented).toBe(false);
 expect(f.key('.',modifiers,f.input()).defaultPrevented).toBe(true);await vi.advanceTimersByTimeAsync(0);
 expect(document.activeElement?.getAttribute('role')).toBe('listbox');
 expect(f.panel().querySelector('[aria-selected=true]')).toBe(selected);
 f.key('.',{...modifiers,repeat:true});await vi.advanceTimersByTimeAsync(0);expect(document.activeElement?.getAttribute('role')).toBe('listbox');
 expect(f.key('.',modifiers).defaultPrevented).toBe(true);expect(document.activeElement).toBe(f.input());
 expect(f.input().value).toBe(value);expect(f.input().selectionStart).toBe(1);expect(f.input().selectionEnd).toBe(3);
 expect(f.key('.',{},f.input()).defaultPrevented).toBe(false);
 expect(f.key('*',{shiftKey:true},f.input()).defaultPrevented).toBe(false);
 f.key('.',modifiers,f.input());await vi.advanceTimersByTimeAsync(0);f.key('*',{shiftKey:true});
 expect(f.panel().querySelector<HTMLSelectElement>('[aria-label="Entity match"]')!.value).toBe('exact');
 expect(f.editor.repository.canUndo()).toBe(false);
});
it('honours a remapped mode toggle inside the query field',async()=>{
 const f=await fixture();f.key('F2');f.editor.bindings.assign('entity.toggleMode',[keyboard('F6')]);
 expect(f.key('.',{ctrlKey:true},f.input()).defaultPrevented).toBe(false);
 expect(f.key('F6',{},f.input()).defaultPrevented).toBe(true);await vi.advanceTimersByTimeAsync(0);
 expect(document.activeElement?.getAttribute('role')).toBe('listbox');
 f.key('F6');expect(document.activeElement).toBe(f.input());
});
it.each([{metaKey:true},{ctrlKey:true}])('creates from the query and links the source with %j Enter',async modifiers=>{
 const f=await fixture();f.key('F2');f.text('  Franz Liszt  ');
 expect(f.key('Enter',{...modifiers,isComposing:true},f.input()).defaultPrevented).toBe(false);
 f.key('Enter',{...modifiers,repeat:true},f.input());expect(f.service.create).not.toHaveBeenCalled();
 expect(f.key('Enter',modifiers,f.input()).defaultPrevented).toBe(true);await vi.advanceTimersByTimeAsync(0);
 expect(f.service.create).toHaveBeenCalledTimes(1);const request=vi.mocked(f.service.create).mock.calls[0][0];
 expect(request.name).toBe('Franz Liszt');expect(request.id).not.toBe('liszt');expect(f.panel()).toBeNull();
 expect(f.node('source').payload.standoffProperties).toEqual([expect.objectContaining({value:request.id,start:0,end:4})]);
 expect(f.editor.encodeDocument().children![0].text).toBe('Liszt');
 f.editor.repository.undo();expect(f.node('source').payload.standoffProperties).toBeUndefined();expect(f.entities.has(request.id)).toBe(true);
});
it('rejects an empty query and retries an uncertain creation with the same identity in Command mode',async()=>{
 const f=await fixture();f.text('   ');f.key('Enter',{ctrlKey:true});expect(f.service.create).not.toHaveBeenCalled();
 expect(f.panel().textContent).toContain('Enter an entity name in the query field');
 vi.mocked(f.service.create).mockRejectedValueOnce(Error('Response lost'));
 f.text('New name');f.key('Enter',{ctrlKey:true});await vi.advanceTimersByTimeAsync(0);
 const request=vi.mocked(f.service.create).mock.calls[0][0];expect(f.panel().textContent).toContain('Creation outcome unconfirmed');
 f.text('Different name');f.key('Enter',{ctrlKey:true},f.input());expect(f.service.create).toHaveBeenCalledTimes(1);
 f.text('New name');f.key('Enter',{ctrlKey:true},f.input());await vi.advanceTimersByTimeAsync(0);
 expect(vi.mocked(f.service.create).mock.calls[1][0]).toEqual(request);
 expect(f.node('source').payload.standoffProperties).toEqual([expect.objectContaining({value:request.id})]);
});
it('suppresses duplicate creation while pending and after a created Entity loses its source range',async()=>{
 const f=await fixture();let finish!:(value:any)=>void;
 vi.mocked(f.service.create).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 f.text('New name');f.key('Enter',{metaKey:true});f.key('Enter',{ctrlKey:true},f.input());expect(f.service.create).toHaveBeenCalledTimes(1);
 f.editor.commands.replaceInlineRange(f.node('source').key,0,0,'Now ');
 const request=vi.mocked(f.service.create).mock.calls[0][0];finish({...request,revision:0,aliases:[]});await vi.advanceTimersByTimeAsync(0);
 expect(f.panel().textContent).toContain('created, but');expect(f.node('source').payload.standoffProperties).toBeUndefined();
 f.key('Enter',{metaKey:true},f.input());expect(f.service.create).toHaveBeenCalledTimes(1);expect(f.panel().textContent).toContain('Bind to new selection');
});
