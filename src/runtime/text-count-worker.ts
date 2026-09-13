import { countText } from "./text-counts";
self.onmessage = (event: MessageEvent<{ id: number; text: string }>) => {
  self.postMessage({ id: event.data.id, counts: countText(event.data.text) });
};
