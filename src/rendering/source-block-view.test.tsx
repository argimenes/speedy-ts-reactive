// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../reactive-editor/editor';
import {registerCoreViews} from './register-core-views';
import {ReactiveTreeView} from './reactive-tree-view';
import {sourcePayload,sourceType} from '../interchange/source-block';
import * as worker from '../runtime/interchange-worker';
const dispose:(()=>void)[]=[];afterEach(()=>{dispose.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();});
const tick=()=>new Promise(r=>setTimeout(r,20));
function mount(source='a\r\nb\nc\rd',enabled=true){
 const editor=new ReactiveEditor({id:'doc',type:'document-block',children:[{id:'source',type:sourceType('markdown'),...sourcePayload('markdown',source),metadata:{custom:'kept'}}]},{features:{documentInterchange:enabled}});registerCoreViews(editor);const projection=editor.createView('first');const host=document.body.appendChild(document.createElement('div'));dispose.push(()=>editor.dispose(),render(()=><ReactiveTreeView editor={editor} projection={projection}/>,host),editor.installGateway(document));
 const node=()=>Object.values(projection.state.nodes).find(n=>n.payload.id==='source')!;
 return{editor,host,projection,node,textarea:host.querySelector('textarea')!,button:(label:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===label)!};
}
it('native typing preserves source endings, performs no preview/snapshot/layout work and undoes exactly',()=>{
 const f=mount(),before=f.node().payload.text,snapshot=vi.spyOn(f.editor.repository,'snapshot'),layout=vi.spyOn(Element.prototype,'getBoundingClientRect'),prepare=vi.spyOn(worker,'runInterchange');
 f.textarea.focus();f.textarea.setSelectionRange(1,1);f.textarea.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,inputType:'insertText',data:'!'}));f.textarea.value='a!\nb\nc\nd';f.textarea.setSelectionRange(2,2);f.textarea.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));
 expect(f.node().payload.text).toBe('a!\r\nb\nc\rd');expect(f.editor.repository.state.revision).toBe(1);expect(snapshot).not.toHaveBeenCalled();expect(layout).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();
 f.editor.repository.undo();expect(f.node().payload.text).toBe(before);expect(f.textarea.value).toBe('a\nb\nc\nd');f.editor.repository.redo();expect(f.textarea.value).toBe('a!\nb\nc\nd');
});
it('commits IME once, does not preview during composition and preserves line endings',async()=>{
 const f=mount();f.textarea.focus();f.textarea.setSelectionRange(1,1);f.textarea.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));f.textarea.value='a語\nb\nc\nd';f.textarea.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));f.button('Preview').click();await tick();expect(f.editor.repository.state.revision).toBe(0);expect(f.host.querySelector('iframe')).toBeNull();
 f.textarea.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'語'}));f.textarea.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));expect(f.editor.repository.state.revision).toBe(1);expect(f.node().payload.text).toBe('a語\r\nb\nc\rd');
});
it('preview is explicit, sandboxed, occurrence-local, stale aware, selection restoring and history free',async()=>{
 const f=mount('**bold**'),prepare=vi.spyOn(worker,'runInterchange');f.textarea.focus();f.textarea.setSelectionRange(2,6);const before=f.editor.repository.state.revision;f.button('Preview').click();await tick();const iframe=f.host.querySelector('iframe')!;
 expect(iframe.getAttribute('sandbox')).toBe('');expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');expect(iframe.srcdoc).toContain('<strong>bold</strong>');expect(f.editor.repository.state.revision).toBe(before);expect(f.editor.repository.canUndo()).toBe(false);
 f.editor.commands.setPayloadField(f.node().key,'text','new');expect(f.host.textContent).toContain('out of date');expect(prepare).toHaveBeenCalledTimes(1);expect(iframe.srcdoc).toContain('<strong>bold</strong>');
 f.button('Source').click();await tick();expect(f.host.querySelector('iframe')).toBeNull();expect(document.activeElement).toBe(f.textarea);expect(f.textarea.selectionStart).toBe(2);
});
it('aborts preview on disposal and rejects stale worker results',async()=>{
 const f=mount();let resolve!:(v:any)=>void;const prepare=vi.spyOn(worker,'runInterchange').mockImplementation(()=>new Promise(r=>resolve=r) as any);f.button('Preview').click();const signal=prepare.mock.calls[0][1];f.editor.commands.setPayloadField(f.node().key,'text','changed');resolve({body:'old',srcdoc:'old',links:[],resources:[],warnings:[]});await tick();expect(f.host.querySelector('iframe')).toBeNull();
 f.button('Preview').click();const active=prepare.mock.calls[1][1];f.editor.commands.remove(f.node().key);await tick();expect(active.aborted).toBe(true);expect(signal.aborted).toBe(true);
});
it('converts the whole Block in one transaction and restores exact original identity/data on Undo',async()=>{
 const f=mount('# Heading\r\n\r\n**bold**'),before=f.editor.encodeDocument();const operation=f.editor.interchange.convertSourceBlock(f.node().key);for(let i=0;i<50&&!f.editor.interchange.question();i++)await tick();expect(f.editor.interchange.question()).toBeTruthy();f.editor.interchange.respond([]);await operation;
 expect(f.editor.interchange.message()).toContain('Converted the whole');expect(f.editor.repository.state.revision).toBe(1);expect(f.editor.encodeDocument().children?.every(b=>b.type==='standoff-editor-block')).toBe(true);f.editor.repository.undo();expect(f.editor.encodeDocument()).toEqual(before);f.editor.repository.redo();expect(f.host.querySelector('textarea')).toBeNull();
});
it('keeps source inert and visible with the feature disabled and leaves legacy HTML registered separately',()=>{
 const f=mount('<script>evil()</script>',false);expect(f.textarea).toBeNull();expect(f.host.querySelector('iframe')).toBeNull();expect(f.host.querySelector('pre')?.textContent).toBe('<script>evil()</script>');expect(f.editor.registry.resolve('html-block')).toBeTruthy();expect(f.editor.encodeDocument().children?.[0].text).toBe('<script>evil()</script>');
});
it('keeps previews independent across occurrences and leaves source editable after preview failure',async()=>{
 const f=mount('**bold**'),second=f.editor.createView('second'),host=document.body.appendChild(document.createElement('div'));dispose.push(render(()=><ReactiveTreeView editor={f.editor} projection={second}/>,host));
 f.button('Preview').click();await tick();expect(f.host.querySelector('iframe')).toBeTruthy();expect(host.querySelector('iframe')).toBeNull();expect(host.querySelector('textarea')?.hidden).toBe(false);
 f.button('Source').click();await tick();f.editor.commands.setPayloadField(f.node().key,'text','changed');vi.spyOn(worker,'runInterchange').mockRejectedValueOnce(Error('Preview failed'));const revision=f.editor.repository.state.revision;f.button('Preview').click();await tick();expect(f.host.textContent).toContain('Preview failed');expect(f.textarea.hidden).toBe(false);expect(f.textarea.readOnly).toBe(false);expect(f.editor.repository.state.revision).toBe(revision);
});
it('refuses stale conversion and cancellation without changing source',async()=>{
 const f=mount('**bold**'),original=f.node().payload.text;const operation=f.editor.interchange.convertSourceBlock(f.node().key);for(let i=0;i<50&&!f.editor.interchange.question();i++)await tick();f.editor.interchange.respond(undefined);await operation;expect(f.node().payload.text).toBe(original);expect(f.editor.repository.state.revision).toBe(0);
 const next=f.editor.interchange.convertSourceBlock(f.node().key);for(let i=0;i<50&&!f.editor.interchange.question();i++)await tick();f.editor.commands.setPayloadField(f.node().key,'text','newer');f.editor.interchange.respond([]);await next;expect(f.node().payload.text).toBe('newer');expect(f.editor.interchange.message()).toContain('changed');
});
it('does not overwrite a linked source edit arriving during IME',()=>{
 const f=mount();f.textarea.focus();f.textarea.setSelectionRange(1,1);f.textarea.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));f.textarea.value='a語\nb\nc\nd';f.editor.commands.setPayloadField(f.node().key,'text','external\r\nedit');f.textarea.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));expect(f.node().payload.text).toBe('external\r\nedit');expect(f.textarea.value).toBe('external\nedit');expect(f.editor.repository.state.revision).toBe(1);
});
it('routes native beforeinput undo/redo to canonical history, retaining exact endings',()=>{
 const f=mount('a\r\nb\nc'),original=f.node().payload.text;f.editor.commands.setPayloadField(f.node().key,'text','changed\nsource');
 const undo=new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'historyUndo'});f.textarea.dispatchEvent(undo);expect(undo.defaultPrevented).toBe(true);expect(f.node().payload.text).toBe(original);
 const redo=new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'historyRedo'});f.textarea.dispatchEvent(redo);expect(redo.defaultPrevented).toBe(true);expect(f.node().payload.text).toBe('changed\nsource');
});
it('linked source typing performs no hash, acquisition or preview work; reconnect cancellation preserves the baseline',async()=>{
 const f=mount('original');f.editor.commands.setPayloadField(f.node().key,'metadata',{sourceLink:{version:1,linkId:'link',filename:'source.md',format:'markdown',byteHash:'0'.repeat(64),textHash:'1'.repeat(64)}});
 const hash=vi.spyOn(crypto.subtle,'digest'),fetch=vi.spyOn(globalThis,'fetch'),prepare=vi.spyOn(worker,'runInterchange'),baseline=JSON.stringify(f.node().payload.metadata);
 f.textarea.focus();f.textarea.setSelectionRange(8,8);f.textarea.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,inputType:'insertText',data:'!'}));f.textarea.value='original!';f.textarea.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));
 expect(hash).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();expect(JSON.stringify(f.node().payload.metadata)).toBe(baseline);
 const revision=f.editor.repository.state.revision;f.editor.interchange.refreshSource(f.node().key);expect(f.editor.interchange.picker()?.link).toBe(true);f.editor.interchange.closePicker();expect(f.editor.repository.state.revision).toBe(revision);expect(JSON.stringify(f.node().payload.metadata)).toBe(baseline);
});
