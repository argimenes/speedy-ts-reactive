import {EditorView,lineNumbers,highlightActiveLineGutter} from '@codemirror/view';
import {EditorState} from '@codemirror/state';
import {syntaxHighlighting,defaultHighlightStyle} from '@codemirror/language';
import {languages} from '@codemirror/language-data';
export const sourceLanguages=['Plain text','JavaScript','JSX','TypeScript','TSX','Python','C#','Java','Go','C','C++','Rust','SQL','JSON','YAML','XML','HTML','CSS','Markdown','TOML'];
export function languageFor(filename:string){const ext=filename.split('.').at(-1)?.toLowerCase();return languages.find(l=>sourceLanguages.includes(l.name)&&l.extensions.includes(ext??''))?.name??'Plain text';}
export async function sourceView(host:HTMLElement,text:string,language:string,wrap:boolean,signal:AbortSignal){
 const longLine=text.split(/\r\n?|\n/).some(l=>l.length>10000);const support=!longLine&&languages.find(l=>l.name===language);
 const lang=support?await support.load():undefined;signal.throwIfAborted();
 const view=new EditorView({parent:host,state:EditorState.create({doc:text,extensions:[EditorState.readOnly.of(true),EditorView.editable.of(false),lineNumbers(),highlightActiveLineGutter(),syntaxHighlighting(defaultHighlightStyle),...(lang?[lang]:[]),...(wrap&&!longLine?[EditorView.lineWrapping]:[]),EditorView.theme({'&':{fontSize:'13px',height:'400px'},'.cm-scroller':{overflow:'auto',fontFamily:'ui-monospace, monospace'},'.cm-content':{padding:'8px 0'}})]})});
 let alive=true;const dispose=()=>{if(!alive)return;alive=false;view.destroy();};signal.addEventListener('abort',dispose,{once:true});return {dispose:()=>{signal.removeEventListener('abort',dispose);dispose();},notice:longLine?'Very long lines: highlighting and wrapping disabled. Original remains unchanged.':''};
}
