export const PROBE_STANDARD_HEIGHT = 42;
export const PROBE_MIN_HEIGHT = 16;
export const PROBE_MAX_HEIGHT = 128;

export function clampProbeSize(value: number) {
  return Number.isFinite(value) ? Math.min(PROBE_MAX_HEIGHT, Math.max(PROBE_MIN_HEIGHT, value)) : PROBE_STANDARD_HEIGHT;
}
