// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { featureFlags } from "../../configuration";
import { WorkspaceDemo } from "../../demo/workspace-demo";
import type { BrowserFileHandle } from "../../demo/browser-json-file";

const disposers: Array<() => void> = [];
afterEach(() => { while (disposers.length) disposers.pop()?.(); document.body.replaceChildren(); vi.unstubAllGlobals(); });

function mount() {
  const host = document.body.appendChild(document.createElement("div"));
  disposers.push(render(() => <WorkspaceDemo configuration={{ features: { codexSystemBar: false } }} />, host));
  return host;
}

function button(label: string, root: ParentNode): HTMLButtonElement {
  const result = [...root.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === label);
  if (!result) throw new Error(`Missing ${label} button`);
  return result;
}

function click(element: HTMLElement) { element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); }

function writableHandle(name: string, writes: string[]): BrowserFileHandle {
  return {
    name,
    getFile: async () => ({ name, text: async () => writes.at(-1) ?? "{}" }) as File,
    createWritable: async () => ({
      write: async data => { writes.push(typeof data === "string" ? data : await data.text()); },
      close: async () => undefined,
    }),
  };
}

describe("Compact workspace geometry", () => {
  it("saves expanded dimensions while compact or minimized, and restores width on reopening", async () => {
    const writes: string[] = [];
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue(writableHandle("Geometry.json", writes)));
    const host = mount(), root = host.querySelector<HTMLElement>(".workspace-demo__window")!;
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: parseFloat(root.style.width) || 1000, height: parseFloat(root.style.height) || 600 }) as DOMRect;
    const page = root.querySelector<HTMLElement>(".reactive-page")!;
    page.style.paddingLeft = "120px"; page.style.paddingRight = "120px";
    const toggle = root.querySelector<HTMLButtonElement>('[aria-label="Compact document"]')!;
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    click(toggle); expect(parseFloat(root.style.width)).toBeLessThan(1000);
    const save = () => click(button("Save Workspace…", host.querySelector('[aria-label="Local files"]')!));
    const size = (index: number) => {
      const find = (dto: any): any => dto.type === "document-window-block" ? dto.metadata.size : dto.children?.map(find).find(Boolean);
      return find(JSON.parse(writes[index]));
    };
    save(); await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(size(0)).toEqual({ w: 1000, h: 600 });
    click(root.querySelector<HTMLButtonElement>('[aria-label="Minimize document window"]')!);
    save(); await vi.waitFor(() => expect(writes).toHaveLength(2));
    expect(size(1)).toEqual({ w: 1000, h: 600 });
    click(root.querySelector<HTMLButtonElement>('[data-window-icon]')!);
    click(root.querySelector<HTMLButtonElement>('[aria-label="Compact document"]')!);
    expect(root.style.width).toBe("1000px");
  });
});
