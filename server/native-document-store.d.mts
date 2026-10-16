import type { Router } from 'express';
export function createNativeDocumentStoreRouter(options: { root: string; defaultVault?: string; establishVault?: (vault:string)=>Promise<unknown>; readOnly?: boolean; fault?: (stage: string, context?: any) => Promise<void>; coordinate?: <T>(action: () => Promise<T>) => Promise<T> }): Router;

export function createNativeDocumentStore(options: Parameters<typeof createNativeDocumentStoreRouter>[0]): {router: Router; readNative(location: {folder:string;filename:string}, signal?:AbortSignal): Promise<{kind:string;native:string;resourceId:string;baseline:{nativeHash:string;generation:string|null};pending:unknown;readOnly:boolean}>};
