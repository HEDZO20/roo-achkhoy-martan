'use strict';

/*
  Дополнительные модули интерфейса. Настройки локальных модулей сохраняются в браузере.
  В рабочей онлайн-версии те же сущности будут храниться в Supabase/PostgreSQL.
*/

const V3_KEY = 'achkhoyEduOnlineV10';
const V3_DEFAULTS = {
  constructorTab: 'forms',
  selectedTemplate: 'gia',
  selectedWorkflow: 'standard',
  indicatorSchool: 's1',
  ratingWeights: { deadlines: 40, quality: 30, completeness: 20, reaction: 10 },
  modules: { indicators:true, automations:true, inspections:true, meetings:true, appeals:true, documents:true, personal:true },
  templates: [
    { id:'gia', name:'Анализ результатов ГИА', category:'ГИА', fields:[
      {type:'number',name:'Количество выпускников',required:true},{type:'number',name:'Допущено к ГИА',required:true},{type:'number',name:'Не допущено',required:true},{type:'number',name:'Неудовлетворительные результаты',required:true},{type:'percent',name:'Средний балл',required:true},{type:'file',name:'Подтверждающий Excel',required:true}
    ]},
    { id:'attendance', name:'Ежемесячная посещаемость', category:'Общее образование', fields:[
      {type:'number',name:'Всего обучающихся',required:true},{type:'number',name:'Пропущено дней',required:true},{type:'number',name:'По болезни',required:true},{type:'text',name:'Причины отклонений',required:false}
    ]},
    { id:'staff', name:'Кадровая потребность', category:'Кадры', fields:[
      {type:'number',name:'Количество педагогов',required:true},{type:'number',name:'Вакансии',required:true},{type:'repeat',name:'Перечень вакансий',required:false},{type:'file',name:'Штатное расписание',required:true}
    ]},
    { id:'safety', name:'Готовность к учебному году', category:'Безопасность', fields:[
      {type:'yesno',name:'Пожарная безопасность',required:true},{type:'yesno',name:'Антитеррористическая защищённость',required:true},{type:'photo',name:'Фото территории',required:true},{type:'signature',name:'Подтверждение директора',required:true}
    ]},
    { id:'custom', name:'Новая универсальная форма', category:'Без категории', fields:[
      {type:'text',name:'Наименование показателя',required:true},{type:'number',name:'Значение',required:true},{type:'comment',name:'Комментарий',required:false}
    ]}
  ],
  workflows: [
    {id:'simple',name:'Простой отчёт',description:'Для обычных оперативных сведений',steps:['Ответственный школы','Директор школы','Специалист РОО']},
    {id:'standard',name:'Стандартное согласование',description:'Основной маршрут районной отчётности',steps:['Ответственный школы','Директор школы','Специалист РОО','Начальник отдела']},
    {id:'important',name:'Важное поручение',description:'Согласование руководством РОО',steps:['Исполнитель','Директор школы','Специалист','Начальник отдела','Заместитель начальника']},
    {id:'critical',name:'Критическое поручение',description:'Финальное утверждение начальником РОО',steps:['Исполнитель','Директор','Начальник отдела','Заместитель','Начальник РОО']}
  ],
  automations: [],
  inspections: [],
  meetings: [],
  appeals: [],
  documents: [],
  personalTasks: [],
  customIndicators: [],
  documentRead: [],
  permissionOverrides: {},
  dashboardWidgets: {deadlines:true,ratings:true,departments:true,activity:true,risks:true,calendar:false},
  resolvedAppeals: [],
  minutesConverted: false,
  delegation: null,
  updateDismissed: false
};

function v3Clone(value){ return JSON.parse(JSON.stringify(value)); }
function loadV3(){
  try {
    const raw=localGet(V3_KEY);
    if(!raw) return v3Clone(V3_DEFAULTS);
    const saved=JSON.parse(raw);
    return {...v3Clone(V3_DEFAULTS),...saved,modules:{...V3_DEFAULTS.modules,...(saved.modules||{})},ratingWeights:{...V3_DEFAULTS.ratingWeights,...(saved.ratingWeights||{})},dashboardWidgets:{...V3_DEFAULTS.dashboardWidgets,...(saved.dashboardWidgets||{})}};
  } catch(_){ return v3Clone(V3_DEFAULTS); }
}
const v3State=loadV3();
function saveV3(){ localSet(V3_KEY,JSON.stringify(v3State)); }


const V3_PAGES={
  chief:['dashboard','situation','tasks','approvals','schools','indicators','rating','departments','reports','automations','constructor','inspections','meetings','appeals','documents','personal','calendar','archive','users','audit'],
  deputy:['dashboard','situation','tasks','approvals','schools','indicators','rating','departments','reports','automations','constructor','inspections','meetings','appeals','documents','personal','calendar','archive','users','audit'],
  department_head:['dashboard','situation','tasks','approvals','schools','indicators','rating','departments','reports','automations','constructor','inspections','meetings','appeals','documents','personal','calendar','archive','audit'],
  specialist:['dashboard','tasks','schools','indicators','rating','reports','automations','constructor','inspections','meetings','appeals','documents','personal','calendar','archive'],
  school_director:['dashboard','tasks','rating','indicators','inspections','meetings','appeals','documents','personal','calendar','archive'],
  school_staff:['dashboard','tasks','inspections','meetings','appeals','documents','personal','calendar','archive']
};
Object.entries(V3_PAGES).forEach(([role,pages])=>{ if(ROLE_CONFIG[role]) ROLE_CONFIG[role].pages=pages; });

Object.assign(PAGE_META,{
  situation:['Режим руководителя','Ситуационный центр'],indicators:['Цифровой паспорт','Реестр показателей'],automations:['Автоматические правила','Автоматизация'],constructor:['Настройка системы','Конструктор без программирования'],inspections:['Контроль организаций','Проверки школ'],meetings:['Совещания и протоколы','Совещания'],appeals:['Единое окно','Обращения школ'],documents:['Нормативная база','Документы и материалы'],personal:['Рабочее пространство','Мои задачи']
});

const MODULE_PAGE_MAP={indicators:['indicators'],automations:['automations'],inspections:['inspections'],meetings:['meetings'],appeals:['appeals'],documents:['documents'],personal:['personal']};
function moduleForPage(page){ return Object.entries(MODULE_PAGE_MAP).find(([,pages])=>pages.includes(page))?.[0]||null; }
function isV3PageEnabled(page){ const key=moduleForPage(page);return !key||v3State.modules[key]!==false; }

