'use strict';

/* V7 — экзаменационная аналитика и контроль отделов */
const V7_KEYS = {
  exams: 'achkhoyEduOnlineExamRowsV10',
  deptOverrides: 'achkhoyEduOnlineDeptOverridesV10',
  selectedDept: 'achkhoyEduOnlineSelectedDeptV10'
};

const V7_DEPARTMENT_PROFILES = [
  {id:'upbringing', code:'ОВР', name:'Отдел воспитательной работы', email:'ruo.ovdo@mail.ru', head:'Начальник отдела не указан', lastLogin:'Не входил', online:false, tasksGiven:0, completed:0, waitingReview:0, overdue:0, avgReview:null, responses:0, rating:null, sourceDirection:'Воспитательная работа'},
  {id:'general', code:'ОБ', name:'Общий отдел', email:'ruo.npo@mail.ru', head:'Начальник отдела не указан', lastLogin:'Не входил', online:false, tasksGiven:0, completed:0, waitingReview:0, overdue:0, avgReview:null, responses:0, rating:null, sourceDirection:'Общий отдел'},
  {id:'methodical', code:'МО', name:'Методический отдел', email:'infometod@bk.ru', head:'Начальник отдела не указан', lastLogin:'Не входил', online:false, tasksGiven:0, completed:0, waitingReview:0, overdue:0, avgReview:null, responses:0, rating:null, sourceDirection:'Методический отдел'},
  {id:'resources', code:'ХО', name:'Хозяйственный отдел', email:'ruo.khg@mail.ru', head:'Начальник отдела не указан', lastLogin:'Не входил', online:false, tasksGiven:0, completed:0, waitingReview:0, overdue:0, avgReview:null, responses:0, rating:null, sourceDirection:'Хозяйственный отдел'},
  {id:'information', code:'ИО', name:'Информационный отдел', email:'roo.inform@mail.ru', head:'Начальник отдела не указан', lastLogin:'Не входил', online:false, tasksGiven:0, completed:0, waitingReview:0, overdue:0, avgReview:null, responses:0, rating:null, sourceDirection:'Информационный отдел'}
];

const V7_NAMES = [];

function v7Grade(score, status='Сдал') {
  if (/не яв/i.test(status)) return '';
  const n = Number(score);
  if (!Number.isFinite(n)) return '';
  if (n >= 80) return 5;
  if (n >= 57) return 4;
  if (n >= 36) return 3;
  return 2;
}

function v7BuildExamSeed() { return []; }

let v7ExamRows=[];
let v7ExamIssues=[];
let v7SelectedDepartment=localGet(V7_KEYS.selectedDept)||'';
let v7DeptOverrides=loadJSON(V7_KEYS.deptOverrides,{});

function v7LoadExamRows(){
  try { const raw=localGet(V7_KEYS.exams); v7ExamRows=raw?JSON.parse(raw):v7BuildExamSeed(); }
  catch(_){ v7ExamRows=v7BuildExamSeed(); }
}
function v7SaveExamRows(){ localSet(V7_KEYS.exams,JSON.stringify(v7ExamRows)); }
function v7SaveDeptOverrides(){ localSet(V7_KEYS.deptOverrides,JSON.stringify(v7DeptOverrides)); }

function v7AddPage(role,page){ if(ROLE_CONFIG[role] && !ROLE_CONFIG[role].pages.includes(page)) ROLE_CONFIG[role].pages.splice(ROLE_CONFIG[role].pages.indexOf('rating')+1,0,page); }
['chief','deputy','department_head','specialist','observer'].forEach(r=>v7AddPage(r,'exams'));
v7AddPage('school_director','exams');
['chief','deputy','department_head','observer'].forEach(r=>v7AddPage(r,'department_control'));
PAGE_META.exams=['ЕГЭ · ОГЭ · ГИА','Анализ экзаменов'];
PAGE_META.department_control=['Внутренний контроль РОО','Работа отделов'];
ROLE_CONFIG.department_head.scope='Только назначенный отдел РОО';
ROLE_CONFIG.department_head.permissions=['Создание поручений своего отдела','Проверка ответов школ','Возврат на исправление','Своды по своему направлению','Просмотр аналитики и рейтинга','Контроль активности своего подразделения'];

// Привязываем реальные рабочие почты, предоставленные пользователем.
V7_DEPARTMENT_PROFILES.forEach((profile,index)=>{
  const dept=DEPARTMENTS.find(d=>d.id===profile.id);
  if(dept){dept.name=profile.name;dept.short=profile.name.replace(/^Отдел\s+/,'');dept.email=profile.email;dept.head=(v7DeptOverrides[profile.id]?.head||profile.head);}
  const userId=`v7-head-${profile.id}`;
  if(!USERS.some(u=>u.id===userId)) USERS.push({id:userId,role:'department_head',name:v7DeptOverrides[profile.id]?.head||profile.head,initials:profile.code,email:profile.email,unit:profile.name,departmentId:profile.id,lastLogin:profile.lastLogin,active:true});
});
ROLE_USER_MAP.department_head='v7-head-upbringing';

