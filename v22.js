'use strict';

/* V22 — полный аудит достоверности данных, пустых состояний и читаемости интерфейса. */
const V22 = {
  version: 'V23',
  auditDate: '24.07.2026'
};

function v22Finite(value){
  if(value===null||value===undefined||value==='') return null;
  const n=Number(value); return Number.isFinite(n)?n:null;
}
function v22Pct(value,digits=0){
  const n=v22Finite(value); return n===null?'—':`${n.toFixed(digits).replace('.',',')}%`;
}
function v22Score(value,digits=1){
  const n=v22Finite(value); return n===null?'—':n.toFixed(digits).replace('.',',');
}
function v22Clamp(value){const n=v22Finite(value);return n===null?0:Math.max(0,Math.min(100,n));}
function v22Empty(title,text='Данные появятся после начала работы в системе.'){
  return `<div class="v22-empty"><span>○</span><div><strong>${escapeHTML(title)}</strong><small>${escapeHTML(text)}</small></div></div>`;
}
function v22StatusLabel(status){return ({active:'В работе',review:'На проверке',overdue:'Просрочено',done:'Завершено',pending_approval:'На согласовании',draft:'Черновик'})[status]||status||'Без статуса';}
function v22MonthTitle(date=new Date()){return date.toLocaleDateString('ru-RU',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase());}
function v22AcademicYear(date=new Date()){const y=date.getFullYear(),m=date.getMonth();return m>=7?`${y}–${y+1}`:`${y-1}–${y}`;}
function v22TaskDate(task){const d=new Date(task.deadlineDate||'');return Number.isNaN(d.getTime())?null:d;}
function v22RatedSchools(){return SCHOOLS.filter(s=>Number.isFinite(Number(s.rating))).sort((a,b)=>Number(b.rating)-Number(a.rating));}
function v22SchoolRatingLabel(school){return Number.isFinite(Number(school?.rating))?v22Pct(school.rating,1):'Не рассчитан';}
function v22DeptHasData(profile){return Number(profile?.tasksGiven||0)>0||Number(profile?.responses||0)>0||Number(profile?.completed||0)>0||Number(profile?.waitingReview||0)>0||Number(profile?.overdue||0)>0;}
function v22DepartmentRating(profile){return v22DeptHasData(profile)?v22Finite(profile.rating):null;}
function v22CurrentUserName(){return state.currentUser?.name||roleConfig()?.label||'Пользователь';}

function v22UpdateStaticUI(){
  document.title='Отдел образования Ачхой-Мартановского района';
  document.querySelector('meta[name="description"]')?.setAttribute('content','Рабочая информационная система Отдела образования Ачхой-Мартановского района');
  const topEyebrow=document.getElementById('pageEyebrow');if(topEyebrow)topEyebrow.textContent='Отдел образования';
  const topTitle=document.getElementById('pageTitle');if(topTitle)topTitle.textContent='Ачхой-Мартановского района';
  const version=document.getElementById('versionButton');if(version)version.textContent=V22.version;
  const newBadge=document.querySelector('[data-page="exams"] .v7-new-badge');newBadge?.remove();
  const appealBadge=document.querySelector('[data-page="appeals"] .nav-badge');if(appealBadge){const n=(typeof v3State!=='undefined'?v3State.appeals.filter(a=>a.status!=='done').length:0);appealBadge.textContent=n;appealBadge.classList.toggle('hidden',n===0);}
  const taskBadge=document.getElementById('taskNavBadge');if(taskBadge&&Number(taskBadge.textContent)===0)taskBadge.classList.add('hidden');
  document.querySelectorAll('.brand-copy strong').forEach(el=>{if(/Отдел Образования/i.test(el.textContent))el.textContent='Отдел образования';});
  const today=document.getElementById('todayLabel');if(today)today.textContent=new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const ratingTabs=document.getElementById('ratingTabs');if(ratingTabs){const buttons=ratingTabs.querySelectorAll('button');if(buttons[0])buttons[0].textContent='Текущий период';if(buttons[1])buttons[1].textContent='Предыдущий период';if(buttons[2])buttons[2].textContent=`${v22AcademicYear()} учебный год`;}
  const reportPeriod=document.getElementById('reportPeriod');if(reportPeriod)reportPeriod.innerHTML=`<option>${v22MonthTitle()}</option><option>${v22AcademicYear()} учебный год</option>`;
  const calendarTitle=document.getElementById('calendarMonthTitle');if(calendarTitle)calendarTitle.textContent=v22MonthTitle();
  const allRecipients=document.querySelector('#newTaskRecipients option[value="all"]');if(allRecipients)allRecipients.textContent=`Все школы района${SCHOOLS.length?` (${SCHOOLS.length})`:''}`;
}

/* Реальный статус школы: отчёт -> статус получателя -> новое, без псевдослучайных значений. */
const v22OriginalTaskOwnStatus=taskOwnStatus;
taskOwnStatus=function(task){
  if(isSchoolRole()&&state.currentUser?.schoolId){
    const submission=typeof getSubmission==='function'?getSubmission(task.id,state.currentUser.schoolId):null;
    if(submission&&typeof submissionStatusInfo==='function'){
      const info=submissionStatusInfo(submission.status);return {status:submission.status,text:info.text,detail:info.detail};
    }
    const recipient=(task._recipients||[]).find(r=>r.school_id===state.currentUser.schoolId);
    if(recipient){
      const map={new:['new','Новое','Поручение ещё не открыто'],working:['working','В работе','Поручение принято в работу'],director:['director','У директора','Ожидает подтверждения директора'],review:['review','На проверке РОО','Отчёт направлен на проверку'],returned:['returned','На исправлении','Отчёт возвращён с замечаниями'],accepted:['accepted','Принято','Работа принята отделом образования'],overdue:['overdue','Просрочено','Срок выполнения истёк']};
      const item=map[recipient.status]||map.new;return {status:item[0],text:item[1],detail:item[2]};
    }
    return {status:'new',text:'Новое',detail:'Поручение ещё не открыто'};
  }
  return v22OriginalTaskOwnStatus(task);
};