const _navigateV2=navigate;
navigate=function(page,scroll=true){
  if(!isV3PageEnabled(page)){ showToast('Этот модуль отключён в конструкторе системы');return; }
  return _navigateV2(page,scroll);
};
const _applyRoleV2=applyRole;
applyRole=function(role){ _applyRoleV2(role);applyV3NavigationVisibility();renderV3(); };
const _renderAllV2=renderAll;
renderAll=function(){ _renderAllV2();renderV3(); };
const _bindStaticV2=bindStaticEvents;
bindStaticEvents=function(){ _bindStaticV2();bindV3Events(); };
const _resetDemoV2=resetDemo;
resetDemo=function(){ localRemove(V3_KEY);Object.assign(v3State,v3Clone(V3_DEFAULTS));_resetDemoV2();saveV3();renderV3(); };

function applyV3NavigationVisibility(){
  document.querySelectorAll('.nav-item').forEach(button=>{
    const page=button.dataset.page;
    const permitted=roleConfig().pages.includes(page);
    const enabled=isV3PageEnabled(page);
    button.classList.toggle('hidden',!permitted||!enabled);
  });
  document.querySelectorAll('.nav-section-label').forEach(label=>{
    let next=label.nextElementSibling,visible=false;
    while(next&&!next.classList.contains('nav-section-label')){if(next.classList.contains('nav-item')&&!next.classList.contains('hidden')) visible=true;next=next.nextElementSibling;}
    label.classList.toggle('hidden',!visible);
  });
}

function renderV3(){
  applyV3NavigationVisibility();
  renderSituationCenter();renderIndicators();renderAutomations();renderConstructor();renderInspections();renderMeetings();renderAppeals();renderDocuments();renderPersonal();renderV3UpdateBanner();
}

function kpi(title,value,detail,progress=70,tone='blue'){
  return `<article class="mini-kpi"><div class="kpi-top"><span>${escapeHTML(title)}</span><b class="tag ${tone}">${tone==='red'?'Риск':'LIVE'}</b></div><strong>${escapeHTML(value)}</strong><small>${escapeHTML(detail)}</small><div class="spark"><i style="width:${Math.max(0,Math.min(100,Number(progress)||0))}%"></i></div></article>`;
}

function renderSituationCenter(){
  const stats=document.getElementById('situationStats');if(!stats)return;
  const tasks=typeof getVisibleTasks==='function'?getVisibleTasks():[];
  const completed=tasks.filter(t=>['done','accepted'].includes(t.status)).length;
  const overdue=tasks.filter(t=>t.status==='overdue').length;
  const review=tasks.filter(t=>['review','roo_review','pending_approval'].includes(t.status)).length;
  const closed=completed+overdue;
  const onTime=closed?Math.round(completed/closed*100):null;
  stats.innerHTML=[
    kpi('Исполнено вовремя',onTime===null?'—':onTime+'%',closed?'По закрытым поручениям':'Недостаточно данных',onTime||0,'green'),
    kpi('Просрочено',String(overdue),overdue?'Требуют контроля':'Просрочек нет',Math.min(100,overdue*10),'red'),
    kpi('Ожидают проверки',String(review),review?'Нужна проверка ответов':'Очередь пуста',Math.min(100,review*10),'orange'),
    kpi('Школы с рейтингом',String((typeof SCHOOLS!=='undefined'?SCHOOLS:[]).filter(s=>Number.isFinite(Number(s.rating))).length),'Только по рассчитанным данным',0,'blue')
  ].join('');
  const risks=document.getElementById('situationRisks');if(risks)risks.innerHTML='<div class="empty-state">Риски появятся после поступления реальных данных.</div>';
  const deps=document.getElementById('situationDepartments');if(deps)deps.innerHTML='<div class="empty-state">Показатели отделов рассчитываются после начала работы.</div>';
  const trend=document.getElementById('situationTrend');if(trend)trend.innerHTML='<div class="empty-state">Динамика появится после накопления данных.</div>';
  const clock=document.getElementById('situationClock');if(clock){const now=new Date();clock.textContent=now.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});}
}

function indicatorData(school){
  const source=school?.indicators||{};
  return {students:source.students??null,classes:source.classes??null,teachers:source.teachers??null,vacancies:source.vacancies??null,gia:source.gia??null,vpr:source.vpr??null,attendance:source.attendance??null,food:source.food??null,transport:source.transport??null,safety:source.safety??null};
}
function renderIndicators(){
  const select=document.getElementById('indicatorSchoolSelect');if(!select)return;
  const schools=typeof getVisibleSchools==='function'?getVisibleSchools():[];
  if(!schools.some(s=>s.id===v3State.indicatorSchool))v3State.indicatorSchool=schools[0]?.id||'';
  select.innerHTML=schools.length?schools.map(s=>`<option value="${s.id}" ${s.id===v3State.indicatorSchool?'selected':''}>${escapeHTML(s.name)}</option>`).join(''):'<option value="">Школы не добавлены</option>';
  ['indicatorSummary','indicatorTrend','indicatorAnomalies','indicatorTable'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='<div class="empty-state">Показатели не загружены. Добавьте подтверждённые сведения школы.</div>';});
}
function renderAutomations(){
  const list=document.getElementById('automationList');if(!list)return;
  const items=Array.isArray(v3State.automations)?v3State.automations:[];
  const active=items.filter(a=>a.active).length,runs=items.reduce((a,b)=>a+Number(b.runs||0),0);
  document.getElementById('automationSummary').innerHTML=[kpi('Создано правил',String(items.length),'Все правила текущего браузера',items.length?'100':0,'blue'),kpi('Активные правила',String(active),'Включены пользователем',items.length?active/items.length*100:0,'green'),kpi('Срабатывания',String(runs),'Зафиксированные запуски',runs?100:0,'purple'),kpi('Облачная синхронизация','—','Модуль ещё не перенесён в Supabase',0,'orange')].join('');
  list.innerHTML=items.length?items.map(a=>`<article class="automation-card"><div class="automation-card-head"><div><h3>${escapeHTML(a.name)}</h3><p>${a.active?'Правило включено':'Правило отключено'}</p></div><label class="switch"><input type="checkbox" data-v3-change="automation" data-id="${a.id}" ${a.active?'checked':''}/><span></span></label></div><div class="automation-flow"><div class="automation-node"><b>ЕСЛИ</b><br>${escapeHTML(a.trigger)}</div><span>→</span><div class="automation-node"><b>ТО</b><br>${escapeHTML(a.action)}</div></div><div class="automation-meta"><span>Срабатываний: ${Number(a.runs||0)}</span><span>Последнее: ${escapeHTML(a.last||'не запускалось')}</span></div><button class="secondary-button" data-v3-action="run-automation" data-id="${a.id}">Запустить проверку сейчас</button></article>`).join(''):'<div class="empty-state">Правила автоматизации не созданы</div>';
}

