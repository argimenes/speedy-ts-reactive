import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeDocument, encodeDocument } from "./codecs";

const fixtures = ["medieval.json", "manuscript.json"];

describe("existing document fixtures", () => {
  for (const fixture of fixtures) {
    it(`round-trips data/templates/${fixture}`, () => {
      const filepath = path.join(process.cwd(), "data", "templates", fixture);
      const source = JSON.parse(fs.readFileSync(filepath, "utf8"));
      const decoded = decodeDocument(source);
      expect(encodeDocument(decoded.state)).toEqual(source);
    });
  }
});