function renderV5Dashboard(){
  const tasks=getVisibleTasks();
  const counts={active:0,review:0,overdue:0,done:0,pending_approval:0,draft:0};
  tasks.forEach(t=>{if(Object.prototype.hasOwnProperty.call(counts,t.status))counts[t.status]++;});
  const school=currentSchool();
  const welcome=document.getElementById('welcomeTitle');if(welcome)welcome.textContent=`${roleConfig()?.label||'Пользователь'}!`;
  const text=document.getElementById('welcomeText');
  if(text){
    const actionCount=counts.active+counts.review+counts.overdue+counts.pending_approval;
    text.textContent=tasks.length?`Доступно поручений: ${tasks.length}. Требуют внимания: ${actionCount}. Просрочено: ${counts.overdue}.`:'Новых поручений пока нет. Здесь появятся задачи, сроки и результаты работы.';
  }
  const today=document.getElementById('todayLabel');if(today)today.textContent=new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const kpis=v5IsSchool()?[
    ['▤','Назначено поручений',tasks.length,'В доступном периоде','green'],
    ['◷','Требуют действия',counts.active+counts.review+counts.overdue+counts.pending_approval,'Откройте список поручений','orange'],
    ['!','Просрочено',counts.overdue,counts.overdue?'Нужно выполнить в первую очередь':'Просрочек нет','red'],
    ['✓','Принято',counts.done,'Отчёты приняты РОО','green'],
    ['★','Рейтинг школы',school?v22SchoolRatingLabel(school):'—',school?.place?`${school.place} место среди рассчитанных`:'Появится после выполненных поручений','blue']
  ]:[
    ['▤','В работе',counts.active,'Активные поручения','green'],
    ['◷','На проверке',counts.review,'Ответы ожидают решения','orange'],
    ['!','Просрочено',counts.overdue,counts.overdue?'Требуют контроля':'Просрочек нет','red'],
    ['✓','Завершено',counts.done,'Принято и закрыто','green'],
    ['★','Школ с рейтингом',v22RatedSchools().length,SCHOOLS.length?`Всего школ: ${SCHOOLS.length}`:'Школы ещё не добавлены','blue']
  ];
  const root=document.getElementById('v5Kpis');if(root)root.innerHTML=kpis.map(([icon,label,value,note,tone])=>`<article class="v5-kpi-card ${tone}"><div class="v5-kpi-icon">${icon}</div><div><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong><small>${escapeHTML(note)}</small></div></article>`).join('');

  const attention=[];
  tasks.filter(t=>t.status==='overdue').slice(0,2).forEach(t=>attention.push(['!','Просрочено',t.title,'red','tasks']));
  if(counts.review)attention.push(['◷','Отчёты на проверке',`${counts.review} ответов ожидают решения`,'orange','tasks']);
  if(counts.pending_approval)attention.push(['▤','На согласовании',`${counts.pending_approval} поручений ожидают решения`,'orange','approvals']);
  const appeals=typeof v3State!=='undefined'?v3State.appeals.filter(a=>a.status!=='done').length:0;
  if(appeals)attention.push(['✉','Обращения',`${appeals} обращений требуют ответа`,'blue','appeals']);
  const attentionRoot=document.getElementById('v5Attention');if(attentionRoot)attentionRoot.innerHTML=attention.length?attention.slice(0,4).map(([icon,title,sub,tone,page])=>`<div class="v5-attention-item ${tone}" data-v5-page="${page}"><div class="v5-attention-icon">${icon}</div><div><strong>${escapeHTML(title)}</strong><span>${escapeHTML(sub)}</span></div><b>›</b></div>`).join(''):v22Empty('Срочных вопросов нет','Просрочки, новые обращения и отчёты на проверке появятся здесь.');

  const recent=document.getElementById('v5RecentTasks');if(recent)recent.innerHTML=tasks.length?tasks.slice(0,5).map(t=>`<tr data-open-task="${t.id}"><td>${escapeHTML(t.title)}</td><td><span class="v5-status ${v5StatusClass(t)}">${escapeHTML(v22StatusLabel(t.status))}</span><small class="v22-task-deadline">${escapeHTML(t.deadline||'Срок не указан')}</small></td></tr>`).join(''):'<tr><td colspan="2" class="empty-state">Поручения ещё не созданы</td></tr>';

  const dashboardRatingTitle=document.getElementById('dashboardRatingTitle');if(dashboardRatingTitle)dashboardRatingTitle.textContent=v5IsSchool()?'Показатели школы':'Рейтинг школ';
  const ranking=document.getElementById('v5Ranking');
  if(ranking){
    if(v5IsSchool()&&school){
      const metrics=[['Соблюдение сроков',school.tasks?school.onTime/Math.max(1,school.tasks)*100:null],['Качество',school.quality],['Полнота',school.completeness],['Скорость реакции',school.response]];
      const known=metrics.filter(([,v])=>Number.isFinite(Number(v)));
      ranking.innerHTML=known.length?known.map(([name,value],i)=>`<div class="v5-ranking-item"><div class="v5-rank ${i===0?'gold':''}">${i+1}</div><div><div class="v5-ranking-name">${escapeHTML(name)}</div><div class="v5-rating-bar"><i style="width:${v22Clamp(value)}%"></i></div></div><div class="v5-ranking-score">${v22Pct(value,0)}</div></div>`).join(''):v22Empty('Рейтинг ещё не рассчитан','Для расчёта нужны выполненные и проверенные поручения.');
    }else{
      const rated=v22RatedSchools().slice(0,5);
      ranking.innerHTML=rated.length?rated.map((s,i)=>`<div class="v5-ranking-item" data-school-card="${s.id}"><div class="v5-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</div><div><div class="v5-ranking-name">${escapeHTML(s.name)}</div><div class="v5-rating-bar"><i style="width:${v22Clamp(s.rating)}%"></i></div></div><div class="v5-ranking-score">${v22Pct(s.rating,1)}</div></div>`).join(''):v22Empty('Рейтинг пока пуст','Он появится после выполнения и проверки первых поручений.');
    }
  }

  const deadlines=document.getElementById('v5Deadlines');
  const important=tasks.filter(t=>['overdue','review','active','pending_approval'].includes(t.status)).sort((a,b)=>(v22TaskDate(a)?.getTime()||Infinity)-(v22TaskDate(b)?.getTime()||Infinity)).slice(0,3);
  if(deadlines)deadlines.innerHTML=important.length?important.map((t,i)=>{const d=v22TaskDate(t);return `<div class="v5-deadline-row" data-open-task="${t.id}"><div class="v5-date-box"><strong>${d?String(d.getDate()).padStart(2,'0'):'—'}</strong><span>${d?d.toLocaleDateString('ru-RU',{month:'short'}).replace('.','').toUpperCase():'СРОК'}</span></div><div><strong>${escapeHTML(t.title)}</strong><span>${escapeHTML(t.direction||'Без направления')}</span></div><span class="tag ${t.status==='overdue'?'red':t.status==='review'?'orange':'blue'}">${escapeHTML(v22StatusLabel(t.status))}</span></div>`;}).join(''):v22Empty('Ближайших сроков нет','После создания поручений здесь появятся контрольные даты.');
  document.querySelectorAll('[data-v5-page]').forEach(el=>el.onclick=()=>navigate(el.dataset.v5Page));
  bindDynamicOpeners?.();v22UpdateStaticUI();
}