function renderConstructor(){
  const target=document.getElementById('builderContent');if(!target)return;
  document.querySelectorAll('#builderTabs button').forEach(b=>b.classList.toggle('active',b.dataset.builderTab===v3State.constructorTab));
  const tab=v3State.constructorTab;
  if(tab==='forms') target.innerHTML=renderFormBuilder();
  else if(tab==='workflows') target.innerHTML=renderWorkflowBuilder();
  else if(tab==='rating') target.innerHTML=renderRatingBuilder();
  else if(tab==='roles') target.innerHTML=renderRoleBuilder();
  else if(tab==='dashboard') target.innerHTML=renderDashboardBuilder();
  else if(tab==='reports') target.innerHTML=renderReportTemplates();
  else target.innerHTML=renderModuleBuilder();
}
function fieldIcon(type){return({number:'#',percent:'%',text:'T',comment:'¶',file:'⇩',photo:'▧',yesno:'✓',signature:'✎',repeat:'≡',date:'□',select:'⌄'})[type]||'•';}
function renderFormBuilder(){
  const selected=v3State.templates.find(t=>t.id===v3State.selectedTemplate)||v3State.templates[0];
  return `<div class="builder-layout"><article class="panel builder-sidebar"><div class="panel-head"><div><span class="eyebrow">Шаблоны</span><h3>Формы отчётности</h3></div><button class="secondary-button small" data-v3-action="new-template">+ Новая</button></div><div class="builder-template-list">${v3State.templates.map(t=>`<div class="builder-template ${t.id===selected.id?'active':''}" data-v3-action="select-template" data-id="${t.id}"><div class="template-icon">▤</div><div><strong>${escapeHTML(t.name)}</strong><span>${escapeHTML(t.category)} · ${t.fields.length} полей</span></div><button class="text-button">Открыть</button></div>`).join('')}</div><span class="eyebrow" style="margin-top:18px">Добавить поле</span><div class="field-palette">${[['number','Число'],['percent','Процент'],['text','Текст'],['select','Список'],['file','Файл'],['photo','Фото'],['yesno','Да / Нет'],['signature','Подпись'],['repeat','Повторяемые строки'],['date','Дата']].map(x=>`<button data-v3-action="add-builder-field" data-type="${x[0]}">+ ${x[1]}</button>`).join('')}</div></article><article class="panel builder-canvas"><div class="canvas-header"><div><span class="eyebrow">Редактор формы</span><h3>${escapeHTML(selected.name)}</h3></div><div><button class="secondary-button small" data-v3-action="preview-template">Предпросмотр</button> <button class="primary-button" data-v3-action="save-template">Сохранить</button></div></div><div class="canvas-fields">${selected.fields.map((f,i)=>`<div class="canvas-field"><div class="drag-handle">⋮⋮</div><div><strong>${escapeHTML(f.name)}</strong><span>${fieldIcon(f.type)} · ${escapeHTML(f.type)} · ${f.required?'обязательное':'необязательное'}</span></div><div class="field-actions"><button data-v3-action="toggle-field-required" data-index="${i}" title="Обязательность">${f.required?'★':'☆'}</button><button data-v3-action="remove-builder-field" data-index="${i}" title="Удалить">×</button></div></div>`).join('')}</div><div class="modal-hint" style="margin-top:15px">Проверки данных можно настроить для каждого поля: диапазон значений, сравнение с прошлым периодом, контроль суммы и обязательность подтверждения.</div></article></div>`;
}
function renderWorkflowBuilder(){
  const selected=v3State.workflows.find(w=>w.id===v3State.selectedWorkflow)||v3State.workflows[0];
  return `<div class="builder-layout"><article class="panel builder-sidebar"><div class="panel-head"><div><span class="eyebrow">Маршруты</span><h3>Готовые сценарии</h3></div></div><div class="builder-template-list">${v3State.workflows.map(w=>`<div class="builder-template ${w.id===selected.id?'active':''}" data-v3-action="select-workflow" data-id="${w.id}"><div class="template-icon">◈</div><div><strong>${escapeHTML(w.name)}</strong><span>${w.steps.length} этапов</span></div></div>`).join('')}</div></article><article class="panel builder-canvas"><div class="canvas-header"><div><span class="eyebrow">Маршрут согласования</span><h3>${escapeHTML(selected.name)}</h3><span class="muted">${escapeHTML(selected.description)}</span></div><button class="primary-button" data-v3-action="save-workflow">Сохранить маршрут</button></div><div class="workflow-canvas"><div class="workflow-route">${selected.steps.map((step,i)=>`${i?'<span class="workflow-arrow">→</span>':''}<div class="workflow-step"><small>Этап ${i+1}</small><strong>${escapeHTML(step)}</strong><button class="text-button" data-v3-action="remove-workflow-step" data-index="${i}">Удалить</button></div>`).join('')}<span class="workflow-arrow">→</span><button class="secondary-button" data-v3-action="add-workflow-step">+ Добавить этап</button></div><div class="modal-hint">Для каждого этапа в рабочей версии можно задать срок, автоматическое замещение, условия пропуска и уведомления.</div></div></article></div>`;
}
function renderRatingBuilder(){
  const w=v3State.ratingWeights,total=Object.values(w).reduce((a,b)=>a+Number(b),0);const preview='—';
  return `<div class="rating-builder-grid"><article class="panel"><div class="panel-head"><div><span class="eyebrow">Вес критериев</span><h3>Формула исполнительской дисциплины</h3></div><span class="tag ${total===100?'green':'red'}">Сумма: ${total}%</span></div><div class="weight-list">${[['deadlines','Соблюдение сроков'],['quality','Качество отчёта'],['completeness','Полнота данных'],['reaction','Скорость реакции']].map(x=>`<div class="weight-row"><span>${x[1]}</span><input type="range" min="0" max="70" value="${w[x[0]]}" data-v3-input="rating-weight" data-key="${x[0]}"/><b class="weight-value" id="weight-${x[0]}">${w[x[0]]}%</b></div>`).join('')}</div><hr style="border-color:var(--line);border-width:1px 0 0;margin:22px 0"><div class="form-grid"><label>Просрочка до 2 часов<select><option>−2 балла</option><option>−1 балл</option><option>Не снижать</option></select></label><label>Повторный возврат<select><option>−5 баллов</option><option>−3 балла</option></select></label><label>Важное поручение<select><option>Коэффициент ×1,25</option><option>×1,5</option></select></label><label>Критическое поручение<select><option>Коэффициент ×2</option><option>×1,5</option></select></label></div><button class="primary-button" style="margin-top:16px" data-v3-action="save-rating-rules">Сохранить правила с новой даты</button></article><article class="panel rating-preview"><span class="eyebrow">Предпросмотр</span><div class="preview-score" id="ratingPreviewScore">${preview}%</div><h3>Модельный пример формулы</h3><p class="muted">Это только предварительный расчёт на условных значениях. Реальные рейтинги формируются из поручений и ответов школ.</p></article></div>`;
}
function permissionValue(role,key){
  const custom=v3State.permissionOverrides[role]?.[key];if(typeof custom==='boolean')return custom;
  const c=ROLE_CONFIG[role];return ({view:true,create:c.canCreate,approve:c.canApprove,publish:c.canPublish,export:!['school_staff'].includes(role),users:c.canManageUsers,rating:c.canEditRating,audit:c.canViewAudit})[key]||false;
}
function renderRoleBuilder(){
  const perms=[['view','Просмотр'],['create','Создание'],['approve','Согласование'],['publish','Публикация'],['export','Экспорт'],['users','Пользователи'],['rating','Рейтинг'],['audit','Журнал']];
  return `<article class="panel permission-matrix"><div class="panel-head"><div><span class="eyebrow">Матрица доступа</span><h3>Роли и отдельные разрешения</h3></div><button class="primary-button" data-v3-action="new-role">+ Создать роль</button></div><table><thead><tr><th>Роль</th>${perms.map(p=>`<th>${p[1]}</th>`).join('')}<th>Область данных</th></tr></thead><tbody>${Object.entries(ROLE_CONFIG).map(([id,r])=>`<tr><td><strong>${escapeHTML(r.label)}</strong></td>${perms.map(p=>`<td><button class="permission-toggle ${permissionValue(id,p[0])?'on':''}" data-v3-action="permission" data-role="${id}" data-permission="${p[0]}">${permissionValue(id,p[0])?'✓':'—'}</button></td>`).join('')}<td><small>${escapeHTML(r.scope)}</small></td></tr>`).join('')}</tbody></table><div class="modal-hint" style="margin-top:15px">Реальные права дополнительно ограничиваются отделом, закреплёнными направлениями и школой пользователя.</div></article>`;
}
function renderDashboardBuilder(){
  const defs={deadlines:['Ближайшие сроки','Список поручений, срок которых скоро истекает'],ratings:['Лучшие школы','Топ школ и изменение мест'],departments:['Работа отделов','Нагрузка и эффективность подразделений'],activity:['Последние действия','Журнал ключевых событий'],risks:['Критические риски','Просрочки и проблемы, требующие внимания'],calendar:['Календарь дня','Совещания, проверки и сроки']};
  return `<article class="panel"><div class="panel-head"><div><span class="eyebrow">Главная панель</span><h3>Виджеты для роли «${escapeHTML(roleConfig().label)}»</h3></div><button class="primary-button" data-v3-action="save-dashboard">Сохранить расположение</button></div><div class="dashboard-widget-grid">${Object.entries(defs).map(([id,d])=>`<div class="widget-option"><div class="widget-option-head"><h3>${d[0]}</h3><label class="switch"><input type="checkbox" data-v3-change="dashboard-widget" data-id="${id}" ${v3State.dashboardWidgets[id]?'checked':''}/><span></span></label></div><p>${d[1]}</p><small class="muted">⋮⋮ Перетащите для изменения порядка</small></div>`).join('')}</div></article>`;
}
function renderReportTemplates(){
  const reports=[['Ежемесячный доклад начальнику','Показатели района, риски, рейтинг и отделы'],['Рейтинг школ','Места, динамика, сроки, качество и возвраты'],['Анализ ГИА','Автоматическая районная сводка по формам школ'],['Просрочки по отделам','Школы, ответственные и длительность просрочки'],['Исполнение предписаний','Проверки, нарушения и сроки устранения'],['Ознакомление с документами','Кто открыл и подтвердил официальный документ']];
  return `<div class="report-template-grid">${reports.map((r,i)=>`<article class="report-template-card"><span class="tag ${['blue','purple','green','red','orange','blue'][i]}">Шаблон</span><h3>${r[0]}</h3><p>${r[1]}</p><button class="secondary-button full" data-v3-action="build-report-template" data-title="${escapeHTML(r[0])}">Настроить отчёт</button></article>`).join('')}</div>`;
}
function renderModuleBuilder(){
  const defs={indicators:['▥','Реестр показателей','Цифровой паспорт и история показателей школ'],automations:['⚙','Автоматизация','Напоминания, эскалации и автоматические сводки'],inspections:['⌕','Проверки школ','Чек-листы, нарушения и контроль устранения'],meetings:['♙','Совещания','Приглашения, протоколы и поручения'],appeals:['✉','Обращения','Единое окно запросов школ'],documents:['▧','База документов','Приказы, шаблоны и ознакомление'],personal:['✓','Мои задачи','Единый список работы и замещение']};
  return `<div class="module-grid">${Object.entries(defs).map(([id,d])=>`<article class="module-card ${v3State.modules[id]?'':'disabled'}"><div class="module-card-head"><div class="module-icon">${d[0]}</div><label class="switch"><input type="checkbox" data-v3-change="module" data-id="${id}" ${v3State.modules[id]?'checked':''}/><span></span></label></div><h3>${d[1]}</h3><p>${d[2]}</p><small class="muted">${v3State.modules[id]?'Модуль включён для разрешённых ролей':'Раздел скрыт из меню пользователей'}</small></article>`).join('')}</div>`;
}

