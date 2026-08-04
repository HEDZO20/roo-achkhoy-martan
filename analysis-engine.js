(function(global){
'use strict';

const E = {};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/ё/g,'е')
  .replace(/[«»"'`]/g,'')
  .replace(/№/g,' номер ')
  .replace(/%/g,' процент ')
  .replace(/[^a-zа-я0-9]+/gi,' ')
  .trim()
  .replace(/\s+/g,' ');
const nnum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).replace(/\s/g,'').replace(',','.').replace(/[^0-9+\-.]/g,'');
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};
const pct = (v) => {
  const x = nnum(v);
  return x === null ? null : x;
};
const round = (v,d=1) => Number.isFinite(v) ? Number(v.toFixed(d)) : null;
const sum = (arr) => arr.reduce((a,b)=>a+(Number.isFinite(+b)?+b:0),0);
const avg = (arr) => {
  const x = arr.map(Number).filter(Number.isFinite);
  return x.length ? x.reduce((a,b)=>a+b,0)/x.length : null;
};
const safeRows = (rows) => (rows||[]).map(r => (r||[]).map(c => String(c ?? '').trim()));
const canonicalSubject = (value) => {
  const raw=String(value||'').replace(/[.:]+$/,'').trim();
  const key=norm(raw);
  const map=[
    [/русск/, 'Русский язык'], [/математик.*баз/, 'Математика базовая'], [/математик.*проф/, 'Математика профильная'],
    [/обществ/, 'Обществознание'], [/биолог/, 'Биология'], [/хими/, 'Химия'], [/информ|икт/, 'Информатика'],
    [/физик/, 'Физика'], [/истори/, 'История'], [/литератур/, 'Литература'], [/англий|иностран/, 'Иностранный язык'],
    [/географ/, 'География'], [/чечен/, 'Чеченский язык']
  ];
  const hit=map.find(([re])=>re.test(key));
  return hit?hit[1]:raw;
};
const titleSubject = (title) => {
  const t = String(title||'').replace(/\s+/g,' ').trim();
  const m = t.match(/по\s+(.+)$/i);
  return canonicalSubject(m ? m[1] : t.replace(/^Таблица\s*\d+\.?\s*/i,''));
};
const hasAll = (text, words) => words.every(w => text.includes(norm(w)));
const firstNonEmpty = (arr) => arr.find(x => String(x??'').trim()) || '';

function parseCsvLine(line){
  const delimiter = line.includes(';') ? ';' : ',';
  let q=false,s='',a=[];
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){
      if(q && line[i+1]==='"'){ s+='"'; i++; }
      else q=!q;
    } else if(c===delimiter && !q){ a.push(s.trim()); s=''; }
    else s+=c;
  }
  a.push(s.trim());
  return a;
}

async function extractDocx(file){
  if(!global.mammoth) throw new Error('Модуль чтения DOCX не загрузился. Обновите страницу и повторите.');
  const buffer = await file.arrayBuffer();
  const [htmlResult,textResult] = await Promise.all([
    global.mammoth.convertToHtml({arrayBuffer:buffer}),
    global.mammoth.extractRawText({arrayBuffer:buffer})
  ]);
  const doc = new DOMParser().parseFromString(htmlResult.value,'text/html');
  const tables=[];
  let pendingTitle='';
  let tableNo=0;
  [...doc.body.children].forEach(node=>{
    const tag=node.tagName.toLowerCase();
    const text=(node.textContent||'').replace(/\s+/g,' ').trim();
    if(tag==='table'){
      tableNo++;
      const rows=[...node.rows].map(r=>[...r.cells].map(c=>(c.textContent||'').replace(/\s+/g,' ').trim()));
      if(rows.length) tables.push({title:pendingTitle||`Таблица ${tableNo}`,rows});
      pendingTitle='';
    } else if(text && (/^таблица\s*\d+/i.test(text) || /информационно-аналитическая справка/i.test(text) || /итогах государственной итоговой/i.test(text))){
      pendingTitle=text;
    }
  });
  return {tables,text:textResult.value||'',messages:htmlResult.messages||[]};
}

async function extractXlsx(file){
  if(!global.XLSX) throw new Error('Модуль Excel не загрузился. Обновите страницу и повторите.');
  const buf=await file.arrayBuffer();
  const wb=global.XLSX.read(buf,{cellDates:true});
  return {tables:wb.SheetNames.map(name=>({title:name,rows:global.XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:false})})),text:''};
}

E.extractFile = async function(file){
  if(!file) throw new Error('Выберите документ');
  if(/\.docx$/i.test(file.name)) return extractDocx(file);
  if(/\.xlsx?$/i.test(file.name)) return extractXlsx(file);
  if(/\.csv$/i.test(file.name)){
    const raw=await file.text();
    return {tables:[{title:file.name,rows:raw.split(/\r?\n/).filter(x=>x.trim()).map(parseCsvLine)}],text:raw};
  }
  throw new Error('Поддерживаются DOCX, XLSX, XLS и CSV');
};

