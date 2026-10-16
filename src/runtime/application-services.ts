import type {ApplicationServices,Operation,OperationMap} from '../application-services/contracts';
/** Explicit client only; no subscriptions, polling, editor ownership or startup I/O. */
export class HttpApplicationServices implements ApplicationServices {
 constructor(private context:()=>{cavernId:string;session:string},private request:typeof fetch=(input,init)=>fetch(input,init)){}
 async call<K extends Operation>(operation:K,input:OperationMap[K]['input'],signal?:AbortSignal):Promise<OperationMap[K]['output']>{
  const scope=this.context();
  const r=await this.request(`/api/services/${operation}`,{method:'POST',signal,headers:{'Content-Type':'application/json','X-Mutable-Cavern':scope.session},body:JSON.stringify(input)});
  let result:unknown;
  if(r.ok&&r.headers.get('Content-Type')?.startsWith('application/octet-stream')){
   if(r.headers.get('X-Mutable-Cavern-Id')!==scope.cavernId)throw Error('Cavern response mismatch');
   result={...JSON.parse(r.headers.get('X-Mutable-Result')??'{}'),bytes:new Uint8Array(await r.arrayBuffer())};
  }else{const response=await r.json();if(!r.ok||!response.Success)throw Error(response.Error??'Application service unavailable');result=response.Data;}
  const current=this.context();if(scope.session!==current.session||scope.cavernId!==current.cavernId)throw Error('Cavern changed; discard service result');
  signal?.throwIfAborted();return result as OperationMap[K]['output'];
 }
}
