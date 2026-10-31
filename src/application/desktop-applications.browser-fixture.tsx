/** Finite browser checks; all service responses are in memory, with no vault writes. */
import { render } from "solid-js/web";
import { onCleanup, onMount } from "solid-js";
import { WorkspaceSession } from "./workspace-session";
import { WorkspacePresentationView } from "./workspace-presentation-view";
import { materializeLocalWorkspace } from "../reactive-editor/workspace-manifest";
import { CavernStartup, useCurrentCavern } from "./cavern-startup";
import { CodexSystemBar } from "../demo/codex-system-bar";
import { desktopApplications } from "./desktop-applications";
import "../index.css";
import "../demo/workspace-demo.css";

async function trusted(action: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    (globalThis as any).__desktopResume = (value: any) => value.error ? reject(Error(value.error)) : resolve(value.result);
    (globalThis as any).desktopInput(JSON.stringify(action));
  });
}
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function until(predicate: () => boolean, label: string) {
  const deadline = performance.now() + 6000;
  while (!predicate()) { if (performance.now() > deadline) throw Error(`Timed out: ${label}`); await new Promise(resolve => setTimeout(resolve, 20)); }
}
async function click(element: Element, double = false) {
  element.scrollIntoView({ block: "nearest", inline: "nearest" });
  const rect = element.getBoundingClientRect();
  await trusted({ type: "click", x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, double });
  await frame();
}
export async function qualifyDesktopApplications() {
  const checks: string[] = [], check = (value: unknown, label: string) => { if (!value) throw Error(label); checks.push(label); };
  const originalFetch = window.fetch, requests: string[] = [];
  window.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input); requests.push(url);
    const ok = (Data: unknown) => new Response(JSON.stringify({ Success: true, Data }), { headers: { "Content-Type": "application/json" } });
    if (url.startsWith('/api/cavern/')) return ok({ current: { path: '/fixture', name: 'Icon qualification', cavernGuid: 'fixture', session: 'fixture-session' }, recentCaverns: [] });
    if (url === '/api/native/vault/default') return ok({ vault: '/fixture' });
    return new Response(JSON.stringify({ Success: false, Error: 'Isolated icon fixture has no backend' }), { status: 503, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  let session!: WorkspaceSession;
  const host = document.body.appendChild(document.createElement('div'));
  document.body.style.background = '#0b1927';
  const Desktop = () => {
    const cavern = useCurrentCavern();
    let launcher: (() => void) | undefined;
    session = new WorkspaceSession(materializeLocalWorkspace({ id: 'icons-workspace', type: 'workspace-block', children: [{ id: 'desktop', type: 'canvas-background-block', children: [] }] }), { features: { entityReferences: false, nativeKnowledge: false, flintMaterialChrome: false, flintProbe: false } });
    onCleanup(() => session.dispose());
    onMount(() => onCleanup(session.editor.installGateway(document)));
    return <main data-window-work-area class="workspace-demo workspace-demo--canonical workspace-demo--system-bar">
      <CodexSystemBar manager={session.windowManager} workspaceLauncher={value => { launcher = value; }}><button role="menuitem" onClick={() => session.editor.commandRegistry.execute('flint.open', { targetKey: session.projection.state.rootKey, args: undefined })}>Open Flint</button></CodexSystemBar>
      <WorkspacePresentationView session={session} desktopActions={{ workbench: () => launcher?.(), cavern: () => cavern!.choose('open') }} />
    </main>;
  };
  const stop = render(() => <CavernStartup>{() => <Desktop />}</CavernStartup>, host);
  try {
    await until(() => host.querySelectorAll('[data-desktop-application]').length === 18, 'desktop ready');
    const icons = () => [...host.querySelectorAll<HTMLButtonElement>('[data-desktop-application]')];
    const icon = (id: string) => host.querySelector<HTMLButtonElement>(`[data-desktop-application="${id}"]`)!;
    await Promise.all(icons().map(button => button.querySelector('img')!.decode()));
    check(icons().every(button => button.querySelector('img')!.naturalWidth === 224), 'All 18 lossless square images load');
    check(icons().every(button => button.querySelector('img')!.getBoundingClientRect().width === 72), 'Artwork displays at 72 CSS pixels');
    const before = session.editor.repository.state.revision;
    await click(icon('flint'));
    check(icon('flint').getAttribute('aria-pressed') === 'true' && Object.keys(session.windowManager!.registry.windows).length === 0, 'Single click selects without launching');
    await trusted({ type: 'click', x: 1200, y: 700 });
    check(icon('flint').getAttribute('aria-pressed') === 'false' && session.editor.repository.state.revision === before, 'Desktop background clears selection without content changes');
    await trusted({ type: 'screenshot', name: 'desktop' });
    const layout = () => icons().map(button => { const r = button.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
    const positions = JSON.stringify(layout());
    for (const app of desktopApplications) {
      await click(icon(app.id), true);
      if (app.id === 'workbench') {
        check(!!host.querySelector('[data-system-menu="workspace"]'), 'Workbench opens the existing Workspace menu');
        await trusted({ type: 'key', key: 'Escape' });
      } else if (app.id === 'cavern') {
        check(!!host.querySelector('[aria-label="Cavern setup"]'), 'Cavern opens the existing chooser');
        await trusted({ type: 'key', key: 'Escape' });
      } else {
        const manager = session.windowManager!;
        await until(() => !!manager.registry.activeWindowId, `${app.name} window activation`);
        const id = manager.registry.activeWindowId!, node = manager.windowNode(id)!;
        check((node.payload.metadata as any).title === (app.id === 'graph' ? 'Flint' : app.name), `${app.name} launches through the existing Window Manager`);
        if (app.id === 'graph') {
          await until(() => !!host.querySelector('.flint-document-graph'), 'Flint Graph view');
          check(!JSON.stringify(session.editor.repository.readState()).includes('initialView'), 'Graph starts the existing Flint view without persisting a UI mode');
        }
        if (!('command' in app)) {
          const placeholder = host.querySelector<HTMLElement>(`[data-desktop-placeholder="${app.id}"]`)!;
          check(placeholder?.textContent?.includes(`${app.name} is not yet available in Mutable OS.`), `${app.name} has the requested placeholder message`);
          if (app.id === 'tasks') {
            await trusted({ type: 'screenshot', name: 'placeholder' });
            const win = placeholder.closest<HTMLElement>('.reactive-window')!, rect = win.getBoundingClientRect();
            const header = win.querySelector('.reactive-window__header')!.getBoundingClientRect();
            await trusted({ type: 'drag', from: {x: header.x + 60, y: header.y + 15}, to: {x: 76, y: 67} }); await frame();
            const tile = icon('flint').getBoundingClientRect();
            check(win.contains(document.elementFromPoint(tile.x + tile.width / 2, tile.y + tile.height / 2)), 'A dragged window receives hits above an overlapping desktop icon');
            await click(win.querySelector('[aria-label="Minimize window"]')!);
            check(!manager.registry.windows[id].visible, 'Placeholder minimizes through existing controls');
            await click(icon('tasks'), true);
            check(manager.registry.windows[id].visible && Object.keys(manager.registry.windows).length === 1, 'Double-click restores the same minimized placeholder');
            await click(placeholder.querySelector('button')!);
            await click(icon('tasks'), true);
            check(Object.keys(manager.registry.windows).length === 1 && manager.registry.windows[id].visible, 'Closed placeholder reopens without a duplicate');
          }
          const close = host.querySelector<HTMLButtonElement>(`[data-desktop-placeholder="${app.id}"] button`)!;
          await click(close);
          check(!manager.registry.windows[id], `${app.name} Close uses the ordinary window lifecycle`);
        } else await session.editor.closeView(id);
        await frame();
      }
    }
    check(JSON.stringify(layout()) === positions, 'Desktop positions stay fixed through application launches, activation and minimization');
    for (const [width, height] of [[1024, 768], [390, 844], [800, 420]]) {
      await trusted({ type: 'viewport', width, height }); await frame();
      const tiles = layout(), overlaps = tiles.some((a, i) => tiles.slice(i + 1).some(b => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]));
      check(!overlaps, `No icon overlap at ${width}×${height}`);
      const last = icon('trash'); last.scrollIntoView({ block: 'nearest', inline: 'nearest' }); await frame();
      const r = last.getBoundingClientRect();
      check(r.x >= 0 && r.right <= width && r.y >= 48 && r.bottom <= height - 80, `All icons remain reachable at ${width}×${height}`);
    }
    await trusted({ type: 'viewport', width: 1440, height: 1000 }); await frame();
    await click(icon('flint'), true);
    await until(() => !!host.querySelector('.flint-application [contenteditable="true"]'), 'Flint editor');
    const editable = host.querySelector<HTMLElement>('.flint-application [contenteditable="true"]')!;
    await click(editable);
    const mutations: MutationRecord[] = [], observer = new MutationObserver(records => mutations.push(...records));
    observer.observe(host.querySelector('.desktop-applications')!, { subtree: true, attributes: true, childList: true, characterData: true });
    const typingRevision = session.editor.repository.state.revision;
    await trusted({ type: 'text', text: ' desktop check' }); await frame(); observer.disconnect();
    check(editable.textContent?.includes('desktop check'), 'Trusted browser text input reaches Flint normally');
    check(session.editor.repository.state.revision > typingRevision, 'Browser input commits through the canonical editor gateway');
    check(mutations.length === 0, 'Typing in Flint produces zero desktop-icon DOM updates');
    return { checks, passed: checks.length, viewports: ['1440×1000', '1024×768', '390×844', '800×420'], network: 'All service calls isolated in memory; no backend or vault writes', serviceRequests: [...new Set(requests)] };
  } finally { stop(); host.remove(); window.fetch = originalFetch; }
}