function renderSchools(){
  const q=(dom.schoolSearch?.value||'').trim().toLowerCase();
  const risk=dom.schoolRiskFilter?.value||'all';
  let schools=getVisibleSchools().filter(s=>(!q||`${s.name} ${s.director} ${s.locality}`.toLowerCase().includes(q))&&(risk==='all'||s.risk===risk));
  dom.schoolsSummary.innerHTML=[
    [schools.length,'Школ в списке'],
    [schools.filter(s=>Number.isFinite(Number(s.rating))).length,'С рассчитанным рейтингом'],
    [schools.filter(s=>s.overdue>0).length,'С просрочками'],
    [schools.filter(s=>s.online).length,'Сейчас в системе']
  ].map(([v,l])=>`<div class="summary-card"><strong>${v}</strong><span>${l}</span></div>`).join('');
  dom.schoolGrid.innerHTML=schools.length?schools.map(s=>`<article class="school-card" data-school-card="${s.id}"><div class="school-card-head"><div class="school-logo">${s.place||'—'}</div><div><span class="tag ${s.rating===null?'gray':s.rating>=90?'green':s.rating>=75?'orange':'red'}">${Number.isFinite(Number(s.rating))?v22Pct(s.rating,1):'Без рейтинга'}</span></div></div><h3>${escapeHTML(s.name)}</h3><p>${escapeHTML(s.director||'Директор не указан')}${s.locality?` · ${escapeHTML(s.locality)}`:''}</p><div class="school-metrics"><div><strong>${s.tasks||0}</strong><span>Поручений</span></div><div><strong>${s.overdue||0}</strong><span>Просрочено</span></div><div><strong>${s.returned||0}</strong><span>Возвратов</span></div></div><div class="school-card-footer"><span class="risk-badge ${s.risk==='good'?'delta-up':s.risk==='critical'?'delta-down':''}">${s.risk==='unknown'?'Недостаточно данных':riskLabel(s.risk)} · ${s.online?'в сети':'не в сети'}</span><button data-school-card="${s.id}">Карточка школы →</button></div></article>`).join(''):v22Empty('Школы не добавлены','Добавьте первую образовательную организацию или импортируйте результаты экзаменов.');
  bindDynamicOpeners?.();
}

function openSchoolModal(schoolId){
  const school=SCHOOLS.find(s=>s.id===schoolId);if(!school)return;
  dom.schoolModalTitle.textContent=school.name;
  const metrics=[['Соблюдение сроков',school.tasks?school.onTime/Math.max(1,school.tasks)*100:null],['Качество данных',school.quality],['Полнота ответа',school.completeness],['Скорость реакции',school.response]];
  const known=metrics.filter(([,v])=>Number.isFinite(Number(v)));
  dom.schoolModalContent.innerHTML=`<div class="school-profile-head"><div class="school-logo">${school.place||'—'}</div><div><strong>${escapeHTML(school.name)}</strong><span>Директор: ${escapeHTML(school.director||'не указан')}<br>Ответственный: ${escapeHTML(school.responsible||'не указан')}</span></div><span class="tag ${school.risk==='good'?'green':school.risk==='attention'?'orange':school.risk==='critical'?'red':'gray'}">${school.risk==='unknown'?'Недостаточно данных':riskLabel(school.risk)}</span></div><div class="school-profile-stats"><div><b>${Number.isFinite(Number(school.rating))?v22Pct(school.rating,1):'—'}</b><span>Рейтинг</span></div><div><b>${school.place||'—'}</b><span>Место</span></div><div><b>${school.overdue||0}</b><span>Просрочки</span></div><div><b>${school.returned||0}</b><span>Возвраты</span></div></div><div class="drawer-card"><h3>Составляющие рейтинга</h3>${known.length?`<div class="rating-breakdown">${known.map(([label,value])=>`<div class="breakdown-row"><span>${escapeHTML(label)}</span><div class="mini-progress"><i style="width:${v22Clamp(value)}%"></i></div><b>${v22Pct(value,0)}</b></div>`).join('')}</div>`:v22Empty('Рейтинг не рассчитан','Показатели появятся после выполнения и проверки поручений.')}</div><div class="modal-actions"><button class="secondary-button" data-school-report="${school.id}">Скачать карточку</button></div>`;
  openModal('schoolModal');document.querySelector('[data-school-report]')?.addEventListener('click',()=>downloadSchoolCard(school));
}

