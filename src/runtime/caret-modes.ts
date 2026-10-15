import { createEffect, createRoot, createSignal, onCleanup, untrack } from 'solid-js';
import { immutable } from './effect-contributions';
import { caretPositionProvider, sentenceFocusProvider, type FocusContext, type FocusProvider } from './focus-region';
import { validateEffectJson, type EffectParams, type TextPresentationEffect, type VisualEffectRegistry } from './visual-effect-registry';

export interface CaretModeDefinition {
  readonly id: string;
  readonly label: string;
  readonly focusProvider: string;
  readonly effect: string;
  readonly params?: EffectParams;
}
interface Surface { flow: HTMLElement; scope: HTMLElement; visible: boolean; scale: () => number }

/** Editor-session coordinator. No repository, annotations, temporary ranges or
 * history access. The host supplies only the active Block's lazy text context. */
export class CaretModes {
  private readonly mode = createSignal('normal');
  private readonly available = createSignal(0);
  private readonly enabledState: ReturnType<typeof createSignal<boolean>>;
  private readonly document = createSignal<Document>();
  private readonly modes = new Map<string, Readonly<CaretModeDefinition>>();
  private readonly providers = new Map<string, FocusProvider>();
  private readonly surfaces = new Map<string, Surface>();
  private readonly visible = new Set<Surface>();
  private readonly attached = new Map<Surface, () => void>();
  private activeScope?: Element;
  private caret?: { nodeKey: string; index: number };
  private renderer?: TextPresentationEffect;
  private provider?: ReturnType<FocusProvider['create']>;
  private frame?: number;
  private composing = false;
  private layoutRevision = 0;
  private disposed = false;
  private readonly disposeRoot: () => void;
  active = () => this.mode[0]();
  enabled = () => this.enabledState[0]();
  focusedNode = () => this.active() === 'normal' ? undefined : this.caret?.nodeKey;
  list = () => { this.available[0](); return [{ id: 'normal', label: 'Normal' }, ...this.modes.values()]; };

