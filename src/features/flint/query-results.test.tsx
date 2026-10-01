// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {QueryResults} from './query-results';
it('yields large DOM publication and prevents replaced or closed queries from republishing old rows',async()=>{
 const tasks:Array<()=>void>=[];
 vi.stubGlobal('scheduler',{postTask:()=>new Promise<void>(resolve=>tasks.push(resolve))});
 const [items,setItems]=createSignal(Array.from({length:130},(_,i)=>'old-'+i));
 const host=document.createElement('div'),dispose=render(()=><QueryResults each={items()}>{item=><button>{item}</button>}</QueryResults>,host);
 try {
  expect(host.children).toHaveLength(40);tasks.shift()!();await Promise.resolve();expect(host.children).toHaveLength(80);
  setItems(['new']);tasks.shift()!();await Promise.resolve();expect(host.textContent).toBe('new');expect(host.children).toHaveLength(1);
  setItems(Array.from({length:100},(_,i)=>'closing-'+i));expect(host.children).toHaveLength(40);
  dispose();tasks.shift()!();await Promise.resolve();expect(host.children).toHaveLength(0);
 } finally {dispose();vi.unstubAllGlobals();}
});
