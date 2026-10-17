import {createServer,type Server} from 'node:http';
import {randomUUID} from 'node:crypto';
import type {PublicationStorage} from '../../src/application-services/publication-ports';
import {PUBLICATION_CSP} from '../../src/publication/policy';
/** No app routes/cookies, filesystem mount, directory listing or privileged bridge. */
export class PublicationPreview {
 private server?:Server;private starting?:Promise<void>;private closed=false;private port=0;private grants=new Map<string,{site:string;release:string;route:string;expires:number}>();
 constructor(private storage:PublicationStorage){}
 async open(site:string,release:string){
  if(this.closed)throw Error('Preview host closed');
  const files=await this.storage.release(site,release);if(this.closed)throw Error('Preview host closed');
  const route=(files.find(f=>f.mediaType==='text/html'&&!f.unit)??files.find(f=>f.mediaType==='text/html'))?.path;if(!route)throw Error('Release has no page');
  for(const [key,g] of this.grants)if(g.expires<Date.now())this.grants.delete(key);
  if(this.grants.size>=16)throw Error('Close another preview before opening more');
  if(!this.server){this.server=createServer((req,res)=>{void(async()=>{
   res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',`${PUBLICATION_CSP}; frame-ancestors 'none'`);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
   if(req.headers.host!==`127.0.0.1:${this.port}`||!['GET','HEAD'].includes(req.method??'')||req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${this.port}`){res.writeHead(403).end();return;}
   const match=/^\/([a-f0-9-]{36})\/([^?%\\]+)$/.exec(req.url??''),grant=match&&this.grants.get(match[1]);
   if(!grant||grant.expires<Date.now()){res.writeHead(404).end();return;}
   const files=await this.storage.release(grant.site,grant.release),file=files.find(f=>f.path===match[2]);if(!file){res.writeHead(404).end();return;}
   const b=await this.storage.file(grant.site,grant.release,file);res.setHeader('Content-Type',file.mediaType);res.setHeader('Content-Length',b.length);res.writeHead(200).end(req.method==='HEAD'?undefined:Buffer.from(b));
  })().catch(()=>{if(!res.headersSent)res.writeHead(404);res.end();});});
   this.starting=new Promise<void>((resolve,reject)=>{this.server!.once('error',reject);this.server!.listen(0,'127.0.0.1',()=>{this.port=(this.server!.address() as any).port;resolve();});});
  }
  await this.starting;
  if(this.closed)throw Error('Preview host closed');
  const grant=randomUUID();this.grants.set(grant,{site,release,route,expires:Date.now()+15*60*1000});return {url:`http://127.0.0.1:${this.port}/${grant}/${route}`,grant};
 }
 revoke(grant:string){this.grants.delete(grant);}
 async close(){this.closed=true;this.grants.clear();await this.starting?.catch(()=>{});if(this.server){this.server.closeAllConnections();await new Promise<void>(resolve=>this.server!.close(()=>resolve()));this.server=undefined;}}
}
