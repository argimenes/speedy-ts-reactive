// Read-only census. Run from the repository root; optional arguments select JSON stores.
import ts from "typescript";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const schemaFile = "src/blocks/standoff-editor-block.ts";
const source = ts.createSourceFile(schemaFile, await readFile(schemaFile, "utf8"), ts.ScriptTarget.Latest, true);
const property = (object, name) => object.properties.find((item) => item.name?.getText(source) === name);
let schemas = [];
function inspectSchema(node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(source) === "getStandoffSchemas") {
    const statement = node.body.statements.find(ts.isReturnStatement);
    let array = statement.expression;
    while (!ts.isArrayLiteralExpression(array)) array = array.expression;
    schemas = array.elements.map((item) => ({
      type: property(item, "type").initializer.text,
      source: schemaFile,
      line: source.getLineAndCharacterOfPosition(item.getStart(source)).line + 1,
      mechanisms: ["decorate", "wrap", "render", "event"].filter((name) => property(item, name)),
    }));
  }
  ts.forEachChild(node, inspectSchema);
}
inspectSchema(source);

const stores = [];
for (const root of process.argv.slice(2).length ? process.argv.slice(2) : ["data", "../codex-data/data"]) {
  const properties = new Map();
  const invalid = [];
  let files = 0;
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "appdb" && !entry.name.startsWith(".")) await scan(filename); continue; }
      if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue;
      let value;
      try { value = JSON.parse(await readFile(filename, "utf8")); files++; }
      catch { invalid.push(filename); continue; }
      const seen = new Set();
      function visit(item) {
        if (!item || typeof item !== "object") return;
        if (Array.isArray(item.standoffProperties)) for (const annotation of item.standoffProperties) {
          if (typeof annotation?.type !== "string") continue;
          let row = properties.get(annotation.type);
          if (!row) properties.set(annotation.type, row = { type: annotation.type, count: 0, files: 0, example: filename });
          row.count++; seen.add(annotation.type);
        }
        if (Array.isArray(item)) item.forEach(visit);
        else for (const [key, value] of Object.entries(item)) if (key !== "standoffProperties") visit(value);
      }
      visit(value);
      for (const type of seen) properties.get(type).files++;
    }
  }
  try {
    await scan(root);
    stores.push({ root, files, invalid, properties: [...properties.values()].sort((a, b) => a.type.localeCompare(b.type)) });
  } catch (error) { stores.push({ root, unavailable: error.message }); }
}
const processor = await readFile("src/library/text-processor.ts", "utf8");
const recognizerOnly = [...new Set([...processor.matchAll(/type:\s*"([^"]+)"/g)].map((match) => match[1]))]
  .filter((type) => !type.startsWith("block/") && !schemas.some((schema) => schema.type === type));
console.log(JSON.stringify({ schemas, recognizerOnly, stores }, null, 2));