function renderRating(){
  const query=(dom.ratingSearch?.value||'').trim().toLowerCase();
  const visible=getRatingSchools().filter(s=>!query||s.name.toLowerCase().includes(query));
  const rated=visible.filter(s=>Number.isFinite(Number(ratingValue(s))));
  const average=rated.length?rated.reduce((a,s)=>a+Number(ratingValue(s)),0)/rated.length:null;
  const deadlineKnown=visible.filter(s=>s.tasks>0);
  const totalTasks=deadlineKnown.reduce((a,s)=>a+s.tasks,0),onTime=deadlineKnown.reduce((a,s)=>a+s.onTime,0);
  const qualityValues=visible.map(s=>v22Finite(s.quality)).filter(v=>v!==null);
  const qualityAverage=qualityValues.length?qualityValues.reduce((a,b)=>a+b,0)/qualityValues.length:null;
  dom.ratingHero.innerHTML=`<div class="rating-main-card"><span>${isSchoolRole()?'Рейтинг вашей школы':'Средний рейтинг рассчитанных школ'}</span><strong>${isSchoolRole()?v22SchoolRatingLabel(currentSchool()):v22Pct(average,1)}</strong><small>${isSchoolRole()?(currentSchool()?.place?`${currentSchool().place} место среди рассчитанных`:'Недостаточно данных'):`Рассчитано школ: ${rated.length} из ${visible.length}`}</small></div><div class="rating-metric"><span>Без просрочек</span><strong>${visible.filter(s=>s.tasks>0&&s.overdue===0).length}</strong><small>школ с поручениями</small><div class="mini-progress"><i style="width:${visible.length?visible.filter(s=>s.tasks>0&&s.overdue===0).length/visible.length*100:0}%"></i></div></div><div class="rating-metric"><span>Выполнение вовремя</span><strong>${v22Pct(totalTasks?onTime/totalTasks*100:null,0)}</strong><div class="mini-progress"><i style="width:${v22Clamp(totalTasks?onTime/totalTasks*100:null)}%"></i></div></div><div class="rating-metric"><span>Качество данных</span><strong>${v22Pct(qualityAverage,0)}</strong><div class="mini-progress"><i style="width:${v22Clamp(qualityAverage)}%"></i></div></div>`;
  dom.ratingTableBody.innerHTML=visible.length?visible.sort((a,b)=>(v22Finite(ratingValue(b))??-1)-(v22Finite(ratingValue(a))??-1)).map(s=>{const value=v22Finite(ratingValue(s));return `<tr><td><span class="position-badge ${s.place&&s.place<=3?'top':''}">${s.place||'—'}</span></td><td class="task-title-cell"><strong>${escapeHTML(s.name)}</strong><span>${escapeHTML(s.director||'Директор не указан')}</span></td><td>${s.tasks||0}</td><td>${s.onTime||0}</td><td>${s.overdue||0}</td><td>${s.returned||0}</td><td>${v22Pct(s.quality,0)}</td><td>${v22Finite(s.trend)===null?'—':`<span class="${s.trend>=0?'delta-up':'delta-down'}">${s.trend>=0?'↑':'↓'} ${Math.abs(s.trend)}</span>`}</td><td><button class="rating-score ${value===null?'unrated':value>=90?'':value>=75?'warn':'bad'}" data-school-card="${s.id}">${value===null?'Не рассчитан':v22Pct(value,1)}</button></td></tr>`;}).join(''):'<tr><td colspan="9" class="empty-state">Школы или данные рейтинга ещё не добавлены</td></tr>';
  bindDynamicOpeners?.();
}

function renderReports(){
  const tasks=getVisibleTasks(),schools=getVisibleSchools(),examRows=typeof v7VisibleExamRows==='function'?v7VisibleExamRows():[];
  const ready=[tasks.length>0,schools.some(s=>Number.isFinite(Number(s.rating))),examRows.length>0,tasks.some(t=>t.status==='overdue')].filter(Boolean).length;
  dom.reportSummary.innerHTML=[[ready,'Доступных отчётов'],[tasks.length,'Поручений в базе'],[schools.length,'Школ в базе'],[examRows.length,'Результатов экзаменов']].map(([v,l])=>`<div class="summary-card"><strong>${v}</strong><span>${l}</span></div>`).join('');
  const reports=[
    ['XLS','Рейтинг школ',v22RatedSchools().length?'Данные готовы к выгрузке':'Нет рассчитанных рейтингов','rating',v22RatedSchools().length],
    ['PDF','Исполнительская дисциплина',tasks.length?'Сводка по поручениям':'Поручения отсутствуют','discipline',tasks.length],
    ['XLS','Анализ результатов ГИА',examRows.length?`${examRows.length} строк результатов`:'Результаты не загружены','gia',examRows.length],
    ['PDF','Просроченные поручения',tasks.some(t=>t.status==='overdue')?'Список готов':'Просрочек нет','overdue',tasks.some(t=>t.status==='overdue')],
    ['XLS','Работа отделов РОО',state.tasks.length?'Показатели рассчитаны по фактам':'Нет поручений отделов','departments',state.tasks.length],
    ['PDF','Аналитическая записка руководителю',(tasks.length||examRows.length)?'Формируется из текущих данных':'Недостаточно данных','brief',tasks.length||examRows.length]
  ];
  dom.reportGrid.innerHTML=reports.map(([icon,title,subtitle,type,enabled])=>`<article class="report-card ${enabled?'':'is-disabled'}"><div class="report-icon">${icon}</div><div><strong>${title}</strong><span>${subtitle}</span></div><button data-download-report="${type}" ${enabled?'':'disabled'}>${enabled?'Скачать':'Нет данных'}</button></article>`).join('');
  document.querySelectorAll('[data-download-report]:not([disabled])').forEach(b=>b.addEventListener('click',()=>downloadReport(b.dataset.downloadReport)));
}

let v22CalendarDate=new Date(new Date().getFullYear(),new Date().getMonth(),1);
function renderCalendar(){
  const year=v22CalendarDate.getFullYear(),month=v22CalendarDate.getMonth();
  const firstDay=(new Date(year,month,1).getDay()+6)%7;const daysInMonth=new Date(year,month+1,0).getDate();
  const taskDates=new Set(getVisibleTasks().map(v22TaskDate).filter(d=>d&&d.getFullYear()===year&&d.getMonth()===month).map(d=>d.getDate()));
  const meetingDates=new Set((typeof v3State!=='undefined'?v3State.meetings:[]).map(m=>Number(m.day)).filter(Boolean));
  const cells=[];for(let i=0;i<firstDay;i++)cells.push({dim:true,n:''});for(let n=1;n<=daysInMonth;n++)cells.push({n,event:taskDates.has(n)||meetingDates.has(n),today:new Date().toDateString()===new Date(year,month,n).toDateString()});while(cells.length%7)cells.push({dim:true,n:''});
  const title=document.getElementById('calendarMonthTitle');if(title)title.textContent=v22MonthTitle(v22CalendarDate);
  dom.calendarDays.innerHTML=cells.map(d=>d.dim?'<span class="calendar-day dim"></span>':`<button class="calendar-day ${d.today?'today':''} ${d.event?'has-event':''} ${d.n===state.selectedCalendarDay?'selected':''}" data-calendar-day="${d.n}"><b>${d.n}</b></button>`).join('');
  renderAgenda(state.selectedCalendarDay||new Date().getDate());
  document.querySelectorAll('[data-calendar-day]').forEach(b=>b.addEventListener('click',()=>{state.selectedCalendarDay=Number(b.dataset.calendarDay);renderCalendar();}));
}
function renderAgenda(day){
  const date=new Date(v22CalendarDate.getFullYear(),v22CalendarDate.getMonth(),day);dom.agendaDate.textContent=date.toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
  const events=[];
  getVisibleTasks().forEach(t=>{const d=v22TaskDate(t);if(d&&d.toDateString()===date.toDateString())events.push([d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),t.title,`${v22StatusLabel(t.status)} · ${t.direction||'без направления'}`,t.status==='overdue'?'red':t.status==='review'?'orange':'blue']);});
  (typeof v3State!=='undefined'?v3State.meetings:[]).forEach(m=>{if(Number(m.day)===day)events.push([m.time||'—',m.title,m.place||'Совещание','green']);});
  dom.agendaList.innerHTML=events.length?events.map(([time,title,text,color])=>`<div class="agenda-item ${color}"><time>${escapeHTML(time)}</time><strong>${escapeHTML(title)}</strong><span>${escapeHTML(text)}</span></div>`).join(''):v22Empty('Событий нет','На выбранную дату нет поручений и совещаний.');
}

