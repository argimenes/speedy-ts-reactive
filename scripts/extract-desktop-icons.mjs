// Exact pixel extraction only; coordinates are retained alongside the original atlas.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const directory = new URL('../src/assets/desktop-icons/', import.meta.url);
const source = await readFile(new URL('source/mutable-app-atlas.png', directory));
const crops = JSON.parse(await readFile(new URL('source/crops.json', directory), 'utf8'));
for (const { id, ...rectangle } of crops) {
  const destination = new URL(`${id}.png`, directory);
  await sharp(source).extract(rectangle).png().toFile(fileURLToPath(destination));
}
console.log(`Extracted ${crops.length} lossless desktop icons.`);
