/**
 * Application feature switches.
 *
 * Block history is deliberately opt-in while the feature is being introduced.
 * Set `blockHistory` to `true` to expose the History/Restore UI and allow a
 * ReactiveEditor to start session or persistent history recording.
 *
 * `publicHostedVersion` separates the read-only hosted stores from browser-local
 * JSON file operations. It is enabled by default on the public-hosted-version
 * feature branch.
 */
export type FeatureFlags = Readonly<{
  blockHistory: boolean;
  publicHostedVersion: boolean;
}>;

export const featureFlags: FeatureFlags = Object.freeze({
  blockHistory: false,
  publicHostedVersion: true,
});

export type ReactiveEditorConfiguration = {
  features?: Partial<FeatureFlags>;
};

export function resolveFeatureFlags(configuration: ReactiveEditorConfiguration = {}): FeatureFlags {
  return Object.freeze({ ...featureFlags, ...configuration.features });
}