function renderArchive(){
  const done=getVisibleTasks().filter(t=>t.status==='done');
  const byYear=new Map();done.forEach(t=>{const d=v22TaskDate(t)||new Date();const y=d.getMonth()>=7?`${d.getFullYear()}–${d.getFullYear()+1}`:`${d.getFullYear()-1}–${d.getFullYear()}`;byYear.set(y,(byYear.get(y)||0)+1);});
  dom.archiveYears.innerHTML=byYear.size?[...byYear.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([year,count])=>`<article><span>${year}</span><strong>${count} завершённых поручений</strong><small>Файлы и версии доступны в карточках поручений</small><button data-archive-year="${year}">Открыть →</button></article>`).join(''):v22Empty('Архив пока пуст','Завершённые поручения появятся здесь автоматически.');
  document.querySelectorAll('[data-archive-year]').forEach(b=>b.addEventListener('click',()=>showToast(`Выбран период ${b.dataset.archiveYear}`)));
}

function renderSituationCenter(){
  const stats=document.getElementById('situationStats');if(!stats)return;
  const tasks=getVisibleTasks();const completed=tasks.filter(t=>t.status==='done').length,overdue=tasks.filter(t=>t.status==='overdue').length,review=tasks.filter(t=>t.status==='review').length;
  const closed=completed+overdue;const onTimeRate=closed?completed/closed*100:null;const rated=v22RatedSchools();
  stats.innerHTML=[kpi('Исполнено в срок',v22Pct(onTimeRate,1),closed?`${closed} закрытых или просроченных поручений`:'Нет завершённых поручений',v22Clamp(onTimeRate),'green'),kpi('Критические просрочки',String(tasks.filter(t=>t.status==='overdue'&&t.priority==='Критическое').length),'По текущим данным',Math.min(100,overdue*20),'red'),kpi('Ожидают проверки',String(review),'Ответы школ на рассмотрении',Math.min(100,review*12),'orange'),kpi('Школы без просрочек',String(SCHOOLS.filter(s=>s.tasks>0&&s.overdue===0).length),SCHOOLS.length?`Из ${SCHOOLS.length} школ`:'Школы не добавлены',SCHOOLS.length?SCHOOLS.filter(s=>s.tasks>0&&s.overdue===0).length/SCHOOLS.length*100:0,'blue')].join('');
  const risks=[];tasks.filter(t=>t.status==='overdue').slice(0,4).forEach(t=>risks.push(['!',t.title,`${t.direction||'Без направления'} · срок ${t.deadline||'истёк'}`,'Открыть',t.id]));
  const unrated=SCHOOLS.filter(s=>s.tasks>0&&!Number.isFinite(Number(s.rating))).length;if(unrated)risks.push(['○','Рейтинг не рассчитан',`${unrated} школам недостаточно данных`,'К рейтингу',null]);
  document.getElementById('situationRisks').innerHTML=risks.length?risks.map(r=>`<div class="risk-item"><div class="risk-icon">${r[0]}</div><div><strong>${escapeHTML(r[1])}</strong><span>${escapeHTML(r[2])}</span></div><button class="text-button" ${r[4]?`data-open-task="${r[4]}"`:'data-page-jump="rating"'}>${r[3]}</button></div>`).join(''):v22Empty('Рисков не обнаружено','Система покажет здесь просрочки и отклонения.');
  const deptRoot=document.getElementById('situationDepartments');if(deptRoot){const profiles=(typeof V7_DEPARTMENT_PROFILES!=='undefined'?V7_DEPARTMENT_PROFILES:[]);deptRoot.innerHTML=profiles.length?profiles.map(p=>{const rating=v22DepartmentRating(p);return `<div class="department-score"><div><strong>${escapeHTML(p.name)}</strong><div class="score-line"><i style="width:${v22Clamp(rating)}%"></i></div><span class="muted">${p.tasksGiven||0} поручений · ${p.overdue||0} просрочено</span></div><b>${v22Pct(rating,1)}</b></div>`;}).join(''):v22Empty('Отделы не загружены');}
  const trend=document.getElementById('situationTrend');if(trend)trend.innerHTML=v22Empty('История ещё не накоплена','График динамики появится после нескольких отчётных периодов.');
  const clock=document.getElementById('situationClock');if(clock)clock.textContent=new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  bindDynamicOpeners?.();
}

