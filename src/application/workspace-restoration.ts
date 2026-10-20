/** Bounded read-only application restoration. No durable data or automatic retry.
 * Waiting and active requests share the caller's cancellation signal. */
export class RestorationQueue {
  private active=0;
  private waiting:Array<{start:()=>void;cancel:()=>void}>=[];
  private controllers=new Set<AbortController>();
  private disposed=false;
  constructor(private readonly limit=4){}
  run<T>(work:(signal:AbortSignal)=>Promise<T>,signal:AbortSignal):Promise<T>{
    if(this.disposed||signal.aborted)return Promise.reject(new DOMException('Restoration canceled','AbortError'));
    return new Promise<T>((resolve,reject)=>{
      const controller=new AbortController();this.controllers.add(controller);
      let started=false,settled=false;
      const finish=()=>{signal.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',aborted);this.controllers.delete(controller);};
      const aborted=()=>{if(!started&&!settled){settled=true;this.waiting=this.waiting.filter(item=>item!==entry);finish();reject(new DOMException('Restoration canceled','AbortError'));}};
      const cancel=()=>controller.abort();
      const entry={cancel,start:()=>{if(settled||controller.signal.aborted)return;started=true;this.active++;
        Promise.resolve().then(()=>work(controller.signal)).then(value=>{controller.signal.throwIfAborted();resolve(value);},reject).catch(reject).finally(()=>{settled=true;finish();this.active--;this.drain();});
      }};
      signal.addEventListener('abort',cancel,{once:true});controller.signal.addEventListener('abort',aborted,{once:true});this.waiting.push(entry);this.drain();
    });
  }
  private drain(){while(!this.disposed&&this.active<this.limit&&this.waiting.length)this.waiting.shift()!.start();}
  dispose(){this.disposed=true;for(const controller of this.controllers)controller.abort();this.waiting=[];}
}
