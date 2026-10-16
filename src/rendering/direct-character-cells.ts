import { managedAsset, assetKey, type ManagedAssetReference } from '../interchange/managed-asset';
import type { JSX } from "solid-js";

export interface CharacterCellPresentation {
  key: string;
  index?: number;
  text: string;
  style?: JSX.CSSProperties;
  concealed?: boolean;
  classes?: string;
  hiddenSource?: boolean;
  image?: { asset?: ManagedAssetReference; src: string; alt: string; label: string; width?: number; height?: number };
  alternative?: { id: string; end: number; cells: CharacterCellPresentation[] };
}

type Entry = {
  element: HTMLSpanElement;
  kind: "text" | "image" | "alternative";
  text?: string;
  style?: JSX.CSSProperties;
  alternative?: DirectCharacterCells;
  assetKey?: string;
  releaseAsset?: () => void;
};

/** Owns only a paragraph's character DOM. The canonical editor still owns all
 * text, annotations and history. Reuse keyed spans (and their Text nodes) so an
 * unrelated update cannot disturb a native selection or an IME composition.
 * There are no Solid roots, signals or effects per character here.
 */
export class DirectCharacterCells {
  private entries = new Map<string, Entry>();
  private disposed = false;
  private keys?: readonly string[];

  constructor(
    private readonly flow: HTMLElement,
    private readonly imageStatus?: (key: string, status: "ready" | "failed") => void,
    private readonly bindAsset?: (image: HTMLImageElement, asset: ManagedAssetReference) => () => void,
  ) {}

  update(cells: readonly CharacterCellPresentation[]): void {
    if (this.disposed) return;
    const document = this.flow.ownerDocument;
    const keys = cells.map(cell => cell.key);
    const sequenceChanged = !this.keys || keys.length !== this.keys.length || keys.some((key, index) => key !== this.keys![index]);
    const structureChanged = sequenceChanged || cells.some(cell => this.entries.get(cell.key)?.kind !== (cell.image ? "image" : cell.alternative ? "alternative" : "text"));
    this.keys = keys;
    const retained = new Set(keys);
    for (const [key, entry] of this.entries) {
      if (retained.has(key)) continue;
      entry.alternative?.dispose(); entry.releaseAsset?.();
      entry.element.remove();
      this.entries.delete(key);
    }
    let cursor = this.flow.firstChild;
    let fragment: DocumentFragment | undefined;
    const flush = () => {
      if (!fragment) return;
      this.flow.insertBefore(fragment, cursor);
      fragment = undefined;
    };
    for (const cell of cells) {
      const kind = cell.image ? "image" : cell.alternative ? "alternative" : "text";
      let entry = this.entries.get(cell.key);
      if (entry && entry.kind !== kind) {
        if (cursor === entry.element) cursor = cursor.nextSibling;
        entry.alternative?.dispose(); entry.releaseAsset?.();
        entry.element.remove();
        this.entries.delete(cell.key);
        entry = undefined;
      }
      if (!entry) {
        const element = document.createElement("span");
        entry = { element, kind };
        this.entries.set(cell.key, entry);
        if (cell.index !== undefined) element.dataset.inlineKey = cell.key;
        if (kind === "image") {
          element.className = "reactive-inline-image";
          element.contentEditable = "false";
          element.setAttribute("role", "img");
          const image = document.createElement("img");
          const report = (status: "ready" | "failed") => {
            // Cached image events can arrive after removal or view disposal.
            if (!this.disposed && image.isConnected && image.getAttribute('src') && this.entries.get(cell.key)?.element === element) this.imageStatus?.(cell.key, status);
          };
          image.onload = () => report("ready");
          image.onerror = () => report("failed");
          element.appendChild(image);
        } else if (kind === "alternative") {
          element.className = "reactive-superposition-projection";
          element.contentEditable = "false";
          element.setAttribute("aria-label", "Active alternative reading");
          entry.alternative = new DirectCharacterCells(element);
        } else {
          element.appendChild(document.createTextNode(cell.text));
        }
      }
      const element = entry.element;
      if (cell.index !== undefined) setAttribute(element, "data-inline-index", String(cell.index));
      if (cell.image) {
        const image = element.firstChild as HTMLImageElement;
        setAttribute(element, "aria-label", cell.image.label);
        // Inert clipboard descriptors must neither load the current page via an
        // empty src nor generate an image-status history entry on error.
        const asset = managedAsset(cell.image.asset), key = asset ? assetKey(asset) : undefined;
        if (key !== entry.assetKey) { entry.releaseAsset?.(); entry.releaseAsset = undefined; entry.assetKey = key; image.removeAttribute('src'); if (asset) entry.releaseAsset = this.bindAsset?.(image, asset); }
        if (!asset) setAttribute(image, "src", cell.image.src || undefined);
        setAttribute(image, "alt", cell.image.alt);
        setAttribute(image, "width", cell.image.width === undefined ? undefined : String(cell.image.width));
        setAttribute(image, "height", cell.image.height === undefined ? undefined : String(cell.image.height));
      } else if (cell.alternative) {
        setAttribute(element, "data-superposition-end", String(cell.alternative.end));
        setAttribute(element, "data-superposition-id", cell.alternative.id);
        entry.alternative!.update(cell.alternative.cells);
      } else {
        // An annotation-only update must not overwrite uncommitted browser/IME
        // text. Reconcile it when the canonical cell sequence or text changes.
        if (sequenceChanged || entry.text !== cell.text) {
          const text = element.firstChild;
          if (text?.nodeType === 3 && element.childNodes.length === 1) {
            if (text.nodeValue !== cell.text) text.nodeValue = cell.text;
          } else element.replaceChildren(document.createTextNode(cell.text));
          entry.text = cell.text;
        }
        setAttribute(element, "aria-hidden", cell.hiddenSource ? "true" : undefined);
        if (entry.style !== cell.style) {
          for (const name of Object.keys(entry.style ?? {})) if (!(name in (cell.style ?? {}))) element.style.removeProperty(name);
          for (const [name, value] of Object.entries(cell.style ?? {})) {
            if (value !== entry.style?.[name as keyof JSX.CSSProperties]) element.style.setProperty(name, String(value ?? ""));
          }
          entry.style = cell.style;
        }
      }
      setAttribute(element, "class", [cell.image ? "reactive-inline-image" : cell.alternative ? "reactive-superposition-projection" : cell.hiddenSource ? "reactive-superposition-source-cell" : cell.concealed ? "reactive-standoff-cell--concealed" : "", cell.classes].filter(Boolean).join(" ") || undefined);
      if (!structureChanged) continue;
      if (!element.parentNode) {
        (fragment ??= document.createDocumentFragment()).appendChild(element);
      } else {
        flush();
        if (element === cursor) cursor = cursor.nextSibling;
        else this.flow.insertBefore(element, cursor);
      }
    }
    flush();
    // Drop any browser-inserted trailing nodes after canonical text is committed.
    if (structureChanged) while (cursor) { const next = cursor.nextSibling; cursor.remove(); cursor = next; }
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.alternative?.dispose(); entry.releaseAsset?.();
      if (entry.kind === "image") {
        const image = entry.element.firstChild as HTMLImageElement;
        image.onload = image.onerror = null;
      }
    }
    this.entries.clear();
    this.keys = undefined;
  }
}

function setAttribute(element: HTMLElement, name: string, value?: string): void {
  if (value === undefined) { if (element.hasAttribute(name)) element.removeAttribute(name); }
  else if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}
