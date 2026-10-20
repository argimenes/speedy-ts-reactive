import { For, Show } from 'solid-js';
import { SystemSubmenu } from '../demo/codex-system-bar';
import type { WorkspaceWindowManager } from '../application/window-manager';

export function NamedLayoutMenu(props:{manager:WorkspaceWindowManager}) {
  const named=props.manager.named;
  const attempt=(work:()=>void)=>{try{work();}catch(error){window.alert(String(error));}};
  return <SystemSubmenu label="Named arrangements">
    <button role="menuitem" onClick={()=>{const name=window.prompt('Name this window arrangement. Save Workspace writes it to the workspace file.');if(name!==null)attempt(()=>named.save(name));}}>Save arrangement as…</button>
    <Show when={named.active()}>{id=><button role="menuitem" onClick={()=>attempt(()=>{const a=named.arrangements().find(a=>a.id===id());if(a)named.save(a.name,a.id);})}>Save current arrangement</button>}</Show>
    <For each={named.arrangements()}>{a=><SystemSubmenu label={`${a.name}${named.active()===a.id?' (selected)':''}`}>
      <button role="menuitem" onClick={()=>named.select(a.id)}>Select arrangement</button>
      <button role="menuitem" onClick={()=>{const name=window.prompt('Rename arrangement',a.name);if(name!==null)attempt(()=>named.rename(a.id,name));}}>Rename…</button>
      <button role="menuitem" onClick={()=>{if(window.confirm(`Delete arrangement “${a.name}”? Application windows will remain open.`))named.delete(a.id);}}>Delete arrangement…</button>
    </SystemSubmenu>}</For>
    <Show when={named.notice()}><p role="status">{named.notice()}</p></Show>
  </SystemSubmenu>;
}