function renderInspections(){
  const target=document.getElementById('inspectionGrid');if(!target)return;
  let items=v3State.inspections;if(isSchoolRole())items=items.filter(i=>i.schoolId===state.currentUser.schoolId);
  const active=items.filter(i=>i.status==='active').length,overdue=items.filter(i=>i.status==='overdue').length,violations=items.reduce((a,b)=>a+b.violations-b.resolved,0),done=items.filter(i=>i.status==='done').length;
  document.getElementById('inspectionSummary').innerHTML=[kpi('Активные проверки',active,'В процессе устранения',active*22,'blue'),kpi('Просроченные предписания',overdue,'Требуют эскалации',overdue*30,'red'),kpi('Открытые нарушения',violations,'По всем доступным школам',Math.min(100,violations*7),'orange'),kpi('Завершено',done,'Приняты подтверждения',done*30,'green')].join('');
  target.innerHTML=items.length?items.map(i=>{const pct=i.violations?Math.round(i.resolved/i.violations*100):(i.status==='planned'?0:100);return `<article class="inspection-card"><div class="inspection-card-head"><div><span class="tag ${i.status==='overdue'?'red':i.status==='done'?'green':i.status==='planned'?'purple':'orange'}">${i.status==='overdue'?'Просрочено':i.status==='done'?'Завершено':i.status==='planned'?'Запланировано':'В работе'}</span><h3>${escapeHTML(i.school)}</h3><p>${escapeHTML(i.type)}</p></div><b>${i.date}</b></div><div class="inspection-progress"><i style="width:${pct}%"></i></div><div class="inspection-meta"><div><b>${i.violations}</b><span>нарушений</span></div><div><b>${i.resolved}</b><span>устранено</span></div><div><b>${i.deadline}</b><span>срок</span></div></div><button class="secondary-button" data-v3-action="inspection-view" data-id="${i.id}">Открыть чек-лист</button></article>`;}).join(''):'<div class="v3-disabled-note"><strong>Проверок для вашей школы нет</strong>Новые проверки и предписания появятся здесь.</div>';
}

