import { expect, it, vi } from 'vitest';
import { AnnotationRangeEvents, type AnnotationRange } from './annotation-range-events';
const range=(key:string,start:number,end:number):AnnotationRange=>({key,index:0,id:key,type:'codex/entity-reference',start,end});
it('emits transitions once, supports overlaps and uses half-open caret boundaries',()=>{
 const events=new AnnotationRangeEvents(), listener=vi.fn();events.subscribe(listener);
 events.setRanges('a',[range('outer',1,5),range('inner',2,3)]);
 events.setCaret('a',1);events.setCaret('a',1);events.setCaret('a',2);events.setCaret('a',3);
 expect(listener.mock.calls.map(([e])=>[e.type,e.annotation.key])).toEqual([['caret-in-range','outer'],['caret-in-range','inner']]);
 events.setCaret('a',4);expect(events.isActive('a','inner')).toBe(false);expect(events.isActive('a','outer')).toBe(true);
 events.setCaret('a',6);expect(events.isActive('a','outer')).toBe(false);expect(listener).toHaveBeenCalledTimes(4);
});
it('isolates occurrences, rechecks changed ranges and releases active state on unmount',()=>{
 const events=new AnnotationRangeEvents(), listener=vi.fn();const stop=events.subscribe(listener);
 for(const key of ['a','b'])events.setRanges(key,[range('same',0,4)]);
 events.setCaret('a',2);events.setCaret('b',2);
 expect(events.isActive('a','same')).toBe(false);expect(events.isActive('b','same')).toBe(true);
 events.setRanges('b',[range('same',3,6)]);expect(events.isActive('b','same')).toBe(false);
 events.setRanges('b',[range('same',0,4)]);expect(events.isActive('b','same')).toBe(true);
 events.remove('b');expect(events.isActive('b','same')).toBe(false);
 stop();const count=listener.mock.calls.length;events.setCaret('a',2);events.dispose();expect(listener).toHaveBeenCalledTimes(count);
});
it('queries the cached index without rereading authored ranges or rebuilding it for caret moves',()=>{
 const events=new AnnotationRangeEvents(), read=vi.fn();
 const ranges=Array.from({length:4096},(_,i)=>({...range(String(i),i*3,i*3+1),get start(){read();return i*3;}}));
 events.setRanges('a',ranges);read.mockClear();const build=vi.spyOn(events,'setRanges');
 for(let i=0;i<100;i++)events.setCaret('a',i*3);
 expect(read).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(events.isActive('a','99')).toBe(true);
 // Random overlaps verify both branches of the centered tree against a simple oracle.
 const overlaps=Array.from({length:80},(_,i)=>range(String(i),(i*17)%90,(i*17)%90+i%20));
 events.setRanges('a',overlaps);
 for(let x=0;x<110;x++){
  events.setCaret('a',x);
  for(const r of overlaps)expect(events.isActive('a',r.key)).toBe(r.start<=x&&x<=r.end);
 }
});
