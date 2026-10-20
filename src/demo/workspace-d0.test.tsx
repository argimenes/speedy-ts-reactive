import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { WorkspaceDemo } from './workspace-demo';
let dispose:(()=>void)|undefined;
afterEach(()=>{dispose?.();document.body.replaceChildren();vi.unstubAllGlobals();});
const button=(label:string,root:ParentNode=document)=>[...root.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label)!;
async function menu(){document.querySelector<HTMLButtonElement>('[data-system-menu-trigger="workspace"]')?.click();await Promise.resolve();}
const mount=()=>{dispose=render(()=><WorkspaceDemo initialWorkspace={{id:'workspace',type:'workspace-block',children:[]}} configuration={{features:{entityReferences:false}}}/>,document.body);};
it('exposes an explicit local upgrade, with cancellation leaving the legacy Save path intact',async()=>{
  let saved='';const handle={name:'Legacy.json',getFile:async()=>({text:async()=>saved}),createWritable:async()=>({write:async(v:string)=>{saved=v;},close:async()=>{}})};
  const picker=vi.fn().mockRejectedValueOnce(new DOMException('cancel','AbortError')).mockResolvedValue(handle);vi.stubGlobal('showSaveFilePicker',picker);
  mount();await menu();button('Upgrade Workspace and Save as…',document.querySelector('[aria-label="Local files"]')!).click();
  await vi.waitFor(()=>expect(picker).toHaveBeenCalledOnce());await vi.waitFor(()=>expect(document.querySelector('[aria-label="Local files"] button:disabled')).toBeNull());
  if(!document.querySelector('[aria-label="Local files"]'))await menu();
  button('Save Workspace',document.querySelector('[aria-label="Local files"]')!).click();
  await vi.waitFor(()=>expect(saved).not.toBe(''));expect(JSON.parse(saved).type).toBe('workspace-block');
  expect(JSON.parse(saved).kind).toBeUndefined();
});
it('server upgrade requires a new name and never offers replacement of an existing Workspace',async()=>{
  const requests:any[]=[];
  vi.stubGlobal('fetch',vi.fn(async(input:any,init?:RequestInit)=>{
    if(String(input).includes('listWorkspaces'))return new Response(JSON.stringify({workspaces:['Workspace-managed.json']}));
    if(String(input).includes('saveWorkspaceBundle')){requests.push({body:JSON.parse(String(init?.body)),headers:init?.headers});return new Response(JSON.stringify({Success:true,Data:{contentHash:'saved'}}));}
    return new Response(JSON.stringify({Success:false}),{status:503});
  }));
  mount();await menu();button('Upgrade Workspace and Save as…',document.querySelector('[aria-label="Server files"]')!).click();
  const dialog=document.querySelector('[role="dialog"]')!;
  await vi.waitFor(()=>expect(button('Save Workspace',dialog).disabled).toBe(false));
  button('Save Workspace',dialog).click();
  await vi.waitFor(()=>expect(dialog.textContent).toContain('new Workspace filename'));
  expect(button('Replace Workspace',dialog)).toBeUndefined();expect(requests).toEqual([]);
  const input=dialog.querySelector<HTMLInputElement>('[aria-label="Workspace name"]')!;input.value='New-managed.json';input.dispatchEvent(new Event('input',{bubbles:true}));button('Save Workspace',dialog).click();
  await vi.waitFor(()=>expect(requests).toHaveLength(1));expect(requests[0].body.workspace.schemaVersion).toBe(2);expect(requests[0].body.documents).toEqual([]);expect(requests[0].headers['If-None-Match']).toBe('*');
});