function renderMeetings(){
  const list=document.getElementById('meetingList');if(!list)return;
  list.innerHTML=v3State.meetings.map(m=>`<article class="meeting-card"><div class="meeting-date"><b>${m.day}</b><span>${m.month}<br>${m.time}</span></div><div><span class="tag ${m.status==='today'?'green':'blue'}">${m.status==='today'?'Сегодня':'Запланировано'}</span><h3>${escapeHTML(m.title)}</h3><p>${escapeHTML(m.place)} · подтвердили ${m.confirmed} из ${m.total}</p></div><div class="meeting-actions"><button class="secondary-button small" data-v3-action="meeting-open" data-id="${m.id}">Открыть</button></div></article>`).join('');
  const protocol=[['До 22 июля','Предоставить обновлённые графики подготовки школ'],['До 24 июля','Проверить готовность пищеблоков'],['До 25 июля','Назначить ответственных за актуализацию паспортов безопасности']];
  document.getElementById('protocolItems').innerHTML=protocol.map((p,i)=>`<div class="protocol-line"><b>${i+1}</b><div><strong>${p[1]}</strong><span>${p[0]} · получатели будут выбраны перед публикацией</span></div></div>`).join('');
  const btn=document.getElementById('convertProtocolButton');if(btn){btn.textContent=v3State.minutesConverted?'Поручения уже созданы ✓':'Создать поручения из протокола';btn.disabled=v3State.minutesConverted||!roleConfig().canCreate;}
}

function renderAppeals(){
  const target=document.getElementById('appealBoard');if(!target)return;
  let items=v3State.appeals;if(isSchoolRole())items=items.filter(a=>a.schoolId===state.currentUser.schoolId);
  const newC=items.filter(a=>a.status==='new').length,work=items.filter(a=>a.status==='work').length,done=items.filter(a=>a.status==='done').length;
  document.getElementById('appealSummary').innerHTML=[kpi('Новые',newC,'Ожидают назначения',newC*20,'orange'),kpi('В работе',work,'Средний ответ 3 ч 40 мин',work*25,'blue'),kpi('Решено за месяц','46','94% в установленный срок',94,'green'),kpi('Средняя оценка','4,8','Оценка школ после закрытия',96,'purple')].join('');
  const columns=[['new','Новые'],['work','В работе'],['done','Решено']];
  target.innerHTML=columns.map(c=>`<div class="appeal-column"><div class="appeal-column-head"><h3>${c[1]}</h3><span class="tag ${c[0]==='new'?'orange':c[0]==='work'?'blue':'green'}">${items.filter(a=>a.status===c[0]).length}</span></div>${items.filter(a=>a.status===c[0]).map(a=>`<article class="appeal-card"><div><span class="appeal-number">${a.id}</span> <span class="tag ${a.priority==='Срочно'?'red':a.priority==='Важно'?'orange':'gray'}">${a.priority}</span></div><h4>${escapeHTML(a.title)}</h4><p>${escapeHTML(a.school)} · ${escapeHTML(a.text)}</p><div class="appeal-card-footer"><span class="appeal-time">${a.time}</span>${c[0]!=='done'&&!isSchoolRole()?`<button class="text-button" data-v3-action="appeal-next" data-id="${a.id}">${c[0]==='new'?'Принять':'Закрыть'} →</button>`:''}</div></article>`).join('')||'<p class="muted">Нет обращений</p>'}</div>`).join('');
}

function renderDocuments(){
  const target=document.getElementById('documentGrid');if(!target)return;
  const q=(document.getElementById('documentSearch')?.value||'').toLowerCase(),cat=document.getElementById('documentCategory')?.value||'all';
  const docs=v3State.documents.filter(d=>(cat==='all'||d.category===cat)&&(!q||`${d.title} ${d.number} ${d.category}`.toLowerCase().includes(q)));
  target.innerHTML=docs.map(d=>{const isRead=v3State.documentRead.includes(d.id),read=isSchoolRole()?(isRead?1:0):d.read,total=isSchoolRole()?1:d.total,pct=Math.round(read/total*100);return `<article class="document-card"><div class="document-type-row"><div class="file-icon">${d.type}</div><span class="tag ${d.required?'red':'blue'}">${d.required?'Обязательно ознакомиться':d.category}</span></div><div><small class="muted">${escapeHTML(d.number)} · ${d.date}</small><h3>${escapeHTML(d.title)}</h3><p>${escapeHTML(d.category)} · последняя актуальная версия</p></div><div class="read-progress"><div><i style="width:${pct}%"></i></div><span>${isSchoolRole()?(isRead?'Вы ознакомились':'Ожидает вашего ознакомления'):`Ознакомились ${read} из ${total} (${pct}%)`}</span></div><div style="display:flex;gap:8px"><button class="secondary-button" data-v3-action="download-document" data-id="${d.id}">Открыть</button>${isSchoolRole()&&!isRead?`<button class="primary-button" data-v3-action="read-document" data-id="${d.id}">Подтвердить</button>`:''}</div></article>`;}).join('')||'<div class="v3-disabled-note"><strong>Документы не найдены</strong>Измените запрос или категорию.</div>';
}

function renderPersonal(){
  const target=document.getElementById('personalTaskList');if(!target)return;
  const filter=document.getElementById('personalTaskFilter')?.value||'all';let tasks=v3State.personalTasks.filter(t=>filter==='all'||(filter==='done'?t.done:!t.done));
  document.getElementById('personalSummary').innerHTML=[kpi('На сегодня',v3State.personalTasks.filter(t=>!t.done&&t.deadline.includes('Сегодня')).length,'Задачи из всех модулей',68,'blue'),kpi('Критические',v3State.personalTasks.filter(t=>!t.done&&t.priority==='critical').length,'Необходимо выполнить первыми',25,'red'),kpi('Выполнено',v3State.personalTasks.filter(t=>t.done).length,'За текущий рабочий день',42,'green'),kpi('Ожидают согласования',getApprovalItems().length,'Доступно для вашей роли',44,'purple')].join('');
  target.innerHTML=tasks.map(t=>`<div class="personal-task ${t.done?'done':''}"><button class="task-check" data-v3-action="personal-complete" data-id="${t.id}">${t.done?'✓':''}</button><div><strong>${escapeHTML(t.title)}</strong><span>${escapeHTML(t.deadline)}</span></div><span class="task-source">${escapeHTML(t.source)}</span></div>`).join('')||'<div class="v3-disabled-note"><strong>Список пуст</strong>Все задачи в выбранной категории выполнены.</div>';
  const sel=document.getElementById('delegationUser');if(sel){sel.innerHTML=USERS.filter(u=>u.id!==state.currentUser?.id && (!isSchoolRole() || u.schoolId===state.currentUser?.schoolId)).slice(0,15).map(u=>`<option value="${u.id}">${escapeHTML(u.name)} — ${escapeHTML(roleLabel(u.role))}</option>`).join('');}
  const status=document.getElementById('delegationStatus');if(status)status.innerHTML=v3State.delegation?`Активно: задачи передаются пользователю <b>${escapeHTML(USERS.find(u=>u.id===v3State.delegation.user)?.name||'сотрудник')}</b> с ${v3State.delegation.from} по ${v3State.delegation.to}.`:'Замещение не настроено. При сохранении история передачи дел будет зафиксирована в журнале.';
}

