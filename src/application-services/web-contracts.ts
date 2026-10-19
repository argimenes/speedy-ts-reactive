import type { WebCapture, WebProjection } from "../web-resources/model";
export interface WebOperations {
  "web.import": {
    input: { id: string; source: string; file?:import("../web-resources/everyday").WebFile; format?:"feed"; everyday?:boolean };
    output: { capture: WebCapture; jobId: string };
  };
  "web.resume": {
    input: { id: string };
    output: { capture: WebCapture; jobId: string };
  };
  "web.embed": {
    input: { source: string };
    output: { url?: string; message?: string };
  };
}
export const webOperations = ["web.import", "web.resume", "web.embed"] as const;
export interface WebTask {
  kind: "web-project";
  bytes: Uint8Array;
}
export interface WebResult {
  kind: "web-projection";
  projection: WebProjection;
}
