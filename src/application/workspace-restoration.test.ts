import { expect,it } from 'vitest';
import { RestorationQueue } from './workspace-restoration';
it('bounds reads, cancels queued work and prevents late results from disposed sessions',async()=>{
 const queue=new RestorationQueue(2),controllers=Array.from({length:4},()=>new AbortController());
 let started=0;const finish:Array<()=>void>=[];
 const requests=controllers.map(c=>queue.run(async()=>{started++;await new Promise<void>(r=>finish.push(r));return started;},c.signal));
 const results=Promise.allSettled(requests);await Promise.resolve();expect(started).toBe(2);
 controllers[2].abort();finish[0]();await new Promise(r=>setTimeout(r,0));expect(started).toBe(3);
 queue.dispose();finish[1]();finish[2]();const settled=await results;
 expect(settled.map(r=>r.status)).toEqual(['fulfilled','rejected','rejected','rejected']);
});