function classify(table){
  const rows=safeRows(table.rows);
  const head=norm(rows.slice(0,4).flat().join(' | '));
  const title=norm(table.title);
  if(hasAll(head,['код','оу','всего','сдали','не сдали']) && (head.includes('5')||head.includes('оценк'))) return 'subject_school';
  if(hasAll(head,['фио','предмет','балл'])) return 'high_scores';
  if(hasAll(head,['предмет','всего участников огэ','сдали','не сдали'])) return 'oge_summary';
  if(hasAll(head,['год','11 классов','егэ'])) return 'admission';
  if(title.includes('выбравших егэ') || (hasAll(head,['предмет','2024','2025','2026']) && head.includes('выбравших'))) return 'subject_choice';
  if(title.includes('сравнительный анализ') || (head.includes('основной') && head.includes('итоговый') && head.includes('2026'))) return 'comparison';
  if(title.includes('средний тестовый балл') || (hasAll(head,['предмет','динамика','2026']) && !head.includes('участник'))) return 'average_scores';
  if(head.includes('аттестат с отличием') && head.includes('11 класс')) return 'certificate_summary';
  if(hasAll(head,['наименование оо','допущенных','получивших аттестат'])) return 'certificates_school';
  if(title.includes('без аттестатов') || (head.includes('не получили аттестат') && head.includes('2026'))) return 'no_certificates';
  if(hasAll(head,['наименование организации','2024','2025','2026'])) return 'no_certificates_school';
  return 'generic';
}

function findHeaderIndex(rows,predicate,max=5){
  for(let i=0;i<Math.min(rows.length,max);i++) if(predicate(rows[i].map(norm))) return i;
  return 0;
}
function colIndex(headers, aliases){
  const hs=headers.map(norm);
  for(const a of aliases){
    const na=norm(a);
    let i=hs.findIndex(h=>h===na);
    if(i>=0) return i;
    i=hs.findIndex(h=>h.includes(na));
    if(i>=0) return i;
  }
  return -1;
}

function parseSubjectSchool(table,warnings){
  const rows=safeRows(table.rows);
  const hi=findHeaderIndex(rows,h=>h.some(x=>x.includes('код'))&&h.some(x=>x==='оу'||x.includes('организац')));
  const h=rows[hi];
  const idx={
    code:colIndex(h,['код']),school:colIndex(h,['оу','образовательная организация','организация']),total:colIndex(h,['всего']),
    c5:colIndex(h,['5']),c4:colIndex(h,['4']),c3:colIndex(h,['3']),c2:colIndex(h,['2']),passed:colIndex(h,['сдали']),failed:colIndex(h,['не сдали']),
    quality:colIndex(h,['% кз','кз']),success:colIndex(h,['% усп','успеваемость']),avg:colIndex(h,['ср.балл','средний балл'])
  };
  const subject=titleSubject(table.title).replace(/^анализ результатов\s+(егэ|огэ|гиа)\s*/i,'').trim();
  const schools=[]; let reportedTotal=null;
  for(let r=hi+1;r<rows.length;r++){
    const row=rows[r];
    const lead=norm(`${row[idx.code]||''} ${row[idx.school]||''}`);
    if(!row.some(Boolean)) continue;
    const item={
      code:idx.code>=0?row[idx.code]:'',school:idx.school>=0?row[idx.school]:'',total:nnum(row[idx.total]),
      count5:nnum(row[idx.c5])||0,count4:nnum(row[idx.c4])||0,count3:nnum(row[idx.c3])||0,count2:nnum(row[idx.c2])||0,
      passed:nnum(row[idx.passed]),failed:nnum(row[idx.failed]),qualityReported:pct(row[idx.quality]),successReported:pct(row[idx.success]),avgReported:nnum(row[idx.avg])
    };
    if(lead.includes('итого')){ reportedTotal=item; continue; }
    if(!item.school || item.total===null) continue;
    item.gradeTotal=item.count5+item.count4+item.count3+item.count2;
    item.qualityCalc=item.total?round((item.count5+item.count4)/item.total*100,1):null;
    item.successCalc=item.total?round(((item.passed ?? (item.total-item.count2))/item.total)*100,1):null;
    item.avgCalc=item.total?round((item.count5*5+item.count4*4+item.count3*3+item.count2*2)/item.total,2):null;
    if(item.gradeTotal!==item.total) warnings.push({level:'warning',table:table.title,row:r+1,text:`${item.school}: сумма оценок (${item.gradeTotal}) не равна числу участников (${item.total}).`});
    if(item.passed!==null && item.failed!==null && item.passed+item.failed!==item.total) warnings.push({level:'warning',table:table.title,row:r+1,text:`${item.school}: «сдали + не сдали» не равно «всего».`});
    if(item.qualityReported!==null && item.qualityCalc!==null && Math.abs(item.qualityReported-item.qualityCalc)>1.5) warnings.push({level:'info',table:table.title,row:r+1,text:`${item.school}: качество знаний в документе ${item.qualityReported}%, расчёт системы ${item.qualityCalc}%.`});
    if(item.successReported!==null && item.successCalc!==null && Math.abs(item.successReported-item.successCalc)>1.5) warnings.push({level:'info',table:table.title,row:r+1,text:`${item.school}: успеваемость в документе ${item.successReported}%, расчёт системы ${item.successCalc}%.`});
    schools.push(item);
  }
  const totals={
    total:sum(schools.map(x=>x.total)),count5:sum(schools.map(x=>x.count5)),count4:sum(schools.map(x=>x.count4)),count3:sum(schools.map(x=>x.count3)),count2:sum(schools.map(x=>x.count2)),
    passed:sum(schools.map(x=>x.passed ?? (x.total-x.count2))),failed:sum(schools.map(x=>x.failed ?? x.count2))
  };
  totals.quality=totals.total?round((totals.count5+totals.count4)/totals.total*100,1):null;
  totals.success=totals.total?round(totals.passed/totals.total*100,1):null;
  totals.avg=totals.total?round((totals.count5*5+totals.count4*4+totals.count3*3+totals.count2*2)/totals.total,2):null;
  if(reportedTotal && reportedTotal.total!==null && Math.abs(reportedTotal.total-totals.total)>0) warnings.push({level:'warning',table:table.title,text:`Итог «Всего» в документе (${reportedTotal.total}) не совпадает с суммой строк (${totals.total}).`});
  return {title:table.title,subject,schools,totals,reportedTotal};
}

