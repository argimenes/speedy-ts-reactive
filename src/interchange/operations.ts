import { portableProjection } from './package/projection';
import { createPackage, openPackage, type PackageAsset, type PackageManifest } from './package/format';
import { packageFragment, materializePackage } from './package/native';
import type { PackageData } from './package/data';
import { compileSourcePreview } from './source-preview';
import { sourceFragment } from './source-block';
import { checkFiles, readSelectedFile } from './file-input';
import { prepareFiles, convertSource } from './document-import';
import { exportFragment } from './export-plan';
import { materializeFragment } from './materialize';
import type { SuppliedFile } from './file-input';
import type { ImportFormat, ExportFormat } from './formats';
import type { MutableFragment, InterchangeScope } from './fragment';
export type InterchangeRequest =
 | {kind:'portable-export';fragment:MutableFragment;assets:PackageAsset[];format:'html'|'markdown';standalone?:boolean;title:string}
 | {kind:'package-create';native:Uint8Array;source:PackageManifest['source'];data:PackageData;schema:unknown;assets:PackageAsset[]}
 | {kind:'package-open';bytes:Uint8Array}
 | {kind:'package-materialize';fragment:MutableFragment;cavernId?:string;assets:[string,string][];context:{data:PackageData;schema:unknown;source:unknown}}
 | {kind:'files';files:SuppliedFile[];format?:ImportFormat}
 | {kind:'preview';source:string;format:'html'|'markdown'}
 | {kind:'embed';files:SuppliedFile[];format?:ImportFormat}
 | {kind:'convert';source:string;format:'html'|'markdown'}
 | {kind:'export';fragment:MutableFragment;format:ExportFormat;title?:string;document?:boolean}
 | {kind:'materialize';fragment:MutableFragment;scope:InterchangeScope;assets:[string,string][]};
export async function prepareInterchange(request:InterchangeRequest) {
 switch(request.kind){
  case 'portable-export':return portableProjection(request.fragment,request.assets,request.format,request.standalone,request.title);
  case 'package-create':return createPackage(request.native,request.source,request.data,request.schema,request.assets);
  case 'package-open':{const result=await openPackage(request.bytes);return {...result,fragment:packageFragment(result.snapshot,result.manifest.source.cavernId)};}
  case 'package-materialize':return materializePackage(request.fragment,request.cavernId,request.assets,request.context);
  case 'preview':return compileSourcePreview(request.source,request.format);
  case 'embed':return prepareSourceFiles(request.files,request.format);
  case 'files':return prepareFiles(request.files,request.format);
  case 'convert':return convertSource(request.source,request.format);
  case 'export':return exportFragment(request.fragment,request.format,request.title,request.document);
  case 'materialize':return materializeFragment(request.fragment,request.scope,new Map(request.assets));
 }
}
export type Prepared<R extends InterchangeRequest> = R extends {kind:'portable-export'} ? Awaited<ReturnType<typeof portableProjection>> : R extends {kind:'package-create'} ? Uint8Array : R extends {kind:'package-open'} ? Awaited<ReturnType<typeof openPackage>>&{fragment:MutableFragment} : R extends {kind:'package-materialize'} ? ReturnType<typeof materializePackage> : R extends {kind:'preview'} ? ReturnType<typeof compileSourcePreview> : R extends {kind:'embed'} ? Awaited<ReturnType<typeof prepareSourceFiles>> : R extends {kind:'files'} ? Awaited<ReturnType<typeof prepareFiles>> : R extends {kind:'convert'} ? ReturnType<typeof convertSource> : R extends {kind:'export'} ? ReturnType<typeof exportFragment> : ReturnType<typeof materializeFragment>;

async function prepareSourceFiles(files:SuppliedFile[],format?:ImportFormat) {
 checkFiles(files);const fragments=[];
 for(const file of files){const read=await readSelectedFile(file,format);if(read.format!=='html'&&read.format!=='markdown')throw Error('Embed source accepts HTML or Markdown files only.');
 fragments.push(sourceFragment(read.format,read.source,{provenance:{version:1,filename:file.name.split(/[\\/]/).at(-1)!,encoding:read.encoding!,bom:read.bom!,byteHash:read.byteHash}}));}
 return fragments;
}
