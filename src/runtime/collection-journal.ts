import type {CollectionPlan} from '../interchange/collection/plan';
export interface CollectionJournal {plan:CollectionPlan;diagnostics?:string[];pending?:{source:string;generation:{resourceId:string;generation:string;native:string}};updated:number}
/** One explicit in-flight batch per Cavern. No startup replay or persistent file handles. */
export interface JournalStore {load(key:string):Promise<CollectionJournal|undefined>;save(key:string,journal:CollectionJournal):Promise<void>;remove(key:string):Promise<void>}
export class IndexedCollectionJournal implements JournalStore {
 private async transaction<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('mutable-collection-journals',1);r.onupgradeneeded=()=>r.result.createObjectStore('operations');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Collection journal is blocked. Close older tabs.'));});
  try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction('operations',mode),request=run(tx.objectStore('operations'));tx.oncomplete=()=>resolve(request.result);tx.onabort=tx.onerror=()=>reject(tx.error??request.error??Error('Collection journal write failed.'));});}finally{db.close();}
 }
 load(key:string){return this.transaction<CollectionJournal|undefined>('readonly',s=>s.get(key));}
 async save(key:string,value:CollectionJournal){if(new Blob([JSON.stringify(value)]).size>24*1024*1024)throw Error('Collection recovery journal exceeds its limit.');await this.transaction('readwrite',s=>s.put(structuredClone(value),key));}
 async remove(key:string){await this.transaction('readwrite',s=>s.delete(key));}
}
