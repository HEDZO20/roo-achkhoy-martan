(() => {
'use strict';

const $ = (s,r=document) => r.querySelector(s);
const $$ = (s,r=document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = (v,withTime=false) => v ? new Date(v).toLocaleString('ru-RU',withTime?{}:{year:'numeric',month:'2-digit',day:'2-digit'}) : '—';
const isoLocal = (d) => { const x=new Date(d); x.setMinutes(x.getMinutes()-x.getTimezoneOffset()); return x.toISOString().slice(0,16); };
const fileSafe = (s) => String(s||'file').replace(/[^a-zа-я0-9._-]+/gi,'_');
const download = (blob,name) => { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); };

const ROLE_LABELS={pending:'Ожидает назначения',roo_head:'Начальник РОО',roo_deputy:'Заместитель начальника РОО',department_head:'Начальник отдела',department_staff:'Специалист отдела',school_director:'Директор школы',school_staff:'Сотрудник школы'};
const STATUS_LABELS={new:'Новое',in_progress:'В работе',director_review:'На проверке директора',roo_review:'На проверке РОО',accepted:'Принято',returned:'Возвращено',cancelled:'Отменено',draft:'Черновик',submitted:'Отправлено',active:'Активен',pending:'Ожидает',blocked:'Заблокирован',planned:'Запланировано',held:'Проведено',completed:'Завершено',answered:'Ответ дан',closed:'Закрыто',approved:'Утверждено'};
const PAGE_META={
 dashboard:['Главная','⌂'],tasks:['Поручения','✓'],schools:['Школы','▦'],rating:['Рейтинг','★'],exams:['Анализ экзаменов','▥'],departments:['Работа отделов','◫'],reports:['Отчёты','▤'],calendar:['Календарь','◷'],documents:['Документы','▣'],appeals:['Обращения','✉'],meetings:['Совещания','◉'],inspections:['Проверки','⌕'],users:['Пользователи и роли','♙'],audit:['Журнал действий','≡'],settings:['Настройки','⚙'],school:['Моя школа','▦'],pending:['Ожидание доступа','…']
};
const ROLE_MENUS={
 roo_head:['dashboard','tasks','schools','rating','exams','departments','reports','calendar','documents','appeals','meetings','inspections','users','audit','settings'],
 roo_deputy:['dashboard','tasks','schools','rating','exams','departments','reports','calendar','documents','appeals','meetings','inspections','users','audit'],
 department_head:['dashboard','tasks','schools','exams','departments','reports','calendar','documents','appeals','meetings','inspections'],
 department_staff:['dashboard','tasks','exams','reports','calendar','documents','appeals','meetings','inspections'],
 school_director:['dashboard','tasks','school','exams','reports','calendar','documents','appeals','inspections','users'],
 school_staff:['dashboard','tasks','school','exams','calendar','documents'],
 pending:['pending']
};

let sb=null,session=null,me=null,currentPage='dashboard';
let branding={logo_url:'',background:'#fff',padding:8,short_name:'Ачхой-Мартан',subtitle:'Отдел образования',full_name:'Отдел образования Ачхой-Мартановского района'};
let cache={schools:null,departments:null,profiles:null,analysis:null};

function toast(text,kind='normal',timeout=3500){const el=$('#toast');el.textContent=text;el.style.background=kind==='error'?'#9e3030':kind==='warn'?'#865e09':'#173d2d';el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),timeout)}
function badge(status){const cls=['returned','blocked','cancelled','closed'].includes(status)?'danger':['new','pending','planned','director_review','roo_review'].includes(status)?'warn':['accepted','active','completed','held','answered'].includes(status)?'success':'info';return `<span class="badge ${cls}">${esc(STATUS_LABELS[status]||status||'—')}</span>`}
function empty(title,text,action=''){return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`}
function modal(html,wide=true){$('#modalBody').innerHTML=html;$('.modal-box').classList.toggle('wide',wide);$('#modal').showModal()}
function closeModal(){if($('#modal').open)$('#modal').close();$('#modalBody').innerHTML=''}
function setBusy(btn,busy,text='Сохранение…'){if(!btn)return; if(busy){btn.dataset.old=btn.textContent;btn.textContent=text;btn.disabled=true}else{btn.textContent=btn.dataset.old||btn.textContent;btn.disabled=false}}
function initials(name){return String(name||'РОО').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'РОО'}
function isRoo(){return ['roo_head','roo_deputy'].includes(me?.role)}
function canCreateTasks(){return ['roo_head','roo_deputy','department_head'].includes(me?.role)}
function canManageUsers(){return isRoo()||me?.role==='school_director'}
function queryError(result){if(result?.error)throw result.error;return result?.data??result}
async function audit(action,entityType,entityId,details={}){try{await sb.from('audit_log').insert({user_id:me?.id,action,entity_type:entityType,entity_id:String(entityId||''),details})}catch(_){}}

async function boot(){
  try{
    const c=window.ROO_CONFIG||{};
    if(!window.supabase)throw new Error('Библиотека Supabase не загрузилась. Проверьте интернет или доступ к CDN.');
    if(!c.supabaseUrl||c.supabaseUrl.includes('YOUR-PROJECT'))throw new Error('Сайт не настроен: заполните config.js через установщик V28.3.');
    sb=window.supabase.createClient(c.supabaseUrl,c.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    bindBase();await loadBranding();await loadRegisterUnits();
    const {data}=await sb.auth.getSession(); session=data.session;
    if(session) await enter(session.user); else showAuth();
    sb.auth.onAuthStateChange(async(event,newSession)=>{session=newSession;if(event==='SIGNED_OUT')showAuth();});
  }catch(e){console.error(e);showAuth();$('#loginMessage').textContent=e.message}
}

function bindBase(){
  window.addEventListener('unhandledrejection',e=>{console.error(e.reason);toast(e.reason?.message||'Произошла ошибка','error')});
  $('#modalClose').onclick=closeModal;
  $('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal()});
  $('#menuBtn').onclick=()=>$('.sidebar').classList.toggle('open');
  $('#logout').onclick=async()=>{await sb.auth.signOut();me=null;cache={schools:null,departments:null,profiles:null,analysis:null};showAuth()};
  $('#notificationButton').onclick=showNotifications;
  $$('.tab[data-auth]').forEach(btn=>btn.onclick=()=>{$$('.tab[data-auth]').forEach(x=>x.classList.toggle('active',x===btn));$('#loginForm').hidden=btn.dataset.auth!=='login';$('#registerForm').hidden=btn.dataset.auth!=='register'});
  $('#loginForm').onsubmit=login;
  $('#registerForm').onsubmit=register;
  $('#forgotPassword').onclick=forgotPassword;
}

async function loadBranding(){
  try{const r=await sb.from('site_settings').select('value').eq('key','branding').maybeSingle();if(!r.error&&r.data?.value)branding={...branding,...r.data.value}}catch(_){ }
  applyBranding();
}
function applyBranding(){
  $('#authBrandTitle').textContent=branding.full_name||branding.short_name;
  $('#brandShortName').textContent=branding.short_name||'Ачхой-Мартан';$('#brandSubtitle').textContent=branding.subtitle||'Отдел образования';
  document.title=branding.full_name||'Система РОО';
  for(const [imgId,markId] of [['authBrandImage','authBrandMark'],['sideBrandImage','sideBrandMark']]){
    const img=$(`#${imgId}`),mark=$(`#${markId}`),fallback=$('.brand-fallback',mark); mark.style.background=branding.background||'#fff';mark.style.padding=`${Number(branding.padding)||8}px`;
    if(branding.logo_url){img.src=branding.logo_url;img.hidden=false;fallback.hidden=true;img.onerror=()=>{img.hidden=true;fallback.hidden=false}}else{img.hidden=true;fallback.hidden=false}
  }
}
function showAuth(){
  $('#app').hidden=true;$('#auth').hidden=false;$('#loginMessage').textContent='';
}
async function login(e){
  e.preventDefault();const btn=$('button[type="submit"]',e.currentTarget);setBusy(btn,true,'Входим…');$('#loginMessage').textContent='';
  try{
    const email=$('#loginEmail').value.trim(),password=$('#loginPassword').value;
    if(!email||!password)throw new Error('Введите почту и пароль.');
    const r=await sb.auth.signInWithPassword({email,password});if(r.error)throw r.error;session=r.data.session;await enter(r.data.user);$('#loginMessage').textContent='Вход выполнен.';
  }catch(err){console.error(err);$('#loginMessage').textContent=err.message==='Invalid login credentials'?'Неверная почта или пароль.':err.message}
  finally{setBusy(btn,false)}
}
async function register(e){
  e.preventDefault();const btn=$('button[type="submit"]',e.currentTarget);setBusy(btn,true,'Отправляем…');$('#registerMessage').textContent='';
  try{
    const email=$('#regEmail').value.trim(),password=$('#regPassword').value,full_name=$('#regName').value.trim(),phone=$('#regPhone').value.trim(),requested_unit_id=$('#regUnit').value||null,place=$('#regPlace').value;
    if(!full_name||!email||password.length<8)throw new Error('Заполните Ф.И.О., почту и пароль не короче 8 символов.');
    const r=await sb.auth.signUp({email,password,options:{data:{full_name,phone,requested_unit_id,place}}});if(r.error)throw r.error;
    $('#registerMessage').textContent='Заявка создана. Подтвердите почту, затем начальник РОО назначит вам роль.';e.currentTarget.reset();await loadRegisterUnits();
  }catch(err){$('#registerMessage').textContent=err.message}finally{setBusy(btn,false)}
}
async function forgotPassword(){
  const email=$('#loginEmail').value.trim();if(!email){$('#loginMessage').textContent='Сначала введите рабочую почту.';return}
  const r=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});$('#loginMessage').textContent=r.error?r.error.message:'Письмо для восстановления пароля отправлено.'
}
async function loadRegisterUnits(){
  if(!sb)return;try{const [d,s]=await Promise.all([sb.from('departments').select('id,name').order('name'),sb.from('schools').select('id,name').order('name')]);const place=$('#regPlace');const update=()=>{const rows=place.value==='school'?(s.data||[]):(d.data||[]);$('#regUnit').innerHTML='<option value="">Выберите организацию</option>'+rows.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')};place.onchange=update;update()}catch(_){ }
}

async function ensureProfile(user){
  let r=await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();
  if(r.error)throw r.error;
  if(!r.data){const ins=await sb.from('profiles').insert({id:user.id,email:user.email,full_name:user.user_metadata?.full_name||'',phone:user.user_metadata?.phone||'',role:'pending',status:'pending'}).select().single();if(ins.error)throw ins.error;r=ins}
  return r.data;
}
async function enter(user){
  me=await ensureProfile(user);$('#auth').hidden=true;$('#app').hidden=false;
  $('#userName').textContent=me.full_name||me.email;$('#userRole').textContent=ROLE_LABELS[me.role]||me.role;$('#avatar').textContent=initials(me.full_name||me.email);
  renderNav();await refreshNotifications();await navigate((ROLE_MENUS[me.role]||['pending'])[0]);
}
function renderNav(){const menu=ROLE_MENUS[me.role]||['pending'];$('#nav').innerHTML=menu.map(k=>`<button type="button" class="nav-btn" data-page="${k}"><span class="nav-icon">${PAGE_META[k]?.[1]||'•'}</span>${PAGE_META[k]?.[0]||k}</button>`).join('');$$('.nav-btn').forEach(b=>b.onclick=()=>navigate(b.dataset.page))}
async function navigate(page){
  currentPage=page;$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('#pageTitle').textContent=PAGE_META[page]?.[0]||page;$('#crumb').textContent=branding.short_name||'Рабочая система РОО';$('.sidebar').classList.remove('open');
  const fn={dashboard:renderDashboard,pending:renderPending,tasks:renderTasks,schools:renderSchools,school:renderMySchool,rating:renderRating,exams:renderExams,departments:renderDepartments,reports:renderReports,calendar:renderCalendar,documents:renderDocuments,appeals:renderAppeals,meetings:renderMeetings,inspections:renderInspections,users:renderUsers,audit:renderAudit,settings:renderSettings}[page]||renderDashboard;
  $('#content').innerHTML='<div class="empty">Загрузка…</div>';try{await fn()}catch(e){console.error(e);$('#content').innerHTML=empty('Раздел временно недоступен',e.message||'Ошибка загрузки')}
}
async function count(table,filter){let q=sb.from(table).select('*',{count:'exact',head:true});if(filter)q=filter(q);const r=await q;return r.error?0:(r.count||0)}
async function loadSchools(force=false){if(cache.schools&&!force)return cache.schools;const r=await sb.from('schools').select('*').order('name');queryError(r);cache.schools=r.data||[];return cache.schools}
async function loadDepartments(force=false){if(cache.departments&&!force)return cache.departments;const r=await sb.from('departments').select('*').order('name');queryError(r);cache.departments=r.data||[];return cache.departments}
async function loadProfiles(force=false){if(cache.profiles&&!force)return cache.profiles;const r=await sb.from('profiles').select('*,schools(name),departments(name)').order('created_at',{ascending:false});queryError(r);cache.profiles=r.data||[];return cache.profiles}

async function renderPending(){
  $('#content').innerHTML=`<div class="panel"><h3>Заявка принята</h3><p>Ваш аккаунт создан, но роль ещё не назначена.</p><div class="notice info">Начальник РОО должен открыть раздел «Пользователи и роли», выбрать вашу должность, школу или отдел и активировать доступ.</div><button id="pendingRefresh" class="primary" type="button">Проверить статус</button></div>`;
  $('#pendingRefresh').onclick=async()=>{me=await ensureProfile(session.user);if(me.status==='active'&&me.role!=='pending'){renderNav();navigate('dashboard')}else toast('Роль пока не назначена','warn')}
}

async function renderDashboard(){
  const [tasks,schools,docs,appeals,pending,notifications]=await Promise.all([count('tasks'),count('schools'),count('documents'),count('appeals',q=>q.neq('status','closed')),isRoo()?count('profiles',q=>q.eq('role','pending')):0,count('notifications',q=>q.eq('is_read',false))]);
  const due=await sb.from('task_recipients').select('id,status,tasks(title,due_at)').order('updated_at',{ascending:false}).limit(20);
  const recent=await sb.from('audit_log').select('action,entity_type,created_at,profiles(full_name)').order('created_at',{ascending:false}).limit(8);
  $('#content').innerHTML=`<div class="grid cols-4">
    <article class="panel stat"><b>${tasks||'—'}</b><small>Поручения</small></article><article class="panel stat"><b>${schools||'—'}</b><small>Школы</small></article><article class="panel stat"><b>${docs||'—'}</b><small>Документы</small></article><article class="panel stat"><b>${appeals||'—'}</b><small>Открытые обращения</small></article>
  </div><div class="split" style="margin-top:17px"><article class="panel"><div class="section-title"><h3>Что требует внимания</h3></div>${pending?`<div class="notice warn">Пользователей без роли: <b>${pending}</b>. <button class="link-btn" data-go="users">Открыть</button></div>`:''}${notifications?`<div class="notice info">Непрочитанных уведомлений: <b>${notifications}</b>.</div>`:''}${(due.data||[]).length?`<div class="metric-list">${due.data.map(x=>`<div class="metric-row"><span>${esc(x.tasks?.title||'Поручение')}</span>${badge(x.status)}</div>`).join('')}</div>`:empty('Нет срочных пунктов','Новые поручения и сроки появятся здесь.')}</article><article class="panel"><h3>Последние действия</h3>${(recent.data||[]).length?`<div class="timeline">${recent.data.map(x=>`<div class="timeline-item"><i></i><div><b>${esc(x.action)}</b><div class="small">${esc(x.profiles?.full_name||'Система')} · ${fmtDate(x.created_at,true)}</div></div></div>`).join('')}</div>`:empty('Журнал пуст','Действия пользователей появятся после работы в системе.')}</article></div>`;
  $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
}

// -------------------- ПОРУЧЕНИЯ --------------------
async function renderTasks(){
  let q=sb.from('tasks').select('*,profiles!tasks_created_by_fkey(full_name),task_recipients(id,status,school_id,department_id,updated_at,schools(name),departments(name))').order('created_at',{ascending:false});
  const r=await q;queryError(r);const rows=r.data||[];
  $('#content').innerHTML=`<div class="toolbar"><div class="filters"><select id="taskStatusFilter"><option value="">Все статусы</option>${Object.entries(STATUS_LABELS).filter(([k])=>['new','in_progress','director_review','roo_review','accepted','returned'].includes(k)).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><input id="taskSearch" placeholder="Поиск по названию"></div><div class="actions">${canCreateTasks()?'<button id="newTask" class="primary" type="button">+ Новое поручение</button>':''}</div></div><div id="tasksList"></div>`;
  const draw=()=>{const s=$('#taskSearch').value.toLowerCase(),f=$('#taskStatusFilter').value;const filtered=rows.filter(t=>(!s||`${t.title} ${t.description||''}`.toLowerCase().includes(s))&&(!f||(t.task_recipients||[]).some(x=>x.status===f)));$('#tasksList').innerHTML=filtered.length?`<div class="cards">${filtered.map(t=>{const rs=t.task_recipients||[],acc=rs.filter(x=>x.status==='accepted').length,over=rs.filter(x=>t.due_at&&new Date(t.due_at)<new Date()&&!['accepted','cancelled'].includes(x.status)).length;return `<article class="entity-card row-click" data-task="${t.id}"><div class="section-title"><h4>${esc(t.title)}</h4>${badge(t.status)}</div><p>${esc((t.description||'').slice(0,170))}</p><div class="metric-row"><span>Получателей</span><b>${rs.length||1}</b></div><div class="metric-row"><span>Принято</span><b>${acc}</b></div><div class="metric-row"><span>Просрочено</span><b class="${over?'rating-bad':''}">${over}</b></div><div class="small">Срок: ${fmtDate(t.due_at,true)} · ${esc(t.profiles?.full_name||'')}</div></article>`}).join('')}</div>`:empty('Поручений нет','Создайте первое поручение или измените фильтр.');$$('[data-task]').forEach(x=>x.onclick=()=>openTask(x.dataset.task));};
  draw();$('#taskSearch').oninput=draw;$('#taskStatusFilter').onchange=draw;if($('#newTask'))$('#newTask').onclick=openTaskCreate;
}
async function openTaskCreate(){
  const [schools,deps]=await Promise.all([loadSchools(),loadDepartments()]);
  modal(`<h2>Новое поручение</h2><div class="grid cols-2"><label>Название<input id="taskTitle"></label><label>Категория<select id="taskCategory"><option>Отчётность</option><option>Экзамены</option><option>Воспитательная работа</option><option>Хозяйственная работа</option><option>Проверка</option><option>Другое</option></select></label><label>Приоритет<select id="taskPriority"><option value="normal">Обычный</option><option value="high">Высокий</option><option value="urgent">Срочный</option></select></label><label>Срок<input id="taskDue" type="datetime-local"></label></div><label>Описание<textarea id="taskDescription"></textarea></label><label>Что обязательно приложить / заполнить<textarea id="taskInstructions"></textarea></label><div class="grid cols-2"><label>Кому<select id="taskTargetType"><option value="all_schools">Всем школам</option><option value="school">Одной школе</option><option value="department">Отделу РОО</option></select></label><label>Получатель<select id="taskTarget"></select></label></div><label><input id="taskDirectorApproval" type="checkbox" checked style="width:auto"> Требуется подтверждение директора школы</label><div class="form-actions"><button id="saveTask" class="primary" type="button">Создать поручение</button><button class="ghost" type="button" data-close>Отмена</button></div>`);
  const type=$('#taskTargetType'),target=$('#taskTarget');const fill=()=>{if(type.value==='all_schools'){target.innerHTML='<option value="all">Все школы района</option>';target.disabled=true}else{target.disabled=false;const rows=type.value==='school'?schools:deps;target.innerHTML=rows.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}};type.onchange=fill;fill();$('[data-close]').onclick=closeModal;$('#saveTask').onclick=saveNewTask;
}
async function saveNewTask(){
  const btn=$('#saveTask');setBusy(btn,true);try{
    const title=$('#taskTitle').value.trim();if(!title)throw new Error('Введите название поручения.');const type=$('#taskTargetType').value,due=$('#taskDue').value?new Date($('#taskDue').value).toISOString():null;
    const payload={title,description:$('#taskDescription').value.trim(),instructions:$('#taskInstructions').value.trim(),category:$('#taskCategory').value,priority:$('#taskPriority').value,due_at:due,created_by:me.id,updated_by:me.id,requires_director_approval:$('#taskDirectorApproval').checked,assigned_to_all_schools:type==='all_schools'};
    if(type==='school')payload.assigned_school_id=$('#taskTarget').value;if(type==='department')payload.assigned_department_id=$('#taskTarget').value;
    const t=queryError(await sb.from('tasks').insert(payload).select().single());let recipients=[];
    if(type==='all_schools'){const schools=await loadSchools();recipients=schools.map(s=>({task_id:t.id,school_id:s.id,status:'new'}))}else if(type==='school')recipients=[{task_id:t.id,school_id:$('#taskTarget').value,status:'new'}];else recipients=[{task_id:t.id,department_id:$('#taskTarget').value,status:'new'}];
    if(recipients.length)queryError(await sb.from('task_recipients').insert(recipients));
    await sb.from('notifications').insert(recipients.map(x=>({school_id:x.school_id||null,department_id:x.department_id||null,title:'Новое поручение',body:title,link_page:'tasks',entity_id:t.id})));
    await audit('Создано поручение','task',t.id,{title,recipients:recipients.length});closeModal();toast('Поручение создано');renderTasks();
  }catch(e){toast(e.message,'error')}finally{setBusy(btn,false)}
}
async function openTask(id){
  const t=queryError(await sb.from('tasks').select('*,profiles!tasks_created_by_fkey(full_name),task_recipients(*,schools(name),departments(name))').eq('id',id).single());
  let recipient=me._viewRecipient||(t.task_recipients||[]).find(r=>(me.school_id&&r.school_id===me.school_id)||(me.department_id&&r.department_id===me.department_id));if(isRoo()&&!recipient)recipient=(t.task_recipients||[])[0];
  const rid=recipient?.id;const [responses,comments,files]=await Promise.all([rid?sb.from('task_responses').select('*,profiles!task_responses_author_id_fkey(full_name)').eq('task_id',id).order('created_at',{ascending:false}):Promise.resolve({data:[]}),rid?sb.from('task_comments').select('*,profiles(full_name)').eq('task_id',id).order('created_at'):Promise.resolve({data:[]}),sb.from('attachments').select('*').eq('entity_type','task').eq('entity_id',id).order('created_at')]);
  const statuses=['new','in_progress','director_review','roo_review','accepted'];const active=statuses.indexOf(recipient?.status||t.status);
  const recipientOptions=isRoo()?`<label>Получатель<select id="taskRecipientSelect">${(t.task_recipients||[]).map(r=>`<option value="${r.id}" ${r.id===rid?'selected':''}>${esc(r.schools?.name||r.departments?.name||'Получатель')} — ${esc(STATUS_LABELS[r.status]||r.status)}</option>`).join('')}</select></label>`:'';
  modal(`<div class="section-title"><div><span class="badge">${esc(t.category||'Поручение')}</span><h2>${esc(t.title)}</h2></div>${badge(recipient?.status||t.status)}</div><p>${esc(t.description||'')}</p>${t.instructions?`<div class="notice info"><b>Обязательные требования</b><br>${esc(t.instructions)}</div>`:''}<div class="small">Срок: ${fmtDate(t.due_at,true)} · Автор: ${esc(t.profiles?.full_name||'')}</div>${recipientOptions}<div class="workflow">${statuses.map((s,i)=>`<div class="workflow-step ${i<active?'done':i===active?'active':''}">${STATUS_LABELS[s]}</div>`).join('')}</div><div class="split"><div><div class="panel" style="box-shadow:none"><h3>Ответ и файлы</h3><label>Текст ответа<textarea id="taskResponseText">${esc(responses.data?.[0]?.response_text||responses.data?.[0]?.text||'')}</textarea></label><label>Приложить файлы<input id="taskFiles" type="file" multiple></label><div class="file-list">${(files.data||[]).map(f=>`<div class="file-item"><span>📎 ${esc(f.file_name)}</span><button type="button" class="link-btn" data-download="${f.id}">Открыть</button></div>`).join('')||'<span class="small">Файлов пока нет</span>'}</div><div class="form-actions" style="margin-top:14px">${taskActionButtons(t,recipient)}</div></div><div class="panel" style="box-shadow:none;margin-top:14px"><h3>Комментарии</h3><div class="timeline">${(comments.data||[]).map(c=>`<div class="timeline-item"><i></i><div><b>${esc(c.profiles?.full_name||'Пользователь')}</b><p>${esc(c.message)}</p><small>${fmtDate(c.created_at,true)}</small></div></div>`).join('')||'<span class="small">Комментариев пока нет</span>'}</div><div class="inline-actions"><input id="taskComment" placeholder="Добавить комментарий"><button id="addTaskComment" class="secondary" type="button">Отправить</button></div></div></div><aside><div class="panel" style="box-shadow:none"><h3>Получатели</h3>${(t.task_recipients||[]).map(r=>`<div class="metric-row"><span>${esc(r.schools?.name||r.departments?.name||'')}</span>${badge(r.status)}</div>`).join('')}</div><div class="panel" style="box-shadow:none;margin-top:14px"><h3>Версии ответа</h3>${(responses.data||[]).map(r=>`<div class="notice"><b>Версия ${r.version_no||1}</b><div class="small">${esc(r.profiles?.full_name||'')} · ${fmtDate(r.created_at,true)}</div></div>`).join('')||'<span class="small">Нет сохранённых версий</span>'}</div></aside></div>`);
  if($('#taskRecipientSelect'))$('#taskRecipientSelect').onchange=()=>openTaskRecipient(t,$('#taskRecipientSelect').value);
  bindTaskActions(t,recipient);$('#addTaskComment').onclick=()=>addTaskComment(t.id,recipient?.id);$$('[data-download]').forEach(b=>b.onclick=()=>downloadAttachment(b.dataset.download));
}
async function openTaskRecipient(t,rid){const r=(t.task_recipients||[]).find(x=>x.id===rid);if(r){me._viewRecipient=r;await openTask(t.id);delete me._viewRecipient}}
function taskActionButtons(t,r){if(!r)return isRoo()?'<span class="small">Выберите получателя.</span>':'';const s=r.status;let html='<button id="saveTaskDraft" class="ghost" type="button">Сохранить черновик</button>';if(['school_staff','school_director','department_staff','department_head'].includes(me.role)){if(s==='new')html+='<button id="acceptTask" class="secondary" type="button">Принять в работу</button>';if(['new','in_progress','returned'].includes(s))html+='<button id="submitTask" class="primary" type="button">Отправить ответ</button>';if(me.role==='school_director'&&s==='director_review')html+='<button id="directorApprove" class="primary" type="button">Подтвердить директором</button><button id="directorReturn" class="danger" type="button">Вернуть сотруднику</button>'}if(isRoo()&&s==='roo_review')html+='<button id="rooAccept" class="primary" type="button">Принять отчёт</button><button id="rooReturn" class="danger" type="button">Вернуть на исправление</button>';return html}
function bindTaskActions(t,r){if(!r)return;const action=async(status,comment='')=>{try{await saveTaskResponse(t,r,false);const upd={status,last_comment:comment||null};if(status==='in_progress'){upd.accepted_at=new Date().toISOString();upd.accepted_by=me.id}if(status==='director_review')upd.submitted_at=new Date().toISOString();if(status==='roo_review'){upd.director_reviewed_at=new Date().toISOString();upd.director_reviewed_by=me.id}if(status==='accepted'){upd.roo_reviewed_at=new Date().toISOString();upd.roo_reviewed_by=me.id;upd.completed_at=new Date().toISOString()}queryError(await sb.from('task_recipients').update(upd).eq('id',r.id));await audit('Изменён статус поручения','task',t.id,{status,recipient:r.id});toast('Статус обновлён');openTask(t.id)}catch(e){toast(e.message,'error')}};if($('#saveTaskDraft'))$('#saveTaskDraft').onclick=()=>saveTaskResponse(t,r,true);if($('#acceptTask'))$('#acceptTask').onclick=()=>action('in_progress');if($('#submitTask'))$('#submitTask').onclick=()=>action((r.school_id&&t.requires_director_approval&&me.role!=='school_director')?'director_review':'roo_review');if($('#directorApprove'))$('#directorApprove').onclick=()=>action('roo_review');if($('#directorReturn'))$('#directorReturn').onclick=()=>action('returned','Возвращено директором');if($('#rooAccept'))$('#rooAccept').onclick=()=>action('accepted');if($('#rooReturn'))$('#rooReturn').onclick=()=>{const c=prompt('Причина возврата:')||'Требуется исправление';action('returned',c)}}
async function saveTaskResponse(t,r,notify=true){const text=$('#taskResponseText').value.trim();let prevQuery=sb.from('task_responses').select('version_no').eq('task_id',t.id);prevQuery=r.school_id?prevQuery.eq('school_id',r.school_id):prevQuery.eq('department_id',r.department_id);const prev=await prevQuery.order('version_no',{ascending:false}).limit(1);const version=(prev.data?.[0]?.version_no||0)+1;queryError(await sb.from('task_responses').insert({task_id:t.id,author_id:me.id,school_id:r.school_id||null,department_id:r.department_id||null,text,response_text:text,status:'draft',version_no:version}));const files=[...($('#taskFiles')?.files||[])];for(const file of files)await uploadAttachment('task',t.id,file);if(notify)toast('Черновик сохранён')}
async function addTaskComment(taskId,recipientId){const message=$('#taskComment').value.trim();if(!message)return;queryError(await sb.from('task_comments').insert({task_id:taskId,recipient_id:recipientId||null,author_id:me.id,message}));await audit('Добавлен комментарий','task',taskId,{message});openTask(taskId)}
async function uploadAttachment(entityType,entityId,file){const path=`${entityType}/${entityId}/${me.id}/${Date.now()}-${fileSafe(file.name)}`;const up=await sb.storage.from('roo-documents').upload(path,file,{upsert:false});if(up.error)throw up.error;queryError(await sb.from('attachments').insert({entity_type:entityType,entity_id:entityId,bucket_id:'roo-documents',storage_path:path,file_name:file.name,mime_type:file.type,size_bytes:file.size,uploaded_by:me.id}))}
async function downloadAttachment(id){const r=queryError(await sb.from('attachments').select('*').eq('id',id).single());const d=await sb.storage.from(r.bucket_id).download(r.storage_path);if(d.error)throw d.error;download(d.data,r.file_name)}

// -------------------- ШКОЛЫ И РЕЙТИНГ --------------------
function schoolPercent(s){const fields=['name','short_name','locality','address','phone','email','director_name','students_total','classes_total','teachers_total','grade9_students','grade11_students','capacity','responsible_name'];return Math.round(fields.filter(k=>s[k]!==null&&s[k]!==undefined&&String(s[k]).trim()!=='').length/fields.length*100)}
async function renderSchools(){const schools=await loadSchools(true);$('#content').innerHTML=`<div class="toolbar"><div class="filters"><input id="schoolSearch" placeholder="Поиск школы"></div><div class="actions">${isRoo()?'<button id="addSchool" class="primary" type="button">+ Добавить школу</button>':''}</div></div><div id="schoolCards"></div>`;const draw=()=>{const s=$('#schoolSearch').value.toLowerCase(),rows=schools.filter(x=>!s||`${x.name} ${x.locality||''}`.toLowerCase().includes(s));$('#schoolCards').innerHTML=rows.length?`<div class="cards">${rows.map(x=>`<article class="entity-card row-click" data-school="${x.id}"><div class="section-title"><h4>${esc(x.name)}</h4>${badge(x.profile_status)}</div><p>${esc(x.locality||'Населённый пункт не указан')}</p><div class="metric-row"><span>Ученики</span><b>${x.students_total??'—'}</b></div><div class="metric-row"><span>Педагоги</span><b>${x.teachers_total??'—'}</b></div><div class="small">Паспорт заполнен на ${schoolPercent(x)}%</div><div class="progress"><i style="width:${schoolPercent(x)}%"></i></div></article>`).join('')}</div>`:empty('Школы не найдены','Измените поиск или добавьте школу.');$$('[data-school]').forEach(b=>b.onclick=()=>openSchool(b.dataset.school));};draw();$('#schoolSearch').oninput=draw;if($('#addSchool'))$('#addSchool').onclick=()=>openSchool(null)}
async function renderMySchool(){if(!me.school_id){$('#content').innerHTML=empty('Школа не назначена','Начальник РОО должен привязать ваш профиль к школе.');return}const s=queryError(await sb.from('schools').select('*').eq('id',me.school_id).single());$('#content').innerHTML=`<div class="toolbar"><div><h3 style="margin:0">${esc(s.name)}</h3><p class="small">Паспорт заполнен на ${schoolPercent(s)}%. Статус: ${esc(STATUS_LABELS[s.profile_status]||s.profile_status)}</p></div><button id="editMySchool" class="primary" type="button">Открыть паспорт</button></div><div class="grid cols-4"><article class="panel stat"><b>${s.students_total??'—'}</b><small>Учеников</small></article><article class="panel stat"><b>${s.teachers_total??'—'}</b><small>Педагогов</small></article><article class="panel stat"><b>${s.classes_total??'—'}</b><small>Классов</small></article><article class="panel stat"><b>${s.capacity??'—'}</b><small>Вместимость</small></article></div><div class="panel" style="margin-top:17px"><h3>Основные сведения</h3><div class="metric-list"><div class="metric-row"><span>Директор</span><b>${esc(s.director_name||'—')}</b></div><div class="metric-row"><span>Адрес</span><b>${esc(s.address||'—')}</b></div><div class="metric-row"><span>Ответственный</span><b>${esc(s.responsible_name||'—')}</b></div></div></div>`;$('#editMySchool').onclick=()=>openSchool(me.school_id,true)}
async function openSchool(id,own=false){let s=id?queryError(await sb.from('schools').select('*').eq('id',id).single()):{};const history=id?await sb.from('school_history').select('*,profiles(full_name)').eq('school_id',id).order('created_at',{ascending:false}).limit(10):{data:[]};const editable=isRoo()||(me.role==='school_director'&&me.school_id===id);const f=(key,label,type='text')=>`<label>${label}<input data-school-field="${key}" type="${type}" value="${esc(s[key]??'')}" ${editable?'':'disabled'}></label>`;const c=(key,label)=>`<label><input data-school-check="${key}" type="checkbox" ${s[key]?'checked':''} ${editable?'':'disabled'} style="width:auto"> ${label}</label>`;modal(`<div class="section-title"><div><h2>${esc(s.name||'Новая школа')}</h2><span class="small">Заполненность паспорта: ${schoolPercent(s)}%</span></div>${s.profile_status?badge(s.profile_status):''}</div><div class="tabs" id="schoolTabs"><button type="button" class="tab active" data-stab="main">Основное</button><button type="button" class="tab" data-stab="students">Ученики</button><button type="button" class="tab" data-stab="infra">Инфраструктура</button><button type="button" class="tab" data-stab="history">История</button></div><section data-sp="main"><div class="grid cols-2">${f('name','Полное название')}${f('short_name','Краткое название')}${f('locality','Населённый пункт')}${f('address','Адрес')}${f('phone','Телефон')}${f('email','Электронная почта','email')}${f('website','Сайт')}${f('director_name','Ф.И.О. директора')}${f('deputy_names','Заместители')}${f('responsible_name','Ответственный за отчётность')}${f('responsible_phone','Телефон ответственного')}</div></section><section data-sp="students" hidden><div class="grid cols-3">${f('students_total','Всего учеников','number')}${f('classes_total','Количество классов','number')}${f('teachers_total','Педагогов','number')}${[1,2,3,4,5,6,7,8,9,10,11].map(n=>f(`grade${n}_students`,`${n} класс`, 'number')).join('')}</div></section><section data-sp="infra" hidden><div class="grid cols-2">${f('capacity','Проектная вместимость','number')}${f('shifts_count','Количество смен','number')}${f('internet_quality','Качество интернета')}${f('building_condition','Состояние здания')}${c('has_meals','Организовано питание')}${c('has_transport','Есть школьный транспорт')}</div><label>Примечание<textarea data-school-field="notes" ${editable?'':'disabled'}>${esc(s.notes||'')}</textarea></label></section><section data-sp="history" hidden>${(history.data||[]).length?`<div class="timeline">${history.data.map(h=>`<div class="timeline-item"><i></i><div><b>${esc(h.action)}</b><div class="small">${esc(h.profiles?.full_name||'')} · ${fmtDate(h.created_at,true)}</div></div></div>`).join('')}</div>`:empty('История пуста','Изменения паспорта появятся здесь.')}</section>${editable?`<div class="form-actions" style="margin-top:18px"><button id="saveSchool" class="primary" type="button">Сохранить</button>${me.role==='school_director'?'<button id="submitSchool" class="secondary" type="button">Отправить на утверждение</button>':''}${isRoo()&&id?'<button id="approveSchool" class="secondary" type="button">Утвердить паспорт</button>':''}</div>`:''}`);
  $$('#schoolTabs [data-stab]').forEach(b=>b.onclick=()=>{$$('#schoolTabs [data-stab]').forEach(x=>x.classList.toggle('active',x===b));$$('[data-sp]').forEach(p=>p.hidden=p.dataset.sp!==b.dataset.stab)});if($('#saveSchool'))$('#saveSchool').onclick=()=>saveSchool(id,s);if($('#submitSchool'))$('#submitSchool').onclick=()=>saveSchool(id,s,'submitted');if($('#approveSchool'))$('#approveSchool').onclick=()=>saveSchool(id,s,'approved');
}
async function saveSchool(id,old,status){try{const payload={};$$('[data-school-field]').forEach(i=>payload[i.dataset.schoolField]=i.type==='number'?(i.value===''?null:Number(i.value)):i.value.trim());$$('[data-school-check]').forEach(i=>payload[i.dataset.schoolCheck]=i.checked);if(status)payload.profile_status=status;if(status==='approved'){payload.approved_by=me.id;payload.approved_at=new Date().toISOString()}let result;if(id)result=await sb.from('schools').update(payload).eq('id',id).select().single();else result=await sb.from('schools').insert(payload).select().single();const saved=queryError(result);await sb.from('school_history').insert({school_id:saved.id,changed_by:me.id,action:status==='approved'?'Паспорт утверждён':status==='submitted'?'Паспорт отправлен на утверждение':'Паспорт школы обновлён',snapshot:saved});await audit('Изменён паспорт школы','school',saved.id,{status:status||'saved'});cache.schools=null;toast('Данные школы сохранены');closeModal();if(currentPage==='schools')renderSchools();else renderMySchool()}catch(e){toast(e.message,'error')}}
async function renderRating(){const r=await sb.from('school_performance_v27').select('*').order('rating',{ascending:false,nullsFirst:false});queryError(r);const rows=r.data||[];$('#content').innerHTML=`<div class="panel"><div class="section-title"><div><h3>Рейтинг школ</h3><p class="small">Рассчитывается только при наличии поручений: принятые ответы повышают показатель, возвраты и просрочки снижают.</p></div><button id="ratingCsv" class="secondary" type="button">Скачать CSV</button></div><div class="table-wrap"><table><thead><tr><th>№</th><th>Школа</th><th>Поручений</th><th>Принято</th><th>Возвратов</th><th>Просрочено</th><th>Рейтинг</th></tr></thead><tbody>${rows.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.school_name)}</td><td>${x.assigned_count}</td><td>${x.accepted_count}</td><td>${x.returned_count}</td><td>${x.overdue_count}</td><td>${x.rating==null?'—':`<b class="${x.rating>=80?'rating-good':x.rating>=60?'rating-mid':'rating-bad'}">${x.rating}%</b>`}</td></tr>`).join('')}</tbody></table></div></div>`;$('#ratingCsv').onclick=()=>download(new Blob(['Школа;Поручений;Принято;Возвратов;Просрочено;Рейтинг\n'+rows.map(x=>[x.school_name,x.assigned_count,x.accepted_count,x.returned_count,x.overdue_count,x.rating??''].join(';')).join('\n')],{type:'text/csv;charset=utf-8'}),'Рейтинг_школ.csv')}

// -------------------- ЭКЗАМЕНЫ --------------------
async function renderExams(){const docs=await sb.from('exam_documents').select('*').order('created_at',{ascending:false});queryError(docs);$('#content').innerHTML=`<div class="toolbar"><div><h3 style="margin:0">Анализ экзаменационных документов</h3><p class="small">DOCX, XLSX, XLS и CSV. Документ анализируется целиком, ошибки отдельных строк не сбрасывают результат.</p></div><div class="actions"><button id="examUpload" class="primary" type="button">+ Загрузить документ</button><button id="examHistory" class="secondary" type="button">История</button></div></div><div class="grid cols-4"><article class="panel stat"><b>${docs.data.length||'—'}</b><small>Документов</small></article><article class="panel stat"><b>${docs.data.reduce((a,x)=>a+(x.tables_count||0),0)||'—'}</b><small>Распознано таблиц</small></article><article class="panel stat"><b>${docs.data.reduce((a,x)=>a+(x.subjects_count||0),0)||'—'}</b><small>Предметных разделов</small></article><article class="panel stat"><b>${docs.data.reduce((a,x)=>a+(x.warnings_count||0),0)||'—'}</b><small>Замечаний к данным</small></article></div><div class="panel" style="margin-top:17px">${docs.data.length?`<div class="table-wrap"><table><thead><tr><th>Документ</th><th>Год</th><th>Экзамен</th><th>Таблиц</th><th>Проблем</th><th>Дата</th></tr></thead><tbody>${docs.data.map(x=>`<tr class="row-click" data-exam-doc="${x.id}"><td>${esc(x.title||x.file_name)}</td><td>${esc(x.academic_year||'—')}</td><td>${esc(x.exam_type||'—')}</td><td>${x.tables_count}</td><td>${x.warnings_count}</td><td>${fmtDate(x.created_at,true)}</td></tr>`).join('')}</tbody></table></div>`:empty('Документы ещё не загружены','Загрузите аналитическую справку ГИА, таблицу Excel или CSV.')}</div>`;$('#examUpload').onclick=openExamWizard;$('#examHistory').onclick=()=>showExamHistory(docs.data);$$('[data-exam-doc]').forEach(x=>x.onclick=()=>openSavedAnalysis(x.dataset.examDoc))}
function openExamWizard(){modal(`<h2>Загрузка и анализ документа</h2><div class="steps"><div class="step active">1. Файл</div><div class="step">2. Распознавание</div><div class="step">3. Проверка</div><div class="step">4. Сохранение</div></div><div class="drop"><input id="examFile" type="file" accept=".docx,.xlsx,.xls,.csv"><p>Поддерживаются DOCX с таблицами и текстом, Excel и CSV.</p></div><div class="grid cols-2"><label>Учебный год<input id="examYear" value="2025/2026"></label><label>Тип экзамена<select id="examType"><option>ГИА</option><option>ЕГЭ</option><option>ОГЭ</option><option>ГВЭ</option></select></label></div><div class="form-actions"><button id="analyzeExam" class="primary" type="button">Проанализировать</button></div><div id="examPreview"></div>`);$('#analyzeExam').onclick=analyzeExamFile}
async function analyzeExamFile(){const file=$('#examFile').files[0];if(!file){toast('Выберите файл','warn');return}const btn=$('#analyzeExam');setBusy(btn,true,'Анализируем…');try{if(!window.ROOAnalysisEngine)throw new Error('Модуль анализа не загрузился.');const extracted=await window.ROOAnalysisEngine.extractFile(file);const analysis=window.ROOAnalysisEngine.analyze({...extracted,fileName:file.name,academicYear:$('#examYear').value,examType:$('#examType').value});analysis.meta={...(analysis.meta||{}),fileName:file.name,academicYear:$('#examYear').value,examType:$('#examType').value,title:analysis.meta?.title||file.name,createdAt:new Date().toISOString()};cache.analysis={analysis,file};$('#examPreview').innerHTML=`<div class="analysis-shell">${window.ROOAnalysisEngine.renderDashboard(analysis)}</div><div class="form-actions" style="margin-top:15px"><button id="saveExamAnalysis" class="primary" type="button">Сохранить анализ</button><button id="exportExamDocx" class="secondary" type="button">Скачать DOCX</button><button id="exportExamXlsx" class="secondary" type="button">Скачать Excel</button></div>`;window.ROOAnalysisEngine.bindDashboard($('#examPreview'));$('#saveExamAnalysis').onclick=saveExamAnalysis;$('#exportExamDocx').onclick=()=>exportAnalysisDocx(analysis);$('#exportExamXlsx').onclick=()=>exportAnalysisXlsx(analysis)}catch(e){console.error(e);toast(e.message,'error')}finally{setBusy(btn,false)}}
async function saveExamAnalysis(){const {analysis,file}=cache.analysis||{};if(!analysis)return;const path=`exam-analysis/${me.id}/${Date.now()}-${fileSafe(file.name)}`;let storagePath='';const up=await sb.storage.from('roo-exam-analysis').upload(path,file);if(!up.error)storagePath=path;const payload={file_name:file.name,title:analysis.meta?.title||file.name,academic_year:analysis.meta?.academicYear,exam_type:analysis.meta?.examType,storage_path:storagePath,analysis_json:analysis,tables_count:analysis.tables?.length||0,subjects_count:analysis.subjectResults?.length||0,warnings_count:analysis.warnings?.length||0,created_by:me.id};queryError(await sb.from('exam_documents').insert(payload));await audit('Загружен анализ экзаменов','exam_document','',{file:file.name});toast('Анализ сохранён');closeModal();renderExams()}
async function openSavedAnalysis(id){const x=queryError(await sb.from('exam_documents').select('*').eq('id',id).single());const a=x.analysis_json;if(!a||!Object.keys(a).length){toast('В документе нет сохранённого анализа','warn');return}modal(`<div id="savedAnalysis" class="analysis-shell">${window.ROOAnalysisEngine.renderDashboard(a)}</div><div class="form-actions"><button id="savedDocx" class="primary" type="button">Скачать DOCX</button><button id="savedXlsx" class="secondary" type="button">Скачать Excel</button>${isRoo()?'<button id="deleteExam" class="danger" type="button">Удалить</button>':''}</div>`);window.ROOAnalysisEngine.bindDashboard($('#savedAnalysis'));$('#savedDocx').onclick=()=>exportAnalysisDocx(a);$('#savedXlsx').onclick=()=>exportAnalysisXlsx(a);if($('#deleteExam'))$('#deleteExam').onclick=async()=>{if(confirm('Удалить этот анализ?')){await sb.from('exam_documents').delete().eq('id',id);closeModal();renderExams()}}}
function showExamHistory(rows){modal(`<h2>История анализов</h2><div class="table-wrap"><table><thead><tr><th>Файл</th><th>Год</th><th>Тип</th><th>Таблиц</th><th>Замечаний</th><th>Дата</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.file_name)}</td><td>${esc(x.academic_year||'')}</td><td>${esc(x.exam_type||'')}</td><td>${x.tables_count}</td><td>${x.warnings_count}</td><td>${fmtDate(x.created_at,true)}</td></tr>`).join('')}</tbody></table></div>`)}
async function exportAnalysisDocx(a){if(window.ROODocxExporter)await window.ROODocxExporter.export(a,branding,`Анализ_${fileSafe(a.meta?.academicYear||'ГИА')}.docx`);else download(new Blob([makeAnalysisHtml(a)],{type:'application/msword'}),'Анализ.doc')}
function exportAnalysisXlsx(a){if(!window.XLSX){toast('Модуль Excel не загрузился','error');return}const wb=XLSX.utils.book_new();const subjects=(a.subjectResults||[]).map(x=>({Предмет:x.subject,Участников:x.totals?.total||0,'5':x.totals?.count5||0,'4':x.totals?.count4||0,'3':x.totals?.count3||0,'2':x.totals?.count2||0,Сдали:x.totals?.passed||0,'Не сдали':x.totals?.failed||0,'Качество знаний':x.totals?.quality??'',Успеваемость:x.totals?.success??'','Средний балл':x.totals?.avg??''}));XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(subjects),'Предметы');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(a.schoolRanking||[]),'Школы');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(a.highScores||[]),'Высокие баллы');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet((a.warnings||[]).map(x=>({Проблема:typeof x==='string'?x:x.message||JSON.stringify(x)}))),'Проверка данных');XLSX.writeFile(wb,`Анализ_${fileSafe(a.meta?.academicYear||'ГИА')}.xlsx`)}
function makeAnalysisHtml(a){return `<!doctype html><meta charset="utf-8"><h1>${esc(a.meta?.title||'Анализ экзаменов')}</h1>${window.ROOAnalysisEngine.renderDashboard(a)}`}

