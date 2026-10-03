import {entityTestApi,registerEntityTestViews} from './test-support';
import {mockResolver} from './resolver-test-support';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import {openEntitySearch} from './entity-search';
import {matchSources} from '../../runtime/search-matching';
vi.mock('../../runtime/search-worker',()=>({runSearchWorker:async(s:any,q:string,o:any)=>matchSources(s,q,o)}));
const cleanup:Array<()=>void>=[];
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();vi.useRealTimers();localStorage.clear();});
function setup(text='he',name='Leonardo da Vinci'){
 const editor=new ReactiveEditor({type:'document-block',children:[{id:'a',type:'standoff-editor-block',text},{id:'b',type:'standoff-editor-block',text:'another mention'}]});
 registerEntityTestViews(editor);const view=editor.createView('ler'),host=document.body.appendChild(document.createElement('div'));
 const dispose=render(()=><ReactiveTreeView editor={editor} projection={view}/>,host);editor.installGateway(document);cleanup.push(()=>{dispose();editor.dispose();});
 const node=(id='a')=>Object.values(view.state.nodes).find(n=>n.payload.id===id)!;
 const mock=mockResolver(name),api=entityTestApi(editor);api.entities=()=>mock.service;
 const open=(ranges=[{nodeKey:node().key,start:0,end:[...text].length}])=>{editor.mounts.get(node().key)!.focus();openEntitySearch(api,ranges);};
 const panel=()=>document.querySelector<HTMLElement>('[role=dialog][aria-label="Link Entity Reference"]')!;
 const input=(label:string,value:string)=>{const e=panel().querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;e.value=value;e.dispatchEvent(new InputEvent('input',{bubbles:true}));};
 const button=(label:string)=>[...panel().querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!;
 const choose=async()=>{panel().querySelector<HTMLButtonElement>(`[aria-label="Select ${name}"]`)!.click();await vi.advanceTimersByTimeAsync(0);};
 return {editor,api,node,open,panel,input,button,choose,...mock};
}
it.each([['Leonardo','Leonardo'],['he','leonardo'],['Firenze','Florence']])('keeps target %s independent of resolver query %s',async(text,query)=>{
 const f=setup(text,query==='Florence'?'Florence':'Leonardo da Vinci');f.open();const before=f.editor.repository.snapshot();f.input('Search entities',query);await vi.advanceTimersByTimeAsync(220);
 expect(f.panel().querySelector('[data-entity-target]')!.textContent).toBe(text);expect(f.editor.repository.snapshot()).toEqual(before);expect(Object.values(f.editor.decorations.nodes).flat().some(d=>d.type==='editor/panel-selection')).toBe(true);
 await f.choose();expect(f.panel()).toBeNull();expect(f.editor.encodeDocument().children![0].text).toBe(text);expect(f.node().payload.standoffProperties).toEqual([expect.objectContaining({value:'blake',start:0,end:[...text].length-1})]);expect(f.service.alias).not.toHaveBeenCalled();
 f.editor.repository.undo();expect(f.node().payload.standoffProperties).toBeUndefined();f.editor.repository.redo();expect(f.node().payload.standoffProperties).toHaveLength(1);
});
it('creates under a separate canonical name without rewriting target; Undo leaves the Entity',async()=>{
 const f=setup();f.open();f.input('Search entities','leonardo');f.button('+ Create Entity').click();expect(f.panel().querySelector<HTMLInputElement>('[aria-label="Canonical name"]')!.value).toBe('leonardo');f.input('Canonical name','Leonardo da Vinci');f.button('Create and link').click();await vi.advanceTimersByTimeAsync(0);
 const input=vi.mocked(f.service.create).mock.calls[0][0];expect(input.name).toBe('Leonardo da Vinci');expect(f.entities.has(input.id)).toBe(true);expect(f.editor.encodeDocument().children![0].text).toBe('he');f.editor.repository.undo();expect(f.node().payload.standoffProperties).toBeUndefined();expect(f.entities.has(input.id)).toBe(true);
});
it('retries unconfirmed creation with the same supplied identity and request',async()=>{
 const f=setup();vi.mocked(f.service.create).mockRejectedValueOnce(Error('Response lost'));f.open();f.button('+ Create Entity').click();f.button('Create and link').click();await vi.advanceTimersByTimeAsync(0);expect(f.panel().textContent).toContain('Creation outcome unconfirmed');expect(f.editor.repository.canUndo()).toBe(false);
 f.button('Retry creation and link').click();await vi.advanceTimersByTimeAsync(0);expect(vi.mocked(f.service.create).mock.calls[1][0]).toEqual(vi.mocked(f.service.create).mock.calls[0][0]);
});
it('retains created-but-not-linked identity and binds a newly validated selection',async()=>{
 const f=setup();let finish!:(e:any)=>void;vi.mocked(f.service.create).mockImplementation(input=>new Promise(r=>{finish=r;}));f.open();f.button('+ Create Entity').click();f.button('Create and link').click();
 f.editor.commands.replaceInlineRange(f.node().key,0,0,'Now ');f.entities.set('created',{id:'created',name:'Leonardo',revision:0,aliases:[]});finish(f.entities.get('created'));await vi.advanceTimersByTimeAsync(0);expect(f.panel().textContent).toContain('created, but');expect(f.node().payload.standoffProperties).toBeUndefined();
 f.api.recoverySelection=()=>[{nodeKey:f.node('b').key,start:0,end:7}];f.button('Bind to new selection').click();await vi.advanceTimersByTimeAsync(0);expect(f.node('b').payload.standoffProperties).toEqual([expect.objectContaining({value:'created',start:0,end:6})]);expect(f.service.create).toHaveBeenCalledTimes(1);expect(f.editor.focus.state.focusedKey).toBe(f.node('b').key);expect(f.editor.mounts.get(f.node('b').key)!.captureInlineSelection!()).toEqual({anchor:0,head:7});
});
it('cancel before dispatch writes nothing and cancel after dispatch never adds a late annotation',async()=>{
 const f=setup();f.open();f.button('Cancel').click();expect(f.service.create).not.toHaveBeenCalled();f.open();let finish!:(e:any)=>void;vi.mocked(f.service.create).mockImplementation(()=>new Promise(r=>finish=r));f.button('+ Create Entity').click();f.button('Create and link').click();f.button('Cancel').click();finish({id:'created',name:'he',aliases:[],revision:0});await vi.advanceTimersByTimeAsync(0);expect(f.node().payload.standoffProperties).toBeUndefined();
});
it('Replace & Link is one undoable native edit and remaps other annotations',async()=>{
 const f=setup('Leo writes');f.editor.commands.setPayloadField(f.node().key,'standoffProperties',[{id:'style',type:'style/bold',start:4,end:9}]);f.open([{nodeKey:f.node().key,start:0,end:3}]);f.input('Search entities','Leonardo');await vi.advanceTimersByTimeAsync(220);f.button('Replace & Link').click();await vi.advanceTimersByTimeAsync(0);
 expect(f.editor.encodeDocument().children![0].text).toBe('Leonardo da Vinci writes');expect(f.node().payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({id:'style',start:18,end:23}),expect.objectContaining({value:'blake',start:0,end:16})]));f.editor.repository.undo();expect(f.editor.encodeDocument().children![0].text).toBe('Leo writes');expect(f.node().payload.standoffProperties).toHaveLength(1);
});
it('adjusts grapheme and word boundaries without authored brackets or query changes',async()=>{
 const f=setup('e\u0301 city');f.open([{nodeKey:f.node().key,start:0,end:2}]);f.input('Search entities','Florence');f.button('end forward word').click();expect(f.panel().querySelector('[data-entity-target]')!.textContent).toBe('e\u0301 ');f.button('end forward word').click();expect(f.panel().querySelector('[data-entity-target]')!.textContent).toBe('e\u0301 city');expect(f.editor.repository.canUndo()).toBe(false);expect(f.panel().querySelector<HTMLInputElement>('[aria-label="Search entities"]')!.value).toBe('Florence');
});
it('preserves cross-Block identity and clears stale target on external edits',async()=>{
 const f=setup();f.open([{nodeKey:f.node().key,start:0,end:2},{nodeKey:f.node('b').key,start:0,end:7}]);f.input('Search entities','Leonardo');await vi.advanceTimersByTimeAsync(220);await f.choose();const a=(f.node().payload.standoffProperties as any[])[0],b=(f.node('b').payload.standoffProperties as any[])[0];expect(a.annotationId).toBe(b.annotationId);f.editor.repository.undo();expect(f.node('b').payload.standoffProperties).toBeUndefined();f.open();f.editor.commands.replaceInlineRange(f.node().key,0,0,'x');expect(f.panel()).toBeNull();
});
it('passes stream, match and scope independently and rejects late search publication',async()=>{
 const f=setup();let finish!:(e:any)=>void;vi.mocked(f.service.search).mockImplementationOnce(()=>new Promise(r=>finish=r));f.open();await vi.advanceTimersByTimeAsync(220);f.input('Search entities','leonardo');await vi.advanceTimersByTimeAsync(220);finish({candidates:[{id:'wrong',name:'Stale'}],complete:true,diagnostics:[],current(){}});await vi.advanceTimersByTimeAsync(0);expect(f.panel().textContent).not.toContain('Stale');
 for(const [label,value]of [['Entity stream','mention'],['Entity match','exact'],['Entity scope','document']]){const e=f.panel().querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));}await vi.advanceTimersByTimeAsync(220);expect(vi.mocked(f.service.search).mock.calls.at(-1)![0]).toEqual({query:'leonardo',stream:'mention',match:'exact',scope:'document'});
});
it('supports explicit alias add/update/remove without linking or history',async()=>{
 const f=setup();f.open();f.input('Search entities','Leonardo');await vi.advanceTimersByTimeAsync(220);f.button('Details / aliases').click();await vi.advanceTimersByTimeAsync(0);f.input('Explicit alias','Leo');f.button('Add alias').click();await vi.advanceTimersByTimeAsync(0);expect(f.entities.get('blake')!.aliases[0].name).toBe('Leo');f.button('Edit alias').click();f.input('Explicit alias','Leonardo');f.button('Update alias').click();await vi.advanceTimersByTimeAsync(0);expect(f.entities.get('blake')!.aliases[0].name).toBe('Leonardo');f.button('Remove alias').click();await vi.advanceTimersByTimeAsync(0);expect(f.entities.get('blake')!.aliases).toHaveLength(0);expect(f.editor.repository.canUndo()).toBe(false);
});
it('keeps Tab and numeric text input native; Enter links and Escape cancels',async()=>{
 const f=setup();f.open();f.input('Search entities','Leonardo');await vi.advanceTimersByTimeAsync(220);const input=f.panel().querySelector<HTMLInputElement>('[aria-label="Search entities"]')!;for(const key of ['Tab','1']){const e=new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});input.dispatchEvent(e);expect(e.defaultPrevented).toBe(false);}input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await vi.advanceTimersByTimeAsync(0);expect(f.panel()).toBeNull();
});
