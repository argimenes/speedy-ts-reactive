export interface ManagedAssetReference { kind: 'managed'; cavernId: string; assetId: string }
export interface AssetManifest extends ManagedAssetReference { mediaType: string; byteLength: number; width?: number; height?: number }
export function managedAsset(value: unknown): ManagedAssetReference | undefined {
  const v = value as Partial<ManagedAssetReference> | undefined;
  return v?.kind === 'managed' && typeof v.cavernId === 'string' && !!v.cavernId && typeof v.assetId === 'string' && /^sha256:[a-f0-9]{64}$/.test(v.assetId) ? v as ManagedAssetReference : undefined;
}
export const assetKey = (asset: ManagedAssetReference) => `${asset.cavernId}/${asset.assetId}`;