// -------------------- ОТДЕЛЫ --------------------
async function renderDepartments(){const [deps,perf,profiles]=await Promise.all([loadDepartments(true),sb.from('department_performance_v27').select('*'),loadProfiles(true)]);const map=new Map((perf.data||[]).map(x=>[x.department_id,x]));$('#content').innerHTML=`<div class="cards">${deps.map(d=>{const p=map.get(d.id)||{},staff=profiles.filter(x=>x.department_id===d.id);return `<article class="entity-card"><div class="section-title"><h4>${esc(d.name)}</h4><span class="rating-number ${p.rating==null?'':p.rating>=80?'rating-good':p.rating>=60?'rating-mid':'rating-bad'}">${p.rating==null?'—':p.rating+'%'}</span></div><p>${esc(d.email||'Почта не указана')}</p><div class="metric-row"><span>Сотрудников</span><b>${staff.length}</b></div><div class="metric-row"><span>Поручений</span><b>${p.assigned_count||0}</b></div><div class="metric-row"><span>Принято</span><b>${p.accepted_count||0}</b></div><div class="metric-row"><span>Просрочено</span><b>${p.overdue_count||0}</b></div><div class="small">${staff.map(x=>x.full_name).filter(Boolean).join(', ')||'Сотрудники не назначены'}</div></article>`}).join('')}</div>`}

