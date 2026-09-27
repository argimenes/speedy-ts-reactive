// Physically exclude Canvas in an isolated copy. Never mutates the working tree.
import { cp, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = process.cwd(), target = await mkdtemp(path.join(tmpdir(), 'codex-no-canvas-'));
const edit = async (file, transform) => { const p = path.join(target, file); await writeFile(p, transform(await readFile(p, 'utf8'))); };
try {
  for (const name of ['src','server','scripts','public','package.json','package-lock.json','index.html','vite.config.ts','vite.config.js','tsconfig.json','tsconfig.reactive.json','tsconfig.server.json']) {
    await cp(path.join(root,name),path.join(target,name),{recursive:true});
  }
  await symlink(path.join(root,'node_modules'),path.join(target,'node_modules'),'dir');
  // Feature-dependent tests are not the removal build's entry points.
  const stripTests = async dir => { for (const e of await readdir(dir,{withFileTypes:true})) { const p=path.join(dir,e.name); if(e.isDirectory())await stripTests(p); else if(/\.test\.[tj]sx?$/.test(e.name))await rm(p); } };
  await stripTests(path.join(target,'src'));await stripTests(path.join(target,'server'));
  for(const name of ['src/features/canvas','src/features/canvas-counter','src/application/canvas-actions.ts','src/application/canvas-derivation.ts','src/application/desktop-derivation.ts','src/application/workspace-presentation-view.tsx','src/application/workspace-presentation.css','src/demo/workspace-presentations.tsx']) await rm(path.join(target,name),{recursive:true});
  // Static assembly changes only: install Desktop, no fake Canvas implementation.
  await edit('src/application/features.ts',s=>s.split('\n').filter(l=>!l.includes('CanvasCounter')).join('\n'));
  await edit('src/application/workspace-session.ts',s=>{
    s=s.replace('import { deriveCanvas } from "./canvas-derivation";','');
    s=s.replace('import { deriveDesktop } from "./desktop-derivation";','');
    s=s.split('\n').filter(l=>!l.includes('register({ id: "workspace.presentation.createDesktop"')).join('\n');
    s=s.replace('new ReactiveEditor(loaded, configuration)','new ReactiveEditor(loaded, { ...configuration, features: { ...configuration.features, canvasWorkspace: false } })');
    s=s.slice(0,s.indexOf('  private readonly closedMedia'))+s.slice(s.indexOf('  private interaction?:'));
    const start=s.indexOf('  canCreateDesktop()');const end=s.indexOf('  ownPresentationInteraction(',start);
    s=s.slice(0,start)+'  selectPresentation(_name: "desktop" | "canvas") { return false; }\n  private changePresentation(_name: "desktop" | "canvas", _deriveDesktop: boolean) { return false; }\n\n'+s.slice(end);
    const a=s.indexOf('  /** Resolve roots before mounting.');const b=s.indexOf('  dirty()',a);s=s.slice(0,a)+s.slice(b);
    return s;
  });
  await edit('src/demo/workspace-demo.tsx',s=>s.replace('import { WorkspacePresentationView } from "../application/workspace-presentation-view";','const WorkspacePresentationView = (props: {session: WorkspaceSession}) => <ReactiveTreeView editor={props.session.editor} projection={props.session.projection} />;').replace('import { WorkspacePresentations } from "./workspace-presentations";','const WorkspacePresentations = (_props: {session: WorkspaceSession; menu?: boolean; busy?: boolean}) => null;'));
  await writeFile(path.join(target,'src/application/canvas-removal.test.tsx'),`// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { render } from 'solid-js/web';
import { WorkspaceSession } from './workspace-session';
import { materializeLocalWorkspace } from '../reactive-editor/workspace-manifest';
import { ReactiveTreeView } from '../rendering/reactive-tree-view';
it('physically absent Canvas retains Desktop editing, opaque layout, bank and unknown app payload',()=>{
 const envelope={version:1,active:'canvas',objects:[{id:'bank-note',target:{kind:'block',blockId:'bank-window'}}],presentations:{desktop:{version:1,kind:'legacy-tree'},canvas:{version:1,camera:{x:12,y:34,zoom:.5},placements:[{id:'p',objectId:'bank-note',bounds:{x:10,y:20,width:840,height:620},order:0}],future:'retain'},spatial:{opaque:true}}};
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',metadata:{workspacePresentation:envelope},children:[{id:'desktop',type:'document-window-block',metadata:{position:{x:5,y:8}},children:[{type:'document-block',children:[{id:'text',type:'plain-text-block',text:'Desktop'}]}]},{type:'workspace-object-bank-block',children:[{id:'bank-window',type:'document-window-block',metadata:{title:'Stored note'},children:[{type:'document-block',children:[{id:'bank-text',type:'plain-text-block',text:'Bank'}]}]},{id:'app',type:'canvas-counter-block',count:7}]}]}));
 const host=document.body.appendChild(document.createElement('main'));const dispose=render(()=><ReactiveTreeView editor={session.editor} projection={session.projection}/>,host);session.editor.installGateway(document);
 try {
 expect(session.presentation.active()).toBe('desktop');expect(host.querySelector('.workspace-canvas')).toBeNull();
 const input=host.querySelector('textarea')!;input.focus();input.value='Desktop edited';input.dispatchEvent(new Event('input',{bubbles:true}));
 expect(Object.values(session.editor.repository.state.contents).find(c=>c.payload.id==='text')?.payload.text).toBe('Desktop edited');
 [...host.querySelectorAll<HTMLButtonElement>('.workspace-object-bank button')].find(b=>b.textContent==='Stored note')!.click();
 const bank=[...host.querySelectorAll('textarea')].find(e=>e.value==='Bank')!;bank.focus();bank.value='Bank edited';bank.dispatchEvent(new Event('input',{bubbles:true}));
 const saved=session.editor.persistence.captureWorkspace().document;expect((saved.metadata as any).workspacePresentation).toEqual(envelope);
 expect(Object.values(session.editor.repository.state.contents).find(c=>c.payload.id==='bank-text')?.payload.text).toBe('Bank edited');
 expect(saved.children![1].children![1].count).toBe(7);
 const reopened=new WorkspaceSession(materializeLocalWorkspace(saved));expect(reopened.editor.persistence.captureWorkspace().document).toEqual(saved);reopened.dispose();
 } finally {dispose();session.dispose();host.remove();}
});`);
  for(const args of [['run','typecheck'],['test','--','--maxWorkers=1','--minWorkers=1','src/application/canvas-removal.test.tsx'],['run','build']]) {
    const result=spawnSync('npm',args,{cwd:target,encoding:'utf8',env:process.env});process.stdout.write(result.stdout);process.stderr.write(result.stderr);if(result.status!==0)throw new Error(`Removal check failed: npm ${args.join(' ')}`);
  }
  console.log('Physical Canvas and Counter removal passed; temporary copy deleted.');
} finally {await rm(target,{recursive:true,force:true});}
