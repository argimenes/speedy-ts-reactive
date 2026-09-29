// Runs under Vitest's server transform, not the strict browser TS project.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { validateDocument } from "../../../server/document-store";

it("the current server validator rejects the proposed native envelope before writing", () => {
  const native = JSON.parse(readFileSync("artifacts/flint-b1/rich.mutable.json", "utf8"));
  expect(() => validateDocument(native)).toThrow("not a Block document");
});
