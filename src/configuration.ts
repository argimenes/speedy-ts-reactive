/**
 * Application feature switches.
 *
 * `compactEditorChrome` defaults on; set false to use the previous wrapping toolbar.
 * `compactDocumentMode` defaults on; set false to hide the laptop-density
 * presentation and per-window Compact Document control.
 * `codexSystemBar` defaults on; set false to use the previous workspace toolbar.
 *
 * Block history is deliberately opt-in while the feature is being introduced.
 * Set `blockHistory` to `true` to expose the History/Restore UI and allow a
 * ReactiveEditor to start session or persistent history recording.
 *
 * `publicHostedVersion` separates the read-only hosted stores from browser-local
 * JSON file operations. It is enabled by default on the public-hosted-version
 * feature branch.
 *
 * `textSuperposition` is an experimental projected-reading feature and remains
 * disabled unless a host or dedicated demo explicitly enables it.
 */
export type FeatureFlags = Readonly<{
  /** Existing Timer capability remains on; activation is decided by application composition. */
  timer: boolean;
  blockHistory: boolean;
  codexSystemBar: boolean;
  compactDocumentMode: boolean;
  compactEditorChrome: boolean;
  publicHostedVersion: boolean;
  textSuperposition: boolean;
}>;

export const featureFlags: FeatureFlags = Object.freeze({
  timer: true,
  blockHistory: false,
  codexSystemBar: true,
  compactDocumentMode: true,
  compactEditorChrome: true,
  publicHostedVersion: true,
  textSuperposition: false,
});

export type ReactiveEditorConfiguration = {
  features?: Partial<FeatureFlags>;
};

export function resolveFeatureFlags(configuration: ReactiveEditorConfiguration = {}): FeatureFlags {
  return Object.freeze({ ...featureFlags, ...configuration.features });
}