function parseAdmission(table){
  const rows=safeRows(table.rows); const h=rows[0]||[];
  return rows.slice(1).filter(r=>/^20\d{2}$/.test(String(r[0]))).map(r=>({year:String(r[0]),students:nnum(r[1]),notEssay:nnum(r[2]),academicDebt:nnum(r[3]),ege:nnum(r[4]),gve:nnum(r[5])}));
}
function parseSubjectChoice(table){
  const rows=safeRows(table.rows); const start=rows.length>1&&rows[0].some(x=>/2024/.test(x))?2:1;
  return rows.slice(start).filter(r=>r[0]&&!norm(r[0]).includes('итого')).map(r=>({subject:r[0],y2024:nnum(r[1]),p2024:pct(r[2]),y2025:nnum(r[3]),p2025:pct(r[4]),y2026:nnum(r[5]),p2026:pct(r[6])}));
}
function parseHighScores(table){
  const rows=safeRows(table.rows); const hi=findHeaderIndex(rows,h=>h.some(x=>x.includes('фио'))&&h.some(x=>x.includes('предмет')));
  const h=rows[hi]; const si=colIndex(h,['оу','школа']),fi=colIndex(h,['фио']),pi=colIndex(h,['предмет']),bi=colIndex(h,['баллы','балл']);
  return rows.slice(hi+1).filter(r=>r[fi]&&nnum(r[bi])!==null&&!norm(r[fi]).includes('всего')).map(r=>({school:r[si],name:r[fi],subject:r[pi],score:nnum(r[bi])}));
}
function parseOgeSummary(table){
  const rows=safeRows(table.rows); const hi=findHeaderIndex(rows,h=>h.some(x=>x.includes('предмет'))&&h.some(x=>x.includes('участник')));
  const h=rows[hi]; const pi=colIndex(h,['предмет']),ti=colIndex(h,['всего участников огэ','участники']),pa=colIndex(h,['сдали']),fa=colIndex(h,['не сдали']);
  return rows.slice(hi+1).filter(r=>r[pi]&&!norm(r[pi]).includes('итого')).map(r=>({subject:r[pi],participantsRaw:r[ti],participants:nnum(r[ti]),passed:pct(r[pa]),failed:pct(r[fa])}));
}
function parseAverageScores(table){
  const rows=safeRows(table.rows); const hi=findHeaderIndex(rows,h=>h.some(x=>x.includes('предмет'))&&h.some(x=>x.includes('2026')));
  return rows.slice(hi+1).filter(r=>r[1]&&!norm(r[1]).includes('итого')).map(r=>({subject:r[1],y2024:nnum(r[2]),y2025:nnum(r[3]),d2025:nnum(r[4]),y2026:nnum(r[5]),d2026:nnum(r[6]),raw:r}));
}
function parseComparison(table){
  const rows=safeRows(table.rows); const start=Math.min(3,rows.length);
  return rows.slice(start).filter(r=>r[1]&&nnum(r[0])!==null).map(r=>({
    subject:r[1],
    y2024:{primary:{total:nnum(r[2]),failed:nnum(r[3]),success:pct(r[4])},final:{total:nnum(r[5]),failed:nnum(r[6]),success:pct(r[7])}},
    y2025:{primary:{total:nnum(r[8]),failed:nnum(r[9]),success:pct(r[10])},final:{total:nnum(r[11]),failed:nnum(r[12]),success:pct(r[13])}},
    y2026:{primary:{total:nnum(r[14]),failed:nnum(r[15]),success:pct(r[16])},final:{total:nnum(r[17]),failed:nnum(r[18]),success:pct(r[19])}}
  }));
}
function parseCertificateSummary(table){
  const rows=safeRows(table.rows); if(rows.length<2) return null;
  const r=rows[1]; return {grade11:nnum(r[1]),degree1:nnum(r[2]),degree2:nnum(r[3]),grade9:nnum(r[4]),honors:nnum(r[5]),trainingCertificates:nnum(r[6])};
}
function parseCertificatesSchool(table){
  const rows=safeRows(table.rows); const hi=findHeaderIndex(rows,h=>h.some(x=>x.includes('наименование оо')));
  return rows.slice(hi+1).filter(r=>r[1]&&!norm(r[1]).includes('итого')).map(r=>({school:r[1],admitted:nnum(r[2]),certificates:nnum(r[3]),september:nnum(r[4])}));
}
function parseNoCertificates(table){
  const rows=safeRows(table.rows); const head=norm(rows.slice(0,3).flat().join(' '));
  if(head.includes('наименование организац')) return {schools:rows.slice(1).filter(r=>r[1]&&!norm(r[1]).includes('итого')).map(r=>({code:r[0],school:r[1],y2024:nnum(r[2]),y2025:nnum(r[3]),y2026:nnum(r[4])}))};
  const r=rows[rows.length-1]||[];
  return {summary:{y2024:{participants:nnum(r[1]),main:nnum(r[2]),final:nnum(r[3]),percent:pct(r[4])},y2025:{participants:nnum(r[5]),main:nnum(r[6]),final:nnum(r[7]),percent:pct(r[8])},y2026:{participants:nnum(r[9]),main:nnum(r[10]),percent:pct(r[11])}}};
}