const v7OriginalApplyRole=applyRole;
applyRole=function(role){
  v7OriginalApplyRole(role);
  if(state.role==='department_head'&&state.currentUser?.departmentId){
    const profile=v7Profile(V7_DEPARTMENT_PROFILES.find(p=>p.id===state.currentUser.departmentId)||{name:'Назначенный отдел'});
    if(dom.sidebarScopeText)dom.sidebarScopeText.textContent=`Только: ${profile.name}`;
  }
};

const v7OriginalRenderAll=renderAll;
renderAll=function(){ v7OriginalRenderAll(); v7RenderExams(); v7RenderDepartments(); };
const v7OriginalResetDemo=resetDemo;
resetDemo=function(){ localRemove(V7_KEYS.exams);localRemove(V7_KEYS.deptOverrides);localRemove(V7_KEYS.selectedDept);v7DeptOverrides={};v7ExamRows=v7BuildExamSeed();v7ExamIssues=[];v7SelectedDepartment='';v7OriginalResetDemo();v7SaveExamRows();v7RenderExams();v7RenderDepartments(); };

function v7Esc(value){ return escapeHTML(value); }
function v7Num(value){ const n=Number(String(value??'').replace(',','.').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null; }
function v7StatusKey(row){
  const text=String(row.status||'').toLowerCase();
  if(text.includes('не яв')) return 'absent';
  if(text.includes('не сдал')||Number(row.grade)===2) return 'failed';
  return 'passed';
}
function v7VisibleExamRows(){
  let rows=[...v7ExamRows];
  if(state.role==='school_director' || state.role==='school_staff'){
    const own=currentSchool(); if(own) rows=rows.filter(r=>r.school===own.name);
  }
  const type=document.getElementById('examTypeFilter')?.value||'all';
  const subject=document.getElementById('examSubjectFilter')?.value||'all';
  const school=document.getElementById('examSchoolFilter')?.value||'all';
  const status=document.getElementById('examStatusFilter')?.value||'all';
  const query=(document.getElementById('examStudentSearch')?.value||'').trim().toLowerCase();
  if(type!=='all') rows=rows.filter(r=>r.exam===type);
  if(subject!=='all') rows=rows.filter(r=>r.subject===subject);
  if(school!=='all') rows=rows.filter(r=>r.school===school);
  if(status==='late') rows=rows.filter(r=>Number(r.lateMinutes)>0);
  else if(status!=='all') rows=rows.filter(r=>v7StatusKey(r)===status);
  if(query) rows=rows.filter(r=>`${r.name} ${r.school} ${r.subject}`.toLowerCase().includes(query));
  return rows;
}
function v7ExamStats(rows){
  const present=rows.filter(r=>v7StatusKey(r)!=='absent');
  const scores=present.map(r=>Number(r.score)).filter(Number.isFinite);
  const passed=rows.filter(r=>v7StatusKey(r)==='passed').length;
  const failed=rows.filter(r=>v7StatusKey(r)==='failed').length;
  const absent=rows.filter(r=>v7StatusKey(r)==='absent').length;
  const late=rows.filter(r=>Number(r.lateMinutes)>0).length;
  const avg=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:0;
  const max=scores.length?Math.max(...scores):0;
  const min=scores.length?Math.min(...scores):0;
  const grades=[5,4,3,2].reduce((acc,g)=>(acc[g]=rows.filter(r=>Number(r.grade)===g).length,acc),{});
  return {total:rows.length,present:present.length,passed,failed,absent,late,avg,max,min,grades,passRate:present.length?passed/present.length*100:0,quality:present.length?(grades[5]+grades[4])/present.length*100:0};
}
function v7PopulateExamFilters(){
  const subjectEl=document.getElementById('examSubjectFilter');const schoolEl=document.getElementById('examSchoolFilter');if(!subjectEl||!schoolEl)return;
  const currentSubject=subjectEl.value,currentSchoolValue=schoolEl.value;
  const subjects=[...new Set(v7ExamRows.map(r=>r.subject).filter(Boolean))].sort();
  const schools=[...new Set(v7ExamRows.map(r=>r.school).filter(Boolean))].sort();
  subjectEl.innerHTML='<option value="all">Все предметы</option>'+subjects.map(v=>`<option>${v7Esc(v)}</option>`).join('');
  schoolEl.innerHTML='<option value="all">Все школы</option>'+schools.map(v=>`<option>${v7Esc(v)}</option>`).join('');
  if(subjects.includes(currentSubject))subjectEl.value=currentSubject;
  if(schools.includes(currentSchoolValue))schoolEl.value=currentSchoolValue;
  if(state.role==='school_director') {const own=currentSchool(); if(own){schoolEl.value=own.name;schoolEl.disabled=true;}}
  else schoolEl.disabled=false;
}
function v7RenderExams(){
  const page=document.getElementById('page-exams');if(!page||!ROLE_CONFIG[state.role]?.pages.includes('exams'))return;
  v7PopulateExamFilters();
  const rows=v7VisibleExamRows();const stats=v7ExamStats(rows);
  const kpis=[
    ['◉',stats.total,'Результатов в выборке',`${stats.present} участников`, '#e2f1dd','#2a7040'],
    ['✓',`${stats.passRate.toFixed(1)}%`,'Успешно сдали',`${stats.passed} результатов`, '#d9efdd','#246a3a'],
    ['∑',stats.avg.toFixed(1),'Средний балл',`Максимум ${stats.max}`, '#e1eee7','#39766a'],
    ['!',stats.failed,'Не сдали',`${stats.absent} не явились`, '#fde0dc','#b43c3c'],
    ['◷',stats.late,'Опоздания',stats.late?'Требуют контроля':'Нарушений нет', '#fff0cf','#9e681d']
  ];
  const kpiEl=document.getElementById('examKpis');if(kpiEl)kpiEl.innerHTML=kpis.map(k=>`<article class="v7-kpi" style="--kpi-tint:${k[4]};--kpi-color:${k[5]}"><div class="v7-kpi-icon">${k[0]}</div><strong>${k[1]}</strong><span>${k[2]}</span><small>${k[3]}</small></article>`).join('');
  v7RenderGradeChart(stats);v7RenderScoreChart(rows);v7RenderAnalysis(rows,stats);v7RenderRisk(rows);v7RenderStudents(rows);v7RenderSchoolAnalysis(rows);v7RenderQuality();
  const count=document.getElementById('examStudentCount');if(count)count.textContent=`Показано строк: ${rows.length}`;
  const canUpload=['chief','deputy','department_head','specialist'].includes(state.role);
  ['examUploadButton','examLoadDemo'].forEach(id=>document.getElementById(id)?.classList.toggle('hidden',!canUpload));
}
function v7RenderGradeChart(stats){
  const el=document.getElementById('examGradeChart');if(!el)return;const max=Math.max(1,...[5,4,3,2].map(g=>stats.grades[g]||0));
  el.innerHTML=[5,4,3,2].map(g=>{const n=stats.grades[g]||0;return `<div class="v7-grade-bar"><strong>${n}</strong><div class="v7-grade-column" style="height:${Math.max(4,n/max*175)}px"></div><span>Оценка ${g}</span></div>`}).join('');
}
function v7RenderScoreChart(rows){
  const el=document.getElementById('examScoreChart');if(!el)return;const ranges=[['Ниже 36',0,35],['36–50',36,50],['51–70',51,70],['71–80',71,80],['81–90',81,90],['91–100',91,100]];
  const values=ranges.map(([label,min,max])=>({label,count:rows.filter(r=>Number.isFinite(Number(r.score))&&Number(r.score)>=min&&Number(r.score)<=max).length}));const peak=Math.max(1,...values.map(v=>v.count));
  el.innerHTML=values.map(v=>`<div class="v7-score-row"><span>${v.label}</span><div class="v7-score-track"><div class="v7-score-fill" style="width:${v.count/peak*100}%"></div></div><b>${v.count}</b></div>`).join('');
}
function v7SchoolStats(rows){
  const groups={};rows.forEach(r=>(groups[r.school]||(groups[r.school]=[])).push(r));
  return Object.entries(groups).map(([school,list])=>({school,...v7ExamStats(list)})).sort((a,b)=>b.avg-a.avg);
}
function v7RenderAnalysis(rows,stats){
  const el=document.getElementById('examAnalysisText');if(!el)return;const schools=v7SchoolStats(rows);const best=schools[0];const weakest=[...schools].sort((a,b)=>a.passRate-b.passRate)[0];const subjects={};rows.forEach(r=>(subjects[r.subject]||(subjects[r.subject]=[])).push(r));const subjectStats=Object.entries(subjects).map(([subject,list])=>({subject,...v7ExamStats(list)})).sort((a,b)=>b.avg-a.avg);
  el.innerHTML=`<p>В выборку вошло <b>${stats.total}</b> результатов. Успешно сданы <b>${stats.passed}</b> (${stats.passRate.toFixed(1)}%), не сданы — <b>${stats.failed}</b>, неявок — <b>${stats.absent}</b>.</p><p>Средний балл составляет <b>${stats.avg.toFixed(1)}</b>, качество результатов (оценки 4 и 5) — <b>${stats.quality.toFixed(1)}%</b>.${best?` Лучший средний результат у <b>${v7Esc(best.school)}</b> — ${best.avg.toFixed(1)}.`:''}</p><p>${subjectStats[0]?`Наиболее высокий средний показатель по предмету «<b>${v7Esc(subjectStats[0].subject)}</b>» — ${subjectStats[0].avg.toFixed(1)}.`:''}${weakest&&weakest.failed?` Требует внимания ${v7Esc(weakest.school)}: не сдано ${weakest.failed} результатов.`:''} Зафиксировано опозданий: <b>${stats.late}</b>.</p>`;
}
function v7RenderRisk(rows){
  const el=document.getElementById('examRiskList');if(!el)return;const schools=v7SchoolStats(rows);const failing=[...schools].sort((a,b)=>b.failed-a.failed)[0];const late=[...schools].sort((a,b)=>b.late-a.late)[0];const low=[...schools].sort((a,b)=>a.avg-b.avg)[0];
  const items=[];if(failing&&failing.failed)items.push(['red','!',failing.school,`${failing.failed} несданных результатов (${(100-failing.passRate).toFixed(1)}%)`]);if(low)items.push(['','↘',low.school,`Самый низкий средний балл в выборке — ${low.avg.toFixed(1)}`]);if(late&&late.late)items.push(['','◷',late.school,`Опозданий учеников: ${late.late}`]);if(!items.length)items.push(['green','✓','Критических рисков не найдено','Все результаты соответствуют заданным правилам контроля']);
  el.innerHTML=items.map(i=>`<div class="v7-risk-item ${i[0]}"><i>${i[1]}</i><div><strong>${v7Esc(i[2])}</strong><span>${v7Esc(i[3])}</span></div></div>`).join('');
}
function v7RenderStudents(rows){
  const body=document.getElementById('examStudentsBody');if(!body)return;body.innerHTML=rows.slice(0,400).map((r,i)=>`<tr><td>${i+1}</td><td>${v7Esc(r.name)}</td><td>${v7Esc(r.school)}</td><td>${v7Esc(r.className||'—')}</td><td><span class="tag blue">${v7Esc(r.exam)}</span></td><td>${v7Esc(r.subject)}</td><td>${r.score===''?'—':`<span class="v7-score-badge">${r.score}</span>`}</td><td>${r.grade?`<span class="v7-grade-badge v7-grade-${r.grade}">${r.grade}</span>`:'—'}</td><td><span class="status-pill ${v7StatusKey(r)==='passed'?'done':v7StatusKey(r)==='failed'?'overdue':'pending'}">${v7Esc(r.status)}</span></td><td>${Number(r.lateMinutes)>0?`<span class="tag orange">${r.lateMinutes} мин.</span>`:'—'}</td></tr>`).join('')||'<tr><td colspan="10" class="empty-table">Нет результатов по выбранным фильтрам</td></tr>';
}
function v7RenderSchoolAnalysis(rows){
  const schools=v7SchoolStats(rows);const cards=document.getElementById('examSchoolCards');const body=document.getElementById('examSchoolsBody');
  if(cards)cards.innerHTML=schools.slice(0,3).map((s,i)=>`<article class="v7-school-analysis-card"><span class="rank">${i+1} место</span><h3>${v7Esc(s.school)}</h3><div class="v7-school-analysis-stats"><div><strong>${s.avg.toFixed(1)}</strong><span>средний балл</span></div><div><strong>${s.passRate.toFixed(0)}%</strong><span>сдали</span></div><div><strong>${s.quality.toFixed(0)}%</strong><span>оценки 4–5</span></div></div></article>`).join('')||'<div class="v7-empty-state">Нет данных</div>';
  if(body)body.innerHTML=schools.map((s,i)=>`<tr><td><b>${i+1}</b></td><td class="task-title-cell"><strong>${v7Esc(s.school)}</strong></td><td>${s.total}</td><td><b>${s.avg.toFixed(1)}</b></td><td><span class="tag green">${s.passed} · ${s.passRate.toFixed(0)}%</span></td><td><span class="tag ${s.failed?'red':'green'}">${s.failed}</span></td><td>${s.grades[5]+s.grades[4]} · ${s.quality.toFixed(0)}%</td><td>${s.late}</td></tr>`).join('');
}
function v7ComputeQuality(){
  const issues=[...v7ExamIssues];const seen=new Set();let duplicates=0,missing=0,mismatch=0;
  v7ExamRows.forEach(r=>{const key=`${r.name}|${r.school}|${r.exam}|${r.subject}`.toLowerCase();if(seen.has(key))duplicates++;seen.add(key);if(!r.name||!r.school||!r.subject)missing++;if(r.score!==''&&Number(r.grade)!==v7Grade(r.score,r.status))mismatch++;});
  if(duplicates)issues.push({level:'warning',title:'Возможные повторные строки',text:`Найдено совпадений: ${duplicates}. Проверьте учеников с одинаковым экзаменом и предметом.`});
  if(missing)issues.push({level:'error',title:'Не заполнены обязательные поля',text:`Строк с пропусками: ${missing}.`});
  if(mismatch)issues.push({level:'warning',title:'Оценка не совпадает с баллом',text:`Строк для проверки: ${mismatch}. Пороговые значения можно изменить в настройках.`});
  if(!issues.length)issues.push({level:'ok',title:'Данные прошли проверку',text:'Критических ошибок, пустых обязательных полей и неправильных баллов не найдено.'});
  return issues;
}
function v7RenderQuality(){const el=document.getElementById('examQualityList');if(!el)return;el.innerHTML=v7ComputeQuality().map(i=>`<div class="v7-quality-item ${i.level==='ok'?'':i.level}"><i>${i.level==='error'?'!':i.level==='warning'?'△':'✓'}</i><div><strong>${v7Esc(i.title)}</strong><span>${v7Esc(i.text)}</span></div></div>`).join('');}

function v7ParseCSV(text){
  const first=(text.split(/\r?\n/).find(Boolean)||'');const candidates=[';',',','\t'];const delimiter=candidates.sort((a,b)=>first.split(b).length-first.split(a).length)[0];const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===delimiter&&!quoted){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(v=>String(v).trim()))rows.push(row);row=[];}else cell+=ch;}
  if(cell||row.length){row.push(cell);if(row.some(v=>String(v).trim()))rows.push(row);}return rows;
}
function v7NormalizeHeader(h){return String(h||'').toLowerCase().replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/g,' ').trim();}
function v7FindColumn(headers,aliases){return headers.findIndex(h=>aliases.some(a=>h===a||h.includes(a)));}
function v7ImportCSV(text,fileName){
  const raw=v7ParseCSV(text.replace(/^\uFEFF/,''));if(raw.length<2)throw new Error('Файл не содержит строк с результатами');
  const headers=raw[0].map(v7NormalizeHeader);const cols={
    name:v7FindColumn(headers,['фио','ученик','фамилия имя отчество']),school:v7FindColumn(headers,['школа','образовательная организация','оо']),className:v7FindColumn(headers,['класс']),exam:v7FindColumn(headers,['экзамен','тип экзамена','вид экзамена']),subject:v7FindColumn(headers,['предмет']),score:v7FindColumn(headers,['балл','тестовый балл','итоговый балл']),grade:v7FindColumn(headers,['оценка','отметка']),status:v7FindColumn(headers,['статус','результат']),lateMinutes:v7FindColumn(headers,['опоздание','минут опоздания','опоздание минут']),year:v7FindColumn(headers,['учебный год','год'])
  };
  const required=['name','school','subject','score'];const missing=required.filter(k=>cols[k]<0);if(missing.length)throw new Error(`Не найдены обязательные колонки: ${missing.join(', ')}`);
  const issues=[],valid=[];raw.slice(1).forEach((cells,index)=>{const get=k=>cols[k]>=0?String(cells[cols[k]]??'').trim():'';const name=get('name'),school=get('school'),subject=get('subject');const scoreRaw=get('score');let score=scoreRaw===''?'':v7Num(scoreRaw);let status=get('status')||'Сдал';if(score!==''&&(score<0||score>100)){issues.push({level:'error',title:`Строка ${index+2}: неправильный балл`,text:`Указано значение «${scoreRaw}». Допустимо от 0 до 100.`});return;}if(!name||!school||!subject){issues.push({level:'error',title:`Строка ${index+2}: не заполнены данные`,text:'Необходимо указать ФИО, школу и предмет.'});return;}if(/не яв/i.test(status))score='';let grade=v7Num(get('grade'));if(!grade)grade=v7Grade(score,status);if(score!==''&&Number(score)<36&&!/не сдал/i.test(status))status='Не сдал';valid.push({id:`import-${Date.now()}-${index}`,year:get('year')||document.getElementById('examYearFilter').value,name,school,className:get('className')||'—',exam:get('exam')||document.getElementById('examTypeFilter').value.replace('all','ЕГЭ'),subject,score,grade,status,lateMinutes:v7Num(get('lateMinutes'))||0,source:fileName});});
  if(!valid.length)throw new Error('После проверки не осталось корректных строк');v7ExamRows=valid;v7ExamIssues=issues;v7SaveExamRows();return {valid:valid.length,issues:issues.length};
}
function v7DownloadTemplate(){downloadCSV('shablon_rezultatov_ege_oge_gia.csv',[['ФИО','Школа','Класс','Экзамен','Предмет','Балл','Оценка','Статус','Опоздание, минут','Учебный год']]);showToast('Шаблон скачан — откройте его в Excel');}
function v7ExportExams(){const rows=v7VisibleExamRows();downloadCSV('analiz_rezultatov_ekzamenov.csv',[['ФИО','Школа','Класс','Экзамен','Предмет','Балл','Оценка','Статус','Опоздание, минут','Учебный год'],...rows.map(r=>[r.name,r.school,r.className,r.exam,r.subject,r.score,r.grade,r.status,r.lateMinutes,r.year])]);showToast('Пофамильный список скачан');}

