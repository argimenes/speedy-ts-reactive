export function imageType(data:Uint8Array){
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
 const dimensions=(w:number,h:number)=>{if(!w||!h||w>16384||h>16384||w*h>40000000)throw Error('Image dimensions exceed package limits');};
 if(data.length>=33&&[137,80,78,71,13,10,26,10].every((v,i)=>data[i]===v)){
  let at=8,first=true,ended=false;
  while(at+12<=data.length){const n=view.getUint32(at),type=String.fromCharCode(...data.subarray(at+4,at+8));if(at+12+n>data.length||type==='acTL')throw Error('Invalid or animated PNG');
   if(first){if(type!=='IHDR'||n!==13)throw Error('Missing PNG header');dimensions(view.getUint32(at+8),view.getUint32(at+12));first=false;}
   at+=12+n;if(type==='IEND'){ended=n===0&&at===data.length;break;}
  }if(!ended)throw Error('PNG terminator/trailing data');return 'image/png';
 }
 if(data.length>=4&&data[0]===255&&data[1]===216){let at=2,frame=false,ended=false;
  while(at<data.length){if(data[at++]!==255)throw Error('Invalid JPEG marker');while(data[at]===255)at++;const marker=data[at++];if(marker===217){ended=at===data.length;break;}if(marker===216||marker===0||at+2>data.length)throw Error('Invalid JPEG');if(marker===1)continue;
   const size=view.getUint16(at);if(size<2||at+size>data.length)throw Error('Truncated JPEG');
   if(marker>=192&&marker<=207&&![196,200,204].includes(marker)){if(frame||size<8)throw Error('Invalid JPEG frame');dimensions(view.getUint16(at+5),view.getUint16(at+3));frame=true;}
   at+=size;
   if(marker===218)while(at<data.length){if(data[at++]!==255)continue;const start=at-1;while(data[at]===255)at++;const next=data[at++];if(next===0||next>=208&&next<=215)continue;at=start;break;}
  }if(!ended||!frame)throw Error('JPEG frame/terminator missing');return 'image/jpeg';
 }throw Error('Package asset is not PNG/JPEG');
}
