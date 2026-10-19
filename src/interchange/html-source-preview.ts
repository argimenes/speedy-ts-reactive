import { parseClipboardHtml, attribute, activeTags, type HtmlNode } from './html-ast';
import { safeUrl, LIMITS } from './fragment';
const escape = (s: string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const tags = new Set('p div span section article header footer main aside blockquote h1 h2 h3 h4 h5 h6 strong b em i u s del sup sub small code pre br hr wbr ul ol li dl dt dd table caption colgroup col thead tbody tfoot tr th td'.split(' '));
const colors = /^(?:#[a-f\d]{3,4}|#[a-f\d]{6}|#[a-f\d]{8}|black|white|red|green|blue|gray|grey|purple|orange|yellow|navy|teal|maroon|silver|transparent|currentcolor)$/i;
const length = (v:string,max:number) => v==='0'||/^(?:\d+(?:\.\d+)?|\.\d+)px$/.test(v)&&parseFloat(v)<=max;
/** Finite grammar: never hand untrusted CSS syntax to a browser parser. */
export function boundedCss(style:string) {
 const out:string[]=[];
 for(const declaration of style.slice(0,8192).split(';')) {
  const pair=declaration.split(':');if(pair.length!==2)continue;
  const key=pair[0].trim().toLowerCase(),value=pair[1].trim().toLowerCase();let valid=false;
  if(['color','background-color','border-color'].includes(key))valid=colors.test(value);
  else if(key==='font-weight')valid=/^(normal|bold|[1-9]00)$/.test(value);
  else if(key==='font-style')valid=/^(normal|italic|oblique)$/.test(value);
  else if(key==='font-size')valid=length(value,48)&&parseFloat(value)>=8;
  else if(key==='text-align')valid=/^(left|right|center|justify|start|end)$/.test(value);
  else if(key==='text-decoration')valid=/^(none|underline|line-through|overline)$/.test(value);
  else if(key==='white-space')valid=/^(normal|pre|pre-wrap|pre-line|break-spaces)$/.test(value);
  else if(/^(margin|padding)(-(top|right|bottom|left))?$/.test(key))valid=value.split(/\s+/).length<=4&&value.split(/\s+/).every(v=>length(v,48));
  else if(key==='border-width')valid=length(value,8);
  else if(key==='border-style')valid=/^(none|solid|dashed|dotted|double)$/.test(value);
  if(valid)out.push(`${key}:${value}`);
 }
 return out.join(';');
}
export const previewCsp = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; style-src 'unsafe-inline'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
export function compileHtmlPreview(source:string){return compilePreviewTree(parseClipboardHtml(source,false).tree);}
export function compilePreviewTree(tree:HtmlNode,initialWarnings:Iterable<string>=[]) {
 const warnings=new Set(initialWarnings),links=new Set<string>(),resources=new Set<string>();let count=0;
 function visit(n:HtmlNode,depth:number):string {
  if(++count>LIMITS.cells||depth>LIMITS.depth)throw Error('Preview is too complex.');
  if(n.nodeName==='#text')return escape(n.value??'');
  const tag=n.tagName;
  if(tag&&(activeTags.has(tag)||['base','link','meta','title','head'].includes(tag)||n.namespaceURI&&n.namespaceURI!=='http://www.w3.org/1999/xhtml')){warnings.add('Active or unsupported content was omitted from this preview.');return '';}
  if(tag==='img'){const url=attribute(n,'src');if(url)resources.add(url.slice(0,2048));warnings.add('Images remain inert placeholders; preview does not acquire external resources.');return `<span>[Image: ${escape(attribute(n,'alt')??'Image')}]</span>`;}
  const content=(n.childNodes??[]).map(c=>visit(c,depth+1)).join('');
  if(tag==='a'){warnings.add('Link navigation is disabled inside preview; safe links are listed separately.');const href=attribute(n,'href');if(href&&safeUrl(href)&&/^(https?:|mailto:)/i.test(href.trim()))links.add(href.trim());return `<span>${content}</span>`;}
  if(!tag)return content;
  if(!tags.has(tag)){warnings.add('Unsupported element wrappers were omitted from this preview.');return content;}
  const style=attribute(n,'style'),css=style?boundedCss(style):'';
  if(style&&css!==style)warnings.add('Styles outside the bounded preview policy were omitted.');
  if(n.attrs?.some(a=>!['style','title','lang','dir','start','value','colspan','rowspan'].includes(a.name)))warnings.add('Unsupported attributes were omitted from this preview.');
  let attrs=css?` style="${escape(css)}"`:'';
  for(const name of ['title','lang','dir']){const v=attribute(n,name);if(v&&v.length<=200&&(name!=='dir'||['ltr','rtl','auto'].includes(v)))attrs+=` ${name}="${escape(v)}"`;}
  for(const name of ['start','value','colspan','rowspan']){const v=attribute(n,name);if(v&&/^\d{1,4}$/.test(v)&&Number(v)<=1000)attrs+=` ${name}="${v}"`;}
  return `<${tag}${attrs}>${content}${['br','hr','wbr','col'].includes(tag)?'':`</${tag}>`}`;
 }
 const body=visit(tree,0);
 const srcdoc=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${previewCsp}"><style>body{margin:16px;font:16px/1.5 system-ui;overflow-wrap:anywhere;color:#222;background:white}pre{white-space:pre-wrap}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #bbb;padding:4px}blockquote{margin:12px;padding-left:12px;border-left:3px solid #bbb}</style></head><body>${body}</body></html>`;
 if(srcdoc.length>16*1024*1024)throw Error('Preview output is too large.');
 return {body,srcdoc,warnings:[...warnings],links:[...links].slice(0,100),resources:[...resources].slice(0,100)};
}
