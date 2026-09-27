// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import App from "../App";

const cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.splice(0).reverse().forEach(dispose => dispose());
  document.body.replaceChildren(); window.history.replaceState(null, "", "/");
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
});
function mount() {
  const host = document.body.appendChild(document.createElement("div"));
  cleanup.push(render(() => <App />, host)); return host;
}
function button(label: string, root: ParentNode = document) {
  const found = [...root.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.replace(/[✓▸]/g, '').trim() === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
async function menu() { if (!document.querySelector('[data-system-menu="workspace"]')) document.querySelector<HTMLButtonElement>('[data-system-menu-trigger="workspace"]')!.click(); await tick(); }
async function select(name: string) { await menu(); button('Presentations').click(); await tick(); button(name, document.querySelector('[aria-label="Presentations"]')!).click(); await tick(); }

describe('main application workspace', () => {
  it('starts with an editable Desktop and exposes Canvas without a development opt-in', async () => {
    vi.stubEnv('VITE_CANVAS_WORKSPACE', undefined);
    vi.stubEnv('DEV', false);
    const host = mount();
    expect(host.querySelector('.workspace-demo--canonical')).not.toBeNull();
    expect(host.querySelector('.workspace-demo__window')).toBeNull();
    expect(host.querySelectorAll('[contenteditable="true"]')).toHaveLength(1);
    await select('Canvas'); expect(host.querySelector('.workspace-canvas')).not.toBeNull();
    expect(host.querySelectorAll('.reactive-window')).toHaveLength(1);
    await select('Desktop'); expect(host.querySelector('.workspace-canvas')).toBeNull();
    expect(host.querySelectorAll('[contenteditable="true"]')).toHaveLength(1);
    await menu(); expect(host.querySelector<HTMLAnchorElement>('a[href="/?demo=1"]')?.target).toBe('_blank');
  });

  it('saves and reopens the initial workspace with its Document identity and Canvas layout', async () => {
    vi.stubEnv('VITE_CANVAS_WORKSPACE', undefined);
    let saved = '', writes = 0;
    const handle = { name: 'Workspace.json', getFile: async () => ({ name: 'Workspace.json', text: async () => saved }), createWritable: async () => ({ write: async (value: string) => { saved = value; writes++; }, close: async () => {} }) };
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockResolvedValue(handle));
    vi.stubGlobal('showOpenFilePicker', vi.fn().mockResolvedValue([handle]));
    const host = mount(); await select('Canvas'); await menu();
    button('Save Workspace', document.querySelector('[aria-label="Local files"]')!).click();
    await vi.waitFor(() => expect(saved).not.toBe(''));
    const value = JSON.parse(saved), doc = value.children[0].children[0].children[0];
    expect(value.metadata.workspacePresentation.active).toBe('canvas');
    expect(doc.metadata.documentId).toBe(doc.id); expect(doc.metadata.filename).toBe(`${doc.id}.json`);
    await tick(); await select('Desktop'); await menu();
    button('Open Workspace…', document.querySelector('[aria-label="Local files"]')!).click();
    await vi.waitFor(() => expect(host.querySelector('.workspace-canvas')).not.toBeNull());
    await menu(); button('Save Workspace', document.querySelector('[aria-label="Local files"]')!).click();
    await vi.waitFor(() => expect(writes).toBe(2));
    expect(JSON.parse(saved).children[0].children[0].children[0].metadata.documentId).toBe(doc.id);
  });

  it('retains an explicit application opt-out', async () => {
    vi.stubEnv('VITE_CANVAS_WORKSPACE', '0');
    const host = mount(); await menu();
    expect(document.querySelector('[data-system-menu="workspace"]')?.textContent).not.toContain('Presentations');
    expect(host.querySelectorAll('[contenteditable="true"]')).toHaveLength(1);
  });

  it('keeps the original sample behind the explicit demo link', () => {
    window.history.replaceState(null, '', '/?demo=1');
    const host = mount();
    expect(host.querySelector('.workspace-demo__window')).not.toBeNull();
    expect(host.querySelector('.workspace-demo--canonical')).toBeNull();
  });
});