function v7Profile(profile){return {...profile,...(v7DeptOverrides[profile.id]||{})};}
function v7VisibleDepartments(){if(state.role==='department_head')return V7_DEPARTMENT_PROFILES.filter(p=>p.id===state.currentUser.departmentId);return V7_DEPARTMENT_PROFILES;}
function v7DeptTasks(profile){return state.tasks.filter(t=>t.departmentId===profile.id).slice(0,6);}
function v7DeptActivities(profile){
  const names=new Set(USERS.filter(u=>u.departmentId===profile.id).map(u=>u.name));
  return state.audit.filter(a=>names.has(a.user)||String(a.object||'').toLowerCase().includes(String(profile.name||'').toLowerCase())||String(a.object||'').toLowerCase().includes(String(profile.sourceDirection||'').toLowerCase())).slice(0,8).map(a=>[String(a.time||'').split(' ').slice(-1)[0]||'—',`${a.user}: ${a.action}${a.object?` — ${a.object}`:''}`]);
}
function v7RenderDepartments(){
  const page=document.getElementById('page-department_control');if(!page||!ROLE_CONFIG[state.role]?.pages.includes('department_control'))return;const profiles=v7VisibleDepartments().map(v7Profile);
  const totals={tasks:profiles.reduce((a,p)=>a+p.tasksGiven,0),completed:profiles.reduce((a,p)=>a+p.completed,0),waiting:profiles.reduce((a,p)=>a+p.waitingReview,0),overdue:profiles.reduce((a,p)=>a+p.overdue,0),avg:profiles.length?profiles.reduce((a,p)=>a+p.rating,0)/profiles.length:0};
  const summary=document.getElementById('departmentSummary');if(summary)summary.innerHTML=[['▤',totals.tasks,'Поручений создано'],['✓',totals.completed,'Завершено'],['◷',totals.waiting,'Ждут проверки'],['!',totals.overdue,'Просрочено'],['★',totals.avg.toFixed(1)+'%','Средний рейтинг']].map(v=>`<article class="v7-summary-card"><i>${v[0]}</i><div><strong>${v[1]}</strong><span>${v[2]}</span></div></article>`).join('');
  const cards=document.getElementById('departmentCards');if(cards)cards.innerHTML=profiles.map(p=>`<article class="v7-department-card ${v7SelectedDepartment===p.id?'active':''}" data-v7-dept="${p.id}"><div class="v7-dept-card-head"><div class="v7-dept-avatar">${p.code}</div><div><h3>${v7Esc(p.name)}</h3><a href="mailto:${v7Esc(p.email)}">${v7Esc(p.email)}</a></div></div><div class="v7-dept-person"><span>${v7Esc(p.head)}</span><strong class="v7-online ${p.online?'':'offline'}">${p.online?'В системе':p.lastLogin==='Не входил'?'Не входил':'Последний вход: '+p.lastLogin}</strong></div><div class="v7-dept-mini-stats"><div><strong>${p.tasksGiven}</strong><span>создано</span></div><div><strong>${p.completed}</strong><span>завершено</span></div><div><strong>${p.waitingReview}</strong><span>на проверке</span></div><div><strong>${p.overdue}</strong><span>просрочено</span></div></div><div class="v7-dept-card-foot"><div class="v7-dept-score"><b>${p.rating==null?'—':p.rating+'%'}</b><span>${p.rating==null?'не рассчитан':'рейтинг отдела'}</span></div><button data-v7-dept-open="${p.id}">Подробнее →</button></div></article>`).join('');
  const rating=document.getElementById('departmentRatingList');if(rating)rating.innerHTML=[...profiles].sort((a,b)=>b.rating-a.rating).map((p,i)=>`<div class="v7-dept-rating-row"><div class="v7-dept-rating-top"><b>${i+1}</b><strong>${v7Esc(p.name)}</strong><b>${p.rating}%</b></div><div class="v7-rating-track"><i style="width:${p.rating}%"></i></div></div>`).join('');
  document.querySelectorAll('[data-v7-dept],[data-v7-dept-open]').forEach(el=>el.onclick=(event)=>{event.stopPropagation();v7SelectedDepartment=el.dataset.v7Dept||el.dataset.v7DeptOpen;localSet(V7_KEYS.selectedDept,v7SelectedDepartment);v7RenderDepartments();});
  if(v7SelectedDepartment&&!profiles.some(p=>p.id===v7SelectedDepartment))v7SelectedDepartment=profiles[0]?.id||'';
  v7RenderDepartmentDetail(profiles.find(p=>p.id===v7SelectedDepartment));
}
function v7RenderDepartmentDetail(profile){
  const el=document.getElementById('departmentDetail');if(!el)return;if(!profile){el.innerHTML='<div class="v7-empty-state"><span>▦</span><h3>Выберите отдел</h3><p>Здесь появятся поручения, ответы школ, активность аккаунта и показатели начальника отдела.</p></div>';return;}
  const tasks=v7DeptTasks(profile),activities=v7DeptActivities(profile);const canEdit=state.role==='chief';
  el.innerHTML=`<div class="v7-detail-head"><div class="v7-dept-avatar">${profile.code}</div><div><span class="eyebrow">Карточка подразделения</span><h2>${v7Esc(profile.name)}</h2><p>${v7Esc(profile.head)} · ${v7Esc(profile.email)} · Последний вход: ${v7Esc(profile.lastLogin)}</p></div><div class="v7-detail-actions"><a class="secondary-button" href="mailto:${v7Esc(profile.email)}">Написать</a><button class="secondary-button" id="v7ShowDeptTasks">Открыть поручения</button>${canEdit?'<button class="primary-button" id="v7EditDepartment">Изменить карточку</button>':''}</div></div><div class="v7-detail-kpis"><div><strong>${profile.tasksGiven}</strong><span>поручений дал</span></div><div><strong>${profile.responses}</strong><span>ответов получил</span></div><div><strong>${profile.completed}</strong><span>завершил</span></div><div><strong>${profile.waitingReview}</strong><span>ждут проверки</span></div><div><strong>${profile.avgReview==null?'—':profile.avgReview+' ч'}</strong><span>среднее время проверки</span></div><div><strong>${profile.rating==null?'—':profile.rating+'%'}</strong><span>${profile.rating==null?'не рассчитан':'рейтинг'}</span></div></div><div class="v7-detail-grid"><div class="v7-subpanel"><h3>Поручения отдела</h3>${tasks.map(t=>`<div class="v7-dept-task"><div><strong>${v7Esc(t.title)}</strong><span>Срок: ${v7Esc(t.due||t.deadline||'по графику')}</span></div><span class="tag ${statusClass(t.status)}">${t.status==='done'?'Завершено':t.status==='review'?'На проверке':t.status==='overdue'?'Просрочено':'В работе'}</span></div>`).join('')}</div><div class="v7-subpanel"><h3>Последняя активность</h3>${activities.map(a=>`<div class="v7-activity-item"><time>${a[0]}</time><div>${v7Esc(a[1])}</div></div>`).join('')}</div></div>`;
  document.getElementById('v7ShowDeptTasks')?.addEventListener('click',()=>{navigate('tasks');showToast(`Открыты поручения: ${profile.name}`);});
  document.getElementById('v7EditDepartment')?.addEventListener('click',()=>v7OpenDepartmentEditor(profile));
}
function v7OpenDepartmentEditor(profile){
  showInfoModal(`Настройка: ${profile.name}`,`<div class="form-grid"><label class="span-2">Название отдела<input id="v7DeptEditName" value="${v7Esc(profile.name)}"></label><label class="span-2">ФИО начальника<input id="v7DeptEditHead" value="${v7Esc(profile.head)}" placeholder="Введите ФИО"></label><label class="span-2">Рабочая почта<input id="v7DeptEditEmail" type="email" value="${v7Esc(profile.email)}"></label></div><button class="primary-button full" id="v7SaveDepartmentCard">Сохранить карточку отдела</button>`,'Управление подразделением');
  setTimeout(()=>document.getElementById('v7SaveDepartmentCard')?.addEventListener('click',()=>{v7DeptOverrides[profile.id]={...(v7DeptOverrides[profile.id]||{}),name:document.getElementById('v7DeptEditName').value.trim()||profile.name,head:document.getElementById('v7DeptEditHead').value.trim()||profile.head,email:document.getElementById('v7DeptEditEmail').value.trim()||profile.email};v7SaveDeptOverrides();const dept=DEPARTMENTS.find(d=>d.id===profile.id);if(dept)Object.assign(dept,v7DeptOverrides[profile.id]);const user=USERS.find(u=>u.email===profile.email||u.departmentId===profile.id&&u.role==='department_head');if(user){user.name=v7DeptOverrides[profile.id].head;user.email=v7DeptOverrides[profile.id].email;user.unit=v7DeptOverrides[profile.id].name;}closeModal('infoModal');v7RenderDepartments();renderUsers();addAudit('Изменил карточку отдела',v7DeptOverrides[profile.id].name,'security');showToast('Карточка отдела сохранена');}),0);
}
function v7ExportDepartmentRating(){const profiles=V7_DEPARTMENT_PROFILES.map(v7Profile).sort((a,b)=>b.rating-a.rating);downloadCSV('reiting_otdelov_roo.csv',[['Место','Отдел','Рабочая почта','Начальник','Создано поручений','Завершено','Ждут проверки','Просрочено','Среднее время проверки, ч','Рейтинг'],...profiles.map((p,i)=>[i+1,p.name,p.email,p.head,p.tasksGiven,p.completed,p.waitingReview,p.overdue,p.avgReview,p.rating])]);showToast('Рейтинг отделов скачан');}

