import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const output=fileURLToPath(new URL('../dist/server/native-path-move',import.meta.url));
mkdirSync(fileURLToPath(new URL('../dist/server',import.meta.url)),{recursive:true});
const temporary=output+'-'+randomUUID();
try { execFileSync('cc',['-std=c11','-Wall','-Wextra','-Werror','-O2',fileURLToPath(new URL('../server/native-path-move.c',import.meta.url)),'-o',temporary],{stdio:'inherit'});
renameSync(temporary,output);
} finally { rmSync(temporary,{force:true}); }
