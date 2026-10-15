import { createRangeRendering } from '../rendering/range-rendering';
import { AnnotationRangeEvents } from './annotation-range-events';
// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createRoot, createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { VisualEffectRegistry, type EffectParams } from './visual-effect-registry';
import { registerVisualEffectRenderers } from '../rendering/visual-effect-renderers';
it('validates JSON definitions, binding/state references, renderer parameters and duplicate registrations',()=>{
  const registry=new VisualEffectRegistry();registerVisualEffectRenderers(registry);
  const valid={type:'test',renderers:[{id:'line',name:'svg-underline'}]};
  expect(()=>registry.registerType({...valid,events:{'caret-enter':['missing']}})).not.toThrow();
  expect(()=>registry.registerType(valid)).toThrow('already registered');
  expect(()=>registry.registerType({type:'bad',renderers:[{id:'a',name:'missing'}]})).toThrow('Unknown renderer');
  expect(()=>registry.registerType({type:'bad',renderers:[{id:'a',name:'svg-underline',params:{opacity:2}}]})).toThrow('opacity');
  expect(()=>registry.registerType({type:'bad',renderers:[{id:'a',name:'css-class',params:{classes:['reactive-standoff-flow']}}]})).toThrow('reserved');
  expect(()=>registry.registerType({...valid,type:'bad',states:{'caret-inside':{missing:{opacity:1}}}})).toThrow('Unknown renderer binding');
  expect(()=>registry.registerType({...valid,type:'bad',events:{'caret-enter':[()=>{}]} as any})).toThrow('JSON');
  registry.dispose();expect(()=>registry.registerType(valid)).toThrow('disposed');
});
it('renders a source-neutral session effect and updates parameters on its existing path',()=>{
  const registry=new VisualEffectRegistry();registerVisualEffectRenderers(registry);
  const renderer=registry.renderer('svg-underline')!;if(renderer.target!=='range-overlay')throw Error('Wrong target');
  const [params,setParams]=createSignal<EffectParams>({...renderer.defaults,opacity:.5});
  const host=document.createElement('div');document.body.append(host);
  const dispose=render(()=><svg><renderer.View identity="session-effect" owner={{kind:'session',key:'session'}} params={params} geometry={()=>({fragments:[{x:10,y:20,width:40,height:15}],offset:0})}/></svg>,host);
  const path=host.querySelector('path')!;expect(path.getAttribute('d')).toBe('M 10 36.5 H 50');
  setParams({...renderer.defaults,opacity:1,color:'blue'});expect(host.querySelector('path')).toBe(path);expect(path.getAttribute('stroke')).toBe('blue');
  dispose();expect(host.querySelector('path')).toBeNull();host.remove();registry.dispose();
});
it('reports unknown/failing named handlers once and isolates later handlers',async()=>{
  const registry=new VisualEffectRegistry(),error=vi.spyOn(console,'error').mockImplementation(()=>{}),called=vi.fn();
  registry.registerHandler('bad',()=>{throw Error('failure');});registry.registerHandler('good',called);
  const context={signal:new AbortController().signal} as any;
  registry.invoke(['missing','bad','good'],context);registry.invoke(['missing','bad','good'],context);await Promise.resolve();
  expect(error).toHaveBeenCalledTimes(2);expect(called).toHaveBeenCalledTimes(2);error.mockRestore();registry.dispose();
});

it('does not rescan aggregate renderer parameters for paint-only caret state changes',()=>{
  const registry=new VisualEffectRegistry();registerVisualEffectRenderers(registry);const events=new AnnotationRangeEvents();
  registry.registerType({type:'many',renderers:[{id:'line',name:'svg-underline'}],states:{'caret-inside':{line:{opacity:.5}}}});
  createRoot(dispose=>{
    const sources=Array.from({length:2048},(_,index)=>({key:String(index),owner:{kind:'annotation' as const,key:String(index)},start:index*3,end:index*3+2,type:'many',definition:registry.type('many')!,data:{},index}));
    const host=createRangeRendering({sources:()=>sources,registry,events,nodeKey:'block',eventsEnabled:true});
    events.setRanges('block',host.eventRanges());host.layout();
    const parameters=vi.spyOn(registry,'params'),indexes=vi.spyOn(events,'setRanges');
    for(let i=0;i<100;i++)events.setCaret('block',i*3);
    expect(parameters).not.toHaveBeenCalled();expect(indexes).not.toHaveBeenCalled();dispose();
  });
  events.dispose();registry.dispose();
});
