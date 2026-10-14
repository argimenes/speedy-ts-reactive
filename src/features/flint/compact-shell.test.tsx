// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../../reactive-editor/editor';
import { registerApplicationViews } from '../../application/features';
import { ReactiveTreeView } from '../../rendering/reactive-tree-view';
import { materializeLocalWorkspace } from '../../reactive-editor/workspace-manifest';
import { FLINT_LAYOUT_KEY, FlintPaneSplitter } from './compact-layout';
import { createSignal } from 'solid-js';

const disposers: (()=>void)[] = [];
afterEach(()=>{disposers.splice(0).reverse().forEach(fn=>fn());document.body.replaceChildren();localStorage.clear();vi.restoreAllMocks();});
function setup(compact = true) {
  const editor = new ReactiveEditor(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{nativeDocumentPersistence:false,flintCompactShell:compact,flintLogo:false,flintMaterialChrome:false,flintProbe:false}});
  registerApplicationViews(editor); const projection=editor.createView('compact-test');
  editor.commandRegistry.execute('flint.open',{targetKey:projection.state.rootKey,args:undefined});
  const host=document.body.appendChild(document.createElement('div'));
  disposers.push(()=>editor.dispose(),render(()=><ReactiveTreeView editor={editor} projection={projection}/>,host));
  const shell=host.querySelector<HTMLElement>('.flint-application')!;
  const button=(label:string)=>shell.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  return {editor,shell,button,host};
}
it('defaults on and keeps the existing editor and document state through shell interactions',()=>{
  const {editor,shell,button}=setup();
  const flow=shell.querySelector('.reactive-standoff-flow');
  const before=editor.repository.snapshot();
  expect(shell.classList.contains('flint-compact')).toBe(true);
  button('Toggle Library').click(); expect(shell.dataset.library).toBe('false');
  button('Toggle Library').click(); expect(shell.dataset.library).toBe('true');
  button('Toggle Context').click(); expect(shell.dataset.context).toBe('false');
  button('Reading density').click(); expect(shell.dataset.density).toBe('reading');
  const separator=shell.querySelector('[aria-label="Resize explorer"]')!;
  separator.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
  expect(separator.getAttribute('aria-valuenow')).toBe('248');
  expect(shell.style.getPropertyValue('--flint-explorer-width')).toBe('248px');
  expect(shell.querySelector('.reactive-standoff-flow')).toBe(flow);
  expect(editor.repository.snapshot()).toEqual(before);
  const next=setup();expect(next.shell.dataset.density).toBe('reading');expect(next.shell.dataset.context).toBe('false');
  expect(next.shell.style.getPropertyValue('--flint-explorer-width')).toBe('248px');
});
it('keeps flag-off behavior and does not apply compact preferences to the previous shell',()=>{
  localStorage.setItem(FLINT_LAYOUT_KEY,JSON.stringify({density:'reading',library:false}));
  const {shell}=setup(false);
  expect(shell.classList.contains('flint-compact')).toBe(false);
  expect(shell.querySelector('[role=separator]')).toBeNull();expect(shell.querySelector('.flint-workspace-tools')).not.toBeNull();
  expect(shell.dataset.library).toBe('true');expect(shell.dataset.density).toBeUndefined();
});
it.each(['{invalid', JSON.stringify({library:'false',explorerWidth:9000,inspectorWidth:-12,density:'giant'})])('validates stored preferences: %s',value=>{
  localStorage.setItem(FLINT_LAYOUT_KEY,value);const {shell}=setup();
  expect(shell.dataset.library).toBe('true');expect(shell.dataset.density).toBe('compact');
  if(value.startsWith('{"')) {expect(shell.style.getPropertyValue('--flint-explorer-width')).toBe('450px');expect(shell.style.getPropertyValue('--flint-inspector-width')).toBe('190px');}
});
it('works when browser storage is blocked',()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked');});
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked');});
  const {button,shell}=setup();expect(()=>button('Reading density').click()).not.toThrow();expect(shell.dataset.density).toBe('reading');
});
describe.each(['library','context'] as const)('%s splitter',pane=>{
  it('resizes under host scaling, commits once, cancels and supports keyboard bounds',()=>{
    const root=document.body.appendChild(document.createElement('div'));
    Object.defineProperty(root,'clientWidth',{value:1000});
    vi.spyOn(root,'getBoundingClientRect').mockReturnValue({width:500} as DOMRect);
    const [width,setWidth]=createSignal(240);const commits:number[]=[];
    disposers.push(render(()=><FlintPaneSplitter pane={pane} controls="test-panel" width={width} root={()=>root} resize={(value,save)=>{setWidth(value);if(save)commits.push(value);}}/>,root));
    const handle=root.firstElementChild!;
    const pointer=(type:string,x:number)=>{const event=new MouseEvent(type,{clientX:x,button:0,bubbles:true,cancelable:true});Object.defineProperty(event,'pointerId',{value:1});handle.dispatchEvent(event);};
    pointer('pointerdown',100);pointer('pointermove',120);expect(width()).toBe(pane==='library'?280:200);expect(commits).toEqual([]);
    pointer('pointerup',120);expect(commits).toEqual([width()]);
    const saved=width();pointer('pointerdown',100);pointer('pointermove',115);pointer('pointercancel',115);expect(width()).toBe(saved);expect(commits).toHaveLength(1);
    handle.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));expect(width()).toBe(450);
    handle.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));expect(width()).toBe(pane==='library'?150:190);
  });
});
