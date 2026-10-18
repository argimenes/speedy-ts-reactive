import {academicOperations} from '../../src/application-services/academic-contracts';
import {Router,json} from 'express';
import type {ApplicationServices,Operation} from '../../src/application-services/contracts';
import {operations} from '../../src/application-services/validation';
import {publicationOperations} from '../../src/application-services/publication-contracts';
/** Mounted only behind the Cavern lifecycle session gate. */
export function applicationServiceRouter(service:ApplicationServices,cavernId:string,publicationEnabled=false,academicEnabled=false){
 const router=Router();router.use(json({limit:'1mb'}));let requests=0;
 router.post('/:operation',async(req,res)=>{
  if(requests>=8){res.status(429).json({Success:false,Error:'Application service is busy'});return;}
  if(!(academicEnabled&&academicOperations.includes(req.params.operation as any))&&!operations.includes(req.params.operation as Operation)&&!(publicationEnabled&&publicationOperations.includes(req.params.operation as any))){res.status(404).json({Success:false,Error:'Unknown application operation'});return;}
  requests++;const c=new AbortController(),cancel=()=>{if(!res.writableEnded)c.abort();};res.once('close',cancel);
  try{
   const result:any=await service.call(req.params.operation as Operation,req.body,c.signal);if(c.signal.aborted)return;
   res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   if(result.bytes instanceof Uint8Array){const {bytes,...metadata}=result;res.set({'Content-Type':'application/octet-stream','X-Mutable-Result':JSON.stringify(metadata),'X-Mutable-Cavern-Id':cavernId});res.send(Buffer.from(bytes));}
   else res.json({Success:true,Data:result});
  }catch(error){if(!c.signal.aborted)res.status(409).json({Success:false,Error:error instanceof Error?error.message:'Application operation failed'});}
  finally{requests--;res.off('close',cancel);}
 });
 return router;
}
