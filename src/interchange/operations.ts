import { prepareFiles, convertSource } from './document-import';
import { exportFragment } from './export-plan';
import { materializeFragment } from './materialize';
import type { SuppliedFile } from './file-input';
import type { ImportFormat, ExportFormat } from './formats';
import type { MutableFragment, InterchangeScope } from './fragment';
export type InterchangeRequest =
 | {kind:'files';files:SuppliedFile[];format?:ImportFormat}
 | {kind:'convert';source:string;format:'html'|'markdown'}
 | {kind:'export';fragment:MutableFragment;format:ExportFormat;title?:string;document?:boolean}
 | {kind:'materialize';fragment:MutableFragment;scope:InterchangeScope;assets:[string,string][]};
export async function prepareInterchange(request:InterchangeRequest) {
 switch(request.kind){
  case 'files':return prepareFiles(request.files,request.format);
  case 'convert':return convertSource(request.source,request.format);
  case 'export':return exportFragment(request.fragment,request.format,request.title,request.document);
  case 'materialize':return materializeFragment(request.fragment,request.scope,new Map(request.assets));
 }
}
export type Prepared<R extends InterchangeRequest> = R extends {kind:'files'} ? Awaited<ReturnType<typeof prepareFiles>> : R extends {kind:'convert'} ? ReturnType<typeof convertSource> : R extends {kind:'export'} ? ReturnType<typeof exportFragment> : ReturnType<typeof materializeFragment>;
