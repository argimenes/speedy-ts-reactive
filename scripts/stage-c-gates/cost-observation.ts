/** Bounded gate diagnostics; no change to editor or recorder policy. */
export function observePage() {
  const stats: Record<string, any> = {}, recent: any[] = [], pending = new Map<number, any>();
  let sequence = 0, boundary = 0, active: any = null;
  const epoch = () => performance.timeOrigin + performance.now();
  const event = (kind: string, detail: any = {}) => {
    recent.push({ kind, at: Date.now(), monotonicEpoch: epoch(), boundary, ...detail });
    if (recent.length > 32) recent.shift();
  };
  const measure = (kind: string, value: number, detail: any = {}) => {
    const s = stats[kind] ??= { count: 0, totalMs: 0, maxMs: 0 };
    s.count++; s.totalMs += value;
    if (value >= s.maxMs) { s.maxMs = value; s.maximum = { at: Date.now(), ...detail }; }
  };
  const state = () => ({ visibility: document.visibilityState, focus: document.hasFocus(), discarded: (document as Document & { wasDiscarded?: boolean }).wasDiscarded });
  for (const name of ["visibilitychange", "freeze", "resume"]) document.addEventListener(name, () => event(name, state()));
  for (const name of ["pageshow", "pagehide", "focus", "blur"]) window.addEventListener(name, e => event(name, { ...state(), persisted: (e as PageTransitionEvent).persisted }));
  const longTaskSupported = PerformanceObserver.supportedEntryTypes.includes("longtask");
  if (longTaskSupported) new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      measure("longTask", entry.duration, { startTime: entry.startTime, name: entry.name });
      if (entry.duration > 1000) event("longTask", { startTime: entry.startTime, duration: entry.duration, name: entry.name });
    }
  }).observe({ type: "longtask", buffered: true });
  async function wait(delayMs: number, label: string, detail: any = {}) {
    const id = ++sequence, requestedAt = epoch(), wallAt = Date.now();
    pending.set(id, { id, label, requestedAt, wallAt, delayMs, deadline: requestedAt + delayMs, ...detail });
    await new Promise<void>(resolve => setTimeout(() => {
      boundary++; const firedAt = epoch(), lateMs = firedAt - requestedAt - delayMs;
      const timer = { ...pending.get(id), firedAt, wallFiredAt: Date.now(), lateMs, boundary };
      pending.delete(id); measure(`timer.${label}`, lateMs, timer);
      if (lateMs > 1000) event("lateTimer", timer);
      resolve();
    }, delayMs));
  }
  function span<T>(label: string, operation: () => T): T {
    const before = active; active = { label, startedAt: epoch(), boundary };
    try { return operation(); } finally {
      measure(`span.${label}`, epoch() - active.startedAt, active); active = before;
    }
  }
  event("installed", state());
  let stopped = false;
  void (async () => { while (!stopped) { await wait(1000, "heartbeat"); event("heartbeat", state()); } })();
  return { wait, span, event, measure, boundary: () => boundary, stop: () => { stopped = true; },
    snapshot: () => ({ ...state(), longTaskSupported, boundary, active, pendingTimers: [...pending.values()], stats, recent }) };
}
