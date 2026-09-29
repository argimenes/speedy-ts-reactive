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
  /** Composite Document application; transient tabs share canonical content. */
  flint: boolean;
  /** Initial Document format arrangements and creation menu. */
  documentFormats: boolean;
  threeDObjects: boolean;
  /** Block-relative presentation; disable to retain data with ordinary rendering. */
  anchorRelationships: boolean;
  /** Canonical Desktop/Canvas presentation. The main application enables it;
   * other editor hosts opt in explicitly. */
  canvasWorkspace: boolean;
  /** Experimental study presentation; explicitly opt in at application assembly. */
  spatialWorkspace: boolean;
  /** Existing Timer capability remains on; activation is decided by application composition. */
  timer: boolean;
  /** Existing retained selection behavior, activated only by application composition. */
  grouping: boolean;
  /** Existing Entity References, activated by application composition. */
  entityReferences: boolean;
  blockHistory: boolean;
  codexSystemBar: boolean;
  compactDocumentMode: boolean;
  compactEditorChrome: boolean;
  publicHostedVersion: boolean;
  textSuperposition: boolean;
}>;

export const featureFlags: FeatureFlags = Object.freeze({
  flint: true,
  documentFormats: true,
  threeDObjects: true,
  anchorRelationships: true,
  canvasWorkspace: false,
  spatialWorkspace: false,
  timer: true,
  grouping: true,
  entityReferences: true,
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
