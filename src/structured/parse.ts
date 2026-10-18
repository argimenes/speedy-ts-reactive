import {parseDocument,visit,isAlias,isPair,isScalar} from 'yaml';
import Papa from 'papaparse';
import {STRUCTURED_LIMITS as L,type Presentation} from './model';
export type Tree={type:string;value?:string;entries?:Array<{key:string;node:Tree}>};
export type StructuredView={tree?:Tree;rows?:string[][];error?:string};
function tree(value:unknown,depth=0,budget={n:0}):Tree {
 if(depth>L.depth||++budget.n>L.nodes)throw Error('Tree exceeds the depth or node limit; use Source.');
 if(value===null)return {type:'null',value:'null'};
 if(typeof value!=='object')return {type:typeof value,value:String(value)};
 if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw Error('Unsupported YAML value; use Source.');
 return {type:Array.isArray(value)?'array':'object',entries:Object.entries(value).map(([key,v])=>({key,node:tree(v,depth+1,budget)}))};
}
export function parseStructured(source:string,format:Presentation):StructuredView{
 try{
  if(source.length>L.chars)throw Error('Structured preview exceeds 200,000 characters; use Source.');
  if(format==='json')return {tree:tree(JSON.parse(source))};
  if(format==='yaml'){
   const doc=parseDocument(source,{schema:'core',uniqueKeys:true,customTags:[]});
   if(doc.errors.length||doc.warnings.length)throw Error([...doc.errors,...doc.warnings].map(e=>e.message).join('\n').slice(0,1000));
   let count=0;visit(doc,(_key,node,path)=>{if(++count>L.nodes||path.length>L.depth)throw Error('YAML depth/node limit');if(isPair(node)&&node.key!==null&&!isScalar(node.key))throw Error('Complex YAML mapping keys require Source.');if(isAlias(node))throw Error('YAML aliases are not expanded; use Source.');});
   return {tree:tree(doc.toJS({maxAliasCount:0,mapAsMap:false}))};
  }
  if(format==='csv'||format==='tsv'){
   const result=Papa.parse<string[]>(source,{delimiter:format==='tsv'?'\t':',',dynamicTyping:false,skipEmptyLines:false,preview:L.rows+1});
   if(result.errors.length)throw Error(result.errors.map(e=>`Row ${e.row??'?'}: ${e.message}`).join('\n').slice(0,1000));
   const rows=result.data;if(rows.length>L.rows||rows.some(r=>r.length>L.columns)||rows.reduce((n,r)=>n+r.length,0)>L.cells)throw Error('Table limit: 2,000 rows, 100 columns or 20,000 cells. Use Source.');
   // Papa preserves field strings; a final record terminator isn't an extra data row.
   if(/[\r\n]$/.test(source)&&rows.at(-1)?.length===1&&rows.at(-1)?.[0]==='')rows.pop();return {rows};
  }
  return {};
 }catch(e){return {error:e instanceof Error?e.message:String(e)};}
}
