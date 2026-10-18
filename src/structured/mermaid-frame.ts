import mermaid from 'mermaid';
// A self-contained bundle executed only in an opaque sandbox with network denied.
const input=(window as any).structuredInput;
(async()=>{try{
 // The sandbox can execute before its first layout. Sequence diagrams measure SVG
 // text immediately. Offscreen frames throttle rAF, so finish document setup and
 // flush this isolated frame's layout without waiting for a visible animation.
 if(document.readyState==='loading')await new Promise<void>(resolve=>document.addEventListener('DOMContentLoaded',()=>resolve(),{once:true}));
 await document.fonts.ready;
 document.body.getBoundingClientRect();
 mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false,flowchart:{htmlLabels:false},maxTextSize:20000,maxEdges:500,suppressErrorRendering:true,secure:['securityLevel','startOnLoad','maxTextSize','maxEdges','htmlLabels','flowchart','secure'],theme:'neutral'});
 const {svg}=await mermaid.render('diagram',input.source);
 if(svg.length>2*1024*1024)throw Error('Diagram SVG size limit');
 const parsed=new DOMParser().parseFromString(svg,'image/svg+xml'),root=parsed.documentElement;
 if(root.tagName!=='svg'||root.querySelectorAll('*').length>10000)throw Error('Diagram complexity limit');
 for(const node of root.querySelectorAll('script,foreignObject,image,a,iframe,object,embed,animate,set'))node.remove();
 for(const node of [root,...root.querySelectorAll('*')])for(const a of [...node.attributes])if(/^on/i.test(a.name)||/href$/i.test(a.name)&&!a.value.startsWith('#'))node.removeAttribute(a.name);
 document.body.replaceChildren(document.importNode(root,true));parent.postMessage({token:input.token,ok:true},'*');
 }catch(e){document.body.textContent='Diagram unavailable';parent.postMessage({token:input.token,error:String(e).slice(0,1000)},'*');}})();
