export const STRUCTURED_BLOCK='mutable/structured-resource-block';
export const STRUCTURED_LIMITS={bytes:2*1024*1024,chars:200000,depth:48,nodes:20000,rows:2000,columns:100,cells:20000,mermaidChars:20000};
export const structuredExtensions=['json','yaml','yml','csv','tsv','js','mjs','cjs','jsx','ts','tsx','cs','py','java','go','c','h','cpp','cc','cxx','hpp','rs','sql','xml','css','toml','mmd','mermaid','jsonl','ndjson','jsonc','json5','ini'];
export type Presentation='json'|'yaml'|'csv'|'tsv'|'source'|'mermaid';
export function presentation(name:string):Presentation{const e=name.split('.').at(-1)?.toLowerCase();return e==='json'?'json':e==='yaml'||e==='yml'?'yaml':e==='csv'?'csv':e==='tsv'?'tsv':e==='mmd'||e==='mermaid'?'mermaid':'source';}
export function structuredPayload(value:any){return value?.structured?.version===1&&typeof value.structured.filename==='string'&&value.structured.filename.length<=255&&typeof value.text==='string'&&value.text.length<=400000&&['json','yaml','csv','tsv','source','mermaid'].includes(value.structured.presentation);}
export function mermaidSource(source:string){
 if(source.length>STRUCTURED_LIMITS.mermaidChars||source.split('\n').length>500)throw Error('Diagram limit: 20,000 characters / 500 lines.');
 if(/%%\s*\{|^\s*---|\b(?:click|href|image|img|icon)\b|<|https?:|data:|javascript:/im.test(source))throw Error('Diagram directives, HTML, links and external resources are disabled. Source is preserved.');
 return source;
}
