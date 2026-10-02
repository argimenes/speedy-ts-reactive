import type { Router } from 'express';
export function createNativeDocumentStoreRouter(options: { root: string; readOnly?: boolean; fault?: (stage: string, context?: any) => Promise<void>; coordinate?: <T>(action: () => Promise<T>) => Promise<T> }): Router;
