import { preparePaste, type PastePreparation } from './prepare';
self.onmessage = (event: MessageEvent<PastePreparation>) => {
  try { self.postMessage({ result: preparePaste(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
