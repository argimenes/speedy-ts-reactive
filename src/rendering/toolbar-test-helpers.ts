/** Test navigation through the same picker and More disclosure used by readers. */
export function toolbarControl<T extends HTMLElement = HTMLButtonElement>(host: HTMLElement, selector: string, preferredToolset?: string): T {
  const picker = host.querySelector<HTMLSelectElement>('select[aria-label="Toolset"]');
  // The visible label remains stable even when a tooltip adds an availability note.
  if (selector.startsWith('button[title="') && !selector.includes('Apply text') && !selector.includes('Apply background')) {
    const label = selector.slice(14, -2);
    const byLabel = `[aria-label="${label}"]`;
    const original = selector;
    selector = `${original}, ${byLabel}`;
  }
  const find = () => host.querySelector<T>(selector) ?? document.querySelector<T>(`.compact-toolbar__panel ${selector}`);
  if (!picker) return find()!;
  const choose = (name: string) => { picker.value = name; picker.dispatchEvent(new Event("change", { bubbles: true })); };
  const more = () => host.querySelector<HTMLButtonElement>('.compact-toolbar__more')!.click();
  if (preferredToolset) choose(preferredToolset);
  if (find()) return find()!;
  for (const name of preferredToolset ? [preferredToolset] : ["Typography", "Annotations", "Visual effects", "Selection"]) {
    choose(name);
    if (find()) return find()!;
    more();
    if (find()) return find()!;
    if (name === "Visual effects") {
      const colour = findColour();
      colour?.click();
      if (find()) return find()!;
    }
  }
  throw new Error(`Toolbar control not found: ${selector}`);
}
function findColour() { return document.querySelector<HTMLButtonElement>('[data-tool-id="colours"]'); }
