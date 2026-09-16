import { createStore } from "solid-js/store";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { NodeKey } from "../block-tree/types";
import { deriveConcertinaPresentation, type ConcertinaDerivation, type ConcertinaRequest } from "./concertina-derivation";
import { resolveConcertinaSettings, type ConcertinaSettings } from "./concertina-settings";
import type { DocumentPositionMarker } from "./document-position-markers";

interface ViewportSnapshot { element: HTMLElement; scrollTop: number; variable: string; }
interface MeasuredViewport { element: HTMLElement; height: number; scrollTop: number; }

/** Occurrence-local presentation only. Never writes to the canonical repository. */
export class ConcertinaService {
  readonly state;
  private readonly setState;
  private request?: ConcertinaRequest;
  private derivation?: ConcertinaDerivation;
  private settings: Readonly<ConcertinaSettings> = resolveConcertinaSettings();
  private hidden = new Set<HTMLElement>();
  private viewports = new Map<HTMLElement, ViewportSnapshot>();
  private frame = 0;
  private readonly unsubscribe: () => void;

  constructor(private readonly editor: ReactiveEditor) {
    [this.state, this.setState] = createStore<{ owner?: string; activeMarkerOrGroup?: string; revision: number; diagnostics: readonly string[] }>({ revision: 0, diagnostics: [] });
    this.unsubscribe = editor.mounts.subscribe(() => { if (this.request) this.schedule(); });
    if (typeof window !== "undefined") {
      window.addEventListener("resize", this.onViewportResize);
      window.visualViewport?.addEventListener("resize", this.onViewportResize);
      document.fonts?.addEventListener?.("loadingdone", this.onViewportResize);
    }
  }

  private readonly onViewportResize = () => { if (this.request) this.schedule(); };

  activate(request: ConcertinaRequest, settings: Partial<ConcertinaSettings> = {}): boolean {
    const projection = this.editor.projections.get(request.viewId);
    const derived = projection && deriveConcertinaPresentation(request, projection);
    if (!derived?.markers.length) { this.deactivate(request.owner); return false; }
    this.restore();
    this.settings = resolveConcertinaSettings(settings);
    this.request = { ...request, markers: derived.markers };
    this.derivation = derived;
    this.setState({ owner: request.owner, activeMarkerOrGroup: request.activeMarkerOrGroup, revision: this.state.revision + 1, diagnostics: derived.diagnostics });
    this.schedule();
    return true;
  }

  update(request: ConcertinaRequest, settings?: Partial<ConcertinaSettings>) { return this.activate(request, settings ?? this.settings); }

  configure(settings: Partial<ConcertinaSettings>) {
    this.settings = resolveConcertinaSettings({ ...this.settings, ...settings });
    if (this.request) this.schedule();
  }

  setActiveMarker(markerOrGroupId?: string) {
    if (!this.request || this.state.activeMarkerOrGroup === markerOrGroupId) return;
    this.request = { ...this.request, activeMarkerOrGroup: markerOrGroupId };
    this.setState("activeMarkerOrGroup", markerOrGroupId);
    this.schedule();
  }

  presentation(nodeKey: NodeKey) {
    const derived = this.derivation;
    if (!derived) return { hidden: false, matched: false };
    const node = this.editor.node(nodeKey);
    const root = node && this.editor.mounts.get(nodeKey)?.root;
    return { hidden: !!root?.closest("[data-concertina-hidden]"), matched: derived.matching.has(nodeKey) };
  }

  deactivate(owner?: string) {
    if (owner && this.state.owner !== owner) return;
    this.request = undefined; this.derivation = undefined;
    this.cancelFrame(); this.restore();
    this.setState({ owner: undefined, activeMarkerOrGroup: undefined, revision: this.state.revision + 1, diagnostics: [] });
  }