function indicatorData(school){
  const data=school?.metadata?.indicators||{};const exams=(typeof v7ExamRows!=='undefined'?v7ExamRows:[]).filter(r=>r.schoolId===school?.id||r.school===school?.name);const scores=exams.map(r=>Number(r.score)).filter(Number.isFinite);
  return {students:v22Finite(data.students),classes:v22Finite(data.classes),teachers:v22Finite(data.teachers),vacancies:v22Finite(data.vacancies),gia:scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:v22Finite(data.gia),vpr:v22Finite(data.vpr),attendance:v22Finite(data.attendance),food:v22Finite(data.food),transport:data.transport||'',safety:data.safety||''};
}
function renderIndicators(){
  const select=document.getElementById('indicatorSchoolSelect');if(!select)return;const schools=getVisibleSchools();
  if(!schools.length){select.innerHTML='<option>Школы не добавлены</option>';document.getElementById('indicatorSummary').innerHTML=v22Empty('Нет школ для анализа');document.getElementById('indicatorTrend').innerHTML='';document.getElementById('indicatorAnomalies').innerHTML=v22Empty('Нет данных для проверки');document.getElementById('indicatorTable').innerHTML='';return;}
  if(!schools.some(s=>s.id===v3State.indicatorSchool))v3State.indicatorSchool=schools[0].id;select.innerHTML=schools.map(s=>`<option value="${s.id}" ${s.id===v3State.indicatorSchool?'selected':''}>${escapeHTML(s.name)}</option>`).join('');const school=schools.find(s=>s.id===v3State.indicatorSchool)||schools[0],d=indicatorData(school);
  const cards=[['Обучающиеся',d.students,'Заполняется в карточке школы'],['Педагоги',d.teachers,d.vacancies===null?'Вакансии не указаны':`Вакансий: ${d.vacancies}`],['Средний балл экзаменов',d.gia===null?null:v22Score(d.gia,1),d.gia===null?'Загрузите результаты экзаменов':'По загруженным результатам'],['Посещаемость',d.attendance===null?null:v22Pct(d.attendance,1),'По последнему отчётному периоду']];
  document.getElementById('indicatorSummary').innerHTML=cards.map(([name,value,note])=>`<article class="metric-card"><span>${name}</span><strong>${value===null?'—':value}</strong><small>${note}</small></article>`).join('');
  const known=[['Обучающиеся',d.students],['Средний балл экзаменов',d.gia],['Посещаемость',d.attendance],['Кадровая обеспеченность',d.teachers!==null&&d.vacancies!==null?Math.max(0,100-d.vacancies/Math.max(1,d.teachers+d.vacancies)*100):null]].filter(([,v])=>v!==null);
  document.getElementById('indicatorTrend').innerHTML=known.length?known.map(([name,value])=>`<div class="metric-row"><span>${name}</span><div class="metric-bar"><i style="width:${v22Clamp(value)}%"></i></div><b>${name==='Посещаемость'||name==='Кадровая обеспеченность'?v22Pct(value,1):v22Score(value,1)}</b></div>`).join(''):v22Empty('Показатели не заполнены','Добавьте данные школы или загрузите результаты экзаменов.');
  document.getElementById('indicatorAnomalies').innerHTML=v22Empty('Автоматических предупреждений нет','Отклонения появятся после сравнения нескольких периодов.');
  const rows=[['Контингент',[['Обучающиеся',d.students],['Классы',d.classes]]],['Кадры',[['Педагоги',d.teachers],['Вакансии',d.vacancies]]],['Качество образования',[['Средний балл экзаменов',d.gia],['ВПР',d.vpr]]],['Условия',[['Горячее питание',d.food],['Транспорт',d.transport||null],['Безопасность',d.safety||null]]],['Исполнительская дисциплина',[['Рейтинг',Number.isFinite(Number(school.rating))?v22Pct(school.rating,1):null],['Место',school.place],['Просрочено',school.overdue],['Возвраты',school.returned]]]];
  document.getElementById('indicatorTable').innerHTML=rows.map(([group,items])=>`<div class="indicator-group"><h4>${group}</h4>${items.map(([name,value])=>`<div class="indicator-line"><span>${name}</span><b>${value===null||value===''?'Не указано':escapeHTML(value)}</b></div>`).join('')}</div>`).join('');
}

function renderAutomations(){
  const list=document.getElementById('automationList');if(!list)return;const items=v3State.automations||[],active=items.filter(a=>a.active).length,runs=items.reduce((a,b)=>a+Number(b.runs||0),0);
  document.getElementById('automationSummary').innerHTML=[kpi('Активные правила',String(active),`Всего создано: ${items.length}`,items.length?active/items.length*100:0,'green'),kpi('Срабатываний',String(runs),'За всё время',Math.min(100,runs),'blue'),kpi('Ошибок выполнения','0','Ошибки будут показаны в журнале',0,'orange'),kpi('Отключённых правил',String(items.length-active),'Можно включить в любой момент',items.length?(items.length-active)/items.length*100:0,'purple')].join('');
  list.innerHTML=items.length?items.map(a=>`<article class="automation-card"><div class="automation-card-head"><div><h3>${escapeHTML(a.name)}</h3><p>${a.active?'Правило работает':'Правило отключено'}</p></div><label class="switch"><input type="checkbox" data-v3-change="automation" data-id="${a.id}" ${a.active?'checked':''}/><span></span></label></div><div class="automation-flow"><div class="automation-node"><b>ЕСЛИ</b><br>${escapeHTML(a.trigger)}</div><span>→</span><div class="automation-node"><b>ТО</b><br>${escapeHTML(a.action)}</div></div><div class="automation-meta"><span>Срабатываний: ${Number(a.runs||0)}</span><span>Последнее: ${escapeHTML(a.last||'ещё не запускалось')}</span></div><button class="secondary-button" data-v3-action="run-automation" data-id="${a.id}">Запустить проверку</button></article>`).join(''):v22Empty('Правила не созданы','Создайте первое правило в конструкторе ниже.');
}

function renderMeetings(){
  const list=document.getElementById('meetingList');if(!list)return;const meetings=v3State.meetings||[];
  list.innerHTML=meetings.length?meetings.map(m=>`<article class="meeting-card"><div class="meeting-date"><b>${escapeHTML(m.day||'—')}</b><span>${escapeHTML(m.month||'')}<br>${escapeHTML(m.time||'—')}</span></div><div><span class="tag ${m.status==='today'?'green':'blue'}">${m.status==='today'?'Сегодня':'Запланировано'}</span><h3>${escapeHTML(m.title)}</h3><p>${escapeHTML(m.place||'Место не указано')} · подтвердили ${Number(m.confirmed||0)} из ${Number(m.total||0)}</p></div><div class="meeting-actions"><button class="secondary-button small" data-v3-action="meeting-open" data-id="${m.id}">Открыть</button></div></article>`).join(''):v22Empty('Совещания не запланированы','Создайте совещание, чтобы добавить повестку и участников.');
  document.getElementById('protocolItems').innerHTML=v22Empty('Протокол не выбран','Откройте совещание и добавьте пункты протокола.');
  const btn=document.getElementById('convertProtocolButton');if(btn){btn.textContent='Сначала выберите протокол';btn.disabled=true;}
}