function renderV3UpdateBanner(){
  const banner=document.getElementById('systemUpdateBanner');if(banner)banner.classList.toggle('hidden',v3State.updateDismissed);
}

function openCommandPalette(query=''){
  const modal=document.getElementById('commandModal');if(!modal)return;modal.classList.remove('hidden');const input=document.getElementById('commandSearchInput');input.value=query;renderCommandResults(query);setTimeout(()=>input.focus(),20);
}
function renderCommandResults(query=''){
  const q=query.toLowerCase().trim();const pages=[
    ['dashboard','⌂','Главная','Общая панель'],['situation','◉','Ситуационный центр','Риски и контроль руководителя'],['tasks','✓','Поручения','Создание и исполнение'],['schools','▦','Школы района','Карточки организаций'],['indicators','▥','Реестр показателей','Цифровые паспорта школ'],['rating','★','Рейтинг школ','Исполнительская дисциплина'],['reports','▤','Отчёты и сводки','Автоматическая аналитика'],['automations','⚙','Автоматизация','Правила и эскалации'],['constructor','✦','Конструктор системы','Формы, роли и модули'],['inspections','⌕','Проверки школ','Нарушения и предписания'],['meetings','♙','Совещания','Повестки и протоколы'],['appeals','✉','Обращения','Запросы школ'],['documents','▧','База документов','Приказы и материалы'],['personal','✓','Мои задачи','Персональный список работы']
  ].filter(p=>roleConfig().pages.includes(p[0])&&isV3PageEnabled(p[0]));
  let results=pages.filter(p=>!q||`${p[2]} ${p[3]}`.toLowerCase().includes(q)).map(p=>({icon:p[1],title:p[2],sub:p[3],page:p[0],key:'раздел'}));
  if(q){results.push(...getVisibleTasks().filter(t=>t.title.toLowerCase().includes(q)).slice(0,4).map(t=>({icon:'✓',title:t.title,sub:`Поручение · ${t.deadline}`,page:'tasks',key:'поручение'})));results.push(...getVisibleSchools().filter(s=>s.name.toLowerCase().includes(q)).slice(0,4).map(s=>({icon:'▦',title:s.name,sub:`Школа · рейтинг ${s.rating}%`,page:'schools',key:'школа'})));}
  results=results.slice(0,10);document.getElementById('commandResults').innerHTML=results.length?results.map(r=>`<button class="command-result" data-v3-action="command-result" data-page="${r.page}" data-title="${escapeHTML(r.title)}"><span class="result-icon">${r.icon}</span><span><strong>${escapeHTML(r.title)}</strong><span>${escapeHTML(r.sub)}</span></span><kbd>${r.key}</kbd></button>`).join(''):'<div class="v3-disabled-note"><strong>Ничего не найдено</strong>Попробуйте другой запрос.</div>';
}

let v3EventsBound=false;
function bindV3Events(){
  if(v3EventsBound)return;v3EventsBound=true;
  document.querySelectorAll('#builderTabs button').forEach(b=>b.addEventListener('click',()=>{v3State.constructorTab=b.dataset.builderTab;saveV3();renderConstructor();}));
  document.getElementById('indicatorSchoolSelect')?.addEventListener('change',e=>{v3State.indicatorSchool=e.target.value;saveV3();renderIndicators();});
  document.getElementById('indicatorSearch')?.addEventListener('input',renderIndicators);
  document.getElementById('documentSearch')?.addEventListener('input',renderDocuments);
  document.getElementById('documentCategory')?.addEventListener('change',renderDocuments);
  document.getElementById('personalTaskFilter')?.addEventListener('change',renderPersonal);
  document.getElementById('commandButton')?.addEventListener('click',()=>openCommandPalette());
  document.getElementById('commandSearchInput')?.addEventListener('input',e=>renderCommandResults(e.target.value));
  document.getElementById('versionButton')?.addEventListener('click',()=>showInfoModal('Версия V3','<h3>Автоматическое обновление</h3><p>В размещённой онлайн-версии пользователи всегда открывают один адрес. Новые версии загружаются автоматически, а данные и аккаунты остаются в базе.</p><h3>Что добавлено</h3><p>Конструктор форм, ролей и маршрутов; автоматические правила; реестр показателей; проверки; совещания; обращения; документы; личные задачи и ситуационный центр.</p>','Система обновлена'));
  document.getElementById('dismissUpdateButton')?.addEventListener('click',()=>{v3State.updateDismissed=true;saveV3();renderV3UpdateBanner();});
  document.getElementById('presentationModeButton')?.addEventListener('click',()=>togglePresentation(true));
  document.getElementById('presentationExitButton')?.addEventListener('click',()=>togglePresentation(false));
  document.getElementById('saveAutomationButton')?.addEventListener('click',()=>{const trigger=document.getElementById('automationTrigger').value,action=document.getElementById('automationAction').value;v3State.automations.unshift({id:'a'+Date.now(),name:'Новое автоматическое правило',trigger,action,active:true,runs:0,last:'Ещё не запускалось'});saveV3();renderAutomations();showToast('Правило создано и включено');});
  document.getElementById('addAutomationButton')?.addEventListener('click',()=>document.getElementById('automationBuilder').scrollIntoView({behavior:'smooth'}));
  document.getElementById('compareIndicatorsButton')?.addEventListener('click',()=>showInfoModal('Сравнение периодов','<p><b>Численность:</b> +17 учащихся</p><p><b>Средний балл ГИА:</b> +2,4</p><p><b>Посещаемость:</b> −0,6%</p><p><b>Вакансии:</b> без изменений</p>','Автоматическая аналитика'));
  document.getElementById('exportPassportButton')?.addEventListener('click',exportSchoolPassportV3);
  document.getElementById('addIndicatorButton')?.addEventListener('click',addCustomIndicatorV3);
  document.getElementById('addInspectionButton')?.addEventListener('click',addInspectionV3);
  document.getElementById('addMeetingButton')?.addEventListener('click',addMeetingV3);
  document.getElementById('newAppealButton')?.addEventListener('click',addAppealV3);
  document.getElementById('addDocumentButton')?.addEventListener('click',addDocumentV3);
  document.getElementById('documentReadReportButton')?.addEventListener('click',()=>downloadCSV('oznakomlenie_s_dokumentami.csv',[['Документ','Ознакомились','Всего'],...v3State.documents.map(d=>[d.title,d.read,d.total])]));
  document.getElementById('addPersonalTaskButton')?.addEventListener('click',addPersonalTaskV3);
  document.getElementById('saveDelegationButton')?.addEventListener('click',saveDelegationV3);
  document.getElementById('convertProtocolButton')?.addEventListener('click',convertProtocolV3);
  document.addEventListener('click',handleV3Click);
  document.addEventListener('change',handleV3Change);
  document.addEventListener('input',handleV3Input);
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommandPalette();}if(e.key==='Escape')document.getElementById('commandModal')?.classList.add('hidden');});
  document.getElementById('commandModal')?.addEventListener('click',e=>{if(e.target.id==='commandModal')e.currentTarget.classList.add('hidden');});
}

