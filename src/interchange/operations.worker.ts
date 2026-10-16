import { prepareInterchange, type InterchangeRequest } from './operations';
self.onmessage=async(event:MessageEvent<InterchangeRequest>)=>{
 try{self.postMessage({result:await prepareInterchange(event.data)});}
 catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
