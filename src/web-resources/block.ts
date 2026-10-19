import { emptyFragment, validateFragment } from "../interchange/fragment";
import { WEB_BLOCK, webCapture, type WebCapture } from "./model";
export function webBlock(capture: WebCapture) {
  if (!webCapture(capture)) throw Error("Invalid web capture");
  const f = emptyFragment();
  f.blocks = [
    {
      localId: "web",
      type: WEB_BLOCK,
      data: {
        web: JSON.parse(JSON.stringify(capture)),
        sourceUrl: capture.source,
      },
      children: [],
      relations: {},
      blockProperties: [],
    },
  ];
  f.placements = [
    {
      localId: "edge",
      kind: "owned",
      target: { kind: "local", object: "block", id: "web" },
    },
  ];
  f.roots = [
    {
      placement: "edge",
      openStart: false,
      openEnd: false,
      clippedStart: false,
      clippedEnd: false,
    },
  ];
  return validateFragment(f);
}