function handleV3Click(event){
  const el=event.target.closest('[data-v3-action]');if(!el)return;const action=el.dataset.v3Action;
  if(action==='risk'||action==='anomaly')showInfoModal('Контрольный сигнал','<p>В рабочей системе здесь откроется карточка школы или поручения, история событий и доступные решения: назначить ответственного, запросить пояснение, продлить срок или эскалировать руководству.</p>','Ситуационный центр');
  if(action==='run-automation'){const a=v3State.automations.find(x=>x.id===el.dataset.id);if(a){a.runs++;a.last='Только что';saveV3();renderAutomations();showToast(`Проверка выполнена: ${a.name}`);}}
  if(action==='select-template'){v3State.selectedTemplate=el.dataset.id;saveV3();renderConstructor();}
  if(action==='new-template'){const name=prompt('Название новой формы:','Новая форма отчётности');if(name){const id='t'+Date.now();v3State.templates.push({id,name,category:'Пользовательская',fields:[]});v3State.selectedTemplate=id;saveV3();renderConstructor();}}
  if(action==='add-builder-field'){const t=v3State.templates.find(x=>x.id===v3State.selectedTemplate);if(t){const names={number:'Новый числовой показатель',percent:'Новый процент',text:'Текстовое поле',select:'Выбор из списка',file:'Прикрепить файл',photo:'Добавить фотографии',yesno:'Подтверждение Да / Нет',signature:'Подтверждение директора',repeat:'Повторяющиеся строки',date:'Дата'};t.fields.push({type:el.dataset.type,name:names[el.dataset.type],required:false});saveV3();renderConstructor();}}
  if(action==='remove-builder-field'){const t=v3State.templates.find(x=>x.id===v3State.selectedTemplate);t?.fields.splice(Number(el.dataset.index),1);saveV3();renderConstructor();}
  if(action==='toggle-field-required'){const t=v3State.templates.find(x=>x.id===v3State.selectedTemplate);if(t?.fields[el.dataset.index])t.fields[el.dataset.index].required=!t.fields[el.dataset.index].required;saveV3();renderConstructor();}
  if(action==='save-template'){addAudit('Изменил шаблон формы',v3State.templates.find(t=>t.id===v3State.selectedTemplate)?.name||'Форма','task');saveV3();showToast('Форма сохранена — обновлять сайт не требуется');}
  if(action==='preview-template'){const t=v3State.templates.find(x=>x.id===v3State.selectedTemplate);showInfoModal(t.name,`<p class="muted">Такую форму увидит школа:</p>${t.fields.map(f=>`<label style="margin:12px 0">${escapeHTML(f.name)}${f.required?' *':''}<input placeholder="${escapeHTML(f.type)}" disabled></label>`).join('')}`,'Предпросмотр формы');}
  if(action==='select-workflow'){v3State.selectedWorkflow=el.dataset.id;saveV3();renderConstructor();}
  if(action==='add-workflow-step'){const w=v3State.workflows.find(x=>x.id===v3State.selectedWorkflow);const step=prompt('Новый этап согласования:','Начальник отдела');if(w&&step){w.steps.push(step);saveV3();renderConstructor();}}
  if(action==='remove-workflow-step'){const w=v3State.workflows.find(x=>x.id===v3State.selectedWorkflow);if(w&&w.steps.length>1){w.steps.splice(Number(el.dataset.index),1);saveV3();renderConstructor();}}
  if(action==='save-workflow'){saveV3();showToast('Маршрут согласования сохранён');}
  if(action==='save-rating-rules'){const total=Object.values(v3State.ratingWeights).reduce((a,b)=>a+Number(b),0);if(total!==100)return showToast('Сумма критериев должна составлять 100%');saveV3();addAudit('Изменил правила рейтинга','Новая формула с будущего периода','rating');showToast('Новая формула сохранена без пересчёта старых месяцев');}
  if(action==='permission'){const role=el.dataset.role,key=el.dataset.permission;v3State.permissionOverrides[role]??={};v3State.permissionOverrides[role][key]=!permissionValue(role,key);saveV3();renderConstructor();}
  if(action==='new-role'){const name=prompt('Название новой роли:','Методист по ГИА');if(name)showInfoModal('Роль создана',`<p>Роль <b>${escapeHTML(name)}</b> создана. В рабочей системе она появится в списке пользователей и получит выбранную область данных.</p>`,'Конструктор ролей');}
  if(action==='save-dashboard'){saveV3();showToast('Главная панель роли сохранена');}
  if(action==='build-report-template'){showInfoModal('Настройка отчёта',`<p>Шаблон «<b>${escapeHTML(el.dataset.title)}</b>» можно настроить: выбрать столбцы, период, школы, отделы, диаграммы, формат Excel/PDF и расписание автоматического формирования.</p>`,'Конструктор отчётов');}
  if(action==='inspection-view'){const i=v3State.inspections.find(x=>x.id===el.dataset.id);if(i)showInfoModal(i.type,`<p><b>${escapeHTML(i.school)}</b></p><p>Выявлено нарушений: ${i.violations}. Устранено: ${i.resolved}. Срок: ${i.deadline}.</p><h3>Чек-лист</h3><ul><li>Документы и приказы</li><li>Состояние помещений</li><li>Безопасность и доступ</li><li>Фотофиксация</li></ul>${i.status!=='done'?`<button class="primary-button" onclick="window.resolveInspectionV3('${i.id}')">Подтвердить устранение одного нарушения</button>`:''}`,'Карточка проверки');}
  if(action==='meeting-open'){const m=v3State.meetings.find(x=>x.id===el.dataset.id);showInfoModal(m.title,`<p>${m.day} июля в ${m.time} · ${m.place}</p><h3>Повестка</h3><ol><li>Исполнение текущих поручений</li><li>Подготовка к новому учебному году</li><li>Разное</li></ol><p>Подтвердили участие ${m.confirmed} из ${m.total}.</p>`,'Совещание');}
  if(action==='appeal-next'){const a=v3State.appeals.find(x=>x.id===el.dataset.id);if(a){a.status=a.status==='new'?'work':'done';saveV3();renderAppeals();showToast(a.status==='done'?'Обращение закрыто':'Обращение принято в работу');}}
  if(action==='download-document'){const d=v3State.documents.find(x=>x.id===el.dataset.id);downloadCSV(`document_${d.id}.csv`,[['Документ'],['Номер',d.number],['Название',d.title],['Дата',d.date],['Категория',d.category]]);showToast('Карточка документа скачана');}
  if(action==='read-document'){if(!v3State.documentRead.includes(el.dataset.id))v3State.documentRead.push(el.dataset.id);saveV3();renderDocuments();showToast('Ознакомление подтверждено и зафиксировано');}
  if(action==='personal-complete'){const t=v3State.personalTasks.find(x=>x.id===el.dataset.id);if(t)t.done=!t.done;saveV3();renderPersonal();}
  if(action==='command-result'){document.getElementById('commandModal').classList.add('hidden');navigate(el.dataset.page);if(el.dataset.page==='tasks'&&el.dataset.title){document.getElementById('taskSearch').value=el.dataset.title;renderTasks();}}
}
window.resolveInspectionV3=function(id){const i=v3State.inspections.find(x=>x.id===id);if(i&&i.resolved<i.violations){i.resolved++;if(i.resolved===i.violations)i.status='done';saveV3();renderInspections();closeModal('infoModal');showToast('Устранение зафиксировано');}};

