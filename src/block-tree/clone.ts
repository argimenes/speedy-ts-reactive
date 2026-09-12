export function clone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return structuredClone(value);
}
