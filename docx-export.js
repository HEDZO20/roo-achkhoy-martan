(function(global){
'use strict';

const X={};
const enc=new TextEncoder();
const xml=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const bytes=(v)=>v instanceof Uint8Array?v:enc.encode(String(v));

let crcTable=null;
function makeCrcTable(){
  const table=new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
    table[n]=c>>>0;
  }
  return table;
}
function crc32(data){
  if(!crcTable) crcTable=makeCrcTable();
  let crc=0xFFFFFFFF;
  for(let i=0;i<data.length;i++) crc=crcTable[(crc^data[i])&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}
function put16(arr,n){arr.push(n&255,(n>>>8)&255);}
function put32(arr,n){arr.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255);}
function concat(chunks){
  const total=chunks.reduce((s,x)=>s+x.length,0),out=new Uint8Array(total);let offset=0;
  chunks.forEach(x=>{out.set(x,offset);offset+=x.length;});return out;
}
function dosTimeDate(date=new Date()){
  const year=Math.max(1980,date.getFullYear());
  return {time:(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1),date:((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate()};
}
function zipStore(files){
  const local=[],central=[];let offset=0;const dt=dosTimeDate();
  for(const file of files){
    const name=bytes(file.name),data=bytes(file.data),crc=crc32(data),head=[];
    put32(head,0x04034b50);put16(head,20);put16(head,0);put16(head,0);put16(head,dt.time);put16(head,dt.date);put32(head,crc);put32(head,data.length);put32(head,data.length);put16(head,name.length);put16(head,0);
    const localEntry=concat([new Uint8Array(head),name,data]);local.push(localEntry);
    const cd=[];put32(cd,0x02014b50);put16(cd,20);put16(cd,20);put16(cd,0);put16(cd,0);put16(cd,dt.time);put16(cd,dt.date);put32(cd,crc);put32(cd,data.length);put32(cd,data.length);put16(cd,name.length);put16(cd,0);put16(cd,0);put16(cd,0);put16(cd,0);put32(cd,0);put32(cd,offset);
    central.push(concat([new Uint8Array(cd),name]));offset+=localEntry.length;
  }
  const centralBytes=concat(central),end=[];put32(end,0x06054b50);put16(end,0);put16(end,0);put16(end,files.length);put16(end,files.length);put32(end,centralBytes.length);put32(end,offset);put16(end,0);
  return concat([...local,centralBytes,new Uint8Array(end)]);
}

function run(text,{bold=false,size=22,color='',italic=false}={}){
  return `<w:r><w:rPr>${bold?'<w:b/>':''}${italic?'<w:i/>':''}${color?`<w:color w:val="${color}"/>`:''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}
function paragraph(text,{bold=false,size=22,color='',align='',before=0,after=100,pageBreak=false,italic=false}={}){
  return `<w:p><w:pPr>${align?`<w:jc w:val="${align}"/>`:''}<w:spacing w:before="${before}" w:after="${after}"/>${pageBreak?'<w:pageBreakBefore/>':''}</w:pPr>${run(text,{bold,size,color,italic})}</w:p>`;
}
function cell(text,{bold=false,fill='',color='',align='left',width=0}={}){
  return `<w:tc><w:tcPr>${width?`<w:tcW w:w="${width}" w:type="dxa"/>`:''}${fill?`<w:shd w:fill="${fill}"/>`:''}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:after="0"/></w:pPr>${run(text,{bold,size:18,color})}</w:p></w:tc>`;
}
function table(headers,rows,widths=[]){
  const borders='<w:tblBorders><w:top w:val="single" w:sz="4" w:color="9BAFA1"/><w:left w:val="single" w:sz="4" w:color="9BAFA1"/><w:bottom w:val="single" w:sz="4" w:color="9BAFA1"/><w:right w:val="single" w:sz="4" w:color="9BAFA1"/><w:insideH w:val="single" w:sz="3" w:color="B7C7BC"/><w:insideV w:val="single" w:sz="3" w:color="B7C7BC"/></w:tblBorders>';
  const header=`<w:tr>${headers.map((h,i)=>cell(h,{bold:true,fill:'DDEBE1',color:'174C36',align:'center',width:widths[i]})).join('')}</w:tr>`;
  const body=rows.map(r=>`<w:tr>${headers.map((_,i)=>cell(r[i]??'',{width:widths[i]})).join('')}</w:tr>`).join('');
  const grid=`<w:tblGrid>${headers.map((_,i)=>`<w:gridCol w:w="${widths[i]||1000}"/>`).join('')}</w:tblGrid>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}<w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>${grid}${header}${body}</w:tbl>${paragraph('',{after:60})}`;
}
function pageBreak(){return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';}
function heading(text){return paragraph(text,{bold:true,size:30,color:'176B4D',before:180,after:110});}
function imageParagraph(relId,widthEmu=5486400,heightEmu=2743200){
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Диаграмма успеваемости"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="chart.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

async function chartPng(analysis){
  if(typeof document==='undefined') return null;
  const data=(analysis.subjectRanking||[]).slice().sort((a,b)=>(b.success||0)-(a.success||0)).slice(0,12);
  if(!data.length) return null;
  const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=720;const c=canvas.getContext('2d');
  c.fillStyle='#ffffff';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#173d2d';c.font='bold 42px Arial';c.fillText('Успеваемость по предметам, %',60,70);
  const left=310,top=120,row=45,maxWidth=950;
  c.font='25px Arial';
  data.forEach((item,i)=>{
    const y=top+i*row,value=Math.max(0,Math.min(100,Number(item.success)||0));
    c.fillStyle='#263d32';c.fillText(String(item.subject).slice(0,23),55,y+27);
    c.fillStyle='#e4ece6';roundRect(c,left,y,maxWidth,27,14);c.fill();
    c.fillStyle=value<80?'#c97a31':'#2b7c59';roundRect(c,left,y,maxWidth*value/100,27,14);c.fill();
    c.fillStyle='#173d2d';c.font='bold 24px Arial';c.fillText(`${value}%`,left+maxWidth+18,y+24);c.font='25px Arial';
  });
  return new Promise(resolve=>canvas.toBlob(async blob=>resolve(blob?new Uint8Array(await blob.arrayBuffer()):null),'image/png'));
}
function roundRect(ctx,x,y,w,h,r){
  const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();
}

function documentXml(a,hasChart,branding){
  const k=a.kpi||{},subjectRows=(a.subjectRanking||[]).map(x=>[x.subject,x.total,x.count5,x.count4,x.count3,x.count2,x.passed,x.failed,x.quality==null?'—':`${x.quality}%`,x.success==null?'—':`${x.success}%`]);
  const schoolRows=(a.schoolRanking||[]).slice(0,40).map((x,i)=>[i+1,x.school,x.subjects,x.participants,x.failed,x.quality==null?'—':`${x.quality}%`,x.success==null?'—':`${x.success}%`,x.avg??'—']);
  const dynamicRows=(a.averageScores||[]).map(x=>[x.subject,x.y2024??'—',x.y2025??'—',x.y2026??'—',x.y2025!=null&&x.y2026!=null?`${x.y2026-x.y2025>=0?'+':''}${(x.y2026-x.y2025).toFixed(1)}`:'—']);
  const highRows=(a.highScores||[]).map((x,i)=>[i+1,x.school,x.name,x.subject,x.score]);
  const warningRows=(a.warnings||[]).slice(0,100).map(x=>[x.table||'',x.row||'—',x.text]);
  const conclusions=(a.conclusions||[]).map(x=>paragraph(`${x.title}. ${x.text}`,{size:21,after:90})).join('');
  const body=[
    paragraph(branding?.full_name||'Отдел образования Ачхой-Мартановского района',{bold:true,size:31,color:'176B4D',align:'center',before:1500,after:260}),
    paragraph(a.meta?.title||'Информационно-аналитическая справка',{bold:true,size:38,align:'center',after:260}),
    paragraph(`${a.meta?.examType||'ГИА'} · ${a.meta?.academicYear||''}`,{size:27,align:'center',after:180}),
    paragraph(`Сформировано: ${new Date().toLocaleDateString('ru-RU')}`,{size:20,color:'66786E',align:'center',after:900}),
    pageBreak(),
    heading('1. Основные показатели'),
    table(['Показатель','Значение'],[
      ['Участники ЕГЭ',k.participants??'—'],['Распознано предметов',k.subjects??'—'],['Школы',k.schools??'—'],['Результаты 80+',k.highScores??'—'],['Аттестаты 11 класса',k.certificates??'—'],['Замечания к данным',k.warnings??0]
    ],[6200,2200]),
    heading('2. Автоматические аналитические выводы'),conclusions||paragraph('Выводы не сформированы.'),
    hasChart?heading('3. Диаграмма успеваемости'):'',hasChart?imageParagraph('rIdChart'):'',
    heading(`${hasChart?'4':'3'}. Сводные результаты по предметам`),
    table(['Предмет','Всего','5','4','3','2','Сдали','Не сдали','КЗ','Усп.'],subjectRows,[2700,700,500,500,500,500,700,850,700,700]),
    pageBreak(),heading(`${hasChart?'5':'4'}. Сравнение школ`),
    table(['№','Школа','Предметов','Участий','Не сдали','КЗ','Усп.','Ср. оценка'],schoolRows,[400,3900,800,800,800,700,700,800]),
    dynamicRows.length?heading(`${hasChart?'6':'5'}. Динамика среднего тестового балла`):'',
    dynamicRows.length?table(['Предмет','2024','2025','2026','Изменение'],dynamicRows,[3600,1000,1000,1000,1300]):'',
    highRows.length?heading(`${hasChart?'7':'6'}. Высокие результаты (80+)`):'',
    highRows.length?table(['№','Школа','Ф.И.О.','Предмет','Баллы'],highRows,[500,3100,2600,1700,700]):'',
    warningRows.length?heading(`${hasChart?'8':'7'}. Проверка качества данных`):'',
    warningRows.length?table(['Таблица','Строка','Замечание'],warningRows,[2700,700,5100]):paragraph('Расхождений не найдено.'),
    paragraph('',{after:250}),paragraph('Ответственный: ________________________________',{size:22,after:160}),paragraph('Дата: ____________________',{size:22})
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="700" w:bottom="850" w:left="700" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

X.createBlob=async function(analysis,branding={}){
  const chart=await chartPng(analysis),hasChart=!!chart;
  const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${hasChart?'<Default Extension="png" ContentType="image/png"/>':''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const docRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hasChart?'<Relationship Id="rIdChart" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/chart.png"/>':''}</Relationships>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  const now=new Date().toISOString();
  const core=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(analysis.meta?.title||'Анализ ГИА')}</dc:title><dc:creator>${xml(branding.full_name||'Отдел образования')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const app=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>РОО V26 Smart Analysis</Application></Properties>`;
  const files=[
    {name:'[Content_Types].xml',data:contentTypes},{name:'_rels/.rels',data:rootRels},{name:'word/document.xml',data:documentXml(analysis,hasChart,branding)},
    {name:'word/_rels/document.xml.rels',data:docRels},{name:'word/styles.xml',data:styles},{name:'docProps/core.xml',data:core},{name:'docProps/app.xml',data:app}
  ];
  if(chart) files.push({name:'word/media/chart.png',data:chart});
  return new Blob([zipStore(files)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
};

X.export=async function(analysis,branding,fileName='Аналитический_отчет.docx'){
  const blob=await X.createBlob(analysis,branding),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
};


function genericDocumentXml(options={}){
  const title=options.title||'Отчёт';
  const subtitle=options.subtitle||'';
  const period=options.period||'';
  const headers=(options.headers||[]).map(String);
  const rows=(options.rows||[]).map(row=>headers.map((h,i)=>row?.[h]??row?.[i]??''));
  const summary=(options.summary||[]).map(item=>Array.isArray(item)?item:[item.label,item.value]);
  const notes=(options.notes||[]).filter(Boolean);
  const widths=headers.map((_,i)=>options.widths?.[i]||Math.max(750,Math.floor(9000/Math.max(headers.length,1))));
  const body=[
    paragraph(options.organization||'Отдел образования Ачхой-Мартановского района',{bold:true,size:30,color:'176B4D',align:'center',before:900,after:240}),
    paragraph(title,{bold:true,size:38,align:'center',after:200}),
    subtitle?paragraph(subtitle,{size:24,align:'center',after:140}):'',
    period?paragraph(`Период: ${period}`,{size:21,color:'66786E',align:'center',after:500}):'',
    paragraph(`Сформировано: ${new Date().toLocaleDateString('ru-RU')}`,{size:19,color:'66786E',align:'center',after:700}),
    summary.length?heading('Основные показатели'):'',
    summary.length?table(['Показатель','Значение'],summary,[6200,2200]):'',
    notes.length?heading('Выводы и примечания'):'',
    notes.map(note=>paragraph(`• ${note}`,{size:21,after:80})).join(''),
    heading('Данные отчёта'),
    rows.length&&headers.length?table(headers,rows,widths):paragraph('Данные за выбранный период отсутствуют.',{italic:true,color:'66786E'}),
    paragraph('',{after:250}),
    paragraph('Начальник РОО: ________________________________',{size:22,after:160}),
    paragraph('Дата: ____________________',{size:22})
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="700" w:bottom="850" w:left="700"/></w:sectPr></w:body></w:document>`;
}

X.createTableReportBlob=async function(options={}){
  const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  const now=new Date().toISOString();
  const core=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(options.title||'Отчёт')}</dc:title><dc:creator>${xml(options.organization||'Отдел образования')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const app=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>РОО V28.3 Final Audit</Application></Properties>`;
  return new Blob([zipStore([
    {name:'[Content_Types].xml',data:contentTypes},{name:'_rels/.rels',data:rootRels},
    {name:'word/document.xml',data:genericDocumentXml(options)},{name:'word/_rels/document.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'},
    {name:'word/styles.xml',data:styles},{name:'docProps/core.xml',data:core},{name:'docProps/app.xml',data:app}
  ])],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
};

X.exportTableReport=async function(options={},fileName='Отчёт.docx'){
  const blob=await X.createTableReportBlob(options),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
};

global.ROODocxExporter=X;
})(window);
