/** Search inputs are public projections only, never native documents or knowledge rows. */
export const SEARCH_LIMITS={bytes:32*1024*1024,shard:1024*1024,cache:4*1024*1024,query:256,terms:16,results:100};
export interface SearchEntry {route:string;title:string;text:string;terms:Record<string,number>}
export function words(text:string){return text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu)??[];}
export function searchEntry(route:string,title:string,text:string,headings:string[]=[]):SearchEntry {
 const terms:Record<string,number>=Object.create(null);
 for(const [content,weight]of [[text,1],[headings.join(' '),4],[title,8]] as const)for(const word of words(content))terms[word]=Math.min(100,(terms[word]??0)+weight);
 const entry={route,title,text,terms};if(new TextEncoder().encode(JSON.stringify([entry])).length>SEARCH_LIMITS.shard)throw Error('Public search contribution exceeds 1 MiB; disable search or narrow document');return entry;
}
/** Emits at most one 1 MiB shard at a time; there is no whole-site text buffer. */
export class SearchShards {
 private entries:SearchEntry[]=[];private size=2;private total=0;readonly shards:Array<{path:string;bytes:number}>=[];
 constructor(private emit:(path:string,text:string)=>Promise<void>){}
 async add(entry:SearchEntry){const size=new TextEncoder().encode(JSON.stringify(entry)).length+1;if(size+2>SEARCH_LIMITS.shard)throw Error('Search contribution exceeds shard limit');if(this.size+size>SEARCH_LIMITS.shard)await this.flush();this.entries.push(entry);this.size+=size;}
 async flush(){if(!this.entries.length)return;const text=JSON.stringify(this.entries),size=new TextEncoder().encode(text).length;this.total+=size;if(this.total>SEARCH_LIMITS.bytes)throw Error('Search index exceeds 32 MiB; narrow scope or disable search');const path=`search/shard-${String(this.shards.length).padStart(4,'0')}.json`;await this.emit(path,text);this.shards.push({path,bytes:size});this.entries=[];this.size=2;}
}
