'use strict';

/* V5 упрощает навигацию и перестраивает главную страницу, сохраняя логику V4. */
const V5_STATUS_LABELS={active:'В работе',review:'На проверке',overdue:'Просрочено',done:'Принято',pending_approval:'У директора',draft:'Черновик'};
const V5_ROLE_TEXT={
  chief:'Здесь вы можете контролировать исполнение поручений, анализировать показатели и управлять образовательной деятельностью района.',
  deputy:'Здесь собраны курируемые направления, документы на согласовании и школы, которым требуется внимание.',
  department_head:'Здесь находятся поручения вашего отдела, ответы школ на проверке и ближайшие сроки.',
  specialist:'Здесь вы можете выполнять свои задачи, проверять ответы школ и готовить сводные отчёты.',
  school_director:'Здесь находятся все поручения вашей школы, отчёты сотрудников и подтверждение отправки в РОО.',
  school_staff:'Здесь находятся назначенные вам поручения. Откройте задание, заполните форму и отправьте директору.',
  observer:'Здесь доступна ключевая аналитика района в режиме просмотра.'
};

function v5Esc(value){ return typeof escapeHTML==='function'?escapeHTML(String(value??'')):String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function v5VisibleTasks(){ try{return getVisibleTasks();}catch(_){return state?.tasks||[];} }
function v5Status(task){ return V5_STATUS_LABELS[task.status]||task.statusText||'Новое'; }
function v5StatusClass(task){ return ['active','review','overdue','done','pending_approval'].includes(task.status)?task.status:'active'; }
function v5TaskOwner(task){ return task.creator||task.direction||'Ответственный'; }
function v5DateParts(task,index){
  const map=[['25','ИЮЛ'],['27','ИЮЛ'],['29','ИЮЛ'],['31','ИЮЛ']];
  const raw=task.deadlineDate||'';const d=raw?new Date(raw):null;
  if(d&&!Number.isNaN(d.getTime())) return [String(d.getDate()).padStart(2,'0'),d.toLocaleString('ru-RU',{month:'short'}).replace('.','').toUpperCase()];
  return map[index%map.length];
}
function v5IsSchool(){ try{return isSchoolRole();}catch(_){return ['school_director','school_staff'].includes(state?.role);} }
function v5CurrentSchool(){ try{return currentSchool();}catch(_){return null;} }

function renderV5Dashboard(){
  const tasks=v5VisibleTasks();
  const active=tasks.filter(t=>t.status==='active').length;
  const review=tasks.filter(t=>t.status==='review').length;
  const overdue=tasks.filter(t=>t.status==='overdue').length;
  const done=tasks.filter(t=>t.status==='done').length;
  const school=v5CurrentSchool();
  const welcome=document.getElementById('welcomeTitle');
  const text=document.getElementById('welcomeText');
  if(welcome) welcome.textContent=(roleConfig?.().label||'Пользователь')+'!';
  if(text) text.textContent=V5_ROLE_TEXT[state.role]||V5_ROLE_TEXT.chief;
  const today=document.getElementById('todayLabel');if(today)today.textContent=new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  const kpis=v5IsSchool()?[
    ['▤','Назначено поручений',tasks.length,'За текущий период','green'],
    ['◷','Требуют действия',tasks.filter(t=>['active','review','overdue'].includes(t.status)).length,'Откройте список поручений','orange'],
    ['!','Просрочено',overdue,'Нужно выполнить в первую очередь','red'],
    ['✓','Принято',done,'Отчёты приняты РОО','green'],
    ['★','Рейтинг школы',school&&Number.isFinite(Number(school.rating))?Number(school.rating).toFixed(1)+'%':'—',school&&Number.isFinite(Number(school.rating))&&school.place?`${school.place} место в районе`:'Рейтинг не рассчитан','blue']
  ]:[
    ['▤','Активные поручения',active,'Открыть полный список','green'],
    ['◷','На рассмотрении',review,'Ожидают проверки','orange'],
    ['!','Просрочено',overdue,'Требуют контроля','red'],
    ['✓','Выполнено',done,'Принято и закрыто','green'],
    ['★','Школ с рейтингом',SCHOOLS.filter(s=>Number.isFinite(Number(s.rating))).length,'После выполнения поручений','blue']
  ];
  const kpiRoot=document.getElementById('v5Kpis');
  if(kpiRoot)kpiRoot.innerHTML=kpis.map(([icon,label,value,note,tone])=>`<article class="v5-kpi-card ${tone}"><div class="v5-kpi-icon">${icon}</div><div><span>${v5Esc(label)}</span><strong>${v5Esc(value)}</strong><small>${v5Esc(note)} →</small></div></article>`).join('');

  const attention=[];
  if(overdue)attention.push(['!','Просроченные поручения',`${overdue} заданий требуют немедленного контроля`,'red','tasks']);
  if(review)attention.push(['◷','Отчёты на рассмотрении',`${review} ответов ожидают вашего решения`,'orange','approvals']);
  const pending=tasks.filter(t=>t.status==='pending_approval').length;
  if(pending)attention.push(['▤','Документы у директора',`${pending} поручений находятся на согласовании`,'orange','approvals']);
  const appeals=(typeof v3State!=='undefined'?v3State.appeals.filter(a=>a.status!=='done').length:0);
  if(appeals)attention.push(['✉','Новые обращения',`${appeals} обращений требуют ответа`,'blue','appeals']);
  const attentionRoot=document.getElementById('v5Attention');
  if(attentionRoot)attentionRoot.innerHTML=attention.slice(0,4).map(([icon,title,sub,tone,page])=>`<div class="v5-attention-item ${tone}" data-v5-page="${page}"><div class="v5-attention-icon">${icon}</div><div><strong>${v5Esc(title)}</strong><span>${v5Esc(sub)}</span></div><b>›</b></div>`).join('');

  const recentRoot=document.getElementById('v5RecentTasks');
  if(recentRoot)recentRoot.innerHTML=tasks.slice(0,5).map(task=>`<tr data-open-task="${task.id}"><td>${v5Esc(task.title)}</td><td><span class="v5-status ${v5StatusClass(task)}">${v5Esc(v5Status(task))}</span></td><td>${v5Esc(task.deadline||'—')}</td><td>${v5Esc(v5TaskOwner(task))}</td></tr>`).join('')||'<tr><td colspan="4">Нет доступных поручений</td></tr>';

  const rankingRoot=document.getElementById('v5Ranking');
  if(rankingRoot){
    if(v5IsSchool()&&school){
      const metrics=[['Сроки',Math.round((school.onTime/Math.max(1,school.tasks))*100)],['Качество',school.quality],['Полнота',school.completeness],['Реакция',school.response]];
      rankingRoot.innerHTML=metrics.map((m,i)=>`<div class="v5-ranking-item"><div class="v5-rank ${i===0?'gold':''}">${i+1}</div><div><div class="v5-ranking-name">${m[0]}</div><div class="v5-rating-bar"><i style="width:${m[1]}%"></i></div></div><div class="v5-ranking-score">${m[1]}%</div></div>`).join('');
    }else{
      const rated=SCHOOLS.filter(s=>Number.isFinite(Number(s.rating))).slice(0,5);rankingRoot.innerHTML=rated.length?rated.map((s,i)=>`<div class="v5-ranking-item" data-school-card="${s.id}"><div class="v5-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</div><div><div class="v5-ranking-name">${v5Esc(s.name)}</div><div class="v5-rating-bar"><i style="width:${Math.min(100,Number(s.rating))}%"></i></div></div><div class="v5-ranking-score">${String(s.rating).replace('.',',')}%</div></div>`).join(''):'<div class="empty-state">Рейтинг пока не рассчитан</div>';
    }
  }

  const deadlineRoot=document.getElementById('v5Deadlines');
  const important=tasks.filter(t=>['overdue','review','active','pending_approval'].includes(t.status)).slice(0,3);
  if(deadlineRoot)deadlineRoot.innerHTML=important.map((task,i)=>{const [day,month]=v5DateParts(task,i);const flag=task.status==='overdue'?'<span class="tag red">Просрочено</span>':i===0?'<span class="tag green">Сегодня</span>':`<span class="tag orange">Через ${i+1} дня</span>`;return `<div class="v5-deadline-row" data-open-task="${task.id}"><div class="v5-date-box"><strong>${day}</strong><span>${month}</span></div><div><strong>${v5Esc(task.title)}</strong><span>${v5Esc(task.direction||v5TaskOwner(task))}</span></div>${flag}</div>`;}).join('')||'<div class="empty-state">Ближайших сроков нет</div>';

  document.querySelectorAll('[data-v5-page]').forEach(el=>el.onclick=()=>navigate(el.dataset.v5Page));
  if(typeof bindDynamicOpeners==='function')bindDynamicOpeners();
}

function updateV5Header(){
  const eyebrow=document.getElementById('pageEyebrow');const title=document.getElementById('pageTitle');
  if(eyebrow)eyebrow.textContent='Отдел Образования';
  if(title)title.textContent='Ачхой-Мартановского Района';
  const version=document.getElementById('versionButton');if(version)version.textContent='V22';
}

const _v5RenderAll=renderAll;
renderAll=function(){_v5RenderAll();renderV5Dashboard();updateV5Header();};
const _v5ApplyRole=applyRole;
applyRole=function(role){_v5ApplyRole(role);renderV5Dashboard();updateV5Header();};
const _v5Navigate=navigate;
navigate=function(page,scroll=true){const result=_v5Navigate(page,scroll);updateV5Header();return result;};

function bindV5(){
  document.body.classList.add('v5-theme','light-theme');
  updateV5Header();renderV5Dashboard();
  const banner=document.getElementById('systemUpdateBanner');if(banner){banner.querySelector('strong').textContent='Система обновлена до V5';banner.querySelector('small').textContent='Новая понятная структура, светло-зелёная тема и удобная главная страница. Все функции V4 сохранены.';}
}
document.addEventListener('DOMContentLoaded',bindV5);
