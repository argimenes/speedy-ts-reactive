import {SavedFactsClient} from './saved-facts-client';
import {SqliteSavedFactsClient} from './sqlite-saved-facts-client';
import type {DocumentVaultLease} from './document-vault';
import type {DiscoveryRow,SavedProviderCoverage} from '../knowledge/contribution-state';
import type {ExtractionPolicy} from '../knowledge/policy';
/** One selected saved substrate per scope generation; never unions two copies. */
export class PreferredSavedFactsClient {
 private sql:SqliteSavedFactsClient;private file:SavedFactsClient;
 private selected?:'sqlite'|'file';private reason?:string;private invalid?:string;private ready=false;private serial=0;
 constructor(vault:DocumentVaultLease,bound:(id:string)=>boolean,private changed:()=>void){this.sql=new SqliteSavedFactsClient(vault,bound);this.file=new SavedFactsClient(vault,bound);}
 reset(){this.serial++;this.invalid=undefined;this.ready=false;this.sql.reset();this.file.reset();this.selected=undefined;this.reason=undefined;}
 get metrics(){return this.selected==='file'?this.file.metrics:this.sql.metrics;}
 failure(){return this.invalid??(this.selected==='file'?this.file.failure():this.sql.failure());}
 status():SavedProviderCoverage {
  if(this.selected==='file')return {provider:'file',state:this.invalid||!this.ready||this.file.failure()?'unknown':'verified',reason:this.reason};
  const status=this.sql.status();return {provider:'sqlite',state:!this.selected?'unknown':status.complete?'verified':status.state==='incomplete'?'incomplete':'unknown'};
 }
 private fallback(error:unknown,notify:boolean){this.sql.reset();this.ready=false;this.selected='file';this.reason='SQL saved coverage unavailable; independently verified file fallback. '+String(error).slice(0,240);if(notify)this.changed();}
 async prepare(policy:ExtractionPolicy,signal:AbortSignal){
  const serial=this.serial,check=()=>{signal.throwIfAborted();if(serial!==this.serial)throw Error('Saved provider superseded');};
  if(this.invalid)throw Error(this.invalid);
  if(!this.selected||this.selected==='sqlite'){try{await this.sql.prepare(policy,signal);await this.sql.current(signal);check();this.selected='sqlite';}catch(error){check();this.fallback(error,this.selected==='sqlite');}}
  if(this.selected==='file'){await this.file.prepare(policy,signal);check();this.ready=true;}
 }
 async read(row:DiscoveryRow,policy:ExtractionPolicy,signal:AbortSignal){
  const serial=this.serial;await this.prepare(policy,signal);
  if(this.selected==='file')return this.file.read(row,policy,signal);
  try{return await this.sql.read(row,policy,signal);}catch(error){signal.throwIfAborted();if(serial===this.serial)this.fallback(error,true);throw error;}
 }
 async current(signal:AbortSignal){
  const serial=this.serial;
  if(this.invalid)throw Error(this.invalid);
  if(this.selected==='file'){try{await this.file.current(signal);}catch(error){signal.throwIfAborted();if(serial===this.serial){this.invalid=String(error);this.ready=false;this.changed();}throw error;}return;}
  if(!this.selected)return;
  try{await this.sql.current(signal);}catch(error){signal.throwIfAborted();if(serial===this.serial)this.fallback(error,true);throw error;}
 }
}