  constructor(private readonly registry: VisualEffectRegistry,
    private readonly context: (key: string, caret: number, frame: number) => FocusContext | undefined, enabled = true, spotlight = false) {
    this.enabledState = createSignal(enabled);
    this.registerProvider({ name: 'current-block', kind: 'block', create: () => ({ identify: c => ({ kind: 'block', nodeKey: c.nodeKey }) }) });
    this.registerProvider(sentenceFocusProvider());
    this.registerMode({ id: 'block-focus', label: 'Block Focus', focusProvider: 'current-block', effect: 'fade-outside-focus', params: { opacity: .35, blur: 0, scope: 'viewport' } });
    this.registerMode({ id: 'sentence-focus', label: 'Sentence Focus', focusProvider: 'current-sentence', effect: 'fade-outside-focus', params: { opacity: .3, blur: 0, scope: 'viewport' } });
    if (spotlight) {
      this.registerProvider(caretPositionProvider);
      this.registerMode({ id: 'reading-spotlight', label: 'Reading Spotlight', focusProvider: 'caret-position', effect: 'reading-spotlight',
        params: { shape: 'ellipse', radiusX: 180, radiusY: 85, dimOpacity: .65, feather: .7, scope: 'viewport', transitionMs: 0 } });
    }
    this.disposeRoot = createRoot(dispose => {
      createEffect(() => {
        this.available[0]();
        const mode = this.modes.get(this.active()), document = this.document[0]();
        const renderer = mode && registry.renderer(mode.effect), provider = mode && this.providers.get(mode.focusProvider);
        if (mode && (!provider || renderer?.target !== 'text-presentation')) { untrack(() => this.select('normal')); return; }
        if (!this.enabled() || !document || !mode || !provider || renderer?.target !== 'text-presentation') return;
        const params = { ...renderer.defaults, ...mode.params };
        renderer.validate(params);
        this.provider = provider.create();
        this.renderer = renderer.create({ document, params, owner: { kind: 'session', key: 'caret-mode' } });
        onCleanup(() => {
          this.cancelFrame();
          this.provider?.dispose?.(); this.provider = undefined;
          this.renderer = undefined;
          this.detach(); this.activeScope = undefined;
        });
        if (provider.kind === 'geometry') {
          const scroll = (event: Event) => {
            const target = event.target;
            // Outer scrolling moves scope and flows together: their cached local
            // origins stay valid. Nested scroll containers change relative origins.
            if (target instanceof Element && target !== this.activeScope && this.activeScope?.contains(target)) this.layoutRevision++;
            this.schedule();
          };
          const resize = () => { this.layoutRevision++; this.schedule(); };
          document.addEventListener('scroll', scroll, true);
          document.defaultView?.addEventListener('resize', resize);
          document.defaultView?.visualViewport?.addEventListener('resize', resize);
          onCleanup(() => {
            document.removeEventListener('scroll', scroll, true);
            document.defaultView?.removeEventListener('resize', resize);
            document.defaultView?.visualViewport?.removeEventListener('resize', resize);
          });
        }
        untrack(() => this.schedule());
      });
      return dispose;
    });
  }
  private assertLive() { if (this.disposed) throw Error('Caret Modes are disposed'); }
  registerProvider(provider: FocusProvider) {
    this.assertLive();
    if (!provider.name || this.providers.has(provider.name)) throw Error('Duplicate or empty focus provider');
    this.providers.set(provider.name, provider); this.available[1](v => v + 1);
    return () => { if (this.providers.get(provider.name) !== provider) return; this.providers.delete(provider.name); if (this.modes.get(this.active())?.focusProvider === provider.name) this.select('normal'); this.available[1](v => v + 1); };
  }
  registerMode(definition: CaretModeDefinition) {
    this.assertLive(); validateEffectJson(definition);
    if (!definition.id || definition.id === 'normal' || this.modes.has(definition.id) || !definition.label) throw Error('Duplicate or invalid Caret Mode');
    const renderer = this.registry.renderer(definition.effect), provider = this.providers.get(definition.focusProvider);
    if (!provider || renderer?.target !== 'text-presentation' || !renderer.focusKinds.includes(provider.kind)) throw Error('Unsupported focus provider or presentation effect');
    renderer.validate({ ...renderer.defaults, ...definition.params });
    const entry = structuredClone(definition);
    (immutable as (value: unknown) => unknown)(entry);
    this.modes.set(entry.id, entry); this.available[1](v => v + 1);
    return () => { if (this.modes.get(entry.id) !== entry) return; if (this.active() === entry.id) this.select('normal'); this.modes.delete(entry.id); this.available[1](v => v + 1); };
  }
  select(id: string) {
    if (this.disposed) return;
    if (id !== 'normal' && !this.modes.has(id)) throw Error(`Unknown Caret Mode ${id}`);
    this.mode[1](this.enabled() ? id : 'normal');
  }
  setEnabled(enabled: boolean) { if (!this.disposed) { this.enabledState[1](enabled); if (!enabled) this.select('normal'); } }
  setCaret(nodeKey?: string, index?: number) {
    if (this.disposed) return;
    const previous = this.caret;
    this.caret = nodeKey && index !== undefined ? { nodeKey, index } : undefined;
    if (!this.caret) {
      this.cancelFrame(); this.renderer?.focus(undefined, undefined); this.detach(); this.activeScope = undefined; return;
    }
    if (previous?.nodeKey === nodeKey && (previous?.index === index || this.modes.get(this.active())?.focusProvider === 'current-block')) return;
    this.schedule();
  }
  setComposing(composing: boolean) { this.composing = composing; if (!composing) this.schedule(); }
  /** O(1) notification; caller invokes on edits. Only the focused sentence is read, in RAF. */
  invalidate() { if (this.modes.get(this.active())?.focusProvider !== 'current-block') this.schedule(); }
  invalidateLayout(nodeKey: string) {
    if (this.providers.get(this.modes.get(this.active())?.focusProvider ?? '')?.kind !== 'geometry') return;
    const surface = this.surfaces.get(nodeKey);
    if (surface && (!this.activeScope || surface.scope === this.activeScope)) { this.layoutRevision++; this.schedule(); }
  }
  mount(nodeKey: string, flow: HTMLElement, scope: Element, scale: () => number = () => 1) {
    if (this.disposed) return { visible: (_value: boolean) => {}, dispose: () => {} };
    const surface: Surface = { flow, scope: scope as HTMLElement, visible: false, scale };
    this.surfaces.set(nodeKey, surface); this.document[1](flow.ownerDocument);
    return {
      visible: (visible: boolean) => {
        if (this.surfaces.get(nodeKey) !== surface || surface.visible === visible) return;
        surface.visible = visible;
        if (visible) { this.visible.add(surface); if (surface.scope === this.activeScope && this.renderer) this.attached.set(surface, this.renderer.attach(flow)); }
        else { this.visible.delete(surface); this.attached.get(surface)?.(); this.attached.delete(surface); }
        if (this.providers.get(this.modes.get(this.active())?.focusProvider ?? '')?.kind === 'geometry') this.schedule();
      },
      dispose: () => {
        if (this.surfaces.get(nodeKey) !== surface) return;
        // Removing a preceding Block can move every remaining origin without
        // resizing those flows. Invalidate before releasing its occurrence.
        this.invalidateLayout(nodeKey);
        this.visible.delete(surface); this.attached.get(surface)?.(); this.attached.delete(surface); this.surfaces.delete(nodeKey);
        if (this.caret?.nodeKey === nodeKey) { this.setCaret(); this.renderer?.focus(undefined, undefined); this.detach(); this.activeScope = undefined; }
      },
    };
  }
  private detach() { for (const release of this.attached.values()) release(); this.attached.clear(); }
  private cancelFrame() { if (this.frame !== undefined) this.document[0]()?.defaultView?.cancelAnimationFrame(this.frame); this.frame = undefined; }
  private schedule() {
    if (this.disposed || !this.renderer || this.composing || this.frame !== undefined) return;
    this.frame = this.document[0]()?.defaultView?.requestAnimationFrame(time => { this.frame = undefined; if (!this.composing) this.flush(time); });
  }
  private flush(time: number) {
    const caret = this.caret, surface = caret && this.surfaces.get(caret.nodeKey);
    const context = caret && surface && this.context(caret.nodeKey, caret.index, time);
    let focus;
    try { focus = context && this.provider?.identify(context); }
    catch (error) { this.registry.report(`Caret focus provider failed: ${error}`); this.select('normal'); return; }
    const scope = focus ? surface?.scope : undefined;
    // Only document transitions attach the visible set. Renderers retain their
    // own bounded presentation state; caret motion never traverses the document.
    if (scope !== this.activeScope) {
      this.detach(); this.activeScope = scope;
      if (scope && this.renderer) for (const item of this.visible) if (item.scope === scope) this.attached.set(item, this.renderer.attach(item.flow));
    }
    this.renderer?.focus(focus ? surface?.flow : undefined, focus, surface ? { scope: surface.scope, scale: surface.scale(), layoutRevision: this.layoutRevision } : undefined);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.cancelFrame(); this.disposeRoot();
    this.detach(); this.visible.clear(); this.surfaces.clear(); this.providers.clear(); this.modes.clear(); this.caret = undefined;
  }
}
