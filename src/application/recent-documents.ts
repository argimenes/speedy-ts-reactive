import { createSignal } from 'solid-js';
import type { RecentApplicationDocument } from '../feature-api/document-application';

export const RECENT_DOCUMENTS_KEY = 'mutable.flint.recent-documents.v1:';
const limit = 10;
const valid = (v: any): v is RecentApplicationDocument => !!v && typeof v.id === 'string' && !!v.id && v.id.length <= 1024
  && typeof v.title === 'string' && v.title.length <= 4096 && !!v.location
  && typeof v.location.folder === 'string' && v.location.folder.length <= 4096
  && typeof v.location.filename === 'string' && !!v.location.filename && v.location.filename.length <= 1024;

/** Device-local navigation history, scoped by logical Vault identity. No document subscriptions. */
export function createRecentDocuments() {
  const entries = new Map<string | undefined, readonly RecentApplicationDocument[]>();
  const [revision, changed] = createSignal(0);
  const read = (vaultId?: string) => {
    if (!entries.has(vaultId)) {
      let initial: RecentApplicationDocument[] = [];
      if (vaultId) try {
        const raw = localStorage.getItem(RECENT_DOCUMENTS_KEY + encodeURIComponent(vaultId));
        const value: unknown = raw && raw.length <= 100000 ? JSON.parse(raw) : [];
        if (Array.isArray(value)) {
          const seen = new Set<string>();
          initial = value.filter(valid).filter(v => { if (seen.has(v.id)) return false; seen.add(v.id); return true; }).slice(0, limit)
            .map(v => ({ id: v.id, title: v.title, location: { folder: v.location!.folder, filename: v.location!.filename } }));
        }
      } catch { /* Restricted/corrupt browser storage must not prevent opening a document. */ }
      entries.set(vaultId, initial);
    }
    return entries.get(vaultId)!;
  };
  return {
    items(vaultId?: string) { revision(); return read(vaultId); },
    record(document: RecentApplicationDocument, vaultId?: string) {
      const previous = read(vaultId), first = previous[0];
      if (first?.id === document.id && first.title === document.title && first.location?.folder === document.location?.folder && first.location?.filename === document.location?.filename) return;
      const next = [{ ...document, ...(document.location ? { location: { ...document.location } } : {}) }, ...previous.filter(d => d.id !== document.id)].slice(0, limit);
      entries.set(vaultId, next); changed(n => n + 1);
      // Unsaved documents are usable in this session, but cannot be reopened after a restart.
      if (vaultId) try { localStorage.setItem(RECENT_DOCUMENTS_KEY + encodeURIComponent(vaultId), JSON.stringify(next.filter(d => d.location))); } catch { /* Session history remains available. */ }
    },
  };
}
