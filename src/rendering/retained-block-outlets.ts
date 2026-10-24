import { createRoot, type JSX, type Owner } from 'solid-js';
import { insert } from 'solid-js/web';

interface Entry { host: HTMLDivElement; dispose: () => void; slot?: HTMLElement; scrollers: Set<HTMLElement>; scrolls: Array<[HTMLElement, number, number]> }

/** One rendered Document owns these roots. A structural parent is only a slot.
 * Release is deferred by one microtask so a synchronous tree edit can adopt the
 * same root. The provider remains the final, synchronous disposal authority. */
export class RetainedBlockOutlets {
  private entries = new Map<string, Entry>();
  private parking?: HTMLDivElement;
  private closed = false;

  attach(key: string, slot: HTMLElement, owner: Owner | null, content: () => JSX.Element) {
    if (this.closed) return () => {};
    let entry = this.entries.get(key);
    if (!entry) {
      const host = document.createElement('div'); host.style.display = 'contents';
      host.dataset.retainedBlock = key;
      slot.append(host);
      let dispose!: () => void;
      const scrollers=new Set<HTMLElement>();
      const scroll=(event:Event)=>{if(event.target instanceof HTMLElement)scrollers.add(event.target);};
      host.addEventListener('scroll',scroll,true);
      entry = { host, dispose: () => {host.removeEventListener('scroll',scroll,true);dispose();}, slot, scrollers, scrolls:[] };
      this.entries.set(key, entry);
      createRoot(release => { dispose = release; insert(host, content()); }, owner);
    } else {
      if(entry.slot)this.captureScroll(entry);
      this.move(entry.host, slot);
    }
    entry.slot = slot;
    const retained = entry;
    queueMicrotask(()=>{if(retained.slot===slot&&slot.isConnected)for(const [element,top,left] of retained.scrolls){element.scrollTop=top;element.scrollLeft=left;}});
    return () => {
      if (this.closed || retained.slot !== slot) return;
      this.captureScroll(retained);
      retained.slot = undefined;
      // Keep live browsing contexts connected while their old parent disappears.
      this.move(retained.host, this.park());
      queueMicrotask(() => {
        if (retained.slot || this.entries.get(key) !== retained) return;
        this.entries.delete(key); retained.dispose(); retained.host.remove();
        if (!this.parking?.childNodes.length) { this.parking?.remove(); this.parking = undefined; }
      });
    };
  }

  private captureScroll(entry: Entry) {
    // Scroll events identify generic scrollers. Native viewers also mark their
    // viewport for programmatic scrolling before the browser emits an event.
    // This bounded query is only during structural movement, never typing/flip.
    for(const el of entry.host.querySelectorAll<HTMLElement>('[data-retain-scroll],textarea'))entry.scrollers.add(el);
    entry.scrolls=[];
    for(const el of entry.scrollers){
      if(!entry.host.contains(el)){entry.scrollers.delete(el);continue;}
      entry.scrolls.push([el,el.scrollTop,el.scrollLeft]);
    }
  }
  private move(node: HTMLElement, parent: HTMLElement) {
    if (node.parentElement === parent) return;
    const moveBefore = (parent as HTMLElement & { moveBefore?: (node: Node, before: Node | null) => void }).moveBefore;
    if (moveBefore && node.isConnected && parent.isConnected) moveBefore.call(parent, node, null);
    else parent.append(node);
  }
  private park() {
    if (!this.parking) {
      this.parking = document.createElement('div');
      this.parking.dataset.blockTransferParking = '';
      this.parking.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;left:0;top:0';
      document.body.append(this.parking);
    }
    return this.parking;
  }
  dispose() {
    this.closed = true;
    for (const entry of this.entries.values()) { entry.dispose(); entry.host.remove(); }
    this.entries.clear(); this.parking?.remove(); this.parking = undefined;
  }
}