function handleV3Change(event){
  const el=event.target;if(el.dataset.v3Change==='automation'){const a=v3State.automations.find(x=>x.id===el.dataset.id);if(a)a.active=el.checked;saveV3();renderAutomations();}
  if(el.dataset.v3Change==='module'){v3State.modules[el.dataset.id]=el.checked;saveV3();applyV3NavigationVisibility();renderConstructor();showToast(el.checked?'Модуль включён':'Модуль скрыт из меню');if(!isV3PageEnabled(state.currentPage))navigate('constructor');}
  if(el.dataset.v3Change==='dashboard-widget'){v3State.dashboardWidgets[el.dataset.id]=el.checked;saveV3();}
}
function handleV3Input(event){
  const el=event.target;if(el.dataset.v3Input==='rating-weight'){v3State.ratingWeights[el.dataset.key]=Number(el.value);const value=document.getElementById(`weight-${el.dataset.key}`);if(value)value.textContent=el.value+'%';const p=document.getElementById('ratingPreviewScore');if(p)p.textContent='—';}
}

function togglePresentation(on){document.body.classList.toggle('presentation-mode',on);document.getElementById('presentationExitButton')?.classList.toggle('hidden',!on);if(on)navigate('situation',false);}
function exportSchoolPassportV3(){const school=getVisibleSchools().find(s=>s.id===v3State.indicatorSchool);if(!school)return showToast('Сначала добавьте школу');const d=indicatorData(school);downloadCSV('cifrovoy_pasport_shkoly.csv',[['Цифровой паспорт'],['Школа',school.name],['Обучающиеся',d.students??''],['Классы',d.classes??''],['Педагоги',d.teachers??''],['Вакансии',d.vacancies??''],['Средний балл ГИА',d.gia??''],['Посещаемость',d.attendance??''],['Рейтинг',school.rating??'']]);showToast('Паспорт школы сформирован');}
function addCustomIndicatorV3(){const name=prompt('Название показателя:','Количество профильных классов');if(!name)return;const value=prompt('Текущее значение:','4');if(value===null)return;v3State.customIndicators.push({name,value});saveV3();renderIndicators();showToast('Показатель добавлен в реестр');}
function addInspectionV3(){if(isSchoolRole())return showToast('Назначать проверки может только РОО');const school=SCHOOLS[0];if(!school)return showToast('Сначала добавьте школу');const type=prompt('Вид проверки:','Тематическая проверка');if(!type)return;v3State.inspections.unshift({id:'i'+Date.now(),schoolId:school.id,school:school.name,type,date:'Сегодня',deadline:'Через 7 дней',violations:0,resolved:0,status:'planned',owner:state.currentUser.name});saveV3();renderInspections();showToast('Проверка запланирована');}
function addMeetingV3(){if(isSchoolRole())return showToast('Создавать совещания может РОО');const title=prompt('Название совещания:','Рабочее совещание');if(!title)return;v3State.meetings.push({id:'m'+Date.now(),day:'30',month:'ИЮЛ',time:'10:00',title,place:'Зал РОО',confirmed:0,total:0,status:'upcoming'});saveV3();renderMeetings();showToast('Совещание добавлено в календарь');}
function addAppealV3(){const title=prompt('Тема обращения:','Уточнение по поручению');if(!title)return;v3State.appeals.unshift({id:'A-'+(190+v3State.appeals.length),schoolId:state.currentUser?.schoolId||null,school:currentSchool()?.name||state.currentUser?.unit||'РОО',title,text:'Новое обращение, зарегистрированное в системе.',status:'new',priority:'Обычное',time:'Только что'});saveV3();renderAppeals();showToast('Обращение зарегистрировано');}
function addDocumentV3(){if(isSchoolRole())return showToast('Добавлять документы может только РОО');const title=prompt('Название документа:','Новый официальный документ');if(!title)return;v3State.documents.unshift({id:'d'+Date.now(),type:'PDF',category:'Приказы',number:'Новый',title,date:new Date().toLocaleDateString('ru-RU'),read:0,total:SCHOOLS.length,required:true});saveV3();renderDocuments();showToast('Документ добавлен в текущий браузер. Облачное хранение раздела будет подключено отдельно.');}
function addPersonalTaskV3(){const title=prompt('Название личной задачи:','Подготовить служебную записку');if(!title)return;v3State.personalTasks.unshift({id:'p'+Date.now(),title,source:'Личная задача',deadline:'Сегодня',priority:'normal',done:false});saveV3();renderPersonal();showToast('Личная задача добавлена');}
function saveDelegationV3(){const user=document.getElementById('delegationUser').value,from=document.getElementById('delegationFrom').value,to=document.getElementById('delegationTo').value;if(!user||!from||!to)return showToast('Заполните период и сотрудника');v3State.delegation={user,from,to,tasks:document.getElementById('delegationTasks').checked,approvals:document.getElementById('delegationApprovals').checked};saveV3();addAudit('Настроил временное замещение',USERS.find(u=>u.id===user)?.name||'Сотрудник','security');renderPersonal();showToast('Замещение сохранено');}
function convertProtocolV3(){showToast('Сначала добавьте реальные пункты протокола. Облачное создание поручений из протокола будет подключено отдельно.');}

// После загрузки V3 сразу применяет доступность модулей к уже отрисованному меню.
document.addEventListener('DOMContentLoaded',()=>{applyV3NavigationVisibility();renderV3();if(!v3State.updateDismissed)setTimeout(()=>document.getElementById('systemUpdateBanner')?.classList.remove('hidden'),450);});
