import {decodeDocument} from '../../block-tree/codecs';
import {captureNative,nativeText} from '../../persistence/native-resource';
const sentence='Leonardo studied light, mountains and water. A🧭B é 漢字: observations become connected research notes. ';
const text=sentence.repeat(3); // ~280 native Cells per paragraph, not empty metadata shells
const dto={id:'@self@-root',type:'document-block',metadata:{documentId:'@self@',title:'Research @self@',tags:['research','topic-@topic@']},
 linkedAnnotations:{'@self@-linked':{id:'@self@-linked',type:'codex/entity-reference',value:'entity-@entity@',metadata:{entityName:'Leonardo'},attributes:{}}},
 children:Array.from({length:4},(_,p)=>({id:`@self@-p${p}`,type:'standoff-editor-block',text,standoffProperties:[
  {id:`@self@-bold${p}`,type:'style/bold',start:0,end:7},
  {id:`@self@-italic${p}`,type:'style/italics',start:3,end:14},
  {id:`@self@-link${p}`,type:'codex/block-reference',value:(p%2?'@skip@':'@next@')+'-root',metadata:{documentId:p%2?'@skip@':'@next@'},start:9,end:15},
  ...(p<2?[{id:`@self@-segment${p}`,annotationId:'@self@-linked',start:0,end:7}]:[{id:`@self@-entity${p}`,type:'codex/entity-reference',value:'entity-@entity@',start:0,end:7}]),
 ],...(p===0?{relation:{leftMargin:{id:'@self@-margin',type:'left-margin-block',children:[{id:'@self@-margin-text',type:'standoff-editor-block',text:'A margin observation.',standoffProperties:[{id:'@self@-rainbow',type:'style/rainbow',start:2,end:7}]}]}}}:{})})),
 futureFeature:{undefinedValue:undefined,notFinite:NaN,nested:{keep:true}}};
const template=nativeText(captureNative(decodeDocument(dto).state,'@self@'));
export function fixtureText(i:number,count:number){return template.replaceAll('@self@',`resource-${i}`).replaceAll('@next@',`resource-${(i+1)%count}`).replaceAll('@skip@',`resource-${(i+7)%count}`).replaceAll('@entity@',String(i%50)).replaceAll('@topic@',String(i%20));}
export const fixtureStats={paragraphs:4,charactersPerParagraph:[...text].length,logicalMentions:7,documentReferences:4,entityMentions:3,annotationSegments:17,blocks:7};
