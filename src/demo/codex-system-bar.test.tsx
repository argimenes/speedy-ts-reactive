// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { CodexSystemBar, formatSystemDateTime } from "./codex-system-bar";

const disposers: Array<() => void> = [];
afterEach(() => {
  while (disposers.length) disposers.pop()?.();
  document.body.replaceChildren();
  delete (navigator as Navigator & { getBattery?: unknown }).getBattery;
  vi.useRealTimers();
});

const click = (element: HTMLElement) => element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

function mount(child = <button type="button" role="menuitem">Workspace action</button>) {
  const host = document.body.appendChild(document.createElement("div"));
  disposers.push(render(() => <CodexSystemBar>{child}</CodexSystemBar>, host));
  return host;
}

describe("Codex system bar", () => {
  it("opens and closes the Codex and Workspace menus with the intended contents", async () => {
    const host = mount();
    const logo = host.querySelector<HTMLButtonElement>('[aria-label="Codex menu"]')!;
    click(logo); await Promise.resolve();
    const codex = host.querySelector<HTMLElement>('[role="menu"][aria-label="Codex"]')!;
    expect(codex.textContent).toContain("About this Codex");
    expect(codex.textContent).toContain("System Settings");
    expect(codex.textContent).toContain("Lock Screen");
    expect(codex.textContent).toContain("Quit");
    codex.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(host.querySelector('[role="menu"][aria-label="Codex"]')).toBeNull();

    click(host.querySelector<HTMLButtonElement>('[data-system-menu-trigger="workspace"]')!); await Promise.resolve();
    expect(host.querySelector('[role="menu"][aria-label="Workspace"]')?.textContent).toContain("Workspace action");
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(host.querySelector('[role="menu"][aria-label="Workspace"]')).toBeNull();
  });

  it("formats browser-local date and omits unsupported battery information", () => {
    expect(formatSystemDateTime(new Date(2026, 8, 21, 9, 46), "en-AU")).toBe("Mon, 21 Sept, 9:46 am");
    const host = mount();
    expect(host.querySelector("time")?.textContent).toBeTruthy();
    expect(host.querySelector(".codex-system-bar__battery-status")).toBeNull();
  });

  it("shows genuine battery level and charging state when the runtime supplies it", async () => {
    const battery = {
      level: .73,
      charging: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(navigator, "getBattery", { configurable: true, value: vi.fn().mockResolvedValue(battery) });
    const host = mount();
    await Promise.resolve(); await Promise.resolve();
    const status = host.querySelector<HTMLElement>(".codex-system-bar__battery-status")!;
    expect(status.getAttribute("aria-label")).toBe("Battery 73%, charging");
    expect(status.querySelector<HTMLElement>(".codex-system-bar__battery > span")?.style.width).toBe("73%");
  });
});
