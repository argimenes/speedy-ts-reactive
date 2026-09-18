import { describe, expect, it, vi } from "vitest";
import { CanonicalRepository } from "../../block-tree/repository";
import { clone } from "../../block-tree/clone";
import { runSchedule } from "../../../scripts/stage-c-gates/cost-scheduler";
import { costFixture } from "./cost-fixture";

describe("G3 lossless fixed-target scheduler", () => {
  it.each([1, 17, 391])("preserves all indices and original deadlines after repeated pauses (seed %i)", async seed => {
    let clock = 123, state = seed, tasks = 0, lastTask = 0, acknowledgements = 0;
    const targets: number[] = [], edits: number[] = [], ackQueue: (() => void)[] = [];
    await runSchedule(3000, 200, {
      now: () => clock,
      wait: async (delay, index, target) => {
        expect(delay).toBe(Math.max(0, target - clock));
        expect(target).toBe(123 + index * 200);
        clock += delay;
        state = (state * 1664525 + 1013904223) >>> 0;
        if (state % 97 === 0) clock += 73000;
        tasks++; while (ackQueue.length) ackQueue.shift()!();
      },
      edit: (index, target) => {
        expect(tasks).toBe(lastTask + 1); lastTask = tasks;
        expect(acknowledgements).toBe(index);
        targets.push(target); edits.push(index); clock += 40;
        ackQueue.push(() => acknowledgements++);
      },
    });
    expect(edits).toEqual(Array.from({ length: 3000 }, (_, i) => i));
    expect(targets.at(-1)).toBe(123 + 2999 * 200);
    expect(ackQueue).toHaveLength(1);
  });

  it("reproduces the old cap failure without boundaries and services a 73-second catch-up with them", async () => {
    // Worker completions are already posted but their main handlers are tasks.
    let oldInFlight = 0, oldDelivered = 0;
    const oldTasks: (() => void)[] = [];
    for (let i = 0; i < 65; i++) {
      if (oldInFlight === 64) break;
      oldInFlight++; oldTasks.push(() => { oldInFlight--; oldDelivered++; });
    }
    expect(oldInFlight).toBe(64); expect(oldDelivered).toBe(0);
    let clock = 0, inFlight = 0, delivered = 0, maxInFlight = 0;
    const tasks: (() => void)[] = [];
    await runSchedule(400, 200, {
      now: () => clock,
      wait: async (delay, index) => { clock += delay + (index === 10 ? 73000 : 0); while (tasks.length) tasks.shift()!(); },
      edit: () => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); tasks.push(() => { inFlight--; delivered++; }); clock += 40; },
    });
    while (tasks.length) tasks.shift()!();
    expect(delivered).toBe(400); expect(inFlight).toBe(0); expect(maxInFlight).toBe(1);
  });

  it("keeps separate real command commits and every undo/redo intermediate state during catch-up", async () => {
    const s = costFixture(100), commits: any[] = [];
    const reference = new CanonicalRepository(s.repository.snapshot(), { enforceBlockIdentity: true });
    (reference as any).historyStorage.store = (commitId: string, label: string, forward: unknown, inverse: unknown) => ({ commitId, label, forward: clone(forward), inverse: clone(inverse) });
    const commit = s.repository.commit.bind(s.repository);
    const spy = vi.spyOn(s.repository, "commit").mockImplementation((...args) => {
      const result = commit(...args); reference.commit(...args); return result;
    });
    s.repository.subscribeCommits(event => commits.push(event), error => { throw error; });
    let clock = 0;
    await runSchedule(80, 200, {
      now: () => clock,
      wait: async (delay, index) => { clock += delay + (index === 5 ? 73000 : 0); },
      edit: index => { s.edit(index); expect(s.repository.snapshot()).toEqual(reference.snapshot()); clock += 40; },
    });
    spy.mockRestore();
    const stack = (s.repository as any).undoStack;
    expect(stack).toHaveLength(80);
    expect(commits).toHaveLength(80);
    expect(stack.map((entry: any) => entry.commitId)).toEqual(commits.map(event => event.commitId));
    for (let i = 79; i >= 0; i--) { s.repository.undo(); reference.undo(); expect(s.repository.snapshot()).toEqual(reference.snapshot()); }
    expect(s.repository.canUndo()).toBe(false);
    for (let i = 1; i <= 80; i++) { s.repository.redo(); reference.redo(); expect(s.repository.snapshot()).toEqual(reference.snapshot()); }
    expect(s.repository.canRedo()).toBe(false);
  });
});
