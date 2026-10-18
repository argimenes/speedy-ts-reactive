/** Tiny deterministic valid PDFs, generated without another PDF parser/library. */
export function pdfFixture(pages=2,imageOnly=false,encrypted=false){
 const objects:string[]=[];const pageIds=Array.from({length:pages},(_,i)=>4+i*2);
 objects.push('<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${pageIds.map(n=>n+' 0 R').join(' ')}] /Count ${pages} >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 for(let i=0;i<pages;i++){const content=imageOnly?'q 200 0 0 200 30 30 cm BI /W 1 /H 1 /CS /RGB /BPC 8 ID\n\x00\x00\x00\nEI Q':`BT /F1 20 Tf 40 720 Td (Academic PDF page ${i+1}) Tj 0 -30 Td (Selectable text and source alignment.) Tj ET`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i]+1} 0 R >>`,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);}
 if(encrypted)objects.push('<< /Filter /Standard /V 1 /R 2 /Length 40 /O <'+ '00'.repeat(32)+' > /U <'+'00'.repeat(32)+'> /P -4 >>');
 let out='%PDF-1.7\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(out.length);out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=out.length;out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R ${encrypted?'/Encrypt '+objects.length+' 0 R /ID [<00000000000000000000000000000000><00000000000000000000000000000000>]':''} >>\nstartxref\n${xref}\n%%EOF\n`;return new TextEncoder().encode(out);
}
