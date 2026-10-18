import {build} from 'esbuild';
await build({entryPoints:['src/structured/mermaid-frame.ts'],outfile:'public/mutable-mermaid.js',bundle:true,format:'iife',platform:'browser',minify:true,target:'es2022',logLevel:'warning'});
