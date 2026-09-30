// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {BacklinksPanel} from './backlinks-view';
import type {ApplicationBacklinks, BacklinksQuery, BacklinksResult} from '../../feature-api/backlinks';
const stops:Array<()=>void>=[];
afterEach(()=>{for(const stop of stops.splice(0).reverse())stop();document.body.replaceChildren();});
function fixture() {
 const [target,setTarget]=createSignal<BacklinksQuery>({vault:'vault',target:{documentId:'b',blockId:'b-root'}});
 const subscribers=new Set<()=>void>();const requests:Array<{query:BacklinksQuery;signal?:AbortSignal;resolve:(value:BacklinksResult)=>void}>=[];
 const api:ApplicationBacklinks={target,follow:vi.fn(async()=>{}),service:{query:vi.fn((query,signal)=>new Promise<BacklinksResult>(resolve=>requests.push({query,signal,resolve}))),current:()=>true,subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn);}}};
 const host=document.body.appendChild(document.createElement('div'));const dispose=render(()=><BacklinksPanel backlinks={api}/>,host);stops.push(dispose);
 const result=(query=target(),title='Source'):BacklinksResult=>({query,target:{...query.target,title:'Target',location:'vault/b.mutable.json'},mentions:[{id:'mention',source:{documentId:'a',blockId:'a-root',title,location:'vault/a.mutable.json'},target:query.target,ranges:[{blockId:'passage',start:0,end:3}],snippet:'Native mention'}],coverage:{available:2,discovered:3,complete:false,diagnostics:['Unopened resource omitted.']}});
 return {api,target,setTarget,subscribers,requests,host,dispose,result};
}
it('uses only the semantic service contract and shows partial coverage before invoking host navigation',async()=>{
 const f=fixture();expect(f.requests).toHaveLength(1);const result=f.result();f.requests[0].resolve(result);await vi.waitFor(()=>expect(f.host.textContent).toContain('Incomplete coverage'));expect(f.host.textContent).toContain('2/3 Documents');expect(f.host.textContent).toContain('Unopened');f.host.querySelector<HTMLButtonElement>('.flint-backlink')!.click();expect(f.api.follow).toHaveBeenCalledWith(result,result.mentions[0],expect.any(AbortSignal));
});
it('drops delayed old-target results and closes only its own subscription and request',async()=>{
 const f=fixture(),first=f.requests[0];f.setTarget({vault:'vault',target:{documentId:'c',blockId:'c-root'}});expect(first.signal?.aborted).toBe(true);expect(f.requests).toHaveLength(2);f.requests[1].resolve(f.result(f.target(),'Current source'));await vi.waitFor(()=>expect(f.host.textContent).toContain('Current source'));first.resolve(f.result(first.query,'Stale source'));await Promise.resolve();expect(f.host.textContent).not.toContain('Stale source');f.dispose();expect(f.subscribers.size).toBe(0);expect(f.requests[1].signal?.aborted).toBe(true);
});
it('immediately disables stale rows, coalesces notifications and supports cancellation even if provider ignores abort',async()=>{
 const f=fixture();f.requests[0].resolve(f.result());await vi.waitFor(()=>expect(f.host.querySelector('.flint-backlink')).toBeTruthy());for(let i=0;i<4;i++)for(const fn of f.subscribers)fn();expect(f.host.querySelector<HTMLButtonElement>('.flint-backlink')!.disabled).toBe(true);await vi.waitFor(()=>expect(f.requests).toHaveLength(2));[...f.host.querySelectorAll('button')].find(b=>b.textContent==='Cancel backlinks query')!.click();expect(f.requests[1].signal?.aborted).toBe(true);f.requests[1].resolve(f.result(f.target(),'Cancelled source'));await Promise.resolve();expect(f.host.textContent).not.toContain('Cancelled source');expect(f.host.textContent).toContain('cancelled');
});
