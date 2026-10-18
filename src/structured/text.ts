import {decodeSource} from '../interchange/file-input';
import {STRUCTURED_LIMITS} from './model';
export function structuredText(bytes:Uint8Array){if(bytes.length>STRUCTURED_LIMITS.bytes)throw Error('Read-only resources are limited to 2 MiB.');return decodeSource(bytes);}
