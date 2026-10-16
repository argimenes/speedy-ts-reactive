import { Inflate, zipSync } from 'fflate';
export const PACKAGE_LIMITS={compressed:64*1024*1024,expanded:96*1024*1024,members:256,manifest:256*1024,native:8*1024*1024,data:8*1024*1024,assets:40*1024*1024,images:20};
const utf8=new TextDecoder('utf-8',{fatal:true});
export const bytes=(text:string)=>new TextEncoder().encode(text);
export const hash=async(data:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(data)))].map(v=>v.toString(16).padStart(2,'0')).join('');
export const json=(data:Uint8Array)=>JSON.parse(utf8.decode(data));
export function memberPath(name:string){if(!/^[A-Za-z0-9_./-]+$/.test(name)||name.startsWith('/')||name.split('/').some(s=>!s||s==='.'||s==='..')||name.length>200)throw Error('Unsafe archive member path');return name;}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
function crc32(data:Uint8Array){let crc=0xffffffff;for(const v of data)crc=(crc>>>8)^crcTable[(crc^v)&255];return (crc^0xffffffff)>>>0;}
/** Strict v1 container admission before inflation; no archive path is ever written to disk. */
export function unpackZip(input:Uint8Array):Map<string,Uint8Array>{
 if(input.length<22||input.length>PACKAGE_LIMITS.compressed)throw Error('Package compressed size limit');
 const v=new DataView(input.buffer,input.byteOffset,input.byteLength),u16=(p:number)=>v.getUint16(p,true),u32=(p:number)=>v.getUint32(p,true),end=input.length-22;
 if(u32(end)!==0x06054b50||u16(end+4)||u16(end+6)||u16(end+20)||u16(end+8)!==u16(end+10)||u32(end+12)+u32(end+16)!==end)throw Error('Unsupported ZIP directory (split, ZIP64, comments or trailing bytes)');
 const count=u16(end+10),central=u32(end+16);if(!count||count>PACKAGE_LIMITS.members)throw Error('Package member limit');
 const output=new Map<string,Uint8Array>(),names=new Set<string>();let at=central,localEnd=0,total=0,compressed=0;
 const extras=(start:number,length:number)=>{const end=start+length;while(start<end){if(start+4>end)throw Error('Malformed ZIP extra');const kind=u16(start),n=u16(start+2);if(kind!==0x5455||n>13||start+4+n>end)throw Error('Unsupported ZIP extra (including ZIP64 and link metadata)');start+=4+n;}};
 for(let i=0;i<count;i++){
  if(at+46>end||u32(at)!==0x02014b50)throw Error('Malformed ZIP directory');
  const flags=u16(at+8),method=u16(at+10),crc=u32(at+16),size=u32(at+20),length=u32(at+24),nl=u16(at+28),el=u16(at+30),cl=u16(at+32),offset=u32(at+42),attrs=u32(at+38),mode=(attrs>>>16)&0xf000;
  if(flags&~0x800||![0,8].includes(method)||u16(at+34)||cl||![0,0x8000].includes(mode)||(attrs&0x50)||at+46+nl+el>end)throw Error('Unsupported ZIP member flags/type');
  const name=memberPath(utf8.decode(input.subarray(at+46,at+46+nl))),fold=name.normalize('NFC').toLowerCase();if(names.has(fold))throw Error('Duplicate archive path');names.add(fold);extras(at+46+nl,el);
  if(length>PACKAGE_LIMITS.expanded||length>Math.max(1,size)*100||(total+=length)>PACKAGE_LIMITS.expanded)throw Error('Package expansion limit');compressed+=size;
  if(offset!==localEnd||offset+30>central||u32(offset)!==0x04034b50||u16(offset+6)!==flags||u16(offset+8)!==method||u32(offset+14)!==crc||u32(offset+18)!==size||u32(offset+22)!==length||u16(offset+26)!==nl)throw Error('Local/central ZIP mismatch');
  const ln=u16(offset+28),start=offset+30+nl+ln;extras(offset+30+nl,ln);
  if(start+size>central||utf8.decode(input.subarray(offset+30,offset+30+nl))!==name)throw Error('Malformed ZIP member');
  const result=new Uint8Array(length);let written=0;
  const append=(chunk:Uint8Array)=>{if(written+chunk.length>length)throw Error('Actual expanded byte limit');result.set(chunk,written);written+=chunk.length;};
  if(method===0)append(input.subarray(start,start+size));else{const stream=new Inflate(append);for(let p=0;p<size;p+=1024)stream.push(input.subarray(start+p,start+Math.min(size,p+1024)),p+1024>=size);}
  if(written!==length||crc32(result)!==crc)throw Error('Archive length/CRC mismatch');
  output.set(name,result);localEnd=start+size;at+=46+nl+el;
 }
 if(at!==end||localEnd!==central||total>Math.max(1,compressed)*100)throw Error('Unlisted archive data');return output;
}
export function packZip(members:Record<string,Uint8Array>){for(const p of Object.keys(members))memberPath(p);const zip=zipSync(members,{level:0});unpackZip(zip);return zip;}
