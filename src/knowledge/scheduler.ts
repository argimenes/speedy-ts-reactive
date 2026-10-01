/** Cooperative derived work. One host supplies scheduling; no input middleware. */
export type YieldControl = () => Promise<void>;
export const yieldTask: YieldControl = () => { const scheduler = (globalThis as any).scheduler; return scheduler?.postTask ? scheduler.postTask(() => { }, { priority: 'background' }) : new Promise(resolve => setTimeout(resolve, 0)); };
export class WorkSlice {
    private start = performance.now();
    private steps = 0;
    visits = 0;
    maxSliceMs = 0;
    constructor(private check: () => void, private pause: YieldControl = yieldTask, private maxSteps = 256, private maxMs = 4, private maxVisits = 4000000) { }
    async step() {
        if (++this.visits > this.maxVisits)
            throw Error('Knowledge work budget exceeded');
        if (++this.steps < this.maxSteps && performance.now() - this.start < this.maxMs)
            return;
        this.check();
        this.maxSliceMs = Math.max(this.maxSliceMs, performance.now() - this.start);
        await this.pause();
        this.check();
        this.steps = 0;
        this.start = performance.now();
    }
    finish() { this.check(); this.maxSliceMs = Math.max(this.maxSliceMs, performance.now() - this.start); }
}
/** Conservatively charge strings, slots and objects, including unknown authored values.
 * Iterative and cancellable; no stringify/capture, and no retained identity graph. */
export async function estimateBytes(value: unknown, work: WorkSlice, limit: number): Promise<number> {
    const queue = [value], seen = new Set<object>();
    let bytes = 0;
    while (queue.length) {
        await work.step();
        const v = queue.pop();
        if (typeof v === 'string')
            bytes += 32 + v.length * 2;
        else if (v && typeof v === 'object') {
            if (seen.has(v))
                continue;
            seen.add(v);
            // The saved authored-value grammar permits plain objects/arrays,
            // not hidden Map/Set/host storage that an enumerable-slot charge
            // would miss. Never clone an uncharged large object.
            const prototype = Object.getPrototypeOf(v);
            if (!Array.isArray(v) && prototype !== Object.prototype && prototype !== null)
                throw Error('Unsupported Facts value object');
            if (Array.isArray(v) && v.length > limit / 8)
                throw Error('Knowledge Facts memory/work budget exceeded');
            bytes += 64;
            for (const key in v) {
                await work.step();
                if (Object.hasOwn(v, key)) {
                    bytes += 32 + key.length * 2;
                    queue.push((v as any)[key]);
                }
            }
        }
        else
            bytes += 16;
        if (bytes > limit)
            throw Error('Knowledge Facts memory/work budget exceeded');
    }
    return bytes;
}