// -------------------- ОТЧЁТЫ --------------------
async function renderReports(){const templates=queryError(await sb.from('report_templates').select('*').order('is_system',{ascending:false}));$('#content').innerHTML=`<div class="toolbar"><div><h3 style="margin:0">Конструктор отчётов</h3><p class="small">Выберите шаблон, период и формат. Данные будут собраны из системы.</p></div></div><div class="cards">${templates.map(t=>`<article class="entity-card"><h4>${esc(t.name)}</h4><p>${esc(t.config?.title||'Готовый шаблон')}</p><button class="primary" data-report="${t.report_type}" type="button">Сформировать</button></article>`).join('')}</div>`;$$('[data-report]').forEach(b=>b.onclick=()=>openReportBuilder(b.dataset.report))}
function openReportBuilder(type){modal(`<h2>Формирование отчёта</h2><div class="grid cols-2"><label>Период с<input id="reportFrom" type="date" value="${new Date(new Date().getFullYear(),0,1).toISOString().slice(0,10)}"></label><label>по<input id="reportTo" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label>Формат<select id="reportFormat"><option value="html">PDF / печать</option><option value="xlsx">Excel</option><option value="doc">Word</option></select></label><label>Заголовок<input id="reportTitle" value="${esc(PAGE_META.reports[0])}"></label></div><button id="buildReport" class="primary" type="button">Сформировать</button>`);$('#buildReport').onclick=()=>buildReport(type)}
async function buildReport(type){const from=$('#reportFrom').value,to=$('#reportTo').value,format=$('#reportFormat').value,title=$('#reportTitle').value||'Отчёт';let rows=[],headers=[];if(type==='tasks_summary'){const r=queryError(await sb.from('tasks').select('title,category,priority,status,due_at,created_at').gte('created_at',from).lte('created_at',to+'T23:59:59'));rows=r;headers=['title','category','priority','status','due_at','created_at']}else if(type==='departments_summary'){rows=queryError(await sb.from('department_performance_v27').select('*'));headers=Object.keys(rows[0]||{})}else if(type==='school_card'){rows=queryError(await sb.from('schools').select('*'));headers=['name','locality','students_total','teachers_total','grade9_students','grade11_students','profile_status']}else{const docs=queryError(await sb.from('exam_documents').select('*').gte('created_at',from).lte('created_at',to+'T23:59:59'));rows=docs.map(x=>({Документ:x.title||x.file_name,Год:x.academic_year,Экзамен:x.exam_type,Таблиц:x.tables_count,Замечаний:x.warnings_count}));headers=Object.keys(rows[0]||{})}if(format==='xlsx'&&window.XLSX){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Отчёт');XLSX.writeFile(wb,`${fileSafe(title)}.xlsx`)}else{const table=`<table border="1" cellspacing="0" cellpadding="6"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${headers.map(h=>`<td>${esc(r[h]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;const html=`<!doctype html><meta charset="utf-8"><style>body{font-family:Arial;padding:30px}h1{text-align:center}table{border-collapse:collapse;width:100%}th{background:#e8f2eb}</style><h1>${esc(title)}</h1><p>Период: ${esc(from)} — ${esc(to)}</p>${table}<p style="margin-top:50px">Начальник РОО __________________</p>`;if(format==='doc')download(new Blob([html],{type:'application/msword'}),`${fileSafe(title)}.doc`);else{const w=open();w.document.write(html);w.document.close();w.print()}}await audit('Сформирован отчёт','report',type,{from,to,format});closeModal()}

// -------------------- КАЛЕНДАРЬ --------------------
async function renderCalendar(){const start=new Date();start.setDate(1);const end=new Date(start.getFullYear(),start.getMonth()+1,0,23,59,59);const r=queryError(await sb.from('calendar_events').select('*').gte('starts_at',start.toISOString()).lte('starts_at',end.toISOString()).order('starts_at'));const by={};r.forEach(x=>{const k=new Date(x.starts_at).getDate();(by[k]??=[]).push(x)});const days=end.getDate(),offset=(start.getDay()+6)%7;$('#content').innerHTML=`<div class="toolbar"><h3>${start.toLocaleString('ru-RU',{month:'long',year:'numeric'})}</h3>${isRoo()?'<button id="newEvent" class="primary" type="button">+ Событие</button>':''}</div><div class="calendar-grid">${Array(offset).fill('<div></div>').join('')}${Array.from({length:days},(_,i)=>`<div class="calendar-day"><b>${i+1}</b>${(by[i+1]||[]).map(e=>`<div class="calendar-event" title="${esc(e.description||'')}">${esc(e.title)}</div>`).join('')}</div>`).join('')}</div>`;if($('#newEvent'))$('#newEvent').onclick=openEventCreate}
async function openEventCreate(){const [schools,deps]=await Promise.all([loadSchools(),loadDepartments()]);modal(`<h2>Новое событие</h2><label>Название<input id="eventTitle"></label><div class="grid cols-2"><label>Начало<input id="eventStart" type="datetime-local" value="${isoLocal(new Date())}"></label><label>Окончание<input id="eventEnd" type="datetime-local"></label><label>Школа<select id="eventSchool"><option value="">Для всех</option>${schools.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label><label>Отдел<select id="eventDepartment"><option value="">Не выбран</option>${deps.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label></div><label>Описание<textarea id="eventDescription"></textarea></label><button id="saveEvent" class="primary" type="button">Сохранить</button>`);$('#saveEvent').onclick=async()=>{const p={title:$('#eventTitle').value,description:$('#eventDescription').value,event_type:'event',starts_at:new Date($('#eventStart').value).toISOString(),ends_at:$('#eventEnd').value?new Date($('#eventEnd').value).toISOString():null,school_id:$('#eventSchool').value||null,department_id:$('#eventDepartment').value||null,created_by:me.id};queryError(await sb.from('calendar_events').insert(p));closeModal();renderCalendar()}}

// -------------------- ДОКУМЕНТЫ --------------------
async function renderDocuments(){const r=queryError(await sb.from('documents').select('*,profiles(full_name),schools(name),departments(name)').order('created_at',{ascending:false}));$('#content').innerHTML=`<div class="toolbar"><div class="filters"><input id="docSearch" placeholder="Поиск документов"><select id="docCategory"><option value="">Все категории</option><option>Приказ</option><option>Письмо</option><option>Методические материалы</option><option>Отчёт</option><option>Протокол</option></select></div><button id="newDocument" class="primary" type="button">+ Документ</button></div><div id="documentsTable"></div>`;const draw=()=>{const s=$('#docSearch').value.toLowerCase(),c=$('#docCategory').value,rows=r.filter(x=>(!s||`${x.title} ${x.document_number||''}`.toLowerCase().includes(s))&&(!c||x.category===c));$('#documentsTable').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Название</th><th>Категория</th><th>№ / дата</th><th>Для кого</th><th>Автор</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.title)}</td><td>${esc(x.category||'—')}</td><td>${esc(x.document_number||'—')}<br>${fmtDate(x.document_date)}</td><td>${esc(x.schools?.name||x.departments?.name||x.visibility)}</td><td>${esc(x.profiles?.full_name||'')}</td><td>${x.storage_path?`<button class="link-btn" data-doc-download="${x.id}" type="button">Скачать</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:empty('Документов нет','Загрузите первый документ.');$$('[data-doc-download]').forEach(b=>b.onclick=()=>downloadDocument(b.dataset.docDownload));};draw();$('#docSearch').oninput=draw;$('#docCategory').onchange=draw;$('#newDocument').onclick=openDocumentCreate}
async function openDocumentCreate(){const [schools,deps]=await Promise.all([loadSchools(),loadDepartments()]);modal(`<h2>Добавить документ</h2><div class="grid cols-2"><label>Название<input id="docTitle"></label><label>Категория<select id="docCat"><option>Приказ</option><option>Письмо</option><option>Методические материалы</option><option>Отчёт</option><option>Протокол</option><option>Другое</option></select></label><label>Номер<input id="docNumber"></label><label>Дата<input id="docDate" type="date"></label><label>Доступ<select id="docVisibility"><option value="all">Всем сотрудникам</option><option value="roo">Только РОО</option><option value="schools">Школам</option><option value="departments">Отделам</option><option value="private">Выбранной организации</option></select></label><label>Файл<input id="docFile" type="file"></label><label>Школа<select id="docSchool"><option value="">Не выбрана</option>${schools.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label><label>Отдел<select id="docDep"><option value="">Не выбран</option>${deps.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label></div><label>Описание<textarea id="docDescription"></textarea></label><button id="saveDocument" class="primary" type="button">Загрузить</button>`);$('#saveDocument').onclick=saveDocument}
async function saveDocument(){const file=$('#docFile').files[0],title=$('#docTitle').value.trim();if(!title)throw new Error('Введите название');let path='',name='';if(file){path=`documents/${me.id}/${Date.now()}-${fileSafe(file.name)}`;queryError(await sb.storage.from('roo-documents').upload(path,file));name=file.name}const p={title,category:$('#docCat').value,document_number:$('#docNumber').value,document_date:$('#docDate').value||null,description:$('#docDescription').value,visibility:$('#docVisibility').value,school_id:$('#docSchool').value||null,department_id:$('#docDep').value||null,storage_path:path,file_name:name,created_by:me.id};queryError(await sb.from('documents').insert(p));await audit('Добавлен документ','document','',{title});closeModal();renderDocuments()}
async function downloadDocument(id){const d=queryError(await sb.from('documents').select('*').eq('id',id).single());const r=await sb.storage.from('roo-documents').download(d.storage_path);if(r.error)throw r.error;download(r.data,d.file_name||'document')}

// -------------------- ОБРАЩЕНИЯ --------------------
async function renderAppeals(){const r=queryError(await sb.from('appeals').select('*,departments(name),profiles!appeals_assigned_to_fkey(full_name)').order('created_at',{ascending:false}));$('#content').innerHTML=`<div class="toolbar"><h3>Обращения граждан и организаций</h3><button id="newAppeal" class="primary" type="button">+ Новое обращение</button></div>${r.length?`<div class="table-wrap"><table><thead><tr><th>Номер</th><th>Тема</th><th>Заявитель</th><th>Отдел</th><th>Срок</th><th>Статус</th></tr></thead><tbody>${r.map(x=>`<tr class="row-click" data-appeal="${x.id}"><td>${esc(x.number||'—')}</td><td>${esc(x.subject)}</td><td>${esc(x.applicant_name||'')}</td><td>${esc(x.departments?.name||'')}</td><td>${fmtDate(x.due_at)}</td><td>${badge(x.status)}</td></tr>`).join('')}</tbody></table></div>`:empty('Обращений нет','Добавьте первое обращение.')}`;$('#newAppeal').onclick=()=>openAppeal();$$('[data-appeal]').forEach(b=>b.onclick=()=>openAppeal(b.dataset.appeal))}
async function openAppeal(id){const deps=await loadDepartments();const a=id?queryError(await sb.from('appeals').select('*').eq('id',id).single()):{};modal(`<h2>${id?'Обращение':'Новое обращение'}</h2><div class="grid cols-2"><label>Номер<input id="appealNumber" value="${esc(a.number||'')}"></label><label>Заявитель<input id="appealApplicant" value="${esc(a.applicant_name||'')}"></label><label>Контакты<input id="appealContacts" value="${esc(a.applicant_contacts||'')}"></label><label>Срок<input id="appealDue" type="date" value="${a.due_at?String(a.due_at).slice(0,10):''}"></label><label>Отдел<select id="appealDep"><option value="">Не выбран</option>${deps.map(x=>`<option value="${x.id}" ${a.assigned_department_id===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><label>Статус<select id="appealStatus">${['new','in_progress','answered','closed','returned'].map(s=>`<option value="${s}" ${a.status===s?'selected':''}>${STATUS_LABELS[s]}</option>`).join('')}</select></label></div><label>Тема<input id="appealSubject" value="${esc(a.subject||'')}"></label><label>Текст обращения<textarea id="appealMessage">${esc(a.message||'')}</textarea></label><label>Ответ<textarea id="appealResponse">${esc(a.response_text||'')}</textarea></label><button id="saveAppeal" class="primary" type="button">Сохранить</button>`);$('#saveAppeal').onclick=async()=>{const p={number:$('#appealNumber').value||null,applicant_name:$('#appealApplicant').value,applicant_contacts:$('#appealContacts').value,subject:$('#appealSubject').value,message:$('#appealMessage').value,status:$('#appealStatus').value,due_at:$('#appealDue').value?new Date($('#appealDue').value).toISOString():null,assigned_department_id:$('#appealDep').value||null,response_text:$('#appealResponse').value,created_by:a.created_by||me.id};queryError(id?await sb.from('appeals').update(p).eq('id',id):await sb.from('appeals').insert(p));closeModal();renderAppeals()}}

// -------------------- СОВЕЩАНИЯ --------------------
async function renderMeetings(){const r=queryError(await sb.from('meetings').select('*,meeting_decisions(*)').order('meeting_at',{ascending:false}));$('#content').innerHTML=`<div class="toolbar"><h3>Совещания и протоколы</h3>${isRoo()?'<button id="newMeeting" class="primary" type="button">+ Совещание</button>':''}</div><div class="cards">${r.map(x=>`<article class="entity-card row-click" data-meeting="${x.id}"><div class="section-title"><h4>${esc(x.title)}</h4>${badge(x.status)}</div><p>${fmtDate(x.meeting_at,true)} · ${esc(x.location||'')}</p><div class="metric-row"><span>Решений</span><b>${x.meeting_decisions?.length||0}</b></div></article>`).join('')||empty('Совещаний нет','Создайте план совещания.')}</div>`;if($('#newMeeting'))$('#newMeeting').onclick=()=>openMeeting();$$('[data-meeting]').forEach(b=>b.onclick=()=>openMeeting(b.dataset.meeting))}
async function openMeeting(id){const m=id?queryError(await sb.from('meetings').select('*,meeting_decisions(*)').eq('id',id).single()):{};modal(`<h2>${id?'Совещание':'Новое совещание'}</h2><div class="grid cols-2"><label>Название<input id="meetingTitle" value="${esc(m.title||'')}"></label><label>Дата и время<input id="meetingAt" type="datetime-local" value="${m.meeting_at?isoLocal(m.meeting_at):isoLocal(new Date())}"></label><label>Место<input id="meetingLocation" value="${esc(m.location||'')}"></label><label>Статус<select id="meetingStatus">${['planned','held','cancelled'].map(s=>`<option value="${s}" ${m.status===s?'selected':''}>${STATUS_LABELS[s]}</option>`).join('')}</select></label></div><label>Повестка<textarea id="meetingAgenda">${esc(m.agenda||'')}</textarea></label><label>Протокол<textarea id="meetingMinutes">${esc(m.minutes_text||'')}</textarea></label><div class="section-title"><h3>Решения</h3><button id="addDecisionRow" class="secondary" type="button">+ Решение</button></div><div id="decisionRows">${(m.meeting_decisions||[]).map(d=>decisionRow(d)).join('')}</div><button id="saveMeeting" class="primary" type="button">Сохранить</button>`);$('#addDecisionRow').onclick=()=>$('#decisionRows').insertAdjacentHTML('beforeend',decisionRow({}));$('#saveMeeting').onclick=()=>saveMeeting(id,m)}
function decisionRow(d){return `<div class="grid cols-3 decision-row"><label>Решение<input data-d="text" value="${esc(d.decision_text||'')}"></label><label>Ответственный<input data-d="responsible" value="${esc(d.responsible_name||'')}"></label><label>Срок<input data-d="due" type="date" value="${d.due_at?String(d.due_at).slice(0,10):''}"></label></div>`}
async function saveMeeting(id,old){const p={title:$('#meetingTitle').value,meeting_at:new Date($('#meetingAt').value).toISOString(),location:$('#meetingLocation').value,status:$('#meetingStatus').value,agenda:$('#meetingAgenda').value,minutes_text:$('#meetingMinutes').value,created_by:old.created_by||me.id};const m=queryError(id?await sb.from('meetings').update(p).eq('id',id).select().single():await sb.from('meetings').insert(p).select().single());if(id)await sb.from('meeting_decisions').delete().eq('meeting_id',id);const ds=$$('.decision-row').map(r=>({meeting_id:m.id,decision_text:$('[data-d="text"]',r).value,responsible_name:$('[data-d="responsible"]',r).value,due_at:$('[data-d="due"]',r).value?new Date($('[data-d="due"]',r).value).toISOString():null})).filter(x=>x.decision_text);if(ds.length)queryError(await sb.from('meeting_decisions').insert(ds));closeModal();renderMeetings()}

// -------------------- ПРОВЕРКИ --------------------
async function renderInspections(){const r=queryError(await sb.from('inspections').select('*,schools(name)').order('planned_at',{ascending:false}));$('#content').innerHTML=`<div class="toolbar"><h3>Проверки образовательных организаций</h3>${isRoo()?'<button id="newInspection" class="primary" type="button">+ Проверка</button>':''}</div>${r.length?`<div class="table-wrap"><table><thead><tr><th>Школа</th><th>Проверка</th><th>Дата</th><th>Проверяющие</th><th>Статус</th></tr></thead><tbody>${r.map(x=>`<tr class="row-click" data-inspection="${x.id}"><td>${esc(x.schools?.name||'')}</td><td>${esc(x.title)}</td><td>${fmtDate(x.planned_at,true)}</td><td>${esc(x.inspectors||'')}</td><td>${badge(x.status)}</td></tr>`).join('')}</tbody></table></div>`:empty('Проверок нет','Создайте план проверки.')}`;if($('#newInspection'))$('#newInspection').onclick=()=>openInspection();$$('[data-inspection]').forEach(b=>b.onclick=()=>openInspection(b.dataset.inspection))}
async function openInspection(id){const schools=await loadSchools();const x=id?queryError(await sb.from('inspections').select('*').eq('id',id).single()):{};modal(`<h2>${id?'Проверка':'Новая проверка'}</h2><div class="grid cols-2"><label>Школа<select id="inspectionSchool">${schools.map(s=>`<option value="${s.id}" ${x.school_id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label>Название<input id="inspectionTitle" value="${esc(x.title||'')}"></label><label>Тип<input id="inspectionType" value="${esc(x.inspection_type||'')}"></label><label>Дата<input id="inspectionDate" type="datetime-local" value="${x.planned_at?isoLocal(x.planned_at):''}"></label><label>Проверяющие<input id="inspectionPeople" value="${esc(x.inspectors||'')}"></label><label>Статус<select id="inspectionStatus">${['planned','in_progress','completed','cancelled'].map(s=>`<option value="${s}" ${x.status===s?'selected':''}>${STATUS_LABELS[s]}</option>`).join('')}</select></label></div><label>Выявленные нарушения<textarea id="inspectionFindings">${esc(x.findings||'')}</textarea></label><label>Рекомендации<textarea id="inspectionRecommendations">${esc(x.recommendations||'')}</textarea></label>${isRoo()?'<button id="saveInspection" class="primary" type="button">Сохранить</button>':''}`);if($('#saveInspection'))$('#saveInspection').onclick=async()=>{const p={school_id:$('#inspectionSchool').value,title:$('#inspectionTitle').value,inspection_type:$('#inspectionType').value,planned_at:$('#inspectionDate').value?new Date($('#inspectionDate').value).toISOString():null,inspectors:$('#inspectionPeople').value,status:$('#inspectionStatus').value,findings:$('#inspectionFindings').value,recommendations:$('#inspectionRecommendations').value,created_by:x.created_by||me.id,completed_at:$('#inspectionStatus').value==='completed'?new Date().toISOString():null};queryError(id?await sb.from('inspections').update(p).eq('id',id):await sb.from('inspections').insert(p));closeModal();renderInspections()}}

// -------------------- ПОЛЬЗОВАТЕЛИ --------------------
async function renderUsers(){const rows=await loadProfiles(true);let visible=rows;if(me.role==='school_director')visible=rows.filter(x=>x.school_id===me.school_id);$('#content').innerHTML=`<div class="toolbar"><div class="filters"><input id="userSearch" placeholder="Поиск по Ф.И.О. или почте"><select id="userRoleFilter"><option value="">Все роли</option>${Object.entries(ROLE_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div></div><div id="usersTable"></div>`;const draw=()=>{const s=$('#userSearch').value.toLowerCase(),f=$('#userRoleFilter').value,rs=visible.filter(x=>(!s||`${x.full_name} ${x.email}`.toLowerCase().includes(s))&&(!f||x.role===f));$('#usersTable').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Пользователь</th><th>Роль</th><th>Организация</th><th>Статус</th><th></th></tr></thead><tbody>${rs.map(x=>`<tr><td><b>${esc(x.full_name||'Без имени')}</b><br><span class="small">${esc(x.email||'')}</span></td><td>${esc(ROLE_LABELS[x.role]||x.role)}</td><td>${esc(x.schools?.name||x.departments?.name||'—')}</td><td>${badge(x.status)}</td><td>${canManageUsers()?`<button class="link-btn" data-user="${x.id}" type="button">Настроить</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;$$('[data-user]').forEach(b=>b.onclick=()=>openUser(b.dataset.user))};draw();$('#userSearch').oninput=draw;$('#userRoleFilter').onchange=draw}
async function openUser(id){const u=(await loadProfiles()).find(x=>x.id===id);const [schools,deps]=await Promise.all([loadSchools(),loadDepartments()]);const allowed=me.role==='school_director'?['school_staff','school_director']:Object.keys(ROLE_LABELS).filter(x=>x!=='pending'||u.role==='pending');modal(`<h2>Настройка пользователя</h2><p><b>${esc(u.full_name||'')}</b><br>${esc(u.email||'')}</p><div class="grid cols-2"><label>Роль<select id="userRole">${allowed.map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${ROLE_LABELS[r]}</option>`).join('')}</select></label><label>Статус<select id="userStatus"><option value="pending" ${u.status==='pending'?'selected':''}>Ожидает</option><option value="active" ${u.status==='active'?'selected':''}>Активен</option><option value="blocked" ${u.status==='blocked'?'selected':''}>Заблокирован</option></select></label><label>Школа<select id="userSchool"><option value="">Не выбрана</option>${schools.map(s=>`<option value="${s.id}" ${u.school_id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label>Отдел<select id="userDep"><option value="">Не выбран</option>${deps.map(d=>`<option value="${d.id}" ${u.department_id===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label></div><button id="saveUser" class="primary" type="button">Сохранить доступ</button>`);$('#saveUser').onclick=async()=>{const role=$('#userRole').value;let school_id=$('#userSchool').value||null,department_id=$('#userDep').value||null;if(role.startsWith('school_'))department_id=null;else if(role.startsWith('department_'))school_id=null;else if(role.startsWith('roo_')){school_id=null;department_id=null}queryError(await sb.from('profiles').update({role,status:$('#userStatus').value,school_id,department_id,updated_at:new Date().toISOString()}).eq('id',id));await audit('Назначена роль','profile',id,{role,status:$('#userStatus').value});cache.profiles=null;toast('Доступ обновлён');closeModal();renderUsers()}}

// -------------------- ЖУРНАЛ --------------------
async function renderAudit(){const r=queryError(await sb.from('audit_log').select('*,profiles(full_name,email)').order('created_at',{ascending:false}).limit(300));$('#content').innerHTML=`<div class="panel"><div class="section-title"><h3>Журнал действий</h3><button id="auditCsv" class="secondary" type="button">Скачать CSV</button></div><div class="table-wrap"><table><thead><tr><th>Дата</th><th>Пользователь</th><th>Действие</th><th>Объект</th><th>Подробности</th></tr></thead><tbody>${r.map(x=>`<tr><td>${fmtDate(x.created_at,true)}</td><td>${esc(x.profiles?.full_name||x.profiles?.email||'Система')}</td><td>${esc(x.action)}</td><td>${esc(x.entity_type||'')} ${esc(x.entity_id||'')}</td><td>${esc(JSON.stringify(x.details||{}))}</td></tr>`).join('')}</tbody></table></div></div>`;$('#auditCsv').onclick=()=>download(new Blob(['Дата;Пользователь;Действие;Объект;Подробности\n'+r.map(x=>[fmtDate(x.created_at,true),x.profiles?.full_name||x.profiles?.email||'',x.action,x.entity_type||'',JSON.stringify(x.details||{})].join(';')).join('\n')],{type:'text/csv;charset=utf-8'}),'Журнал_действий.csv')}

// -------------------- НАСТРОЙКИ И ЛОГОТИП --------------------
async function renderSettings(){if(me.role!=='roo_head'){ $('#content').innerHTML=empty('Нет доступа','Изменять настройки может только начальник РОО.');return}$('#content').innerHTML=`<div class="grid cols-2"><article class="panel"><h3>Фирменное оформление</h3><div class="brand-mark brand-mark-auth" id="settingsLogoPreview"><img id="settingsLogoImage" alt="Логотип" ${branding.logo_url?'':'hidden'} src="${esc(branding.logo_url||'')}"><span class="brand-fallback" ${branding.logo_url?'hidden':''}>РОО</span></div><label>Новый логотип<input id="brandingLogo" type="file" accept=".png,.jpg,.jpeg,.webp,.svg"></label><label>Фон логотипа<input id="brandingBackground" type="color" value="${normalizeColor(branding.background)}"></label><label>Внутренний отступ <input id="brandingPadding" type="range" min="0" max="30" value="${Number(branding.padding)||8}"></label><p class="small">PNG с прозрачностью сохраняется прозрачным. Для изображения с залитым фоном сайт определит цвет по краям и подберёт фон контейнера.</p></article><article class="panel"><h3>Название системы</h3><label>Короткое название<input id="brandingShort" value="${esc(branding.short_name||'')}"></label><label>Подзаголовок<input id="brandingSubtitle" value="${esc(branding.subtitle||'')}"></label><label>Полное название<textarea id="brandingFull">${esc(branding.full_name||'')}</textarea></label><div class="form-actions"><button id="saveBranding" class="primary" type="button">Сохранить</button><button id="removeLogo" class="danger" type="button">Удалить логотип</button></div></article></div>`;$('#brandingLogo').onchange=previewBrandingLogo;$('#brandingBackground').oninput=updateLogoPreview;$('#brandingPadding').oninput=updateLogoPreview;$('#saveBranding').onclick=saveBranding;if($('#removeLogo'))$('#removeLogo').onclick=removeLogo;updateLogoPreview()}
function normalizeColor(v){const m=String(v||'').match(/^#([0-9a-f]{6})$/i);return m?m[0]:'#ffffff'}
async function previewBrandingLogo(){const file=$('#brandingLogo').files[0];if(!file)return;const img=$('#settingsLogoImage'),fallback=$('.brand-fallback',$('#settingsLogoPreview'));img.src=URL.createObjectURL(file);img.hidden=false;fallback.hidden=true;try{const d=await window.ROOAnalysisEngine.detectLogoBackground(file);if(!d.transparent){const c=document.createElement('canvas').getContext('2d');c.fillStyle=d.background;$('#brandingBackground').value=rgbToHex(c.fillStyle)}}catch(_){}updateLogoPreview()}
function rgbToHex(c){if(c.startsWith('#'))return c;const m=c.match(/\d+/g);return m?`#${m.slice(0,3).map(x=>Number(x).toString(16).padStart(2,'0')).join('')}`:'#ffffff'}
function updateLogoPreview(){const p=$('#settingsLogoPreview');if(!p)return;p.style.background=$('#brandingBackground').value;p.style.padding=`${$('#brandingPadding').value}px`}
async function saveBranding(){const file=$('#brandingLogo').files[0];let logo_url=branding.logo_url||'';if(file){const path=`branding/logo-${Date.now()}-${fileSafe(file.name)}`;const up=await sb.storage.from('roo-public').upload(path,file,{upsert:true});if(up.error)throw up.error;logo_url=sb.storage.from('roo-public').getPublicUrl(path).data.publicUrl}const value={logo_url,background:$('#brandingBackground').value,padding:Number($('#brandingPadding').value),short_name:$('#brandingShort').value,subtitle:$('#brandingSubtitle').value,full_name:$('#brandingFull').value};queryError(await sb.from('site_settings').upsert({key:'branding',value,updated_by:me.id,updated_at:new Date().toISOString()}));branding=value;applyBranding();toast('Оформление сохранено')}
async function removeLogo(){branding.logo_url='';queryError(await sb.from('site_settings').upsert({key:'branding',value:branding,updated_by:me.id,updated_at:new Date().toISOString()}));applyBranding();renderSettings()}

// -------------------- УВЕДОМЛЕНИЯ --------------------
async function refreshNotifications(){if(!me)return;const r=await sb.from('notifications').select('id',{count:'exact',head:true}).eq('is_read',false);const n=r.count||0;$('#notificationCount').textContent=n;$('#notificationCount').hidden=!n}
async function showNotifications(){const r=queryError(await sb.from('notifications').select('*').order('created_at',{ascending:false}).limit(50));modal(`<h2>Уведомления</h2>${r.length?`<div class="timeline">${r.map(x=>`<div class="timeline-item"><i></i><div><b>${esc(x.title)}</b><p>${esc(x.body||'')}</p><small>${fmtDate(x.created_at,true)}</small></div></div>`).join('')}</div>`:empty('Уведомлений нет','Новые события появятся здесь.')}<button id="readAll" class="secondary" type="button">Отметить всё прочитанным</button>`);$('#readAll').onclick=async()=>{await sb.from('notifications').update({is_read:true,read_at:new Date().toISOString()}).eq('is_read',false);refreshNotifications();closeModal()}}


/* ==================== V28 FINAL AUDIT OVERRIDES ==================== */
ROLE_MENUS.roo_deputy = ROLE_MENUS.roo_deputy.filter(page => page !== 'users');
ROLE_MENUS.school_director = ROLE_MENUS.school_director.filter(page => page !== 'users');
canManageUsers = function(){ return me?.role === 'roo_head'; };

let calendarCursorV28 = new Date();
let activeAnalysisViewV28 = null;

function showAppV28(){
  const auth=$('#auth'), app=$('#app');
  if(auth){auth.hidden=true;auth.style.display='none'}
  if(app){app.hidden=false;app.style.display='grid'}
}

showAuth = function(){
  const auth=$('#auth'), app=$('#app');
  if(app){app.hidden=true;app.style.display='none'}
  if(auth){auth.hidden=false;auth.style.display='grid'}
  if($('#loginMessage')) $('#loginMessage').textContent='';
};

applyBranding = function(){
  $('#authBrandTitle').textContent=branding.full_name||branding.short_name||'Отдел образования';
  $('#brandShortName').textContent=branding.short_name||'Ачхой-Мартан';
  $('#brandSubtitle').textContent=branding.subtitle||'Отдел образования';
  document.title=branding.full_name||'Система РОО';
  for(const [imgId,markId] of [['authBrandImage','authBrandMark'],['sideBrandImage','sideBrandMark']]){
    const img=$(`#${imgId}`),mark=$(`#${markId}`),fallback=$('.brand-fallback',mark);
    const padding=Number(branding.padding);
    mark.style.background=branding.background||'#fff';
    mark.style.padding=`${Number.isFinite(padding)?Math.max(0,padding):8}px`;
    const fallbackMode=()=>{img.hidden=true;img.removeAttribute('src');fallback.hidden=false;};
    if(branding.logo_url){
      img.onload=()=>{img.hidden=false;fallback.hidden=true};
      img.onerror=fallbackMode;
      img.src=branding.logo_url;
    }else fallbackMode();
  }
};

loadRegisterUnits = async function(){
  if(!sb)return;
  const place=$('#regPlace'), unit=$('#regUnit');
  const update=async()=>{
    unit.disabled=true;unit.innerHTML='<option value="">Загрузка списка…</option>';
    try{
      let result=await sb.rpc('registration_units_v28',{unit_type:place.value});
      if(result.error){
        const table=place.value==='school'?'schools':'departments';
        result=await sb.from(table).select('id,name').order('name');
      }
      if(result.error)throw result.error;
      const rows=result.data||[];
      unit.innerHTML='<option value="">Выберите организацию</option>'+rows.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
    }catch(error){
      unit.innerHTML='<option value="">Список временно недоступен</option>';
      console.error(error);
    }finally{unit.disabled=false}
  };
  place.onchange=update;await update();
};

ensureProfile = async function(user){
  let result=await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();
  if(result.error)throw result.error;
  if(!result.data){
    const repair=await sb.rpc('ensure_my_profile_v28');
    if(repair.error)throw repair.error;
    result=await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();
  }
  if(!result.data)throw new Error('Профиль сотрудника не создан. Выполните финальный SQL V28.');
  return result.data;
};

enter = async function(user){
  me=await ensureProfile(user);
  if(me.status==='blocked'){
    await sb.auth.signOut();
    showAuth();
    $('#loginMessage').textContent='Учётная запись заблокирована администратором.';
    return false;
  }
  showAppV28();
  $('#userName').textContent=me.full_name||me.email;
  $('#userRole').textContent=ROLE_LABELS[me.role]||me.role;
  $('#avatar').textContent=initials(me.full_name||me.email);
  renderNav();await refreshNotifications();await navigate((ROLE_MENUS[me.role]||['pending'])[0]);
  return true;
};

login = async function(e){
  e.preventDefault();
  const btn=$('button[type="submit"]',e.currentTarget);setBusy(btn,true,'Входим…');$('#loginMessage').textContent='';
  try{
    const email=$('#loginEmail').value.trim(),password=$('#loginPassword').value;
    if(!email||!password)throw new Error('Введите почту и пароль.');
    const result=await sb.auth.signInWithPassword({email,password});if(result.error)throw result.error;
    session=result.data.session;await enter(result.data.user);
  }catch(error){
    console.error(error);
    const message=String(error.message||'Ошибка входа');
    $('#loginMessage').textContent=/invalid login credentials/i.test(message)?'Неверная почта или пароль.':/email not confirmed/i.test(message)?'Подтвердите почту через письмо, затем повторите вход.':message;
  }finally{setBusy(btn,false)}
};

navigate = async function(page){
  if($('#modal')?.open)closeModal();
  activeAnalysisViewV28=null;
  currentPage=page;
  $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  $('#pageTitle').textContent=PAGE_META[page]?.[0]||page;
  $('#crumb').textContent=branding.short_name||'Рабочая система РОО';
  $('.sidebar').classList.remove('open');
  const fn={dashboard:renderDashboard,pending:renderPending,tasks:renderTasks,schools:renderSchools,school:renderMySchool,rating:renderRating,exams:renderExams,departments:renderDepartments,reports:renderReports,calendar:renderCalendar,documents:renderDocuments,appeals:renderAppeals,meetings:renderMeetings,inspections:renderInspections,users:renderUsers,audit:renderAudit,settings:renderSettings}[page]||renderDashboard;
  $('#content').innerHTML='<div class="empty">Загрузка…</div>';
  try{await fn();window.scrollTo({top:0,behavior:'auto'})}catch(error){console.error(error);$('#content').innerHTML=empty('Раздел временно недоступен',error.message||'Ошибка загрузки')}
};

renderDashboard = async function(){
  const [tasks,schools,docs,appeals,pending,notifications]=await Promise.all([
    count('tasks'),count('schools'),count('documents'),count('appeals',q=>q.neq('status','closed')),isRoo()?count('profiles',q=>q.eq('role','pending')):0,count('notifications',q=>q.eq('is_read',false))
  ]);
  const dueResult=await sb.from('task_recipients').select('id,status,updated_at,tasks(title,due_at)').order('updated_at',{ascending:false}).limit(40);
  const recent=await sb.from('audit_log').select('action,entity_type,created_at,profiles(full_name)').order('created_at',{ascending:false}).limit(8);
  const attention=(dueResult.data||[]).filter(x=>!['accepted','cancelled'].includes(x.status)).slice(0,12);
  $('#content').innerHTML=`<div class="grid cols-4">
    <article class="panel stat"><b>${tasks??0}</b><small>Поручения</small></article><article class="panel stat"><b>${schools??0}</b><small>Школы</small></article><article class="panel stat"><b>${docs??0}</b><small>Документы</small></article><article class="panel stat"><b>${appeals??0}</b><small>Открытые обращения</small></article>
  </div><div class="split top-gap"><article class="panel"><div class="section-title"><h3>Что требует внимания</h3></div>${pending?`<div class="notice warn">Пользователей без роли: <b>${pending}</b>. <button class="link-btn" data-go="users" type="button">Открыть</button></div>`:''}${notifications?`<div class="notice info">Непрочитанных уведомлений: <b>${notifications}</b>.</div>`:''}${attention.length?`<div class="metric-list">${attention.map(x=>{const overdue=x.tasks?.due_at&&new Date(x.tasks.due_at)<new Date();return `<div class="metric-row"><span><b>${esc(x.tasks?.title||'Поручение')}</b><small>${fmtDate(x.tasks?.due_at,true)}</small></span><span>${overdue?'<span class="badge danger">Просрочено</span>':badge(x.status)}</span></div>`}).join('')}</div>`:empty('Нет срочных пунктов','Новые поручения и сроки появятся здесь.')}</article><article class="panel"><h3>Последние действия</h3>${(recent.data||[]).length?`<div class="timeline">${recent.data.map(x=>`<div class="timeline-item"><i></i><div><b>${esc(x.action)}</b><div class="small">${esc(x.profiles?.full_name||'Система')} · ${fmtDate(x.created_at,true)}</div></div></div>`).join('')}</div>`:empty('Журнал пуст','Действия пользователей появятся после работы в системе.')}</article></div>`;
  $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
};

openTask = async function(id){
  const task=queryError(await sb.from('tasks').select('*,profiles!tasks_created_by_fkey(full_name),task_recipients(*,schools(name),departments(name))').eq('id',id).single());
  let recipient=me._viewRecipient||(task.task_recipients||[]).find(r=>(me.school_id&&r.school_id===me.school_id)||(me.department_id&&r.department_id===me.department_id));
  if(isRoo()&&!recipient)recipient=(task.task_recipients||[])[0];
  const rid=recipient?.id;
  let responsesPromise=Promise.resolve({data:[]}), commentsPromise=Promise.resolve({data:[]}), filesPromise=Promise.resolve({data:[]});
  if(rid){
    let responseQuery=sb.from('task_responses').select('*,profiles!task_responses_author_id_fkey(full_name)').eq('task_id',id);
    responseQuery=recipient.school_id?responseQuery.eq('school_id',recipient.school_id):responseQuery.eq('department_id',recipient.department_id);
    responsesPromise=responseQuery.order('created_at',{ascending:false});
    commentsPromise=sb.from('task_comments').select('*,profiles(full_name)').eq('task_id',id).eq('recipient_id',rid).order('created_at');
    filesPromise=sb.from('attachments').select('*').eq('entity_type','task').eq('entity_id',id).eq('recipient_id',rid).order('created_at');
  }
  const [responses,comments,files]=await Promise.all([responsesPromise,commentsPromise,filesPromise]);
  queryError(responses);queryError(comments);queryError(files);
  const statuses=['new','in_progress','director_review','roo_review','accepted'];
  const active=Math.max(0,statuses.indexOf(recipient?.status||task.status));
  const recipientOptions=isRoo()?`<label>Получатель<select id="taskRecipientSelect">${(task.task_recipients||[]).map(r=>`<option value="${r.id}" ${r.id===rid?'selected':''}>${esc(r.schools?.name||r.departments?.name||'Получатель')} — ${esc(STATUS_LABELS[r.status]||r.status)}</option>`).join('')}</select></label>`:'';
  modal(`<div class="section-title"><div class="min-zero"><span class="badge">${esc(task.category||'Поручение')}</span><h2>${esc(task.title)}</h2></div>${badge(recipient?.status||task.status)}</div><p class="pre-wrap">${esc(task.description||'')}</p>${task.instructions?`<div class="notice info"><b>Обязательные требования</b><div class="pre-wrap">${esc(task.instructions)}</div></div>`:''}<div class="small">Срок: ${fmtDate(task.due_at,true)} · Автор: ${esc(task.profiles?.full_name||'')}</div>${recipientOptions}<div class="workflow">${statuses.map((status,index)=>`<div class="workflow-step ${index<active?'done':index===active?'active':''}">${STATUS_LABELS[status]}</div>`).join('')}</div><div class="split"><div><div class="panel flat"><h3>Ответ и файлы</h3><label>Текст ответа<textarea id="taskResponseText">${esc(responses.data?.[0]?.response_text||responses.data?.[0]?.text||'')}</textarea></label><label>Приложить файлы<input id="taskFiles" type="file" multiple></label><div class="file-list">${(files.data||[]).map(file=>`<div class="file-item"><span>📎 ${esc(file.file_name)}</span><button type="button" class="link-btn" data-download="${file.id}">Открыть</button></div>`).join('')||'<span class="small">Файлов пока нет</span>'}</div><div class="form-actions top-gap-sm">${taskActionButtons(task,recipient)}</div></div><div class="panel flat top-gap-sm"><h3>Комментарии</h3><div class="timeline">${(comments.data||[]).map(comment=>`<div class="timeline-item"><i></i><div><b>${esc(comment.profiles?.full_name||'Пользователь')}</b><p class="pre-wrap">${esc(comment.message)}</p><small>${fmtDate(comment.created_at,true)}</small></div></div>`).join('')||'<span class="small">Комментариев пока нет</span>'}</div><div class="inline-actions"><input id="taskComment" placeholder="Добавить комментарий"><button id="addTaskComment" class="secondary" type="button">Отправить</button></div></div></div><aside><div class="panel flat"><h3>Получатели</h3>${(task.task_recipients||[]).map(r=>`<div class="metric-row"><span>${esc(r.schools?.name||r.departments?.name||'')}</span>${badge(r.status)}</div>`).join('')}</div><div class="panel flat top-gap-sm"><h3>Версии ответа</h3>${(responses.data||[]).map(response=>`<div class="notice"><b>Версия ${response.version_no||1}</b><div class="small">${esc(response.profiles?.full_name||'')} · ${fmtDate(response.created_at,true)}</div></div>`).join('')||'<span class="small">Нет сохранённых версий</span>'}</div></aside></div>`);
  if($('#taskRecipientSelect'))$('#taskRecipientSelect').onchange=()=>openTaskRecipient(task,$('#taskRecipientSelect').value);
  bindTaskActions(task,recipient);
  if($('#addTaskComment'))$('#addTaskComment').onclick=()=>addTaskComment(task.id,recipient?.id);
  $$('[data-download]').forEach(b=>b.onclick=async()=>{try{await downloadAttachment(b.dataset.download)}catch(error){toast(error.message,'error')}});
};

taskActionButtons = function(task,recipient){
  if(!recipient)return isRoo()?'<span class="small">Выберите получателя.</span>':'';
  const status=recipient.status;
  const worker=['school_staff','school_director','department_staff','department_head'].includes(me.role);
  let html=worker?'<button id="saveTaskDraft" class="ghost" type="button">Сохранить черновик</button>':'';
  if(worker){
    if(status==='new')html+='<button id="acceptTask" class="secondary" type="button">Принять в работу</button>';
    if(['new','in_progress','returned'].includes(status))html+='<button id="submitTask" class="primary" type="button">Отправить ответ</button>';
    if(me.role==='school_director'&&status==='director_review')html+='<button id="directorApprove" class="primary" type="button">Подтвердить директором</button><button id="directorReturn" class="danger" type="button">Вернуть сотруднику</button>';
  }
  if(isRoo()&&status==='roo_review')html+='<button id="rooAccept" class="primary" type="button">Принять отчёт</button><button id="rooReturn" class="danger" type="button">Вернуть на исправление</button>';
  return html||'<span class="small">Доступных действий нет.</span>';
};

bindTaskActions = function(task,recipient){
  if(!recipient)return;
  const changeStatus=async(status,comment='')=>{
    try{
      const update={status,last_comment:comment||null};
      if(status==='in_progress'){update.accepted_at=new Date().toISOString();update.accepted_by=me.id}
      if(status==='director_review')update.submitted_at=new Date().toISOString();
      if(status==='roo_review'){update.director_reviewed_at=new Date().toISOString();update.director_reviewed_by=me.id}
      if(status==='accepted'){update.roo_reviewed_at=new Date().toISOString();update.roo_reviewed_by=me.id;update.completed_at=new Date().toISOString()}
      queryError(await sb.from('task_recipients').update(update).eq('id',recipient.id));
      await audit('Изменён статус поручения','task',task.id,{status,recipient:recipient.id});
      toast('Статус обновлён');await openTask(task.id);
    }catch(error){toast(error.message,'error')}
  };
  if($('#saveTaskDraft'))$('#saveTaskDraft').onclick=()=>saveTaskResponse(task,recipient,{status:'draft',notify:true,requireContent:false});
  if($('#acceptTask'))$('#acceptTask').onclick=()=>changeStatus('in_progress');
  if($('#submitTask'))$('#submitTask').onclick=async()=>{
    try{
      await saveTaskResponse(task,recipient,{status:'submitted',notify:false,requireContent:true});
      await changeStatus((recipient.school_id&&task.requires_director_approval&&me.role!=='school_director')?'director_review':'roo_review');
    }catch(error){toast(error.message,'error')}
  };
  if($('#directorApprove'))$('#directorApprove').onclick=()=>changeStatus('roo_review');
  if($('#directorReturn'))$('#directorReturn').onclick=()=>changeStatus('returned','Возвращено директором');
  if($('#rooAccept'))$('#rooAccept').onclick=()=>changeStatus('accepted');
  if($('#rooReturn'))$('#rooReturn').onclick=()=>{const comment=prompt('Причина возврата:')?.trim();if(comment)changeStatus('returned',comment)};
};

saveTaskResponse = async function(task,recipient,options={}){
  const text=$('#taskResponseText')?.value.trim()||'';
  const files=[...($('#taskFiles')?.files||[])];
  if(options.requireContent&&!text&&!files.length)throw new Error('Введите текст ответа или приложите хотя бы один файл.');
  if(!text&&!files.length){if(options.notify)toast('Нет изменений для сохранения','warn');return false}
  let previous=sb.from('task_responses').select('version_no').eq('task_id',task.id);
  previous=recipient.school_id?previous.eq('school_id',recipient.school_id):previous.eq('department_id',recipient.department_id);
  const prev=await previous.order('version_no',{ascending:false}).limit(1);
  if(prev.error)throw prev.error;
  const version=(prev.data?.[0]?.version_no||0)+1;
  queryError(await sb.from('task_responses').insert({task_id:task.id,author_id:me.id,school_id:recipient.school_id||null,department_id:recipient.department_id||null,text,response_text:text,status:options.status||'draft',version_no:version}));
  for(const file of files)await uploadAttachment('task',task.id,file,recipient.id);
  if(options.notify)toast('Черновик сохранён');
  return true;
};

uploadAttachment = async function(entityType,entityId,file,recipientId=null){
  if(file.size>50*1024*1024)throw new Error(`Файл «${file.name}» больше 50 МБ.`);
  const path=`${me.id}/${entityType}/${entityId}/${Date.now()}-${fileSafe(file.name)}`;
  const upload=await sb.storage.from('roo-documents').upload(path,file,{upsert:false});if(upload.error)throw upload.error;
  queryError(await sb.from('attachments').insert({entity_type:entityType,entity_id:entityId,recipient_id:recipientId,bucket_id:'roo-documents',storage_path:path,file_name:file.name,mime_type:file.type,size_bytes:file.size,uploaded_by:me.id}));
};

function renderExamListV28(docs){
  $('#content').innerHTML=`<div class="toolbar"><div class="min-zero"><h3>Анализ экзаменационных документов</h3><p class="small">DOCX, XLSX, XLS и CSV. Анализ открывается как полноценная страница без вложенной прокрутки.</p></div><div class="actions"><button id="examUpload" class="primary" type="button">+ Загрузить документ</button><button id="examHistory" class="secondary" type="button">История</button></div></div><div class="grid cols-4"><article class="panel stat"><b>${docs.length}</b><small>Документов</small></article><article class="panel stat"><b>${docs.reduce((sum,x)=>sum+(x.tables_count||0),0)}</b><small>Распознано таблиц</small></article><article class="panel stat"><b>${docs.reduce((sum,x)=>sum+(x.subjects_count||0),0)}</b><small>Предметных разделов</small></article><article class="panel stat"><b>${docs.reduce((sum,x)=>sum+(x.warnings_count||0),0)}</b><small>Замечаний к данным</small></article></div><div class="panel top-gap">${docs.length?`<div class="table-wrap"><table><thead><tr><th>Документ</th><th>Год</th><th>Экзамен</th><th>Таблиц</th><th>Проблем</th><th>Дата</th></tr></thead><tbody>${docs.map(x=>`<tr class="row-click" data-exam-doc="${x.id}"><td><b>${esc(x.title||x.file_name)}</b><div class="small">${esc(x.file_name||'')}</div></td><td>${esc(x.academic_year||'—')}</td><td>${esc(x.exam_type||'—')}</td><td>${x.tables_count??0}</td><td>${x.warnings_count??0}</td><td>${fmtDate(x.created_at,true)}</td></tr>`).join('')}</tbody></table></div>`:empty('Документы ещё не загружены','Загрузите аналитическую справку ГИА, таблицу Excel или CSV.')}</div>`;
  $('#examUpload').onclick=openExamWizard;
  $('#examHistory').onclick=()=>showExamHistory(docs);
  $$('[data-exam-doc]').forEach(row=>row.onclick=()=>openSavedAnalysis(row.dataset.examDoc));
}

renderExams = async function(){
  const result=await sb.from('exam_documents').select('*').order('created_at',{ascending:false});queryError(result);
  renderExamListV28(result.data||[]);
};

function showExamPageV28(title,body){
  activeAnalysisViewV28=true;
  $('#content').innerHTML=`<div class="analysis-page"><div class="toolbar analysis-page-toolbar"><div class="actions"><button id="examBack" class="ghost" type="button">← К списку анализов</button></div><div class="min-zero"><h3>${esc(title)}</h3></div></div>${body}</div>`;
  $('#examBack').onclick=renderExams;
  window.scrollTo({top:0,behavior:'auto'});
}

openExamWizard = function(){
  showExamPageV28('Загрузка и анализ документа',`<div class="panel analysis-upload-panel"><div class="steps"><div class="step active">1. Файл</div><div class="step">2. Распознавание</div><div class="step">3. Проверка</div><div class="step">4. Сохранение</div></div><div class="drop"><input id="examFile" type="file" accept=".docx,.xlsx,.xls,.csv"><p>Поддерживаются DOCX с таблицами и текстом, Excel и CSV.</p></div><div class="grid cols-2"><label>Учебный год<input id="examYear" value="2025/2026"></label><label>Тип экзамена<select id="examType"><option>ГИА</option><option>ЕГЭ</option><option>ОГЭ</option><option>ГВЭ</option></select></label></div><div class="form-actions"><button id="analyzeExam" class="primary" type="button">Проанализировать</button></div></div><div id="examPreview" class="top-gap"></div>`);
  $('#analyzeExam').onclick=analyzeExamFile;
};

analyzeExamFile = async function(){
  const file=$('#examFile')?.files?.[0];if(!file){toast('Выберите файл','warn');return}
  const btn=$('#analyzeExam');setBusy(btn,true,'Анализируем…');
  try{
    if(!window.ROOAnalysisEngine)throw new Error('Модуль анализа не загрузился.');
    const extracted=await window.ROOAnalysisEngine.extractFile(file);
    const analysis=window.ROOAnalysisEngine.analyze({...extracted,fileName:file.name,academicYear:$('#examYear').value,examType:$('#examType').value});
    analysis.meta={...(analysis.meta||{}),fileName:file.name,academicYear:$('#examYear').value,examType:$('#examType').value,title:analysis.meta?.title||file.name,createdAt:new Date().toISOString()};
    cache.analysis={analysis,file};
    $('#examPreview').innerHTML=`<div class="panel analysis-result-panel"><div class="analysis-shell">${window.ROOAnalysisEngine.renderDashboard(analysis)}</div><div class="form-actions analysis-actions"><button id="saveExamAnalysis" class="primary" type="button">Сохранить анализ</button><button id="exportExamDocx" class="secondary" type="button">Скачать DOCX</button><button id="exportExamXlsx" class="secondary" type="button">Скачать Excel</button></div></div>`;
    window.ROOAnalysisEngine.bindDashboard($('#examPreview'));
    $('#saveExamAnalysis').onclick=saveExamAnalysis;$('#exportExamDocx').onclick=()=>exportAnalysisDocx(analysis);$('#exportExamXlsx').onclick=()=>exportAnalysisXlsx(analysis);
    $('#examPreview').scrollIntoView({block:'start',behavior:'smooth'});
  }catch(error){console.error(error);toast(error.message,'error')}finally{setBusy(btn,false)}
};

saveExamAnalysis = async function(){
  const current=cache.analysis||{},analysis=current.analysis,file=current.file;if(!analysis||!file)return;
  const button=$('#saveExamAnalysis');setBusy(button,true);
  try{
    const path=`${me.id}/exam-analysis/${Date.now()}-${fileSafe(file.name)}`;
    const upload=await sb.storage.from('roo-exam-analysis').upload(path,file,{upsert:false});
    if(upload.error)throw new Error(`Не удалось сохранить исходный файл: ${upload.error.message}`);
    const payload={file_name:file.name,title:analysis.meta?.title||file.name,academic_year:analysis.meta?.academicYear,exam_type:analysis.meta?.examType,school_id:me.school_id||null,storage_path:path,analysis_json:analysis,tables_count:analysis.tables?.length||0,subjects_count:analysis.subjectResults?.length||0,warnings_count:analysis.warnings?.length||0,created_by:me.id};
    queryError(await sb.from('exam_documents').insert(payload));
    await audit('Загружен анализ экзаменов','exam_document','',{file:file.name});
    cache.analysis=null;toast('Анализ сохранён');await renderExams();
  }catch(error){toast(error.message,'error')}finally{setBusy(button,false)}
};

openSavedAnalysis = async function(id){
  const documentRow=queryError(await sb.from('exam_documents').select('*').eq('id',id).single());
  const analysis=documentRow.analysis_json;
  if(!analysis||!Object.keys(analysis).length){toast('В документе нет сохранённого анализа','warn');return}
  showExamPageV28(documentRow.title||documentRow.file_name,`<div id="savedAnalysis" class="panel analysis-result-panel"><div class="analysis-shell">${window.ROOAnalysisEngine.renderDashboard(analysis)}</div><div class="form-actions analysis-actions"><button id="savedDocx" class="primary" type="button">Скачать DOCX</button><button id="savedXlsx" class="secondary" type="button">Скачать Excel</button>${isRoo()?'<button id="deleteExam" class="danger" type="button">Удалить анализ</button>':''}</div></div>`);
  window.ROOAnalysisEngine.bindDashboard($('#savedAnalysis'));
  $('#savedDocx').onclick=()=>exportAnalysisDocx(analysis);$('#savedXlsx').onclick=()=>exportAnalysisXlsx(analysis);
  if($('#deleteExam'))$('#deleteExam').onclick=async()=>{if(!confirm('Удалить этот анализ и исходный файл?'))return;const del=await sb.from('exam_documents').delete().eq('id',id);if(del.error)return toast(del.error.message,'error');if(documentRow.storage_path)await sb.storage.from('roo-exam-analysis').remove?.([documentRow.storage_path]);toast('Анализ удалён');renderExams()};
};

showExamHistory = function(rows){
  showExamPageV28('История анализов',rows.length?`<div class="panel"><div class="table-wrap"><table><thead><tr><th>Файл</th><th>Год</th><th>Тип</th><th>Таблиц</th><th>Замечаний</th><th>Дата</th></tr></thead><tbody>${rows.map(x=>`<tr class="row-click" data-history-exam="${x.id}"><td>${esc(x.file_name)}</td><td>${esc(x.academic_year||'')}</td><td>${esc(x.exam_type||'')}</td><td>${x.tables_count??0}</td><td>${x.warnings_count??0}</td><td>${fmtDate(x.created_at,true)}</td></tr>`).join('')}</tbody></table></div></div>`:empty('История пуста','Сохранённые анализы появятся здесь.'));
  $$('[data-history-exam]').forEach(row=>row.onclick=()=>openSavedAnalysis(row.dataset.historyExam));
};

renderReports = async function(){
  const templates=queryError(await sb.from('report_templates').select('*').order('is_system',{ascending:false}));
  $('#content').innerHTML=`<div class="toolbar"><div class="min-zero"><h3>Конструктор отчётов</h3><p class="small">Выберите шаблон, период и формат. Отчёт будет сформирован с заголовком, сводкой и оформленной таблицей.</p></div></div>${templates.length?`<div class="cards">${templates.map(template=>`<article class="entity-card"><h4>${esc(template.name)}</h4><p>${esc(template.config?.title||'Готовый шаблон')}</p><button class="primary" data-report="${template.report_type}" type="button">Сформировать</button></article>`).join('')}</div>`:empty('Шаблоны не найдены','Выполните финальный SQL V28.')}`;
  $$('[data-report]').forEach(button=>button.onclick=()=>openReportBuilder(button.dataset.report));
};

buildReport = async function(type){
  const button=$('#buildReport');setBusy(button,true,'Формируем…');
  try{
    const from=$('#reportFrom').value,to=$('#reportTo').value,format=$('#reportFormat').value,title=$('#reportTitle').value.trim()||'Отчёт';
    if(!from||!to||new Date(from)>new Date(to))throw new Error('Проверьте период отчёта.');
    let rows=[],columns=[];
    if(type==='tasks_summary'){
      rows=queryError(await sb.from('tasks').select('title,category,priority,status,due_at,created_at').gte('created_at',from).lte('created_at',to+'T23:59:59'));
      columns=[['title','Поручение'],['category','Категория'],['priority','Приоритет'],['status','Статус'],['due_at','Срок'],['created_at','Создано']];
    }else if(type==='departments_summary'){
      rows=queryError(await sb.from('department_performance_v27').select('*'));
      columns=[['department_name','Отдел'],['assigned_count','Поручений'],['accepted_count','Принято'],['returned_count','Возвратов'],['overdue_count','Просрочено'],['rating','Рейтинг, %']];
    }else if(type==='school_card'){
      rows=queryError(await sb.from('schools').select('*'));
      columns=[['name','Школа'],['locality','Населённый пункт'],['students_total','Учеников'],['teachers_total','Педагогов'],['grade9_students','9 класс'],['grade11_students','11 класс'],['profile_status','Статус паспорта']];
    }else{
      const docs=queryError(await sb.from('exam_documents').select('*').gte('created_at',from).lte('created_at',to+'T23:59:59'));
      rows=docs.map(x=>({title:x.title||x.file_name,academic_year:x.academic_year,exam_type:x.exam_type,tables_count:x.tables_count,warnings_count:x.warnings_count}));
      columns=[['title','Документ'],['academic_year','Год'],['exam_type','Экзамен'],['tables_count','Таблиц'],['warnings_count','Замечаний']];
    }
    if(!rows.length)throw new Error('За выбранный период данных для отчёта нет.');
    const headers=columns.map(x=>x[1]);
    const values=rows.map(row=>columns.map(([key])=>key.endsWith('_at')?fmtDate(row[key],true):(STATUS_LABELS[row[key]]||(row[key]??''))));
    if(format==='xlsx'){
      if(!window.XLSX)throw new Error('Модуль Excel не загрузился.');
      const data=rows.map(row=>Object.fromEntries(columns.map(([key,label])=>[label,key.endsWith('_at')?fmtDate(row[key],true):(STATUS_LABELS[row[key]]||(row[key]??''))])));
      const workbook=XLSX.utils.book_new(),sheet=XLSX.utils.json_to_sheet(data);
      sheet['!cols']=headers.map((header,index)=>({wch:Math.min(45,Math.max(header.length+3,...data.map(row=>String(row[header]??'').length+2)))}));
      sheet['!autofilter']={ref:sheet['!ref']};
      XLSX.utils.book_append_sheet(workbook,sheet,'Отчёт');XLSX.writeFile(workbook,`${fileSafe(title)}.xlsx`);
    }else if(format==='docx'){
      if(!window.ROODocxExporter?.exportTableReport)throw new Error('Модуль DOCX не загрузился.');
      await window.ROODocxExporter.exportTableReport({title,period:`${from} — ${to}`,headers,rows:values,organization:branding.full_name,summary:[['Строк в отчёте',rows.length],['Период',`${from} — ${to}`]]},`${fileSafe(title)}.docx`);
    }else{
      const table=`<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${values.map(row=>`<tr>${row.map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;color:#173d2d;margin:32px}h1{text-align:center;color:#176b4d}p{text-align:center;color:#65766d}table{width:100%;border-collapse:collapse;margin-top:24px;font-size:12px}th,td{border:1px solid #9bafa1;padding:8px;vertical-align:top}th{background:#ddebe1}@media print{body{margin:12mm}}</style><h1>${esc(title)}</h1><p>${esc(branding.full_name)}<br>Период: ${esc(from)} — ${esc(to)}</p>${table}<p style="margin-top:50px;text-align:left">Начальник РОО __________________________</p></html>`;
      const win=open('','_blank');if(!win)throw new Error('Браузер заблокировал окно печати. Разрешите всплывающие окна.');win.document.write(html);win.document.close();setTimeout(()=>win.print(),250);
    }
    await audit('Сформирован отчёт','report',type,{from,to,format});closeModal();toast('Отчёт сформирован');
  }catch(error){toast(error.message,'error')}finally{setBusy(button,false)}
};

openReportBuilder = function(type){
  modal(`<h2>Формирование отчёта</h2><div class="grid cols-2"><label>Период с<input id="reportFrom" type="date" value="${new Date(new Date().getFullYear(),0,1).toISOString().slice(0,10)}"></label><label>по<input id="reportTo" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label>Формат<select id="reportFormat"><option value="pdf">PDF / печать</option><option value="xlsx">Excel</option><option value="docx">DOCX</option></select></label><label>Заголовок<input id="reportTitle" value="${esc(PAGE_META.reports[0])}"></label></div><div class="form-actions"><button id="buildReport" class="primary" type="button">Сформировать</button><button class="ghost" type="button" data-close>Отмена</button></div>`);
  $('#buildReport').onclick=()=>buildReport(type);$('[data-close]').onclick=closeModal;
};

renderCalendar = async function(){
  const start=new Date(calendarCursorV28.getFullYear(),calendarCursorV28.getMonth(),1);
  const end=new Date(start.getFullYear(),start.getMonth()+1,0,23,59,59);
  const events=queryError(await sb.from('calendar_events').select('*').gte('starts_at',start.toISOString()).lte('starts_at',end.toISOString()).order('starts_at'));
  const by={};events.forEach(event=>{const day=new Date(event.starts_at).getDate();(by[day]??=[]).push(event)});
  const days=end.getDate(),offset=(start.getDay()+6)%7;
  $('#content').innerHTML=`<div class="toolbar"><div class="actions"><button id="calPrev" class="ghost" type="button">←</button><button id="calToday" class="ghost" type="button">Сегодня</button><button id="calNext" class="ghost" type="button">→</button></div><h3>${start.toLocaleString('ru-RU',{month:'long',year:'numeric'})}</h3>${isRoo()?'<button id="newEvent" class="primary" type="button">+ Событие</button>':''}</div><div class="calendar-weekdays"><b>Пн</b><b>Вт</b><b>Ср</b><b>Чт</b><b>Пт</b><b>Сб</b><b>Вс</b></div><div class="calendar-grid">${Array(offset).fill('<div class="calendar-day calendar-empty"></div>').join('')}${Array.from({length:days},(_,index)=>`<div class="calendar-day" data-calendar-date="${new Date(start.getFullYear(),start.getMonth(),index+1).toISOString()}"><b>${index+1}</b>${(by[index+1]||[]).map(event=>`<button class="calendar-event" type="button" data-calendar-event="${event.id}" title="${esc(event.description||'')}">${esc(event.title)}</button>`).join('')}</div>`).join('')}</div>`;
  $('#calPrev').onclick=()=>{calendarCursorV28=new Date(start.getFullYear(),start.getMonth()-1,1);renderCalendar()};
  $('#calNext').onclick=()=>{calendarCursorV28=new Date(start.getFullYear(),start.getMonth()+1,1);renderCalendar()};
  $('#calToday').onclick=()=>{calendarCursorV28=new Date();renderCalendar()};
  if($('#newEvent'))$('#newEvent').onclick=()=>openEventCreate();
  $$('[data-calendar-date]').forEach(day=>day.ondblclick=()=>isRoo()&&openEventCreate(day.dataset.calendarDate));
  $$('[data-calendar-event]').forEach(button=>button.onclick=()=>{const event=events.find(x=>String(x.id)===String(button.dataset.calendarEvent));modal(`<h2>${esc(event.title)}</h2><p class="pre-wrap">${esc(event.description||'Описание не указано')}</p><div class="metric-list"><div class="metric-row"><span>Начало</span><b>${fmtDate(event.starts_at,true)}</b></div><div class="metric-row"><span>Окончание</span><b>${fmtDate(event.ends_at,true)}</b></div></div>`,false)});
};

openEventCreate = async function(initialDate=''){
  const [schools,deps]=await Promise.all([loadSchools(),loadDepartments()]);
  const initial=initialDate?new Date(initialDate):new Date();
  modal(`<h2>Новое событие</h2><label>Название<input id="eventTitle" maxlength="180"></label><div class="grid cols-2"><label>Начало<input id="eventStart" type="datetime-local" value="${isoLocal(initial)}"></label><label>Окончание<input id="eventEnd" type="datetime-local"></label><label>Школа<select id="eventSchool"><option value="">Для всех</option>${schools.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label><label>Отдел<select id="eventDepartment"><option value="">Не выбран</option>${deps.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label></div><label>Описание<textarea id="eventDescription"></textarea></label><div class="form-actions"><button id="saveEvent" class="primary" type="button">Сохранить</button><button class="ghost" type="button" data-close>Отмена</button></div>`);
  $('[data-close]').onclick=closeModal;
  $('#saveEvent').onclick=async()=>{const button=$('#saveEvent');setBusy(button,true);try{const title=$('#eventTitle').value.trim(),start=$('#eventStart').value,end=$('#eventEnd').value;if(!title||!start)throw new Error('Укажите название и начало события.');if(end&&new Date(end)<new Date(start))throw new Error('Окончание не может быть раньше начала.');queryError(await sb.from('calendar_events').insert({title,description:$('#eventDescription').value.trim(),event_type:'event',starts_at:new Date(start).toISOString(),ends_at:end?new Date(end).toISOString():null,school_id:$('#eventSchool').value||null,department_id:$('#eventDepartment').value||null,created_by:me.id}));closeModal();renderCalendar()}catch(error){toast(error.message,'error')}finally{setBusy(button,false)}};
};

saveDocument = async function(){
  const button=$('#saveDocument');setBusy(button,true,'Загружаем…');
  try{
    const file=$('#docFile').files[0],title=$('#docTitle').value.trim(),visibility=$('#docVisibility').value,school=$('#docSchool').value||null,department=$('#docDep').value||null;
    if(!title)throw new Error('Введите название документа.');
    if(file&&file.size>50*1024*1024)throw new Error('Размер файла превышает 50 МБ.');
    if(visibility==='private'&&((school?1:0)+(department?1:0)!==1))throw new Error('Для частного документа выберите одну школу или один отдел.');
    let path='',name='';
    if(file){path=`${me.id}/documents/${Date.now()}-${fileSafe(file.name)}`;const upload=await sb.storage.from('roo-documents').upload(path,file,{upsert:false});if(upload.error)throw upload.error;name=file.name}
    const payload={title,category:$('#docCat').value,document_number:$('#docNumber').value.trim()||null,document_date:$('#docDate').value||null,description:$('#docDescription').value.trim(),visibility,school_id:school,department_id:department,storage_path:path||null,file_name:name||null,created_by:me.id};
    queryError(await sb.from('documents').insert(payload));await audit('Добавлен документ','document','',{title});closeModal();toast('Документ добавлен');renderDocuments();
  }catch(error){toast(error.message,'error')}finally{setBusy(button,false)}
};

openUser = async function(id){
  if(me.role!=='roo_head'){toast('Назначать роли может только начальник РОО','error');return}
  const user=(await loadProfiles()).find(x=>x.id===id);if(!user)return;
  const [schools,deps]=await Promise.all([loadSchools(),loadDepartments()]);
  const own=id===me.id;
  modal(`<h2>Настройка пользователя</h2><p><b>${esc(user.full_name||'')}</b><br>${esc(user.email||'')}</p>${own?'<div class="notice warn">Собственную роль и статус нельзя изменить из интерфейса — это защищает главный аккаунт.</div>':''}<div class="grid cols-2"><label>Роль<select id="userRole" ${own?'disabled':''}>${Object.entries(ROLE_LABELS).map(([role,label])=>`<option value="${role}" ${user.role===role?'selected':''}>${label}</option>`).join('')}</select></label><label>Статус<select id="userStatus" ${own?'disabled':''}><option value="pending" ${user.status==='pending'?'selected':''}>Ожидает</option><option value="active" ${user.status==='active'?'selected':''}>Активен</option><option value="blocked" ${user.status==='blocked'?'selected':''}>Заблокирован</option></select></label><label>Школа<select id="userSchool"><option value="">Не выбрана</option>${schools.map(s=>`<option value="${s.id}" ${user.school_id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label>Отдел<select id="userDep"><option value="">Не выбран</option>${deps.map(d=>`<option value="${d.id}" ${user.department_id===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label></div><div class="form-actions"><button id="saveUser" class="primary" type="button" ${own?'disabled':''}>Сохранить доступ</button><button class="ghost" type="button" data-close>Отмена</button></div>`);
  $('[data-close]').onclick=closeModal;
  if(own)return;
  $('#saveUser').onclick=async()=>{const button=$('#saveUser');setBusy(button,true);try{const role=$('#userRole').value,status=$('#userStatus').value;let school_id=$('#userSchool').value||null,department_id=$('#userDep').value||null;if(role.startsWith('school_')){department_id=null;if(!school_id)throw new Error('Для школьной роли выберите школу.')}else if(role.startsWith('department_')){school_id=null;if(!department_id)throw new Error('Для роли отдела выберите отдел.')}else if(role.startsWith('roo_')||role==='pending'){school_id=null;department_id=null}const result=await sb.rpc('assign_user_access_v28',{target_user:id,new_role:role,new_status:status,new_school:school_id,new_department:department_id});if(result.error)throw result.error;await audit('Назначена роль','profile',id,{role,status});cache.profiles=null;toast('Доступ обновлён');closeModal();renderUsers()}catch(error){toast(error.message,'error')}finally{setBusy(button,false)}};
};

saveBranding = async function(){
  const button=$('#saveBranding');setBusy(button,true);
  try{
    const file=$('#brandingLogo').files[0];let logo_url=branding.logo_url||'';
    if(file){if(file.size>5*1024*1024)throw new Error('Логотип больше 5 МБ.');const path=`${me.id}/branding/logo-${Date.now()}-${fileSafe(file.name)}`;const upload=await sb.storage.from('roo-public').upload(path,file,{upsert:false});if(upload.error)throw upload.error;logo_url=sb.storage.from('roo-public').getPublicUrl(path).data.publicUrl}
    const value={logo_url,background:$('#brandingBackground').value,padding:Number($('#brandingPadding').value),short_name:$('#brandingShort').value.trim()||'Ачхой-Мартан',subtitle:$('#brandingSubtitle').value.trim()||'Отдел образования',full_name:$('#brandingFull').value.trim()||'Отдел образования Ачхой-Мартановского района'};
    queryError(await sb.from('site_settings').upsert({key:'branding',value,updated_by:me.id,updated_at:new Date().toISOString()}));branding=value;applyBranding();toast('Оформление сохранено')
  }catch(error){toast(error.message,'error')}finally{setBusy(button,false)}
};

showNotifications = async function(){
  const notifications=queryError(await sb.from('notifications').select('*').order('created_at',{ascending:false}).limit(50));
  modal(`<div class="section-title"><h2>Уведомления</h2>${notifications.some(x=>!x.is_read)?'<button id="readAll" class="secondary" type="button">Отметить всё прочитанным</button>':''}</div>${notifications.length?`<div class="timeline notification-list">${notifications.map(x=>`<button type="button" class="timeline-item notification-item ${x.is_read?'is-read':''}" data-notification="${x.id}" data-page="${esc(x.link_page||'')}"><i></i><span><b>${esc(x.title)}</b><span class="pre-wrap">${esc(x.body||'')}</span><small>${fmtDate(x.created_at,true)}</small></span></button>`).join('')}</div>`:empty('Уведомлений нет','Новые события появятся здесь.')}`);
  const mark=async ids=>{if(!ids.length)return;const result=await sb.rpc('mark_notifications_read_v28',{notification_ids:ids});if(result.error)throw result.error;await refreshNotifications()};
  if($('#readAll'))$('#readAll').onclick=async()=>{try{await mark(notifications.filter(x=>!x.is_read).map(x=>x.id));closeModal()}catch(error){toast(error.message,'error')}};
  $$('[data-notification]').forEach(button=>button.onclick=async()=>{try{await mark([button.dataset.notification]);const page=button.dataset.page;closeModal();if(page&&PAGE_META[page])navigate(page)}catch(error){toast(error.message,'error')}});
};
/* ==================== V28.3 FINAL FUNCTIONAL OVERRIDES ==================== */

saveNewTask = async function(){
  const button=$('#saveTask');setBusy(button,true,'Создаём…');
  try{
    const title=$('#taskTitle').value.trim(),type=$('#taskTargetType').value,dueValue=$('#taskDue').value,target=$('#taskTarget').value;
    if(!title)throw new Error('Введите название поручения.');
    if(!dueValue)throw new Error('Укажите дату и время исполнения поручения.');
    if(type!=='all_schools'&&!target)throw new Error('Выберите получателя поручения.');
    const due=new Date(dueValue);if(Number.isNaN(due.getTime()))throw new Error('Указан некорректный срок.');
    const payload={title,description:$('#taskDescription').value.trim(),instructions:$('#taskInstructions').value.trim(),category:$('#taskCategory').value,priority:$('#taskPriority').value,due_at:due.toISOString(),created_by:me.id,updated_by:me.id,requires_director_approval:$('#taskDirectorApproval').checked,assigned_to_all_schools:type==='all_schools',status:'new'};
    if(type==='school')payload.assigned_school_id=target;if(type==='department')payload.assigned_department_id=target;
    const task=queryError(await sb.from('tasks').insert(payload).select().single());
    let recipients=[];
    if(type==='all_schools')recipients=(await loadSchools()).map(s=>({task_id:task.id,school_id:s.id,status:'new'}));
    else if(type==='school')recipients=[{task_id:task.id,school_id:target,status:'new'}];
    else recipients=[{task_id:task.id,department_id:target,status:'new'}];
    if(!recipients.length)throw new Error('Получатели не найдены. Добавьте школы или выберите отдел.');
    queryError(await sb.from('task_recipients').insert(recipients));
    const notifications=recipients.map(row=>({school_id:row.school_id||null,department_id:row.department_id||null,title:'Новое поручение',body:`${title}. Срок: ${fmtDate(due,true)}`,link_page:'tasks',entity_id:task.id}));
    const notice=await sb.from('notifications').insert(notifications);if(notice.error)console.warn(notice.error);
    await audit('Создано поручение','task',task.id,{title,recipients:recipients.length,due_at:due.toISOString()});
    closeModal();toast('Поручение создано');renderTasks();
  }catch(error){toast(error.message,'error')}finally{setBusy(button,false)}
};

openSchool = async function(id,own=false){
  const school=id?queryError(await sb.from('schools').select('*').eq('id',id).single()):{};
  const history=id?await sb.from('school_history').select('*,profiles(full_name)').eq('school_id',id).order('created_at',{ascending:false}).limit(20):{data:[]};
  const editable=isRoo()||(me.role==='school_director'&&me.school_id===id);
  const input=(key,label,type='text',extra='')=>`<label>${label}<input data-school-field="${key}" type="${type}" value="${esc(school[key]??'')}" ${type==='number'?'min="0" step="1"':''} ${extra} ${editable?'':'disabled'}></label>`;
  const check=(key,label)=>`<label class="checkbox-label"><input data-school-check="${key}" type="checkbox" ${school[key]?'checked':''} ${editable?'':'disabled'}> <span>${label}</span></label>`;
  modal(`<div class="section-title"><div class="min-zero"><h2>${esc(school.name||'Новая школа')}</h2><span class="small">Заполненность паспорта: ${schoolPercent(school)}%</span></div>${school.profile_status?badge(school.profile_status):''}</div><div class="tabs school-tabs" id="schoolTabs"><button type="button" class="tab active" data-stab="main">Основное</button><button type="button" class="tab" data-stab="students">Ученики</button><button type="button" class="tab" data-stab="infra">Инфраструктура</button><button type="button" class="tab" data-stab="history">История</button></div><section data-sp="main"><div class="grid cols-2">${input('code','Код образовательной организации')}${input('name','Полное название')}${input('short_name','Краткое название')}${input('locality','Населённый пункт')}${input('address','Адрес')}${input('phone','Телефон','tel')}${input('email','Электронная почта','email')}${input('website','Сайт','url')}${input('director_name','Ф.И.О. директора')}${input('deputy_names','Заместители')}${input('responsible_name','Ответственный за отчётность')}${input('responsible_phone','Телефон ответственного','tel')}</div></section><section data-sp="students" hidden><div class="grid cols-3">${input('students_total','Всего учеников','number')}${input('classes_total','Количество классов','number')}${input('teachers_total','Педагогов','number')}${[1,2,3,4,5,6,7,8,9,10,11].map(n=>input(`grade${n}_students`,`${n} класс`,'number')).join('')}</div></section><section data-sp="infra" hidden><div class="grid cols-2">${input('capacity','Проектная вместимость','number')}${input('shifts_count','Количество смен','number')}${input('internet_quality','Качество интернета')}${input('building_condition','Состояние здания')}${check('has_meals','Организовано питание')}${check('has_transport','Есть школьный транспорт')}</div><label>Примечание<textarea data-school-field="notes" ${editable?'':'disabled'}>${esc(school.notes||'')}</textarea></label></section><section data-sp="history" hidden>${(history.data||[]).length?`<div class="timeline">${history.data.map(row=>`<div class="timeline-item"><i></i><div><b>${esc(row.action)}</b><div class="small">${esc(row.profiles?.full_name||'Система')} · ${fmtDate(row.created_at,true)}</div></div></div>`).join('')}</div>`:empty('История пуста','Изменения паспорта появятся здесь.')}</section>${editable?`<div class="form-actions top-gap"><button id="saveSchool" class="primary" type="button">Сохранить</button>${me.role==='school_director'?'<button id="submitSchool" class="secondary" type="button">Отправить на утверждение</button>':''}${isRoo()&&id?'<button id="approveSchool" class="secondary" type="button">Утвердить паспорт</button>':''}<button class="ghost" data-close type="button">Закрыть</button></div>`:''}`);
  $$('[data-stab]').forEach(button=>button.onclick=()=>{$$('[data-stab]').forEach(x=>x.classList.toggle('active',x===button));$$('[data-sp]').forEach(section=>section.hidden=section.dataset.sp!==button.dataset.stab)});
  if($('[data-close]'))$('[data-close]').onclick=closeModal;
  if($('#saveSchool'))$('#saveSchool').onclick=()=>saveSchool(id,school);
  if($('#submitSchool'))$('#submitSchool').onclick=()=>saveSchool(id,school,'submitted');
  if($('#approveSchool'))$('#approveSchool').onclick=()=>saveSchool(id,school,'approved');
};

saveSchool = async function(id,old,status){
  const button=status==='approved'?$('#approveSchool'):status==='submitted'?$('#submitSchool'):$('#saveSchool');setBusy(button,true);
  try{
    const payload={};
    $$('[data-school-field]').forEach(input=>{let value=input.value.trim();if(input.type==='number')value=value===''?null:Number(value);payload[input.dataset.schoolField]=value});
    $$('[data-school-check]').forEach(input=>payload[input.dataset.schoolCheck]=input.checked);
    if(!payload.name)throw new Error('Укажите полное название школы.');
    for(const [key,value] of Object.entries(payload))if(typeof value==='number'&&(!Number.isFinite(value)||value<0))throw new Error('Числовые показатели не могут быть отрицательными.');
    const grades=[1,2,3,4,5,6,7,8,9,10,11].reduce((sum,n)=>sum+(Number(payload[`grade${n}_students`])||0),0);
    if(payload.students_total!=null&&grades>payload.students_total)throw new Error('Сумма учеников по классам больше общего количества учеников.');
    if(status)payload.profile_status=status;if(status==='approved'){payload.approved_by=me.id;payload.approved_at=new Date().toISOString()}
    const result=id?await sb.from('schools').update(payload).eq('id',id).select().single():await sb.from('schools').insert(payload).select().single();
    const saved=queryError(result);
    queryError(await sb.from('school_history').insert({school_id:saved.id,changed_by:me.id,action:status==='approved'?'Паспорт утверждён':status==='submitted'?'Паспорт отправлен на утверждение':'Паспорт школы обновлён',snapshot:saved}));
    await audit('Изменён паспорт школы','school',saved.id,{status:status||'saved'});cache.schools=null;toast('Данные школы сохранены');closeModal();currentPage==='schools'?renderSchools():renderMySchool();
  }catch(error){toast(error.message,'error')}finally{setBusy(button,false)}
};

renderRating = async function(){
  const result=await sb.from('school_performance_v27').select('*').order('rating',{ascending:false,nullsFirst:false});queryError(result);const rows=result.data||[];
  $('#content').innerHTML=`<div class="panel"><div class="section-title"><div class="min-zero"><h3>Рейтинг школ</h3><p class="small">Показатель появляется только после реального исполнения поручений. Школы без данных не получают автоматические 100%.</p></div>${rows.length?'<button id="ratingCsv" class="secondary" type="button">Скачать CSV</button>':''}</div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>№</th><th>Школа</th><th>Поручений</th><th>Принято</th><th>Возвратов</th><th>Просрочено</th><th>Рейтинг</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td>${index+1}</td><td>${esc(row.school_name)}</td><td>${row.assigned_count??0}</td><td>${row.accepted_count??0}</td><td>${row.returned_count??0}</td><td>${row.overdue_count??0}</td><td>${row.rating==null?'<span class="small">Не рассчитан</span>':`<b class="${row.rating>=80?'rating-good':row.rating>=60?'rating-mid':'rating-bad'}">${row.rating}%</b>`}</td></tr>`).join('')}</tbody></table></div>`:empty('Рейтинг ещё не рассчитан','Он появится после создания поручений и проверки ответов школ.')}</div>`;
  if($('#ratingCsv'))$('#ratingCsv').onclick=()=>download(new Blob(['\ufeffШкола;Поручений;Принято;Возвратов;Просрочено;Рейтинг\r\n'+rows.map(row=>[row.school_name,row.assigned_count??0,row.accepted_count??0,row.returned_count??0,row.overdue_count??0,row.rating??''].map(value=>`"${String(value).replaceAll('"','""')}"`).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'Рейтинг_школ.csv');
};

renderUsers = async function(){
  if(me.role!=='roo_head'){ $('#content').innerHTML=empty('Нет доступа','Назначать роли и управлять аккаунтами может только начальник РОО.');return }
  const rows=await loadProfiles(true);
  $('#content').innerHTML=`<div class="toolbar"><div class="filters"><input id="userSearch" placeholder="Поиск по Ф.И.О. или почте"><select id="userRoleFilter"><option value="">Все роли</option>${Object.entries(ROLE_LABELS).map(([key,value])=>`<option value="${key}">${value}</option>`).join('')}</select><select id="userStatusFilter"><option value="">Все статусы</option><option value="pending">Ожидает</option><option value="active">Активен</option><option value="blocked">Заблокирован</option></select></div></div><div id="usersTable"></div>`;
  const draw=()=>{const search=$('#userSearch').value.toLowerCase(),role=$('#userRoleFilter').value,status=$('#userStatusFilter').value;const filtered=rows.filter(user=>(!search||`${user.full_name||''} ${user.email||''}`.toLowerCase().includes(search))&&(!role||user.role===role)&&(!status||user.status===status));$('#usersTable').innerHTML=filtered.length?`<div class="table-wrap"><table><thead><tr><th>Пользователь</th><th>Роль</th><th>Организация</th><th>Статус</th><th></th></tr></thead><tbody>${filtered.map(user=>`<tr><td><b>${esc(user.full_name||'Без имени')}</b><br><span class="small">${esc(user.email||'')}</span></td><td>${esc(ROLE_LABELS[user.role]||user.role)}</td><td>${esc(user.schools?.name||user.departments?.name||'—')}</td><td>${badge(user.status)}</td><td><button class="link-btn" data-user="${user.id}" type="button">Настроить</button></td></tr>`).join('')}</tbody></table></div>`:empty('Пользователи не найдены','Измените фильтр или дождитесь новых заявок.');$$('[data-user]').forEach(button=>button.onclick=()=>openUser(button.dataset.user))};
  draw();$('#userSearch').oninput=draw;$('#userRoleFilter').onchange=draw;$('#userStatusFilter').onchange=draw;
};

openAppeal = async function(id){
  const deps=await loadDepartments(),appeal=id?queryError(await sb.from('appeals').select('*').eq('id',id).single()):{};
  modal(`<h2>${id?'Обращение':'Новое обращение'}</h2><div class="grid cols-2"><label>Номер<input id="appealNumber" value="${esc(appeal.number||'')}"></label><label>Заявитель<input id="appealApplicant" value="${esc(appeal.applicant_name||'')}"></label><label>Контакты<input id="appealContacts" value="${esc(appeal.applicant_contacts||'')}"></label><label>Срок<input id="appealDue" type="date" value="${appeal.due_at?String(appeal.due_at).slice(0,10):''}"></label><label>Отдел<select id="appealDep"><option value="">Не выбран</option>${deps.map(dep=>`<option value="${dep.id}" ${appeal.assigned_department_id===dep.id?'selected':''}>${esc(dep.name)}</option>`).join('')}</select></label><label>Статус<select id="appealStatus">${['new','in_progress','answered','closed','returned'].map(status=>`<option value="${status}" ${appeal.status===status?'selected':''}>${STATUS_LABELS[status]}</option>`).join('')}</select></label></div><label>Тема<input id="appealSubject" maxlength="250" value="${esc(appeal.subject||'')}"></label><label>Текст обращения<textarea id="appealMessage">${esc(appeal.message||'')}</textarea></label><label>Ответ<textarea id="appealResponse">${esc(appeal.response_text||'')}</textarea></label><div class="form-actions"><button id="saveAppeal" class="primary" type="button">Сохранить</button><button class="ghost" data-close type="button">Отмена</button></div>`);
  $('[data-close]').onclick=closeModal;
  $('#saveAppeal').onclick=async()=>{const button=$('#saveAppeal');setBusy(button,true);try{const subject=$('#appealSubject').value.trim(),status=$('#appealStatus').value,response=$('#appealResponse').value.trim();if(!subject)throw new Error('Введите тему обращения.');if(['answered','closed'].includes(status)&&!response)throw new Error('Для статуса «Ответ дан» или «Закрыто» заполните ответ.');const payload={number:$('#appealNumber').value.trim()||null,applicant_name:$('#appealApplicant').value.trim(),applicant_contacts:$('#appealContacts').value.trim(),subject,message:$('#appealMessage').value.trim(),status,due_at:$('#appealDue').value?new Date($('#appealDue').value+'T12:00:00').toISOString():null,assigned_department_id:$('#appealDep').value||null,response_text:response,created_by:appeal.created_by||me.id};queryError(id?await sb.from('appeals').update(payload).eq('id',id):await sb.from('appeals').insert(payload));await audit(id?'Обращение обновлено':'Обращение создано','appeal',id||'',{subject,status});closeModal();renderAppeals()}catch(error){toast(error.message,'error')}finally{setBusy(button,false)}};
};

openInspection = async function(id){
  const schools=await loadSchools(),inspection=id?queryError(await sb.from('inspections').select('*').eq('id',id).single()):{};
  modal(`<h2>${id?'Проверка':'Новая проверка'}</h2><div class="grid cols-2"><label>Школа<select id="inspectionSchool"><option value="">Выберите школу</option>${schools.map(school=>`<option value="${school.id}" ${inspection.school_id===school.id?'selected':''}>${esc(school.name)}</option>`).join('')}</select></label><label>Название<input id="inspectionTitle" maxlength="250" value="${esc(inspection.title||'')}"></label><label>Тип<input id="inspectionType" value="${esc(inspection.inspection_type||'')}"></label><label>Дата<input id="inspectionDate" type="datetime-local" value="${inspection.planned_at?isoLocal(inspection.planned_at):''}"></label><label>Проверяющие<input id="inspectionPeople" value="${esc(inspection.inspectors||'')}"></label><label>Статус<select id="inspectionStatus">${['planned','in_progress','completed','cancelled'].map(status=>`<option value="${status}" ${inspection.status===status?'selected':''}>${STATUS_LABELS[status]}</option>`).join('')}</select></label></div><label>Выявленные нарушения<textarea id="inspectionFindings">${esc(inspection.findings||'')}</textarea></label><label>Рекомендации<textarea id="inspectionRecommendations">${esc(inspection.recommendations||'')}</textarea></label>${isRoo()?'<div class="form-actions"><button id="saveInspection" class="primary" type="button">Сохранить</button><button class="ghost" data-close type="button">Отмена</button></div>':''}`);
  if($('[data-close]'))$('[data-close]').onclick=closeModal;
  if($('#saveInspection'))$('#saveInspection').onclick=async()=>{const button=$('#saveInspection');setBusy(button,true);try{const school_id=$('#inspectionSchool').value,title=$('#inspectionTitle').value.trim(),status=$('#inspectionStatus').value;if(!school_id||!title)throw new Error('Выберите школу и укажите название проверки.');if(status==='completed'&&!$('#inspectionFindings').value.trim()&&!$('#inspectionRecommendations').value.trim())throw new Error('Для завершённой проверки укажите результаты или рекомендации.');const payload={school_id,title,inspection_type:$('#inspectionType').value.trim(),planned_at:$('#inspectionDate').value?new Date($('#inspectionDate').value).toISOString():null,inspectors:$('#inspectionPeople').value.trim(),status,findings:$('#inspectionFindings').value.trim(),recommendations:$('#inspectionRecommendations').value.trim(),created_by:inspection.created_by||me.id,completed_at:status==='completed'?(inspection.completed_at||new Date().toISOString()):null};queryError(id?await sb.from('inspections').update(payload).eq('id',id):await sb.from('inspections').insert(payload));await audit(id?'Проверка обновлена':'Проверка создана','inspection',id||'',{title,status});closeModal();renderInspections()}catch(error){toast(error.message,'error')}finally{setBusy(button,false)}};
};

previewBrandingLogo = async function(){
  const file=$('#brandingLogo')?.files?.[0];if(!file)return;if(file.size>5*1024*1024){toast('Логотип больше 5 МБ.','error');$('#brandingLogo').value='';return}
  const img=$('#settingsLogoImage'),fallback=$('.brand-fallback',$('#settingsLogoPreview')),url=URL.createObjectURL(file);img.src=url;img.hidden=false;fallback.hidden=true;img.onload=()=>URL.revokeObjectURL(url);img.onerror=()=>{URL.revokeObjectURL(url);img.hidden=true;fallback.hidden=false;toast('Не удалось открыть изображение логотипа.','error')};
  try{const detected=await window.ROOAnalysisEngine.detectLogoBackground(file);if(!detected.transparent){const canvas=document.createElement('canvas').getContext('2d');canvas.fillStyle=detected.background;$('#brandingBackground').value=rgbToHex(canvas.fillStyle)}}catch(error){console.warn(error)}updateLogoPreview();
};

/* ==================== END V28.3 FINAL FUNCTIONAL OVERRIDES ==================== */

/* ==================== END V28 FINAL AUDIT OVERRIDES ==================== */

window.addEventListener('DOMContentLoaded',boot);
})();
