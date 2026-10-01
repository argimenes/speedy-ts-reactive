import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
await build({entryPoints:[fileURLToPath(new URL('../server/native-knowledge-worker.ts',import.meta.url))],outfile:fileURLToPath(new URL('../dist/server/native-knowledge-worker.js',import.meta.url)),bundle:true,platform:'node',format:'esm',target:'node22',sourcemap:true});