function aggregateSchools(subjectResults){
  const map=new Map();
  subjectResults.forEach(sr=>sr.schools.forEach(s=>{
    const key=norm(s.school); if(!key) return;
    const x=map.get(key)||{school:s.school,subjects:0,participants:0,count5:0,count4:0,count3:0,count2:0,passed:0,failed:0};
    x.subjects++; x.participants+=s.total||0; x.count5+=s.count5||0; x.count4+=s.count4||0; x.count3+=s.count3||0; x.count2+=s.count2||0; x.passed+=s.passed??((s.total||0)-(s.count2||0)); x.failed+=s.failed??(s.count2||0); map.set(key,x);
  }));
  return [...map.values()].map(x=>({...x,quality:x.participants?round((x.count5+x.count4)/x.participants*100,1):null,success:x.participants?round(x.passed/x.participants*100,1):null,avg:x.participants?round((x.count5*5+x.count4*4+x.count3*3+x.count2*2)/x.participants,2):null})).sort((a,b)=>(b.success??0)-(a.success??0)||(b.quality??0)-(a.quality??0));
}

function buildConclusions(a){
  const out=[];
  const subjects=a.subjectResults.map(x=>({subject:x.subject,...x.totals})).filter(x=>x.total>0);
  if(a.admission.length){
    const y=[...a.admission].sort((x,y)=>String(x.year).localeCompare(String(y.year))).at(-1);
    out.push({level:'info',title:'Контингент ГИА-11',text:`В ${y.year} году указано ${y.students??'—'} обучающихся 11-х классов; на ЕГЭ заявлено ${y.ege??'—'}, на ГВЭ — ${y.gve??'—'}.`});
  }
  if(subjects.length){
    const best=[...subjects].sort((a,b)=>(b.success??-1)-(a.success??-1))[0];
    const worst=[...subjects].sort((a,b)=>(a.success??999)-(b.success??999))[0];
    const qualityLow=[...subjects].sort((a,b)=>(a.quality??999)-(b.quality??999))[0];
    out.push({level:'success',title:'Наиболее высокая успеваемость',text:`${best.subject}: ${best.success}% (${best.passed} из ${best.total} сдали).`});
    if(worst && worst.success<100) out.push({level:'warning',title:'Зона внимания по успеваемости',text:`${worst.subject}: ${worst.success}%, не сдали ${worst.failed} участников.`});
    if(qualityLow) out.push({level:'warning',title:'Самое низкое качество знаний',text:`${qualityLow.subject}: ${qualityLow.quality}% оценок «4» и «5».`});
  }
  if(a.averageScores.length){
    const improved=a.averageScores.filter(x=>x.y2025!==null&&x.y2026!==null).map(x=>({...x,delta:round(x.y2026-x.y2025,1)})).sort((a,b)=>b.delta-a.delta);
    if(improved[0]) out.push({level:'success',title:'Лучший рост среднего тестового балла',text:`${improved[0].subject}: ${improved[0].y2025} → ${improved[0].y2026} (${improved[0].delta>=0?'+':''}${improved[0].delta}).`});
    const declined=improved.filter(x=>x.delta<0).sort((a,b)=>a.delta-b.delta)[0];
    if(declined) out.push({level:'warning',title:'Отрицательная динамика',text:`${declined.subject}: ${declined.y2025} → ${declined.y2026} (${declined.delta}).`});
  }
  if(a.highScores.length){
    const top=[...a.highScores].sort((x,y)=>y.score-x.score)[0];
    out.push({level:'success',title:'Высокие результаты',text:`В документе распознано ${a.highScores.length} результатов от 80 баллов. Максимальный результат — ${top.score} по предмету «${top.subject}».`});
  }
  const cert11=a.certificatesSchool.find(x=>x.length && x.some(y=>/11|гиа(?!-9)/i.test(y.context||''))) || a.certificatesSchool[0];
  if(cert11 && cert11.length){
    const admitted=sum(cert11.map(x=>x.admitted)), certificates=sum(cert11.map(x=>x.certificates));
    if(admitted) out.push({level:certificates===admitted?'success':'warning',title:'Получение аттестатов',text:`По таблице школ аттестаты получили ${certificates} из ${admitted} выпускников; разница — ${Math.max(0,admitted-certificates)}.`});
  }
  if(a.ogeSummary.length && a.ogeSummary.every(x=>(x.failed??0)===0)) out.push({level:'success',title:'ОГЭ',text:'В сводной таблице ОГЭ по всем указанным предметам зафиксировано 100% сдачи и 0% несдавших.'});
  if(a.warnings.length) out.push({level:'info',title:'Контроль качества данных',text:`Система нашла ${a.warnings.length} расхождений или мест, требующих проверки. Они не блокируют анализ и вынесены в отдельную вкладку.`});
  return out;
}

