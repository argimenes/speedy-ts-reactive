import type {PublicFile,PublicationProfile} from '../application-services/publication-contracts';
import {PUBLICATION_VERSION} from './policy';
/** Stable dependency serialization, independent of object insertion order and transport. */
export function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(v=>canonical(v??null)).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>(value as any)[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical((value as any)[k])).join(',')+'}';
 return JSON.stringify(value);
}
export function projectionPolicy(profile:PublicationProfile){
 const {reader,...base}=profile;
 // Theme tokens affect only reader.css. Templates/semantics/search remain dependencies.
 return {...base,...reader?{reader:{...reader,theme:undefined}}:{},generator:PUBLICATION_VERSION,tokenizer:'nfkc-unicode-word-v1'};
}
/** Serving/export identity must not depend on private staging-unit locations. */
export const publicManifest=(files:PublicFile[])=>files.map(({path,hash,size,mediaType,entry})=>({path,hash,size,mediaType,...entry?{entry}:{} })).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
