/** Local preferences only, using the same facility as Flint recents. Never in publications or Documents. */
export interface EntityUse { id: string; name: string; at: number }
const sessions = new Map<string, EntityUse[]>(), prefix = 'mutable.autocomplete.usage.v1:';
const valid = (r: any): r is EntityUse => !!r && typeof r.id === 'string' && r.id.length <= 512 && typeof r.name === 'string' && r.name.length <= 1000 && Number.isFinite(r.at);
export function usage(scope: string, days?: number, now = Date.now()): EntityUse[] {
  if (!days) return sessions.get(scope) ?? [];
  try { const raw = localStorage.getItem(prefix + encodeURIComponent(scope)); if (!raw || raw.length > 500_000) return []; const rows: unknown = JSON.parse(raw); return Array.isArray(rows) ? rows.filter(valid).filter(r => r.at <= now && now-r.at <= days*86400000).slice(0,200) : []; } catch { return []; }
}
export function recordUsage(scope: string, entity: {id:string;name:string}, now = Date.now()) {
  const row = { id:entity.id, name:entity.name, at: now }, merge = (old: EntityUse[]) => [row,...old.filter(r => r.id !== row.id)].slice(0,200);
  sessions.set(scope,merge(usage(scope)));
  try { localStorage.setItem(prefix + encodeURIComponent(scope), JSON.stringify(merge(usage(scope,30,now)))); } catch { /* Session use remains available in private/quota-limited browsers. */ }
}
export function clearUsage(scope: string) { sessions.delete(scope); try { localStorage.removeItem(prefix + encodeURIComponent(scope)); } catch {} }
