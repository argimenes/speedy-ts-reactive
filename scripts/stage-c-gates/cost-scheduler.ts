/** Fixed target schedule, lossless catch-up. A microtask is NOT a task boundary. */
export async function runSchedule(total: number, intervalMs: number, hooks: {
  now(): number;
  wait(delayMs: number, index: number, target: number): Promise<void>;
  edit(index: number, target: number): void | Promise<void>;
}) {
  const start = hooks.now();
  for (let index = 0; index < total; index++) {
    const target = start + index * intervalMs;
    // Every edit enters through a timer task, including overdue edits. Never
    // reset the origin, skip an index, batch commands or wait for recorder credit.
    await hooks.wait(Math.max(0, target - hooks.now()), index, target);
    await hooks.edit(index, target);
  }
}
