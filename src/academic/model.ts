import { managedAsset, type ManagedAssetReference } from '../interchange/managed-asset';
import type { ScholarlyMetadata } from '../interchange/scholarly';
import type { AcademicIdentifier } from './identifiers';
export const ACADEMIC_BLOCK = 'mutable/academic-resource-block';
export type AcademicFormat =
  | AcademicIdentifier['family']
  | 'bibtex'
  | 'ris'
  | 'alto'
  | 'page'
  | 'epub';
export interface CitationRecord extends Omit<ScholarlyMetadata, 'doi'> {
  doi?: string;
  key: string;
  rawFields: Array<[string, string]>;
  identifiers: Array<{ namespace: string; key: string }>;
  abstract?: string;
  dates?: Record<string, string>;
  rights?: string[];
}
export interface OcrWord {
  id: string;
  text: string;
  points: number[][];
  confidence?: number;
  start: number;
  end: number;
}
export interface OcrLine {
  confidence?: number;
  regionId?: string;
  id: string;
  text: string;
  words: OcrWord[];
  points: number[][];
  start: number;
  end: number;
}
export interface OcrPage {
  id: string;
  width: number;
  height: number;
  unit: string;
  image?: string;
  text: string;
  regions?: Array<{ id: string; points: number[][]; lineIds: string[] }>;
  lines: OcrLine[];
  order: 'explicit' | 'source-order';
  rawOrder?: string[];
}
export interface AcademicProjection {
  version: 1;
  kind: AcademicFormat;
  title: string;
  diagnostics: string[];
  citations: CitationRecord[];
  metadata?: Array<{
    name: string;
    namespace: string;
    value: string;
    attributes: Record<string, string>;
  }>;
  person?: { name: string; affiliations: unknown[]; works: unknown[]; dates: unknown };
  pages?: OcrPage[];
  chapters?: Array<{ id: string; path: string; title: string; html: string; anchors: string[] }>;
  navigation?: Array<{ label: string; href: string }>;
  images?: Array<{ path: string; mediaType: string; bytes?: Uint8Array }>;
}
export interface AcademicCapture {
  version: 1;
  kind: 'deterministic';
  snapshotId: string;
  resourceId: string;
  source: string;
  endpoint: string;
  retrievedAt: string;
  asset: ManagedAssetReference;
  format: AcademicFormat;
  projection: AcademicProjection;
  identity?: AcademicIdentifier;
  assets?: ManagedAssetReference[];
}
/** Validate admitted projections, without fetching sources or touching canonical data. */
export function academicCapture(v: any): v is AcademicCapture {
  const p = v?.projection,
    string = (x: any, n = 200000) => typeof x === 'string' && x.length <= n;
  if (
    v?.version !== 1 ||
    v.kind !== 'deterministic' ||
    !string(v.snapshotId, 100) ||
    !string(v.resourceId, 200) ||
    !string(v.source, 4096) ||
    !managedAsset(v.asset) ||
    p?.version !== 1 ||
    p.kind !== v.format ||
    !['orcid', 'arxiv', 'pmid', 'pmcid', 'isbn', 'bibtex', 'ris', 'alto', 'page', 'epub'].includes(
      v.format
    ) ||
    !string(p.title, 10000) ||
    !Array.isArray(p.diagnostics) ||
    p.diagnostics.length > 2000 ||
    !p.diagnostics.every((s: any) => string(s, 10000)) ||
    !Array.isArray(p.citations) ||
    p.citations.length > 200
  )
    return false;
  if (
    !p.citations.every(
      (c: any) =>
        string(c.title, 10000) &&
        string(c.key, 1000) &&
        Array.isArray(c.creators) &&
        c.creators.length <= 200 &&
        c.creators.every((a: any) => a && typeof a === 'object') &&
        Array.isArray(c.fullTextCandidates) &&
        c.fullTextCandidates.length <= 10 &&
        c.fullTextCandidates.every((s: any) => string(s, 4096)) &&
        Array.isArray(c.rawFields) &&
        c.rawFields.length <= 10000 &&
        Array.isArray(c.identifiers)
    )
  )
    return false;
  if (
    p.pages !== undefined &&
    (!Array.isArray(p.pages) ||
      p.pages.length > 200 ||
      !p.pages.every(
        (r: any) =>
          string(r.id, 1000) &&
          string(r.text, 1000000) &&
          Number.isFinite(r.width) &&
          r.width > 0 &&
          Number.isFinite(r.height) &&
          r.height > 0 &&
          Array.isArray(r.lines) &&
          r.lines.length <= 10000 &&
          r.lines.every(
            (l: any) =>
              string(l.text) &&
              Array.isArray(l.words) &&
              l.words.length <= 10000 &&
              Array.isArray(l.points) &&
              l.points.length <= 1000 &&
              l.points.every(
                (p: any) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)
              )
          )
      ))
  )
    return false;
  if (
    p.chapters !== undefined &&
    (!Array.isArray(p.chapters) ||
      p.chapters.length > 200 ||
      !p.chapters.every(
        (r: any) =>
          string(r.path, 500) &&
          string(r.title, 10000) &&
          string(r.html, 2000000) &&
          Array.isArray(r.anchors) &&
          r.anchors.length <= 10000 &&
          r.anchors.every((a: any) => string(a, 500))
      ))
  )
    return false;
  return (
    (!p.navigation ||
      (Array.isArray(p.navigation) &&
        p.navigation.length <= 1000 &&
        p.navigation.every((n: any) => string(n.label, 1000) && string(n.href, 1000)))) &&
    (!v.assets ||
      (Array.isArray(v.assets) && v.assets.length <= 10 && v.assets.every(managedAsset)))
  );
}
export function storedProjection(p: AcademicProjection): AcademicProjection {
  return { ...p, ...(p.images ? { images: p.images.map(({ bytes, ...i }) => i) } : {}) };
}
export function emptyCitation(key: string, title: string, url = ''): CitationRecord {
  return {
    version: 1,
    key,
    title,
    url,
    type: 'ScholarlyWork',
    providerType: 'document',
    creators: [],
    licenses: [],
    fullTextCandidates: [],
    diagnostics: [],
    rawFields: [],
    identifiers: [],
  };
}
