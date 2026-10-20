import { NamedLayoutMenu } from "./named-layouts";
import { WindowLayoutActions } from "./window-layout";
import { For, Show } from 'solid-js';
import type { WorkspaceWindowManager } from '../application/window-manager';
import { SystemSubmenu } from '../demo/codex-system-bar';

/** Derive membership from runtime registration, never enumerate repository nodes. */
export function WindowList(props:{manager:WorkspaceWindowManager}) {
  const manager=props.manager;
  return <SystemSubmenu label="Windows">
    <Show when={manager.layout.active()}>
      <NamedLayoutMenu manager={manager}/>
      <button role="menuitem" disabled={!manager.layout.canUndo()} onClick={()=>manager.layout.undo()}>Undo window layout</button>
      <button role="menuitem" disabled={!manager.layout.canRedo()} onClick={()=>manager.layout.redo()}>Redo window layout</button>
    </Show>
    <button role="menuitem" disabled={manager.lifecycle.workspaceBlocked} onClick={()=>manager.lifecycle.cycle()}>Next window</button>
    <button role="menuitem" disabled={manager.lifecycle.workspaceBlocked} onClick={()=>manager.lifecycle.cycle(-1)}>Previous window</button>
    <For each={Object.keys(manager.registry.windows)}>{id=><Show when={manager.registry.windows[id]}>{record=><SystemSubmenu label={`${manager.title(id)}${record().active?' (active)':record().visible?'':' (hidden)'}`}>
      <button role="menuitem" onClick={()=>manager.lifecycle.reveal(id)}>{record().visible?'Activate':'Restore'}</button>
      <button role="menuitem" disabled={!record().visible||!manager.lifecycle.canMinimize(id)} onClick={()=>manager.lifecycle.minimize(id)}>Minimize</button>
      <button role="menuitem" disabled={!record().visible} onClick={()=>manager.maximize(id)}>Maximize / restore size</button>
      <button role="menuitem" disabled={!record().visible||manager.layout.isTiled(id)} onClick={()=>manager.geometry.controllers.get(id)?.keyboard('move')}>Move — arrows, Enter, Escape</button>
      <button role="menuitem" disabled={!record().visible||manager.layout.isTiled(id)} onClick={()=>manager.geometry.controllers.get(id)?.keyboard('resize')}>Resize — arrows, Enter, Escape</button>
      <Show when={manager.layout.active()}><WindowLayoutActions manager={manager} id={id}/></Show>
      <button role="menuitem" onClick={()=>manager.close(id)}>Close</button>
    </SystemSubmenu>}</Show>}</For>
  </SystemSubmenu>;
}