function renderAppeals(){
  const target=document.getElementById('appealBoard');if(!target)return;let items=v3State.appeals||[];if(isSchoolRole())items=items.filter(a=>a.schoolId===state.currentUser.schoolId);const newC=items.filter(a=>a.status==='new').length,work=items.filter(a=>a.status==='work').length,done=items.filter(a=>a.status==='done').length,total=items.length;
  document.getElementById('appealSummary').innerHTML=[kpi('Новые',String(newC),'Ожидают назначения',total?newC/total*100:0,'orange'),kpi('В работе',String(work),'Ожидают ответа',total?work/total*100:0,'blue'),kpi('Решено',String(done),'За всё время',total?done/total*100:0,'green'),kpi('Всего обращений',String(total),'В доступном контуре',100,'purple')].join('');
  const columns=[['new','Новые'],['work','В работе'],['done','Решено']];target.innerHTML=columns.map(([status,title])=>`<div class="appeal-column"><div class="appeal-column-head"><h3>${title}</h3><span class="tag ${status==='new'?'orange':status==='work'?'blue':'green'}">${items.filter(a=>a.status===status).length}</span></div>${items.filter(a=>a.status===status).map(a=>`<article class="appeal-card"><div><span class="appeal-number">${escapeHTML(a.id)}</span> <span class="tag ${a.priority==='Срочно'?'red':a.priority==='Важно'?'orange':'gray'}">${escapeHTML(a.priority||'Обычное')}</span></div><h4>${escapeHTML(a.title)}</h4><p>${escapeHTML(a.school||'')} · ${escapeHTML(a.text||'')}</p><div class="appeal-card-footer"><span class="appeal-time">${escapeHTML(a.time||'')}</span>${status!=='done'&&!isSchoolRole()?`<button class="text-button" data-v3-action="appeal-next" data-id="${a.id}">${status==='new'?'Принять':'Закрыть'} →</button>`:''}</div></article>`).join('')||'<p class="muted">Нет обращений</p>'}</div>`).join('');
  const badge=document.querySelector('[data-page="appeals"] .nav-badge');if(badge){badge.textContent=newC+work;badge.classList.toggle('hidden',newC+work===0);}
}

const v22OriginalRenderDocuments=renderDocuments;
renderDocuments=function(){v22OriginalRenderDocuments();document.querySelectorAll('.document-card .read-progress').forEach(el=>{if(/NaN/.test(el.textContent))el.innerHTML='<span>Статистика ознакомления появится после публикации документа.</span>';});};

const v22OriginalRenderAudit=renderAudit;
renderAudit=function(){
  if(state.role==='department_head'){
    const original=state.audit;const dept=currentDepartment();state.audit=original.filter(a=>String(a.object||'').toLowerCase().includes(String(dept?.name||'').toLowerCase())||a.user===state.currentUser?.name);v22OriginalRenderAudit();state.audit=original;return;
  }
  v22OriginalRenderAudit();
};

