/** Admission validates bounded text only; authored syntax may be malformed. */
export function validateStructuredOriginal(bytes){
 if(bytes.length>2*1024*1024)throw Error('Read-only original exceeds 2 MiB');
 let encoding='utf-8',start=0;if(bytes[0]===255&&bytes[1]===254){encoding='utf-16le';start=2;}else if(bytes[0]===254&&bytes[1]===255){encoding='utf-16be';start=2;}
 const text=new TextDecoder(encoding,{fatal:true}).decode(bytes.subarray(start));
 if(/[\u0000-\u0008\u000b\u000e-\u001f]/.test(text)||[...text].length>200000)throw Error('Binary or excessive read-only source');
 return {mediaType:'text/plain'};
}
