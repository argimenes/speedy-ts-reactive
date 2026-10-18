import sharp from 'sharp';
import { IMAGE_LIMITS } from './asset-image-validation.mjs';
sharp.cache(false); sharp.concurrency(1);
process.once('message', async input => {
  const bytes=input.bytes??input, L=input.limits??IMAGE_LIMITS;
  try {
    const png = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpeg) throw Error('Only validated PNG/JPEG originals are supported.');
    // Reject animation and bytes after the image terminator. Metadata remains original.
    if (png) {
      let pos = 8, ended = false;
      while (pos + 12 <= bytes.length) {
        const n = bytes.readUInt32BE(pos), type = bytes.toString('ascii', pos+4, pos+8);
        if (n > L.bytes || pos + 12 + n > bytes.length || type === 'acTL') throw Error('Invalid or animated PNG.');
        pos += 12 + n;
        if (type === 'IEND') { ended = n === 0 && pos === bytes.length; break; }
      }
      if (!ended) throw Error('Invalid PNG terminator or trailing data.');
    } else {
      let pos = 2, ended = false;
      while (pos < bytes.length) {
        if (bytes[pos++] !== 255) throw Error('Invalid JPEG marker.');
        while (bytes[pos] === 255) pos++;
        const marker = bytes[pos++];
        if (marker === 217) { ended = pos === bytes.length; break; }
        if (marker === 216 || marker === 0 || pos + 2 > bytes.length) throw Error('Invalid JPEG stream.');
        if (marker === 1) continue;
        const size = bytes.readUInt16BE(pos);
        if (size < 2 || pos + size > bytes.length) throw Error('Truncated JPEG segment.');
        pos += size;
        if (marker === 218) {
          while (pos < bytes.length) {
            if (bytes[pos++] !== 255) continue;
            const start = pos - 1;
            while (bytes[pos] === 255) pos++;
            const next = bytes[pos++];
            if (next === 0 || next >= 208 && next <= 215) continue;
            pos = start; break;
          }
        }
      }
      if (!ended) throw Error('Invalid JPEG terminator or trailing data.');
    }
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: L.pixels, sequentialRead: true });
    const info = await image.metadata();
    if (!['png','jpeg'].includes(info.format) || (info.pages ?? 1) !== 1 || !info.width || !info.height || info.width > L.dimension || info.height > L.dimension || info.width * info.height > L.pixels) throw Error('Image dimensions/frames exceed the import limits.');
    // Force a complete decode, discarding pixels. Never encode or replace the original.
    await image.stats();
    process.send({ mediaType: png ? 'image/png' : 'image/jpeg', width: info.width, height: info.height, byteLength: bytes.length });
  } catch (error) { process.send({ error: error.message }); }
});
