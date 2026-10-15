import { clone } from '../block-tree/clone';
import type { JsonObject } from '../block-tree/types';

export function pointAffinity(p: JsonObject, length: number): 'before' | 'after' {
  return p.affinity === 'before' || p.affinity === 'after' ? p.affinity : p.start === length ? 'before' : 'after';
}
export function includesPoint(p: JsonObject, start: number, end: number, length: number) {
  const x = Number(p.start), affinity = pointAffinity(p, length);
  return x > start && x < end || x === start && affinity === 'after' || x === end && affinity === 'before';
}
/** Canonical inclusive properties in, canonical inclusive properties out. */
export function clipProperties(properties: unknown, start: number, end: number, length: number, offset = -start, whole = false): JsonObject[] {
  if (!Array.isArray(properties)) return [];
  return properties.flatMap(p => {
    if (!p || !Number.isInteger(p.start) || !Number.isInteger(p.end)) return [];
    if (p.isZeroWidth === true) return whole || includesPoint(p, start, end, length)
      ? [{ ...clone(p), start: p.start + offset, end: p.start + offset, affinity: pointAffinity(p, length) }] : [];
    const a = Math.max(start, p.start), b = Math.min(end - 1, p.end);
    return a <= b ? [{ ...clone(p), start: a + offset, end: b + offset }] : [];
  });
}
/** Point-specific replacement; undefined means the point was consumed. */
export function replacePoint(p: JsonObject, start: number, end: number, inserted: number, length: number): JsonObject | undefined {
  const x = Number(p.start), affinity = pointAffinity(p, length);
  if (end > start && includesPoint(p, start, end, length)) return undefined;
  const next = x < start || x === start && affinity === 'before' ? x : x >= end ? x + inserted - (end - start) : start + inserted;
  return { ...clone(p), start: next, end: next, affinity };
}

export function mapStandoffPropertiesForReplacement(
  properties: unknown[],
  start: number,
  end: number,
  insertedLength: number,
  origins: (number | null)[],
  length = end,
): unknown[] {
  const removedLength = end - start;
  const delta = insertedLength - removedLength;

  return properties.flatMap((property, index) => {
    const retain = (value: unknown) => { origins.push(index); return [value]; };
    if (!property || typeof property !== "object") return retain(clone(property));
    const mapped = clone(property as Record<string, unknown>);
    const propertyStart = typeof mapped.start === "number" ? mapped.start : undefined;
    const propertyEnd = typeof mapped.end === "number" ? mapped.end : undefined;
    if (
      propertyStart === undefined ||
      propertyEnd === undefined ||
      propertyEnd < propertyStart
    ) {
      return retain(mapped);
    }

    if (mapped.isZeroWidth === true) {
      const point = replacePoint(mapped, start, end, insertedLength, length);
      return point ? retain(point) : [];
    }

    // Standoff ranges are inclusive Cell ranges, while replacement ranges are
    // half-open boundaries. An insertion at a range edge stays outside that
    // range; an insertion strictly inside it expands the range.
    if (removedLength === 0) {
      if (insertedLength === 0 || propertyEnd < start) return retain(mapped);
      if (propertyStart >= start) {
        mapped.start = propertyStart + insertedLength;
        mapped.end = propertyEnd + insertedLength;
      } else {
        mapped.end = propertyEnd + insertedLength;
      }
      return retain(mapped);
    }

    if (propertyEnd < start) return retain(mapped);
    if (propertyStart >= end) {
      mapped.start = propertyStart + delta;
      mapped.end = propertyEnd + delta;
      return retain(mapped);
    }

    const survivesBefore = propertyStart < start;
    const survivesAfter = propertyEnd >= end;
    if (!survivesBefore && !survivesAfter) return [];

    mapped.start = survivesBefore ? propertyStart : start + insertedLength;
    mapped.end = survivesAfter ? propertyEnd + delta : start - 1;
    return typeof mapped.start === "number" &&
      typeof mapped.end === "number" &&
      mapped.start <= mapped.end
      ? retain(mapped)
      : [];
  });
}
