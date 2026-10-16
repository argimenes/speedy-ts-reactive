import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
await build({entryPoints:[fileURLToPath(new URL('server/application-services/host.ts',root))],outfile:fileURLToPath(new URL('dist/server/application-services/host.js',root)),bundle:true,platform:'node',format:'esm',target:'node22',external:['express','fs-ext'],plugins:[{name:'existing-native-store',setup(b){b.onResolve({filter:/native-document-store\.mjs$/},()=>({path:'../native-document-store.mjs',external:true}));}}]});
await build({entryPoints:[fileURLToPath(new URL('server/application-services/preparation-worker.ts',root))],outfile:fileURLToPath(new URL('dist/server/application-services/preparation-worker.mjs',root)),bundle:true,platform:'node',format:'esm',target:'node22'});