E.analyze = function(input){
  const a={
    meta:{fileName:input.fileName||'',academicYear:input.academicYear||'',examType:input.examType||'ГИА',createdAt:new Date().toISOString(),title:'Информационно-аналитическая справка по итогам ГИА'},
    tables:[],subjectResults:[],admission:[],subjectChoices:[],comparison:[],averageScores:[],highScores:[],ogeSummary:[],certificateSummary:null,certificatesSchool:[],noCertificates:{summary:null,schools:[]},warnings:[],genericTables:[]
  };
  (input.tables||[]).forEach((source,index)=>{
    const table={title:source.title||`Таблица ${index+1}`,rows:safeRows(source.rows)};
    if(!table.rows.length) return;
    const type=classify(table); a.tables.push({title:table.title,type,rows:table.rows});
    try{
      if(type==='subject_school') a.subjectResults.push(parseSubjectSchool(table,a.warnings));
      else if(type==='admission') a.admission.push(...parseAdmission(table));
      else if(type==='subject_choice') a.subjectChoices.push(...parseSubjectChoice(table));
      else if(type==='comparison') a.comparison.push(...parseComparison(table));
      else if(type==='average_scores') a.averageScores.push(...parseAverageScores(table));
      else if(type==='high_scores') a.highScores.push(...parseHighScores(table));
      else if(type==='oge_summary') a.ogeSummary.push(...parseOgeSummary(table));
      else if(type==='certificate_summary') a.certificateSummary=parseCertificateSummary(table);
      else if(type==='certificates_school') a.certificatesSchool.push(parseCertificatesSchool(table).map(x=>({...x,context:table.title})));
      else if(type==='no_certificates'){
        const x=parseNoCertificates(table); if(x.summary)a.noCertificates.summary=x.summary; if(x.schools)a.noCertificates.schools.push(...x.schools);
      } else if(type==='no_certificates_school'){
        const x=parseNoCertificates(table); if(x.schools)a.noCertificates.schools.push(...x.schools);
      } else a.genericTables.push(table);
    }catch(err){ a.warnings.push({level:'warning',table:table.title,text:`Не удалось полностью разобрать таблицу: ${err.message}`}); a.genericTables.push(table); }
  });
  a.schoolRanking=aggregateSchools(a.subjectResults);
  a.subjectRanking=a.subjectResults.map(x=>({subject:x.subject,...x.totals,schools:x.schools.length})).sort((x,y)=>(y.success??0)-(x.success??0)||(y.quality??0)-(x.quality??0));
  a.conclusions=buildConclusions(a);
  a.meta.tablesCount=a.tables.length; a.meta.subjectsCount=a.subjectResults.length; a.meta.warningsCount=a.warnings.length;
  const latestAdmission=[...a.admission].sort((x,y)=>String(x.year).localeCompare(String(y.year))).at(-1);
  const firstCertificateTable=a.certificatesSchool[0]||[];
  a.kpi={
    participants:latestAdmission?.ege ?? (a.subjectRanking.find(x=>/русск/i.test(x.subject))?.total ?? null),
    subjects:a.subjectResults.length,
    highScores:a.highScores.length,
    schools:a.schoolRanking.length,
    certificates:a.certificateSummary?.grade11 ?? (firstCertificateTable.length?sum(firstCertificateTable.map(x=>x.certificates)):null),
    warnings:a.warnings.length
  };
  return a;
};