  clearAll() { this.deactivate(); }
  dispose() {
    this.clearAll(); this.unsubscribe();
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.onViewportResize);
      window.visualViewport?.removeEventListener("resize", this.onViewportResize);
      document.fonts?.removeEventListener?.("loadingdone", this.onViewportResize);
    }
  }

  private cancelFrame() {
    if (!this.frame) return;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frame);
    else clearTimeout(this.frame);
    this.frame = 0;
  }

  private schedule() {
    this.cancelFrame();
    this.frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => this.apply()) : (setTimeout(() => this.apply(), 0) as unknown as number);
  }

  private restore() {
    for (const root of this.hidden) { if (root.dataset.concertinaHidden === "true") { root.hidden = false; delete root.dataset.concertinaHidden; } }
    this.hidden.clear();
    for (const snapshot of this.viewports.values()) {
      snapshot.element.classList.remove("reactive-concertina-viewport");
      if (snapshot.variable) snapshot.element.style.setProperty("--concertina-height", snapshot.variable);
      else snapshot.element.style.removeProperty("--concertina-height");
      snapshot.element.scrollTop = snapshot.scrollTop;
    }
    this.viewports.clear();
  }

  private rangePosition(surface: HTMLElement, marker: DocumentPositionMarker): { top: number; bottom: number } | undefined {
    if (marker.anchor.kind !== "text-range" || marker.anchor.range.coordinate !== "cell") return;
    const flow = surface.querySelector<HTMLElement>(".reactive-standoff-flow"), range = marker.anchor.range;
    const first = flow?.children[range.start], last = flow?.children[range.end - 1];
    if (!first || !last) return;
    const outer = surface.getBoundingClientRect(), start = first.getBoundingClientRect(), end = last.getBoundingClientRect();
    if (!start.height && !end.height) return;
    return { top: start.top - outer.top + surface.scrollTop, bottom: end.bottom - outer.top + surface.scrollTop };
  }

  private measure(nodeKey: NodeKey, markers: readonly DocumentPositionMarker[]): MeasuredViewport | undefined {
    const mount = this.editor.mounts.get(nodeKey);
    if (!(mount?.root instanceof HTMLElement)) return;
    const surface = mount.root.querySelector<HTMLElement>(".reactive-standoff-surface");
    if (!surface) return;
    const naturalHeight = surface.scrollHeight || surface.getBoundingClientRect().height;
    if (naturalHeight <= this.settings.naturalHeightThresholdPx) return;
    const positions = markers.map(marker => ({ marker, bounds: this.rangePosition(surface, marker) })).filter(item => !!item.bounds);
    if (!positions.length) return;
    const active = positions.find(item => item.marker.id === this.request?.activeMarkerOrGroup || item.marker.group === this.request?.activeMarkerOrGroup) ?? positions[0];
    const bounds = active.bounds!;
    let clusterTop = bounds.top, clusterBottom = bounds.bottom;
    // Nearby matches share one excerpt; distant matches remain reachable by navigation.
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const item of positions) {
        const candidate = item.bounds!;
        if (candidate.top > clusterBottom + this.settings.nearbyMatchMergeGapPx || candidate.bottom < clusterTop - this.settings.nearbyMatchMergeGapPx) continue;
        const top = Math.min(clusterTop, candidate.top), bottom = Math.max(clusterBottom, candidate.bottom);
        if (top !== clusterTop || bottom !== clusterBottom) { clusterTop = top; clusterBottom = bottom; expanded = true; }
      }
    }
    const desired = clusterBottom - clusterTop + this.settings.contextBeforePx + this.settings.contextAfterPx;
    const height = Math.min(this.settings.maximumExcerptHeightPx, Math.max(this.settings.preferredExcerptHeightPx, desired));
    const allFit = desired <= height;
    const scrollTop = Math.max(0, Math.min(naturalHeight - height, (allFit ? clusterTop : bounds.top) - this.settings.contextBeforePx - this.settings.activeMatchScrollMarginPx));
    return { element: surface, height, scrollTop };
  }

  private apply() {
    this.frame = 0;
    const derived = this.derivation;
    if (!derived || !this.request) return;
    // Read all geometry before changing the layout of any Block.
    const measured = [...derived.matching].map(([key, markers]) => this.measure(key, markers)).filter((value): value is MeasuredViewport => !!value);
    for (const key of derived.hiddenBranchRoots) {
      const root = this.editor.mounts.get(key)?.root;
      if (!(root instanceof HTMLElement) || root.hidden) continue;
      root.hidden = true; root.dataset.concertinaHidden = "true"; this.hidden.add(root);
    }
    for (const item of measured) {
      if (!this.viewports.has(item.element)) this.viewports.set(item.element, { element: item.element, scrollTop: item.element.scrollTop, variable: item.element.style.getPropertyValue("--concertina-height") });
      item.element.classList.add("reactive-concertina-viewport");
      item.element.style.setProperty("--concertina-height", `${item.height}px`);
      item.element.scrollTop = item.scrollTop;
    }
    this.editor.blockSelection.prune();
  }
}
