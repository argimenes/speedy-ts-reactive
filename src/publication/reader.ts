/** Bounded, authored publication options. No arbitrary CSS, HTML, fonts or scripts. */
import {object} from '../application-services/validation';
export interface ThemeOptions {name:'reader'|'compact';font:'serif'|'sans';colour:'paper'|'slate'|'high-contrast';scheme:'light'|'dark'|'auto';size:16|18|20|22;width:60|72|84;spacing:1.4|1.6|1.8}
export interface SemanticSelection {key:string;fields:Array<'description'|'aliases'|'statement'|'expression'>}
export type ResearchSource={kind:'live'}|{kind:'frozen';blocks:Array<{resourceId:string;blockId:string}>};
export interface ResearchOptions {source:ResearchSource;fingerprint:string;selections:SemanticSelection[]}
export interface ReaderOptions {preset:'reading'|'static'|'research';theme:ThemeOptions;search:boolean;popovers:boolean;research?:ResearchOptions}
export const defaultReader=():ReaderOptions=>({preset:'reading',theme:{name:'reader',font:'serif',colour:'paper',scheme:'auto',size:18,width:72,spacing:1.6},search:true,popovers:false});
export function validateResearchSource(v:unknown):asserts v is ResearchSource {
 object(v,['kind','blocks']);if(v.kind==='live'){if(v.blocks!==undefined)throw Error('Live context cannot select frozen Blocks');return;}
 if(v.kind!=='frozen'||!Array.isArray(v.blocks)||v.blocks.length>1000)throw Error('Choose a semantic context');const ids=new Set();
 for(const b of v.blocks){object(b,['resourceId','blockId']);if([b.resourceId,b.blockId].some(x=>typeof x!=='string'||!x||x.length>1024)||ids.has(b.resourceId))throw Error('Select one frozen context per document');ids.add(b.resourceId);}
}
export function validateSelections(v:unknown):asserts v is SemanticSelection[]{
 if(!Array.isArray(v)||v.length>500)throw Error('At most 500 reviewed semantic targets');const keys=new Set();
 for(const s of v){object(s,['key','fields']);if(typeof s.key!=='string'||!/^e-[a-f0-9]{32}$/.test(s.key)||keys.has(s.key)||!Array.isArray(s.fields)||s.fields.length>4||new Set(s.fields).size!==s.fields.length||s.fields.some(f=>!['description','aliases','statement','expression'].includes(f)))throw Error('Invalid semantic disclosure selection');keys.add(s.key);}
}
export function validateReader(v:unknown):asserts v is ReaderOptions {
 object(v,['preset','theme','search','popovers','research']);if(!['reading','static','research'].includes(v.preset)||typeof v.search!=='boolean'||typeof v.popovers!=='boolean')throw Error('Invalid reader options');
 object(v.theme,['name','font','colour','scheme','size','width','spacing']);const t=v.theme;
 if(!['reader','compact'].includes(t.name)||!['serif','sans'].includes(t.font)||!['paper','slate','high-contrast'].includes(t.colour)||!['light','dark','auto'].includes(t.scheme)||![16,18,20,22].includes(t.size)||![60,72,84].includes(t.width)||![1.4,1.6,1.8].includes(t.spacing))throw Error('Invalid bounded theme settings');
 if(v.preset==='static'&&(v.search||v.popovers)||v.preset!=='research'&&(v.research!==undefined||v.popovers))throw Error('Profile does not permit these interactions');
 if(v.research!==undefined){object(v.research,['source','fingerprint','selections']);validateResearchSource(v.research.source);validateSelections(v.research.selections);if(typeof v.research.fingerprint!=='string'||! /^[a-f0-9]{64}$/.test(v.research.fingerprint))throw Error('Review semantic candidates before saving Research settings');}
 if(v.preset==='research'&&!v.research)throw Error('Research requires an explicit context and field review');
}
export const interactive=(r?:ReaderOptions)=>!!r&&(r.search||r.preset==='research'&&r.popovers);
export function themeCss(t:ThemeOptions){
 const palette={paper:['#faf8f2','#25251f','#234f86','#767267'],slate:['#f5f7fa','#202b38','#184f87','#667383'],'high-contrast':['#ffffff','#000000','#0031a6','#777777']}[t.colour];
 const light=`--paper:${palette[0]};--ink:${palette[1]};--link:${palette[2]};--line:${palette[3]};color-scheme:light`,dark='--paper:#171b22;--ink:#f0f2f5;--link:#a8ceff;--line:#8993a3;color-scheme:dark';
 return `:root{${t.scheme==='dark'?dark:light};font-family:${t.font==='serif'?'Georgia,"Times New Roman",serif':'system-ui,sans-serif'};font-size:${t.size}px;line-height:${t.spacing}}${t.scheme==='auto'?`@media(prefers-color-scheme:dark){:root{${dark}}}`:''}
 *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);padding:${t.name==='compact'?'16px':'clamp(16px,4vw,40px)'}}main{max-width:${t.width}ch;margin:auto;overflow-wrap:anywhere}p{margin-block:${t.name==='compact'?'.6em':'1em'}}a{color:var(--link)}img{max-width:100%;height:auto}table{border-collapse:collapse;display:block;max-width:100%;overflow:auto}td,th{border:1px solid var(--line);padding:.4em}pre{white-space:pre-wrap;overflow-wrap:anywhere}nav{font-family:system-ui,sans-serif;font-size:.9rem;margin-block:1rem}h1,h2,h3{line-height:1.25}button,input,select{font:inherit;color:inherit;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:.35em .6em}button{cursor:pointer}a:focus-visible,button:focus-visible,input:focus-visible,[tabindex]:focus-visible{outline:3px solid var(--link);outline-offset:3px}.reader-results li{margin-block:1em}.reader-results p{font-size:.9em}.reader-preview{font-size:.75em;margin-inline:.4em}.reader-popover{position:fixed;inset:auto 1rem 1rem;max-height:50vh;overflow:auto;background:var(--paper);border:2px solid var(--line);padding:1rem;box-shadow:0 4px 16px #0004;z-index:1}.reader-popover p{white-space:pre-wrap}.reader-popover[hidden]{display:none}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}@media print{button,.reader-popover,[data-reader-search]{display:none}body{background:white;color:black}}`;
}
