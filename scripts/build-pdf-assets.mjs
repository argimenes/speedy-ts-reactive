// Local PDF.js support data. No runtime CDN or provider dependency.
import {cp,mkdir,copyFile} from 'node:fs/promises';
const base=new URL('../',import.meta.url),target=new URL('public/pdfjs/',base);
await mkdir(target,{recursive:true});
for(const name of ['cmaps','standard_fonts','wasm'])await cp(new URL(`node_modules/pdfjs-dist/${name}`,base),new URL(name,target),{recursive:true});
await copyFile(new URL('node_modules/pdfjs-dist/LICENSE',base),new URL('LICENSE',target));
