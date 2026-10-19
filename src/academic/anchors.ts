export type AcademicAnchor =
  | {
      version: 1;
      snapshotId: string;
      kind: 'ocr-page';
      pageId: string;
      width: number;
      height: number;
      points: number[][];
    }
  | { version: 1; snapshotId: string; kind: 'epub-fragment'; path: string; fragment: string };
export function validAcademicAnchor(v: any): v is AcademicAnchor {
  if (v?.version !== 1 || typeof v.snapshotId !== 'string' || v.snapshotId.length > 100)
    return false;
  if (v.kind === 'epub-fragment')
    return (
      typeof v.path === 'string' &&
      v.path.length <= 500 &&
      typeof v.fragment === 'string' &&
      v.fragment.length <= 500
    );
  return (
    v.kind === 'ocr-page' &&
    typeof v.pageId === 'string' &&
    Number.isFinite(v.width) &&
    v.width > 0 &&
    Number.isFinite(v.height) &&
    v.height > 0 &&
    Array.isArray(v.points) &&
    v.points.length >= 3 &&
    v.points.length <= 1000 &&
    v.points.every(
      (p: any) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every(Number.isFinite) &&
        p[0] >= 0 &&
        p[1] >= 0 &&
        p[0] <= v.width &&
        p[1] <= v.height
    )
  );
}
