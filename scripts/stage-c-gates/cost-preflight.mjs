import { statfs } from 'node:fs/promises';
import { tmpdir, totalmem } from 'node:os';

/** Laboratory guard, not a production admission policy or a capacity claim.
 * Sustained traces retain ordinary undo and can cause substantial swap pressure. */
export async function costPreflight() {
  const volume = await statfs(tmpdir());
  const availableBytes = volume.bavail * volume.bsize;
  const minimumFreeBytes = 8 * 1024 ** 3;
  const result = { availableBytes, minimumFreeBytes, physicalMemoryBytes: totalmem() };
  if (availableBytes < minimumFreeBytes) throw new Error(`Sustained benchmark stopped before launch: ${availableBytes} temporary-volume bytes free; laboratory guard requires ${minimumFreeBytes}. Free resources or use another host; do not change editor undo to make this check pass.`);
  return result;
}