/* Рейтинг отделов — только по фактам, без 100% при нулевых данных. */
function v7RenderDepartments(){
  const page=document.getElementById('page-department_control');if(!page||!ROLE_CONFIG[state.role]?.pages.includes('department_control'))return;const profiles=v7VisibleDepartments().map(v7Profile);
  const rated=profiles.map(v22DepartmentRating).filter(v=>v!==null);const totals={tasks:profiles.reduce((a,p)=>a+Number(p.tasksGiven||0),0),completed:profiles.reduce((a,p)=>a+Number(p.completed||0),0),waiting:profiles.reduce((a,p)=>a+Number(p.waitingReview||0),0),overdue:profiles.reduce((a,p)=>a+Number(p.overdue||0),0),avg:rated.length?rated.reduce((a,b)=>a+b,0)/rated.length:null};
  const summary=document.getElementById('departmentSummary');if(summary)summary.innerHTML=[['▤',totals.tasks,'Поручений создано'],['✓',totals.completed,'Завершено'],['◷',totals.waiting,'Ждут проверки'],['!',totals.overdue,'Просрочено'],['★',v22Pct(totals.avg,1),'Средний рейтинг']].map(v=>`<article class="v7-summary-card"><i>${v[0]}</i><div><strong>${v[1]}</strong><span>${v[2]}</span></div></article>`).join('');
  const cards=document.getElementById('departmentCards');if(cards)cards.innerHTML=profiles.length?profiles.map(p=>{const rating=v22DepartmentRating(p);return `<article class="v7-department-card ${v7SelectedDepartment===p.id?'active':''}" data-v7-dept="${p.id}"><div class="v7-dept-card-head"><div class="v7-dept-avatar">${p.code}</div><div><h3>${v7Esc(p.name)}</h3><a href="mailto:${v7Esc(p.email)}">${v7Esc(p.email)}</a></div></div><div class="v7-dept-person"><span>${v7Esc(p.head)}</span><strong class="v7-online ${p.online?'':'offline'}">${p.online?'В системе':p.lastLogin==='Не входил'?'Не входил':`Последний вход: ${v7Esc(p.lastLogin)}`}</strong></div><div class="v7-dept-mini-stats"><div><strong>${p.tasksGiven||0}</strong><span>создано</span></div><div><strong>${p.completed||0}</strong><span>завершено</span></div><div><strong>${p.waitingReview||0}</strong><span>на проверке</span></div><div><strong>${p.overdue||0}</strong><span>просрочено</span></div></div><div class="v7-dept-card-foot"><div class="v7-dept-score"><b>${v22Pct(rating,1)}</b><span>${rating===null?'недостаточно данных':'рейтинг отдела'}</span></div><button data-v7-dept-open="${p.id}">Подробнее →</button></div></article>`;}).join(''):v22Empty('Подразделения не загружены');
  const ratingRoot=document.getElementById('departmentRatingList');if(ratingRoot){const sorted=profiles.filter(p=>v22DepartmentRating(p)!==null).sort((a,b)=>v22DepartmentRating(b)-v22DepartmentRating(a));ratingRoot.innerHTML=sorted.length?sorted.map((p,i)=>`<div class="v7-dept-rating-row"><div class="v7-dept-rating-top"><b>${i+1}</b><strong>${v7Esc(p.name)}</strong><b>${v22Pct(v22DepartmentRating(p),1)}</b></div><div class="v7-rating-track"><i style="width:${v22Clamp(v22DepartmentRating(p))}%"></i></div></div>`).join(''):v22Empty('Рейтинг ещё не рассчитан','Создайте и завершите хотя бы одно поручение отдела.');}
  document.querySelectorAll('[data-v7-dept],[data-v7-dept-open]').forEach(el=>el.onclick=e=>{e.stopPropagation();v7SelectedDepartment=el.dataset.v7Dept||el.dataset.v7DeptOpen;localSet(V7_KEYS.selectedDept,v7SelectedDepartment);v7RenderDepartments();});
  if(v7SelectedDepartment&&!profiles.some(p=>p.id===v7SelectedDepartment))v7SelectedDepartment=profiles[0]?.id||'';if(!v7SelectedDepartment&&profiles.length)v7SelectedDepartment=profiles[0].id;v7RenderDepartmentDetail(profiles.find(p=>p.id===v7SelectedDepartment));
}
function v7RenderDepartmentDetail(profile){
  const el=document.getElementById('departmentDetail');if(!el)return;if(!profile){el.innerHTML=v22Empty('Выберите отдел');return;}const tasks=v7DeptTasks(profile),activities=v7DeptActivities(profile),rating=v22DepartmentRating(profile),canEdit=state.role==='chief';
  el.innerHTML=`<div class="v7-detail-head"><div class="v7-dept-avatar">${profile.code}</div><div><span class="eyebrow">Карточка подразделения</span><h2>${v7Esc(profile.name)}</h2><p>${v7Esc(profile.head)} · ${v7Esc(profile.email)} · Последний вход: ${v7Esc(profile.lastLogin)}</p></div><div class="v7-detail-actions"><a class="secondary-button" href="mailto:${v7Esc(profile.email)}">Написать</a><button class="secondary-button" id="v7ShowDeptTasks">Открыть поручения</button>${canEdit?'<button class="primary-button" id="v7EditDepartment">Изменить карточку</button>':''}</div></div><div class="v7-detail-kpis"><div><strong>${profile.tasksGiven||0}</strong><span>поручений дал</span></div><div><strong>${profile.responses||0}</strong><span>ответов получил</span></div><div><strong>${profile.completed||0}</strong><span>завершил</span></div><div><strong>${profile.waitingReview||0}</strong><span>ждут проверки</span></div><div><strong>${!v22DeptHasData(profile)||profile.avgReview===null||profile.avgReview===undefined?'—':v22Score(profile.avgReview,1)+' ч'}</strong><span>среднее время проверки</span></div><div><strong>${v22Pct(rating,1)}</strong><span>${rating===null?'ещё не рассчитан':'рейтинг'}</span></div></div><div class="v7-detail-grid"><div class="v7-subpanel"><h3>Поручения отдела</h3>${tasks.length?tasks.map(t=>`<div class="v7-dept-task"><div><strong>${v7Esc(t.title)}</strong><span>Срок: ${v7Esc(t.deadline||'не указан')}</span></div><span class="tag ${statusClass(t.status)}">${v22StatusLabel(t.status)}</span></div>`).join(''):v22Empty('Поручений нет','Созданные этим отделом поручения появятся здесь.')}</div><div class="v7-subpanel"><h3>Последняя активность</h3>${activities.length?activities.map(a=>`<div class="v7-activity-item"><time>${v7Esc(a[0])}</time><div>${v7Esc(a[1])}</div></div>`).join(''):v22Empty('Активность не зафиксирована','Входы, создание поручений и проверки появятся после действий сотрудника.')}</div></div>`;
  document.getElementById('v7ShowDeptTasks')?.addEventListener('click',()=>{navigate('tasks');showToast(`Открыты поручения: ${profile.name}`);});document.getElementById('v7EditDepartment')?.addEventListener('click',()=>v7OpenDepartmentEditor(profile));
}
function v7ExportDepartmentRating(){const profiles=V7_DEPARTMENT_PROFILES.map(v7Profile).filter(p=>v22DepartmentRating(p)!==null).sort((a,b)=>v22DepartmentRating(b)-v22DepartmentRating(a));if(!profiles.length)return showToast('Рейтинг ещё не рассчитан');downloadCSV('reiting_otdelov_roo.csv',[['Место','Отдел','Рабочая почта','Начальник','Создано поручений','Завершено','Ждут проверки','Просрочено','Среднее время проверки, ч','Рейтинг'],...profiles.map((p,i)=>[i+1,p.name,p.email,p.head,p.tasksGiven,p.completed,p.waitingReview,p.overdue,p.avgReview??'',v22DepartmentRating(p)])]);showToast('Рейтинг отделов скачан');}

const v22OriginalRenderAll=renderAll;
renderAll=function(){v22OriginalRenderAll();v22UpdateStaticUI();};
const v22OriginalApplyRole=applyRole;
applyRole=function(role){v22OriginalApplyRole(role);v22UpdateStaticUI();};

function v22Bind(){
  v22UpdateStaticUI();
  const isoAfter=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
  const taskDate=document.getElementById('newTaskDate');if(taskDate&&!taskDate.value)taskDate.value=isoAfter(3);
  const delegationFrom=document.getElementById('delegationFrom');if(delegationFrom&&!delegationFrom.value)delegationFrom.value=isoAfter(0);
  const delegationTo=document.getElementById('delegationTo');if(delegationTo&&!delegationTo.value)delegationTo.value=isoAfter(14);
  document.getElementById('calendarPrev')?.addEventListener('click',()=>{v22CalendarDate=new Date(v22CalendarDate.getFullYear(),v22CalendarDate.getMonth()-1,1);state.selectedCalendarDay=1;renderCalendar();});
  document.getElementById('calendarNext')?.addEventListener('click',()=>{v22CalendarDate=new Date(v22CalendarDate.getFullYear(),v22CalendarDate.getMonth()+1,1);state.selectedCalendarDay=1;renderCalendar();});
  const version=document.getElementById('versionButton');if(version)version.title='ONLINE V23 — рабочие роли и полный аудит интерфейса';
  setTimeout(()=>{try{renderAll();}catch(e){console.warn('V22 initial render',e);}},0);
}
document.addEventListener('DOMContentLoaded',v22Bind);