function metric(label,value,sub=''){ return `<article class="analysis-kpi"><b>${value??'—'}</b><span>${esc(label)}</span>${sub?`<small>${esc(sub)}</small>`:''}</article>`; }
function conclusionCard(x){ return `<div class="analysis-conclusion ${esc(x.level)}"><span class="analysis-dot"></span><div><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div></div>`; }
function barList(items,key,labelKey,suffix='%'){
  if(!items.length) return '<div class="analysis-empty">Нет данных для графика</div>';
  const max=Math.max(...items.map(x=>Number(x[key])||0),1);
  return `<div class="analysis-bars">${items.map(x=>`<div class="analysis-bar-row"><span title="${esc(x[labelKey])}">${esc(x[labelKey])}</span><div><i style="width:${Math.max(2,(Number(x[key])||0)/max*100)}%"></i></div><b>${x[key]??'—'}${suffix}</b></div>`).join('')}</div>`;
}
function rawTable(t){
  const rows=t.rows||[]; if(!rows.length) return '';
  const cols=Math.max(...rows.map(r=>r.length),0);
  return `<details class="analysis-source"><summary>${esc(t.title)} <small>${esc(t.type)} · ${rows.length} строк</small></summary><div class="table-wrap"><table class="compact"><tbody>${rows.map((r,ri)=>`<tr>${Array.from({length:cols},(_,ci)=>`<${ri===0?'th':'td'}>${esc(r[ci]??'')}</${ri===0?'th':'td'}>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}

E.renderDashboard = function(a){
  const subjects=a.subjectRanking||[], schools=a.schoolRanking||[];
  const overview=`<div class="analysis-grid-kpi">${metric('Участников ЕГЭ',a.kpi.participants,'по последнему году')}${metric('Предметов',a.kpi.subjects,'распознано')}${metric('Школ',a.kpi.schools,'в предметных таблицах')}${metric('Высоких баллов',a.kpi.highScores,'80 и выше')}${metric('Аттестатов',a.kpi.certificates,'по таблицам школ')}${metric('Проверить',a.kpi.warnings,'расхождений данных')}</div>
  <div class="analysis-grid-2"><section class="analysis-card"><h3>Ключевые выводы</h3><div class="analysis-conclusions">${a.conclusions.map(conclusionCard).join('')||'<div class="analysis-empty">Выводы появятся после распознавания таблиц.</div>'}</div></section><section class="analysis-card"><h3>Успеваемость по предметам</h3>${barList(subjects.slice().sort((x,y)=>(y.success??0)-(x.success??0)).slice(0,12),'success','subject')}</section></div>
  <div class="analysis-grid-2"><section class="analysis-card"><h3>Качество знаний</h3>${barList(subjects.slice().sort((x,y)=>(y.quality??0)-(x.quality??0)).slice(0,12),'quality','subject')}</section><section class="analysis-card"><h3>Что распознано</h3><ul class="analysis-checklist"><li>${a.tables.length} таблиц</li><li>${a.subjectResults.length} предметных разрезов по школам</li><li>${a.comparison.length} строк динамики за три года</li><li>${a.averageScores.length} строк среднего тестового балла</li><li>${a.highScores.length} высокобалльных результатов</li><li>${a.ogeSummary.length} строк сводки ОГЭ</li></ul></section></div>`;

  const summaryHtml=`${a.admission.length?`<section class="analysis-card"><h3>Допуск к ГИА-11 и выбор формы экзамена</h3><div class="table-wrap"><table><thead><tr><th>Год</th><th>11 классы</th><th>Не допущены: сочинение</th><th>Академическая задолженность</th><th>Заявлены на ЕГЭ</th><th>Заявлены на ГВЭ</th></tr></thead><tbody>${a.admission.map(x=>`<tr><td><b>${esc(x.year)}</b></td><td>${x.students??'—'}</td><td>${x.notEssay??'—'}</td><td>${x.academicDebt??'—'}</td><td>${x.ege??'—'}</td><td>${x.gve??'—'}</td></tr>`).join('')}</tbody></table></div></section>`:''}
  ${a.subjectChoices.length?`<section class="analysis-card"><h3>Выбор предметов ЕГЭ</h3><div class="table-wrap"><table><thead><tr><th>Предмет</th><th>2024</th><th>Доля</th><th>2025</th><th>Доля</th><th>2026</th><th>Доля</th></tr></thead><tbody>${a.subjectChoices.map(x=>`<tr><td><b>${esc(canonicalSubject(x.subject))}</b></td><td>${x.y2024??'—'}</td><td>${x.p2024??'—'}%</td><td>${x.y2025??'—'}</td><td>${x.p2025??'—'}%</td><td>${x.y2026??'—'}</td><td>${x.p2026??'—'}%</td></tr>`).join('')}</tbody></table></div></section>`:''}
  ${a.certificateSummary?`<section class="analysis-card"><h3>Аттестаты и документы об образовании</h3><div class="analysis-grid-kpi">${metric('11 класс',a.certificateSummary.grade11)}${metric('1 степень',a.certificateSummary.degree1)}${metric('2 степень',a.certificateSummary.degree2)}${metric('9 класс',a.certificateSummary.grade9)}${metric('С отличием',a.certificateSummary.honors)}${metric('Свидетельства',a.certificateSummary.trainingCertificates)}</div></section>`:''}
  ${a.ogeSummary.length?`<section class="analysis-card"><h3>Результаты ОГЭ</h3><div class="table-wrap"><table><thead><tr><th>Предмет</th><th>Участники</th><th>Сдали</th><th>Не сдали</th></tr></thead><tbody>${a.ogeSummary.map(x=>`<tr><td><b>${esc(canonicalSubject(x.subject))}</b></td><td>${esc(x.participantsRaw||x.participants||'—')}</td><td>${x.passed??'—'}%</td><td>${x.failed??'—'}%</td></tr>`).join('')}</tbody></table></div></section>`:''}
  ${a.certificatesSchool.length?`<section class="analysis-card"><h3>Получение аттестатов по школам</h3>${a.certificatesSchool.map((list,index)=>`<details class="analysis-subject-detail" ${index===0?'open':''}><summary>Таблица ${index+1} — ${list.length} организаций</summary><div class="table-wrap"><table><thead><tr><th>Школа</th><th>Допущены</th><th>Получили аттестат</th><th>Сентябрь</th></tr></thead><tbody>${list.map(x=>`<tr><td>${esc(x.school)}</td><td>${x.admitted??'—'}</td><td>${x.certificates??'—'}</td><td>${x.september??'—'}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}</section>`:''}
  ${a.noCertificates.summary?`<section class="analysis-card"><h3>Не получили аттестат: динамика</h3><div class="table-wrap"><table><thead><tr><th>Год</th><th>Участники</th><th>Основной этап</th><th>Итог</th><th>Доля</th></tr></thead><tbody><tr><td>2024</td><td>${a.noCertificates.summary.y2024.participants??'—'}</td><td>${a.noCertificates.summary.y2024.main??'—'}</td><td>${a.noCertificates.summary.y2024.final??'—'}</td><td>${a.noCertificates.summary.y2024.percent??'—'}%</td></tr><tr><td>2025</td><td>${a.noCertificates.summary.y2025.participants??'—'}</td><td>${a.noCertificates.summary.y2025.main??'—'}</td><td>${a.noCertificates.summary.y2025.final??'—'}</td><td>${a.noCertificates.summary.y2025.percent??'—'}%</td></tr><tr><td>2026</td><td>${a.noCertificates.summary.y2026.participants??'—'}</td><td>${a.noCertificates.summary.y2026.main??'—'}</td><td>—</td><td>${a.noCertificates.summary.y2026.percent??'—'}%</td></tr></tbody></table></div></section>`:''}
  ${a.noCertificates.schools.length?`<section class="analysis-card"><h3>Школы: случаи без аттестатов</h3><div class="table-wrap"><table><thead><tr><th>Код</th><th>Организация</th><th>2024</th><th>2025</th><th>2026</th></tr></thead><tbody>${a.noCertificates.schools.map(x=>`<tr><td>${esc(x.code)}</td><td>${esc(x.school)}</td><td>${x.y2024??'—'}</td><td>${x.y2025??'—'}</td><td>${x.y2026??'—'}</td></tr>`).join('')}</tbody></table></div></section>`:''}`;

  const subjectHtml=subjects.length?`<div class="table-wrap"><table><thead><tr><th>Предмет</th><th>Участники</th><th>«5»</th><th>«4»</th><th>«3»</th><th>«2»</th><th>Сдали</th><th>Не сдали</th><th>КЗ</th><th>Усп.</th><th>Ср. оценка</th></tr></thead><tbody>${subjects.map(x=>`<tr><td><b>${esc(x.subject)}</b></td><td>${x.total}</td><td>${x.count5}</td><td>${x.count4}</td><td>${x.count3}</td><td>${x.count2}</td><td>${x.passed}</td><td>${x.failed}</td><td>${x.quality??'—'}%</td><td>${x.success??'—'}%</td><td>${x.avg??'—'}</td></tr>`).join('')}</tbody></table></div>${a.subjectResults.map(x=>`<details class="analysis-subject-detail"><summary>${esc(x.subject)} — школы (${x.schools.length})</summary><div class="table-wrap"><table><thead><tr><th>Код</th><th>Школа</th><th>Всего</th><th>5</th><th>4</th><th>3</th><th>2</th><th>Сдали</th><th>Не сдали</th><th>КЗ</th><th>Усп.</th></tr></thead><tbody>${x.schools.map(s=>`<tr><td>${esc(s.code)}</td><td>${esc(s.school)}</td><td>${s.total}</td><td>${s.count5}</td><td>${s.count4}</td><td>${s.count3}</td><td>${s.count2}</td><td>${s.passed??'—'}</td><td>${s.failed??'—'}</td><td>${s.qualityCalc??'—'}%</td><td>${s.successCalc??'—'}%</td></tr>`).join('')}</tbody></table></div></details>`).join('')}`:'<div class="analysis-empty">Предметные таблицы не распознаны.</div>';

  const schoolHtml=schools.length?`<div class="table-wrap"><table><thead><tr><th>№</th><th>Школа</th><th>Предметов</th><th>Участий</th><th>Сдали</th><th>Не сдали</th><th>Качество</th><th>Успеваемость</th><th>Средняя оценка</th></tr></thead><tbody>${schools.map((x,i)=>`<tr><td>${i+1}</td><td><b>${esc(x.school)}</b></td><td>${x.subjects}</td><td>${x.participants}</td><td>${x.passed}</td><td>${x.failed}</td><td>${x.quality??'—'}%</td><td>${x.success??'—'}%</td><td>${x.avg??'—'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="analysis-empty">Данные по школам не распознаны.</div>';

  const dynamicsRows=a.comparison.length?a.comparison:[];
  const dynamics=`${a.averageScores.length?`<section class="analysis-card"><h3>Средний тестовый балл: 2025 → 2026</h3>${barList(a.averageScores.filter(x=>x.y2026!==null).map(x=>({subject:x.subject,value:x.y2026})).sort((x,y)=>y.value-x.value),'value','subject','')}</section>`:''}<div class="table-wrap"><table><thead><tr><th>Предмет</th><th>2024 итог</th><th>2025 итог</th><th>2026 основной</th><th>2026 итог</th><th>Изменение итоговой сдачи 2025→2026</th></tr></thead><tbody>${dynamicsRows.map(x=>{const d=(x.y2026.final.success??x.y2026.primary.success)-x.y2025.final.success;return `<tr><td><b>${esc(x.subject)}</b></td><td>${x.y2024.final.success??'—'}%</td><td>${x.y2025.final.success??'—'}%</td><td>${x.y2026.primary.success??'—'}%</td><td>${x.y2026.final.success??'—'}%</td><td class="${d>=0?'good':'bad'}">${Number.isFinite(d)?`${d>=0?'+':''}${round(d,1)} п.п.`:'—'}</td></tr>`}).join('')}</tbody></table></div>`;

  const high=`${a.highScores.length?`<div class="table-wrap"><table><thead><tr><th>№</th><th>Школа</th><th>Ф.И.О.</th><th>Предмет</th><th>Баллы</th></tr></thead><tbody>${a.highScores.slice().sort((x,y)=>y.score-x.score).map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.school)}</td><td>${esc(x.name)}</td><td>${esc(x.subject)}</td><td><b>${x.score}</b></td></tr>`).join('')}</tbody></table></div>`:'<div class="analysis-empty">Высокобалльные результаты не найдены.</div>'}`;

  const quality=`<div class="analysis-quality-summary"><b>${a.warnings.length}</b><span>замечаний к структуре или расчётам</span></div>${a.warnings.length?a.warnings.map(x=>`<div class="analysis-warning ${esc(x.level||'warning')}"><b>${esc(x.table||'Проверка данных')}</b>${x.row?`<small>строка ${x.row}</small>`:''}<p>${esc(x.text)}</p></div>`).join(''):'<div class="analysis-empty success">Расхождений не найдено.</div>'}`;
  const source=a.tables.map(rawTable).join('');

  return `<article class="analysis-document"><div class="analysis-doc-head"><div><span class="analysis-file-tag">${esc(a.meta.examType||'ГИА')}</span><h2>${esc(a.meta.title)}</h2><p>${esc(a.meta.fileName)} · ${esc(a.meta.academicYear)} · ${new Date(a.meta.createdAt).toLocaleString('ru-RU')}</p></div><div class="analysis-doc-score"><b>${Math.max(0,100-Math.min(70,a.warnings.length*2))}%</b><small>качество распознавания</small></div></div>
  <div class="analysis-tabs"><button class="active" data-analysis-tab="overview">Обзор</button><button data-analysis-tab="summary">Сводные данные</button><button data-analysis-tab="subjects">Предметы</button><button data-analysis-tab="schools">Школы</button><button data-analysis-tab="dynamics">Динамика</button><button data-analysis-tab="high">Высокие баллы</button><button data-analysis-tab="quality">Проверка данных</button><button data-analysis-tab="source">Исходные таблицы</button></div>
  <section data-analysis-panel="overview">${overview}</section><section data-analysis-panel="summary" hidden>${summaryHtml}</section><section data-analysis-panel="subjects" hidden>${subjectHtml}</section><section data-analysis-panel="schools" hidden>${schoolHtml}</section><section data-analysis-panel="dynamics" hidden>${dynamics}</section><section data-analysis-panel="high" hidden>${high}</section><section data-analysis-panel="quality" hidden>${quality}</section><section data-analysis-panel="source" hidden>${source}</section></article>`;
};

E.bindDashboard = function(root){
  if(!root) return;
  root.querySelectorAll('[data-analysis-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    root.querySelectorAll('[data-analysis-tab]').forEach(x=>x.classList.toggle('active',x===btn));
    root.querySelectorAll('[data-analysis-panel]').forEach(p=>p.hidden=p.dataset.analysisPanel!==btn.dataset.analysisTab);
  }));
};

E.detectLogoBackground = async function(file){
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Не удалось прочитать изображение'));i.src=url;});
    const max=320,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
    const c=document.createElement('canvas'); c.width=w;c.height=h; const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);
    const d=ctx.getImageData(0,0,w,h).data; const border=Math.max(2,Math.round(Math.min(w,h)*0.08));
    let transparent=0,total=0; const buckets=new Map();
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      if(x>=border&&x<w-border&&y>=border&&y<h-border) continue;
      const i=(y*w+x)*4,a=d[i+3];total++; if(a<32){transparent++;continue;}
      const r=Math.round(d[i]/16)*16,g=Math.round(d[i+1]/16)*16,b=Math.round(d[i+2]/16)*16,key=`${Math.min(255,r)},${Math.min(255,g)},${Math.min(255,b)}`;buckets.set(key,(buckets.get(key)||0)+1);
    }
    if(total && transparent/total>0.55) return {background:'transparent',transparent:true};
    const best=[...buckets.entries()].sort((a,b)=>b[1]-a[1])[0];
    return {background:best?`rgb(${best[0]})`:'#ffffff',transparent:false};
  } finally { URL.revokeObjectURL(url); }
};

E.escape=esc; E.normalize=norm;
global.ROOAnalysisEngine=E;
})(window);
