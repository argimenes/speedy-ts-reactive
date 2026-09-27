// Turn the CDP capture into a self-contained replay and selected stills.
import { readFile, writeFile, rm } from 'node:fs/promises';
const root='artifacts/spatial-b/';
const frames=JSON.parse(await readFile(root+'sequence.json','utf8')).sort((a,b)=>a.timestamp-b.timestamp);
const start=frames[0].timestamp;
const data=frames.map(f=>({ms:Math.round((f.timestamp-start)*1000),src:'data:image/jpeg;base64,'+f.data}));
await writeFile(root+'sequence.html',`<!doctype html><meta charset="utf-8"><title>Spatial B — recorded handoff</title>
<style>body{margin:0;background:#111824;color:#eee;font:15px system-ui}header{padding:14px;display:flex;gap:18px;align-items:center}button,select{padding:7px}input{flex:1}img{display:block;width:100%;height:auto}p{margin:14px;color:#bbb}</style>
<header><button id="play">Replay</button><label>Speed <select id="speed"><option value="1">Recorded timing</option><option value=".25">Quarter speed</option></select></label><input id="seek" aria-label="Captured frame" type="range" min="0" max="${data.length-1}" value="0"><output id="time"></output></header>
<img id="frame" alt="Recorded study activation and return"><p>Chrome CDP capture, including actual mounting and capture delays. Drag to inspect individual frames. This is visual evidence, not a frame-rate benchmark.</p>
<script>const frames=${JSON.stringify(data)};let generation=0;const image=document.getElementById('frame'),seek=document.getElementById('seek'),time=document.getElementById('time');function show(i){image.src=frames[i].src;seek.value=i;time.textContent=frames[i].ms+' ms · '+(i+1)+' / '+frames.length}seek.oninput=()=>{generation++;show(+seek.value)};document.getElementById('play').onclick=()=>{const token=++generation,start=performance.now(),speed=+document.getElementById('speed').value;function tick(now){if(token!==generation)return;const ms=(now-start)*speed;let i=frames.findIndex(f=>f.ms>ms);i=i<0?frames.length-1:Math.max(0,i-1);show(i);if(ms<frames.at(-1).ms)requestAnimationFrame(tick)}requestAnimationFrame(tick)};show(0);</script>`);
for(const [name,ms] of [['02-lift',120],['03-approach',290],['05-return',1100]]) {
 const f=frames.reduce((a,b)=>Math.abs((a.timestamp-start)*1000-ms)<Math.abs((b.timestamp-start)*1000-ms)?a:b);
 await writeFile(root+name+'.jpg',Buffer.from(f.data,'base64'));
 await rm(root+name+'.png',{force:true});
}
await writeFile(root+'index.html',`<!doctype html><meta charset="utf-8"><title>Spatial B review</title>
<style>body{max-width:1250px;margin:30px auto;padding:0 20px;background:#121925;color:#e9e3d7;font:16px/1.5 system-ui}h1,h2{font-family:Georgia,serif;font-weight:400}a{color:#d9bb81}iframe{width:100%;height:970px;border:1px solid #687080}section{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}img{width:100%;height:auto}figcaption{margin:8px 0 18px;color:#c5c2b8}@media(max-width:800px){section{grid-template-columns:1fr}iframe{height:650px}}</style>
<h1>Spatial B — physical page to ordinary Codex</h1><p>The accepted A study is unchanged. The page lifts, turns, approaches and broadens into a comfortable editing rectangle; a short crossfade introduces the live Document Window. Return reverses the path to the saved physical placement.</p>
<p><a href="../../CODEX_SPATIAL_MILESTONE_B_REPORT.md">Implementation report</a> · <a href="browser-results.json">Browser results</a> · <a href="sequence.html">Open replay separately</a></p>
<iframe title="Recorded activation and return with playback and frame scrubber" src="sequence.html"></iframe>
<h2>Captured views</h2><section>${[['01-desk.png','Physical A4-like page on the desk'],['02-lift.jpg','Initial lift'],['03-approach.jpg','Approach and expansion (captured frame)'],['04-editing.png','Ordinary, untransformed live Codex Window'],['05-return.jpg','Reverse pickup (captured frame)'],['06-desk-restored.png','Desk restored to the unchanged placement']].map(([file,label])=>`<figure><a href="${file}"><img src="${file}" alt="${label}"></a><figcaption>${label}</figcaption></figure>`).join('')}</section>
<h2>Try it</h2><p>Run Vite with <code>VITE_SPATIAL_WORKSPACE=1</code>. Open an existing Document, choose Workspace → Presentations → Create Spatial, select its page and choose Read Document (or double-click it). Type, select text, open Entity tools, toggle Compact, then Return to desk. With reduced motion enabled the transition is immediate.</p><p>The proxy remains a schematic manuscript preview. The animation bridges physical page proportions and the larger live editing surface; saved placements are never enlarged.</p>`);
console.log(`Wrote Spatial B gallery with ${frames.length} recorded frames.`);