function v7BindEvents(){
  const file=document.getElementById('examFileInput');document.getElementById('examUploadButton')?.addEventListener('click',()=>file?.click());
  file?.addEventListener('change',()=>{const selected=file.files?.[0];if(!selected)return;const status=document.getElementById('examImportStatus');if(/\.(xlsx|xls)$/i.test(selected.name)){status.textContent='Не удалось обработать Excel-файл. Сохраните его как CSV UTF-8 и повторите загрузку';status.classList.add('error');showInfoModal('Файл Excel','Этот файл не удалось прочитать текущим обработчиком. Откройте файл в Excel и выберите <b>Сохранить как → CSV UTF-8</b>. Рабочая онлайн-версия будет принимать XLSX напрямую.','Загрузка результатов');file.value='';return;}const reader=new FileReader();reader.onload=()=>{try{const result=v7ImportCSV(String(reader.result||''),selected.name);status.textContent=`Импортировано строк: ${result.valid}. Предупреждений: ${result.issues}`;status.classList.remove('error');v7PopulateExamFilters();v7RenderExams();addAudit('Загрузил результаты экзаменов',selected.name,'submission');showToast('Результаты загружены и проанализированы');}catch(error){status.textContent=error.message;status.classList.add('error');showToast(error.message);}file.value='';};reader.readAsText(selected,'UTF-8');});
  document.getElementById('examDownloadTemplate')?.addEventListener('click',v7DownloadTemplate);document.getElementById('examExportFiltered')?.addEventListener('click',v7ExportExams);
  ['examYearFilter','examTypeFilter','examSubjectFilter','examSchoolFilter','examStatusFilter'].forEach(id=>document.getElementById(id)?.addEventListener('change',v7RenderExams));document.getElementById('examStudentSearch')?.addEventListener('input',v7RenderExams);
  document.querySelectorAll('[data-exam-tab]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-exam-tab]').forEach(b=>b.classList.toggle('active',b===btn));document.querySelectorAll('[data-exam-panel]').forEach(p=>p.classList.toggle('active',p.dataset.examPanel===btn.dataset.examTab));}));
  document.getElementById('examCopyAnalysis')?.addEventListener('click',async()=>{const text=document.getElementById('examAnalysisText')?.innerText||'';try{await navigator.clipboard.writeText(text);showToast('Аналитическая справка скопирована');}catch(_){showToast('Выделите текст и скопируйте вручную');}});
  document.getElementById('departmentExportButton')?.addEventListener('click',v7ExportDepartmentRating);document.getElementById('departmentRefreshButton')?.addEventListener('click',()=>{v7RenderDepartments();showToast('Показатели отделов обновлены');});document.getElementById('departmentRatingRules')?.addEventListener('click',()=>showInfoModal('Рейтинг отделов','<ul><li><b>25%</b> — поручения завершены в срок.</li><li><b>20%</b> — скорость проверки ответов школ.</li><li><b>15%</b> — отсутствие необработанных отчётов.</li><li><b>15%</b> — качество поручений и форм.</li><li><b>10%</b> — ответы на обращения школ.</li><li><b>10%</b> — внутренние поручения начальника РОО.</li><li><b>5%</b> — отсутствие необоснованных продлений.</li></ul><p>Само количество созданных поручений не повышает рейтинг.</p>','Объективная оценка'));
  // До основного обработчика входа подставляем аккаунт отдела по указанной почте.
  document.getElementById('loginForm')?.addEventListener('submit',()=>{const email=(document.getElementById('emailInput')?.value||'').trim().toLowerCase();const user=USERS.find(u=>u.role==='department_head'&&u.email.toLowerCase()===email);if(user){ROLE_USER_MAP.department_head=user.id;document.getElementById('roleSelect').value='department_head';}},true);
}

v7LoadExamRows();
document.addEventListener('DOMContentLoaded',()=>{v7BindEvents();v7PopulateExamFilters();v7RenderExams();v7RenderDepartments();});
