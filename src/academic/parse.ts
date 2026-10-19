import { bibliography } from './bibliography';
import { parseOcr } from './ocr';
import { parseEpub } from './epub';
import { normalizeProvider } from './providers';
import type { AcademicIdentifier } from './identifiers';
import type { AcademicFormat } from './model';
export function parseAcademic(
  bytes: Uint8Array,
  format: AcademicFormat | 'ocr',
  identity?: AcademicIdentifier,
  secondary?: Uint8Array,
  discovery?: Uint8Array[]
) {
  if (format === 'epub') return parseEpub(bytes);
  if (bytes.length > (format === 'alto' || format === 'page' || format === 'ocr' ? 8 : 2) * 1024 * 1024)
    throw Error('Academic original size limit');
  if (format === 'bibtex' || format === 'ris')
    return bibliography(new TextDecoder('utf-8', { fatal: true }).decode(bytes), format);
  if (format === 'alto' || format === 'page' || format === 'ocr') {
    const result = parseOcr(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (format !== 'ocr' && result.kind !== format) throw Error('OCR format mismatch');
    return result;
  }
  if (!identity || identity.family !== format) throw Error('Provider identity required');
  return normalizeProvider(identity, bytes, secondary, discovery);
}
