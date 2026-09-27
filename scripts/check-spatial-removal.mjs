// Physically remove Spatial in an isolated copy; retain real Desktop and Canvas.
import { cp, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root=process.cwd(), target=await mkdtemp(path.join(tmpdir(),'codex-no-spatial-'));
const edit=async(file,fn)=>{const p=path.join(target,file);await writeFile(p,fn(await readFile(p,'utf8')));};
try {
 for(const name of ['src','server','scripts','public','package.json','package-lock.json','index.html','vite.config.ts','vite.config.js','tsconfig.json','tsconfig.reactive.json','tsconfig.server.json'])await cp(path.join(root,name),path.join(target,name),{recursive:true});
 await symlink(path.join(root,'node_modules'),path.join(target,'node_modules'),'dir');
 const strip=async dir=>{for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await strip(p);else if(/\.test\.[tj]sx?$/.test(e.name))await rm(p);}};
 await strip(path.join(target,'src'));await strip(path.join(target,'server'));
 await rm(path.join(target,'src/features/spatial'),{recursive:true});await rm(path.join(target,'src/application/spatial-actions.ts'));await rm(path.join(target,'src/application/spatial-document-preview.ts'));
 await edit('src/application/workspace-session.ts',s=>s.split('\n').filter(l=>!l.includes('import { createSpatialActions')&&!l.includes('readonly spatial?')&&!l.includes('this.spatial = createSpatialActions')&&!l.includes('this.spatial?.create()')).join('\n').replace('spatial: this.editor.features.spatialWorkspace ? { supports: supportsSpatial } : undefined','spatial: undefined'));
 await edit('src/application/workspace-open.ts',s=>{
  s=s.split('\n').filter(l=>!l.includes('const spatial =')&&!l.includes('const spatialCommit =')&&!l.includes('spatialCommit?.()')).join('\n').replace('const banked = !!canvas || spatial;','const banked = !!canvas;');
  const a=s.indexOf('    if (presentation.active() === "spatial") {'),b=s.indexOf('    } else if (presentation.active() === "canvas") {',a);
  if(a<0||b<0)throw new Error('Spatial reveal assembly changed; update removal patch.');
  return s.slice(0,a)+'    if (presentation.active() === "canvas") {'+s.slice(b+'    } else if (presentation.active() === "canvas") {'.length);
 });
 await edit('src/application/workspace-presentation-view.tsx',s=>{
  s=s.split('\n').filter(l=>!l.includes('const SpatialView = lazy')).join('\n');
  const start=s.indexOf('  const [spatialResize'),end=s.indexOf('  return <ReactiveViewProvider',start);
  if(start<0||end<0)throw new Error('Spatial host assembly changed; update removal patch.');
  s=s.slice(0,start)+s.slice(end);
  s=s.replace(' : presentation.active() === \"spatial\" ? spatialGeometry(key) : undefined', ' : undefined');
  const a=s.indexOf('fallback={<Show when={presentation.active() === "spatial"'),b=s.indexOf('</Show>}>',a);
  if(a<0||b<0)throw new Error('Spatial view assembly changed; update removal patch.');
  return s.slice(0,a)+'fallback={<BlockOutlet nodeKey={projection.state.rootKey} />}> '+s.slice(b+'</Show>}>'.length);
 });
 await edit('package.json',s=>{const p=JSON.parse(s);delete p.dependencies.three;delete p.devDependencies['@types/three'];return JSON.stringify(p,null,2);});
 await writeFile(path.join(target,'src/application/spatial-removal.test.tsx'),`// @vitest-environment jsdom
import { expect,it,vi } from 'vitest';
import { render } from 'solid-js/web';
import { WorkspaceSession } from './workspace-session';
import { workspaceOpen } from './workspace-open';
import { materializeLocalWorkspace } from '../reactive-editor/workspace-manifest';
import { WorkspacePresentationView } from './workspace-presentation-view';
it('physically absent Spatial preserves its data while Desktop/Canvas edit and open content',async()=>{
 const spatial={version:1,environment:{preset:'night-study-v1'},camera:{kind:'perspective',yaw:0,approach:0},placements:[],future:{a:[1,2]}};
 const envelope={version:1,active:'spatial',objects:[],presentations:{desktop:{version:1,kind:'legacy-tree'},spatial}};
 const s=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',metadata:{workspacePresentation:envelope},children:[{id:'w',type:'document-window-block',children:[{id:'doc',type:'document-block',children:[{id:'text',type:'plain-text-block',text:'Before'}]}]}]}),{features:{canvasWorkspace:true,spatialWorkspace:true}});
 const host=document.body.appendChild(document.createElement('main'));const dispose=render(()=><WorkspacePresentationView session={s}/>,host);s.editor.installGateway(document);
 try {
 expect(s.presentation.active()).toBe('desktop');expect(s.presentation.issue()).toContain('preserved');expect(host.querySelector('canvas')).toBeNull();
 const input=host.querySelector('textarea')!;input.focus();input.value='Desktop edit';input.dispatchEvent(new Event('input',{bubbles:true}));
 expect((s.editor.persistence.captureWorkspace().document.metadata as any).workspacePresentation).toEqual(envelope);
 expect(s.selectPresentation('canvas')).toBe(true);const canvas=host.querySelector('textarea')!;canvas.focus();canvas.value='Canvas edit';canvas.dispatchEvent(new Event('input',{bubbles:true}));
 workspaceOpen(s).newDocument();expect(s.canvasRoots()).toHaveLength(2);
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({Success:true,Data:{document:{id:'server-doc',type:'document-block',children:[{type:'plain-text-block',text:'Server content'}]}}})));
 await workspaceOpen(s).serverDocument({folder:'.',filename:'FromServer.json'},new AbortController().signal);expect(s.canvasRoots()).toHaveLength(3);
 const saved=s.editor.persistence.captureWorkspace().document;expect((saved.metadata as any).workspacePresentation.presentations.spatial).toEqual(spatial);
 expect(Object.values(s.editor.repository.state.contents).find(c=>c.payload.id==='text')?.payload.text).toBe('Canvas edit');
 const reloaded=new WorkspaceSession(materializeLocalWorkspace(saved),{features:{canvasWorkspace:true}});expect(reloaded.editor.persistence.captureWorkspace().document).toEqual(saved);reloaded.dispose();
 }finally{vi.unstubAllGlobals();dispose();s.dispose();host.remove();}
});`);
 for(const args of [['run','typecheck'],['test','--','--maxWorkers=1','--minWorkers=1','src/application/spatial-removal.test.tsx'],['run','build']]) {
  const r=spawnSync('npm',args,{cwd:target,encoding:'utf8',env:{...process.env,VITE_SPATIAL_WORKSPACE:'0'}});process.stdout.write(r.stdout);process.stderr.write(r.stderr);if(r.status!==0)throw new Error(`Removal check failed: npm ${args.join(' ')}`);
 }
 console.log('Physical Spatial removal passed; Desktop/Canvas and unknown Spatial data preserved.');
}finally{await rm(target,{recursive:true,force:true});}
