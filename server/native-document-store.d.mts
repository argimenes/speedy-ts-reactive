import type { Router } from 'express';
export function createNativeDocumentStoreRouter(options: { root: string; defaultVault?: string; establishVault?: (vault:string)=>Promise<unknown>; readOnly?: boolean; fault?: (stage: string, context?: any) => Promise<void>; coordinate?: <T>(action: () => Promise<T>) => Promise<T> }): Router;
