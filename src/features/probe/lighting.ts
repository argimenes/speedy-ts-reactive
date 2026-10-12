import type { Light } from '../flint/material-response';

/** Optional host lighting. Without it the Probe uses its own default studio light. */
export interface ProbeLighting {
  readonly light: Light;
  readonly effects: { reducedMotion: boolean };
  subscribe(request: () => void): () => void;
}
