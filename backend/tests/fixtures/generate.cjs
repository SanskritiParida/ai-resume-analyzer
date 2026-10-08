const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const { jsPDF } = require(root + '/node_modules/jspdf');
const JSZip = require(root + '/backend/node_modules/jszip');
const { PDFParse } = require(root + '/backend/node_modules/pdf-parse');
const directory = path.join(root, 'backend/tests/fixtures');
fs.mkdirSync(directory, {recursive:true});
const body = [
 'Synthetic Candidate - extraction test document',
 'PROFILE',
 'Builds accessible applications and documents measurable project outcomes.',
 'ACADEMIC JOURNEY',
 'Bachelor of Computing, Example University, 2022-2026',
 'TOOLS AND TECHNOLOGIES',
 'JavaScript, React, Node.js, SQL, Git, REST APIs',
 'SELECTED WORK',
 'Campus Scheduler: built an appointment service with validation and tests.',
 'Community Portal: implemented responsive pages and reviewed user feedback.',
 'PROFESSIONAL CONTRIBUTIONS',
 'Developer Intern, Example Studio, June-August 2025',
 'Implemented API endpoints and documented deployment procedures.',
 'CREDENTIALS',
 'Database Fundamentals, Example Training, 2025',
 'Additional project details explain design choices and achieved outcomes.',
];
function document(){const pdf=new jsPDF({compress:true});pdf.setFontSize(10);return pdf;}
function save(pdf,name){fs.writeFileSync(path.join(directory,name),Buffer.from(pdf.output('arraybuffer')));}
const single=document();body.forEach((line,i)=>single.text(line,15,20+i*10));save(single,'single-column.pdf');
const unusual=document();body.slice().reverse().forEach((line,i)=>unusual.text(line,15,20+i*10));save(unusual,'unusual-headings.pdf');
for (const columns of [2,3]) {
 const pdf=document();pdf.setFontSize(7);
 // Deliberately draw row-by-row: content stream differs from column-major reading order.
 for(let row=0;row<6;row++)for(let col=0;col<columns;col++){
   pdf.text(`COLUMN_${col+1}_ROW_${row+1} source content`,15+col*(180/columns),20+row*14);
 }
 save(pdf,columns===2?'two-column.pdf':'multi-column.pdf');
}
const table=document();const rows=[['Degree','Institution','Year'],['Bachelor of Computing','Example University','2026'],['Database Certificate','Example Training','2025']];
rows.forEach((row,i)=>row.forEach((cell,col)=>table.text(cell,[15,100,170][col],20+i*15)));save(table,'table.pdf');
(async()=>{
 const renderer=new PDFParse({data:Buffer.from(single.output('arraybuffer'))});
 let image;
 try {image=(await renderer.getScreenshot({scale:1})).pages[0].data;}finally{await renderer.destroy();}
 const scanned=document();scanned.addImage(image,'PNG',0,0,210,297);save(scanned,'image-only.pdf');
 const mixed=document();body.forEach((line,i)=>mixed.text(line,15,20+i*10));mixed.addPage();mixed.addImage(image,'PNG',0,0,210,297);save(mixed,'mixed-text-image.pdf');
 const zip=new JSZip();
 zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
 zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
 const paragraphs=body.map(line=>`<w:p><w:r><w:t>${escape(line)}</w:t></w:r></w:p>`).join('');
 const tableRows=rows.map(row=>'<w:tr>'+row.map(cell=>`<w:tc><w:p><w:r><w:t>${escape(cell)}</w:t></w:r></w:p></w:tc>`).join('')+'</w:tr>').join('');
 zip.file('word/document.xml',`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:tbl>${tableRows}</w:tbl><w:sectPr/></w:body></w:document>`);
 fs.writeFileSync(path.join(directory,'paragraphs-and-table.docx'),await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
 const cases=[
 {file:'single-column.pdf',format:'pdf',fragments:['Synthetic Candidate','ACADEMIC JOURNEY','Bachelor of Computing','Campus Scheduler','Developer Intern','Database Fundamentals']},
 {file:'two-column.pdf',format:'pdf',fragments:['COLUMN_1_ROW_1','COLUMN_1_ROW_6','COLUMN_2_ROW_1','COLUMN_2_ROW_6']},
 {file:'multi-column.pdf',format:'pdf',fragments:['COLUMN_1_ROW_1','COLUMN_2_ROW_6','COLUMN_3_ROW_1','COLUMN_3_ROW_6']},
 {file:'table.pdf',format:'pdf',fragments:rows.flat()},
 {file:'unusual-headings.pdf',format:'pdf',fragments:['ACADEMIC JOURNEY','TOOLS AND TECHNOLOGIES','PROFESSIONAL CONTRIBUTIONS','CREDENTIALS','Example University']},
 {file:'paragraphs-and-table.docx',format:'docx',fragments:['Synthetic Candidate','ACADEMIC JOURNEY','Campus Scheduler',...rows.flat()]},
 {file:'image-only.pdf',format:'pdf',fragments:[],quality:'insufficient'},
 {file:'mixed-text-image.pdf',format:'pdf',fragments:['Synthetic Candidate','Campus Scheduler'],quality:'suspicious'},
 ];
 fs.writeFileSync(path.join(directory,'cases.json'),JSON.stringify(cases.map(c=>({...c,provenance:'synthetic controlled test, not a real resume'})),null,2)+'\n');
 console.log('Created eight real PDF/DOCX fixtures with known source content, including raster-only and mixed PDFs.');
})();
