import { createRoot, createSignal, getOwner, type Owner } from "solid-js";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { BlockTreeProjection } from "../block-tree/projection";
import type { LocalCoordinates } from "../runtime/local-coordinates";

export interface DocumentActivity { mounted: boolean; visible: boolean; active: boolean }

/** Stable, runtime-only binding. E1.1 deliberately has no rebind/transfer operation. */
export class DocumentHostBinding {
  private state = createSignal<DocumentActivity>({ mounted: true, visible: false, active: false });
  readonly activity = this.state[0];
  private generation = 0;
  constructor(readonly ownerKey: string, readonly slotKey: string, readonly windowId: string,
    readonly coordinates: LocalCoordinates) {}
  update(visible: boolean, active: boolean) {
    const previous = this.activity();
    if (!previous.mounted || previous.visible === visible && previous.active === (visible && active)) return;
    this.generation++;
    this.state[1]({ mounted: true, visible, active: visible && active });
  }
  ticket() { const generation = this.generation; return () => this.activity().mounted && generation === this.generation; }
  end() { this.generation++; this.state[1]({ mounted: false, visible: false, active: false }); }
}

export interface RetainedDocumentSession {
  readonly id: string;
  readonly projection: BlockTreeProjection;
  readonly rootKey: string;
  readonly ownsProjection: boolean;
  readonly host: DocumentHostBinding;
  readonly element: HTMLDivElement;
  readonly signal: AbortSignal;
  /** Checks session lifetime only. Visibility is a separate host ticket. */
  current(): boolean;
}

/** Sole final disposal authority, created and destroyed by WorkspaceSession.
 * Membership holders request release; they never own the render disposer.
 * No resources, domain edits, Save bindings or persistent records are allocated.
 */
export class DocumentSessionStore {
  private records = new Map<string, { session: RetainedDocumentSession; dispose: () => void }>();
  private alive = true;
  private lifetime = new AbortController();
  readonly signal = this.lifetime.signal;
  constructor(private editor: ReactiveEditor) {}
  get size() { return this.records.size; }
  sessions() { return [...this.records.values()].map(record => record.session); }

  mount(options: { ownerKey: string; slotKey: string; windowId: string; placement: string;
    coordinates: LocalCoordinates; shared?: { projection: BlockTreeProjection; rootKey: string } },
    render: (session: RetainedDocumentSession) => void, owner: Owner | null = getOwner()): RetainedDocumentSession {
    if (!this.alive) throw Error("Document session store is disposed");
    if ([...this.records.values()].some(r => r.session.host.ownerKey === options.ownerKey && r.session.host.slotKey === options.slotKey))
      throw Error("Document host slot already has a session");
    const projection = options.shared?.projection ?? this.editor.createView(undefined, options.placement);
    const controller = new AbortController(), element = document.createElement("div");
    element.className = "retained-document-session";
    // The container changes neither the established scrollport nor flex geometry.
    element.style.display = "contents";
    const session: RetainedDocumentSession = {
      id: `document-session:${crypto.randomUUID()}`, projection,
      rootKey: options.shared?.rootKey ?? projection.state.rootKey, ownsProjection: !options.shared,
      host: new DocumentHostBinding(options.ownerKey, options.slotKey, options.windowId, options.coordinates),
      element, signal: controller.signal, current: () => this.alive && !controller.signal.aborted,
    };
    let disposeRoot = () => {};
    const record = { session, dispose: () => {
      if (controller.signal.aborted) return;
      controller.abort(); session.host.end();
      try { disposeRoot(); } finally {
        element.remove();
        if (session.ownsProjection) this.editor.disposeView(projection);
      }
    } };
    this.records.set(session.id, record);
    try {
      // Detached root inherits context, not the parent's cleanup authority.
      createRoot(dispose => { disposeRoot = dispose; render(session); }, owner);
      return session;
    } catch (error) { this.release(session); throw error; }
  }
  release(session: RetainedDocumentSession) {
    const record = this.records.get(session.id);
    if (!record || record.session !== session) return;
    this.records.delete(session.id);
    record.dispose();
  }
  releaseOwner(ownerKey: string) {
    for (const { session } of [...this.records.values()]) if (session.host.ownerKey === ownerKey) this.release(session);
  }
  dispose() {
    if (!this.alive) return;
    this.alive = false; this.lifetime.abort();
    for (const { session } of [...this.records.values()]) this.release(session);
  }
}
