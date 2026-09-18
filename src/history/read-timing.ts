/** Scalar diagnostics only. One sample per selection; no historical bodies retained. */
export type ReadMeasure = <T>(name: string, action: () => T) => T;
export interface ReadTiming {
  stages: Record<string, number>;
  chunks: number; fetchedBytes: number; replayRecords: number;
  checkpointHits: number; headHits: number;
  workerMs?: number; queueMs?: number; roundTripMs?: number; resultFreezeMs?: number;
  uiMs?: number; totalMs?: number;
}
export function readTiming() {
  const timing: ReadTiming = { stages: {}, chunks: 0, fetchedBytes: 0, replayRecords: 0, checkpointHits: 0, headHits: 0 };
  const measure: ReadMeasure = (name, action) => { const start = performance.now(); try { return action(); } finally { timing.stages[name] = (timing.stages[name] ?? 0) + performance.now() - start; } };
  const asyncMeasure = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
    const start = performance.now(); try { return await action(); } finally { timing.stages[name] = (timing.stages[name] ?? 0) + performance.now() - start; }
  };
  return { timing, measure, asyncMeasure };
}
