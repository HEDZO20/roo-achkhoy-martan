'use strict';

/* ONLINE V24 — подключение интерфейса к Supabase, качество данных и история импортов. */
(() => {
  const cfg = window.ROO_SUPABASE_CONFIG;
  if (!cfg || !window.supabase?.createClient) {
    console.error('Supabase SDK или config.js не загружены');
    return;
  }

  const client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.rooSupabase = client;

  let onlineReady = false;
  let currentProfile = null;
  let currentSession = null;
  let syncing = false;
  let reloadTimer = null;
  let taskSyncTimer = null;
  let submissionSyncTimer = null;
  let examSyncTimer = null;
  let auditSyncTimer = null;
  let designSyncTimer = null;
  let pendingExamImport = null;
  const uploadQueue = new Map();
  const fieldUploadQueue = new Map();
  const remoteFilesByName = new Map();
  const syncedAuditFingerprints = new Set();

  const original = {};
  const ROLE_LABELS = {
    chief:'Начальник РОО', deputy:'Заместитель начальника РОО', department_head:'Начальник отдела',
    specialist:'Специалист отдела', school_director:'Директор школы', school_staff:'Ответственный сотрудник школы',
    pending:'Ожидает активации'
  };

  const statusText = {
    draft:'Черновик', pending_approval:'На согласовании', active:'Активно', review:'На проверке',
    overdue:'Просрочено', done:'Завершено', cancelled:'Отменено'
  };

  const submissionStatus = {
    draft:'Черновик', director:'У директора', review:'На проверке РОО', returned:'На исправлении', accepted:'Принято'
  };

  const onlineCSS = `
    body.roo-online #roleSelect, body.roo-online label[for="roleSelect"], body.roo-online .login-options,
    body.roo-online #quickRoleSwitcher, body.roo-online #resetDemoButton, body.roo-online #resetDemoFromLogin,
    body.roo-online #demoRoleLoginLabel, body.roo-online #demoRoleProfileLabel { display:none !important; }
    body.roo-online .login-card-head span:last-child{font-weight:700;color:#23663b}
    .roo-online-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
    .roo-online-actions button{min-height:44px;border-radius:13px;border:1px solid var(--border,#dce6d7);background:rgba(255,255,255,.68);font-weight:700;cursor:pointer}
    .roo-online-actions button:first-child{background:#23663b;color:#fff;border-color:#23663b}
    .roo-online-state{margin-top:12px;padding:11px 13px;border-radius:12px;background:#edf6ed;color:#255e38;font-size:13px;line-height:1.45}
    .roo-online-state.error{background:#fff0ef;color:#a62b25}
    .roo-online-state.warning{background:#fff7e6;color:#8b5b00}
    .roo-cloud-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#e7f5e8;color:#23663b;font-size:12px;font-weight:800}
    .roo-cloud-dot{width:8px;height:8px;border-radius:50%;background:#35a853;box-shadow:0 0 0 4px rgba(53,168,83,.12)}
    .roo-setup-panel{padding:18px;border-radius:16px;background:#fff8e8;border:1px solid #efd79b;color:#684b0b;line-height:1.55}
    .roo-setup-panel code{display:block;background:#fff;padding:8px;border-radius:8px;margin:8px 0;word-break:break-all}
    .roo-sync-spinner{display:inline-block;width:13px;height:13px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:roo-spin .7s linear infinite}
    @keyframes roo-spin{to{transform:rotate(360deg)}}
  `;


  function hideLegacyDemoControls(){
    const hideNode=(node)=>{ if(node){ node.hidden=true; node.style.display='none'; node.setAttribute('aria-hidden','true'); } };
    const loginRole=document.getElementById('roleSelect');
    hideNode(loginRole);
    hideNode(document.getElementById('demoRoleLoginLabel'));
    if(loginRole?.previousElementSibling?.tagName==='LABEL') hideNode(loginRole.previousElementSibling);

    const quickRole=document.getElementById('quickRoleSwitcher');
    hideNode(quickRole);
    hideNode(document.getElementById('demoRoleProfileLabel'));
    if(quickRole?.previousElementSibling?.tagName==='LABEL') hideNode(quickRole.previousElementSibling);

    hideNode(document.getElementById('resetDemoButton'));
    hideNode(document.getElementById('resetDemoFromLogin'));
  }

  function injectStyle(){
    const style=document.createElement('style'); style.textContent=onlineCSS; document.head.appendChild(style);
    document.body.classList.add('roo-online');
    hideLegacyDemoControls();
  }

  function setLoginState(message, type=''){
    const el=document.getElementById('rooOnlineState');
    if(!el)return;
    el.textContent=message;
    el.className=`roo-online-state ${type}`.trim();
  }

  function initials(name='Пользователь'){
    return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'П';
  }

  function formatDateTime(value){
    if(!value)return '';
    const d=new Date(value); if(Number.isNaN(d.getTime()))return String(value);
    return d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',','');
  }

  function formatDeadline(value){
    if(!value)return 'Срок не указан';
    const d=new Date(value); if(Number.isNaN(d.getTime()))return String(value);
    return d.toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).replace(',','');
  }

  function safeJSON(value, fallback={}){
    if(value && typeof value==='object')return value;
    try{return JSON.parse(value)}catch(_){return fallback}
  }

  function onlineError(error, fallback='Ошибка подключения'){
    console.error(error);
    const message=error?.message||fallback;
    if(typeof showToast==='function')showToast(message);
    return message;
  }

  function addOnlineLoginControls(){
    const card=document.querySelector('.login-card');
    const note=card?.querySelector('.demo-note');
    if(note){
      note.innerHTML='<strong>Онлайн-система Supabase</strong><span>Войдите по своей рабочей почте. При первом входе создайте пароль.</span>';
    }
    const roleSelect=document.getElementById('roleSelect');if(roleSelect?.previousElementSibling?.tagName==='LABEL')roleSelect.previousElementSibling.style.display='none';
    const form=document.getElementById('loginForm');
    if(!form || document.getElementById('rooRegisterButton'))return;
    const actions=document.createElement('div');
    actions.className='roo-online-actions';
    actions.innerHTML='<button type="button" id="rooRegisterButton">Первый вход / создать пароль</button><button type="button" id="rooResetPasswordButton">Забыли пароль</button>';
    form.appendChild(actions);
    const stateBox=document.createElement('div');
    stateBox.id='rooOnlineState'; stateBox.className='roo-online-state'; stateBox.textContent='Проверка подключения к Supabase…';
    form.appendChild(stateBox);
    document.querySelector('.login-card-head span:last-child').textContent='ONLINE V24 · рабочая онлайн-система';
  }

  function updateVersionUI(){
    hideLegacyDemoControls();
    const version=document.getElementById('versionButton'); if(version)version.textContent='V24';
    const head=document.querySelector('.login-card-head span:last-child'); if(head)head.textContent='ONLINE V24 · Supabase подключён';
    const banner=document.getElementById('systemUpdateBanner');
    if(banner){
      const strong=banner.querySelector('strong'); const small=banner.querySelector('small');
      if(strong)strong.textContent='Онлайн-система V24';
      if(small)small.textContent='Данные хранятся в Supabase и доступны пользователям с разных устройств.';
    }
    const top=document.querySelector('.v5-header-brand');
    if(top && !top.querySelector('.roo-cloud-badge')) top.insertAdjacentHTML('beforeend','<span class="roo-cloud-badge"><i class="roo-cloud-dot"></i> Облако подключено</span>');
  }

  async function getProfile(userId){
    const {data,error}=await client.from('profiles').select('*').eq('id',userId).maybeSingle();
    if(error)throw error;
    return data;
  }

  function scopeForProfile(profile){
    if(profile.role==='chief')return 'Все отделы и школы района';
    if(profile.role==='deputy')return 'Курируемые отделы и все школы';
    if(profile.department_id){
      const d=DEPARTMENTS.find(x=>x.id===profile.department_id); return d?`Только: ${d.name}`:'Назначенный отдел';
    }
    if(profile.school_id){
      const s=SCHOOLS.find(x=>x.id===profile.school_id); return s?s.name:'Назначенная школа';
    }
    return 'Ограниченный доступ';
  }

  function installProfile(profile, session){
    currentProfile=profile; currentSession=session; state.role=profile.role; window.ROOCurrentProfile=profile; window.ROOCurrentSession=session;
    const id=`remote-${profile.id}`;
    const user={
      id, role:profile.role, name:profile.full_name||profile.email, initials:initials(profile.full_name||profile.email),
      email:profile.email, unit:'', departmentId:profile.department_id||undefined, schoolId:profile.school_id||undefined,
      lastLogin:'Сейчас', active:profile.active
    };
    const oldIndex=USERS.findIndex(x=>x.id===id); if(oldIndex>=0)USERS.splice(oldIndex,1,user); else USERS.push(user);
    ROLE_USER_MAP[profile.role]=id;
    if(ROLE_CONFIG[profile.role]){
      ROLE_CONFIG[profile.role].scope=scopeForProfile(profile);
      if(profile.role==='department_head'||profile.role==='specialist'){
        const canExam=['methodical','information'].includes(profile.department_id);
        ROLE_CONFIG[profile.role].pages=ROLE_CONFIG[profile.role].pages.filter(p=>p!=='exams');
        if(canExam)ROLE_CONFIG[profile.role].pages.splice(Math.max(0,ROLE_CONFIG[profile.role].pages.indexOf('rating')+1),0,'exams');
      }
    }
  }

  function mapDepartment(row){
    return {
      id:row.id,name:row.name,short:row.short_name||row.name.replace(/^Отдел\s+/i,''),icon:(row.short_name||row.name).slice(0,1).toUpperCase(),
      head:row.head_name||'Начальник отдела не указан',email:row.email||'',staff:0,active:0,overdue:0,completion:null
    };
  }

  function finiteOrNull(value){
    if(value===null||value===undefined||value==='')return null;
    const n=Number(value);return Number.isFinite(n)?n:null;
  }

  function mapSchool(row,index){
    const m=safeJSON(row.metadata,{});
    const storedRating=finiteOrNull(row.rating);
    return {
      id:row.id,name:row.name,locality:row.locality||'',director:row.director_name||'Не указан',responsible:row.responsible_name||'Не указан',
      rating:storedRating,june:finiteOrNull(m.june),year:finiteOrNull(m.year),place:null,
      tasks:0,onTime:0,overdue:0,returned:0,
      quality:finiteOrNull(m.quality),completeness:finiteOrNull(m.completeness),response:finiteOrNull(m.response),trend:finiteOrNull(m.trend),
      risk:storedRating===null?'unknown':storedRating>=90?'good':storedRating>=75?'attention':'critical',online:false,email:row.email||'',metadata:m
    };
  }

  function deriveSchoolPerformance(taskRows,submissionRows){
    const taskById=new Map((taskRows||[]).map(t=>[Number(t.id),t]));
    const submissionByKey=new Map((submissionRows||[]).map(s=>[`${Number(s.task_id)}:${s.school_id}`,s]));
    const now=Date.now();
    SCHOOLS.forEach(school=>{
      const recipients=[];
      (taskRows||[]).forEach(task=>(task.task_recipients||[]).forEach(rec=>{if(rec.school_id===school.id)recipients.push({task,rec,submission:submissionByKey.get(`${Number(task.id)}:${school.id}`)});}));
      school.tasks=recipients.length;
      school.overdue=recipients.filter(x=>x.rec.status==='overdue'||(Date.parse(x.task.deadline)<now&&!['accepted'].includes(x.rec.status))).length;
      school.returned=recipients.filter(x=>x.rec.status==='returned'||x.submission?.status==='returned').length;
      school.onTime=recipients.filter(x=>{
        if(x.rec.status!=='accepted')return false;
        const completed=Date.parse(x.rec.completed_at||x.rec.accepted_at||x.rec.updated_at||'');
        const deadline=Date.parse(x.task.deadline||'');
        return Number.isFinite(completed)&&Number.isFinite(deadline)&&completed<=deadline;
      }).length;
      const closed=recipients.filter(x=>['accepted','overdue'].includes(x.rec.status));
      const deadlineScore=closed.length?school.onTime/closed.length*100:null;
      const reviewed=recipients.filter(x=>['accepted','returned'].includes(x.submission?.status||x.rec.status));
      school.quality=reviewed.length?reviewed.filter(x=>(x.submission?.status||x.rec.status)==='accepted').length/reviewed.length*100:null;
      const submitted=recipients.filter(x=>x.submission&&['director','review','returned','accepted'].includes(x.submission.status));
      school.completeness=submitted.length?submitted.filter(x=>{
        const answers=safeJSON(x.submission.answers,{});const files=safeJSON(x.submission.field_files,{});
        return Object.keys(answers).length>0||Object.keys(files).length>0;
      }).length/submitted.length*100:null;
      const opened=recipients.filter(x=>x.rec.opened_at);
      school.response=opened.length?opened.filter(x=>{
        const openedAt=Date.parse(x.rec.opened_at);const createdAt=Date.parse(x.task.created_at||'');
        return Number.isFinite(openedAt)&&Number.isFinite(createdAt)&&(openedAt-createdAt)<=24*3600*1000;
      }).length/opened.length*100:null;
      const components=[[deadlineScore,40],[school.quality,30],[school.completeness,20],[school.response,10]].filter(([v])=>Number.isFinite(v));
      if(components.length){
        const weight=components.reduce((a,[,w])=>a+w,0);
        school.rating=Math.round(components.reduce((a,[v,w])=>a+v*w,0)/weight*10)/10;
      }else if(school.tasks===0){school.rating=null;}
      school.risk=school.rating===null?'unknown':school.rating>=90?'good':school.rating>=75?'attention':'critical';
      school.online=false;
    });
    const rated=SCHOOLS.filter(s=>Number.isFinite(s.rating)).sort((a,b)=>b.rating-a.rating);
    rated.forEach((s,i)=>s.place=i+1);
  }

  function mapProfileUser(row){
    const dept=DEPARTMENTS.find(d=>d.id===row.department_id);
    const school=SCHOOLS.find(s=>s.id===row.school_id);
    return {id:`remote-${row.id}`,role:row.role,name:row.full_name||row.email,initials:initials(row.full_name||row.email),email:row.email,
      unit:dept?.name||school?.name||'Руководство РОО',departmentId:row.department_id||undefined,schoolId:row.school_id||undefined,
      lastLogin:row.last_seen_at?formatDateTime(row.last_seen_at):'Не входил',active:row.active,_profileId:row.id};
  }

  function mapTask(row){
    const recipients=row.task_recipients||[];
    const accepted=recipients.filter(x=>x.status==='accepted').length;
    const opened=recipients.filter(x=>x.opened_at).length;
    const returned=recipients.filter(x=>x.status==='returned').length;
    const overdue=recipients.filter(x=>x.status==='overdue').length;
    const total=recipients.length;
    const progress=total?Math.round((accepted/total)*100):(row.status==='done'?100:0);
    const fields=safeJSON(row.form_schema,{fields:[]}).fields||[];
    return {
      id:Number(row.id),title:row.title,departmentId:row.department_id,direction:row.direction||'',deadlineDate:row.deadline,
      deadline:formatDeadline(row.deadline),progress,completed:accepted,total,received:opened,opened,overdue,returned,
      status:row.status,statusText:statusText[row.status]||row.status,priority:row.priority||'Обычное',creator:row.creator_name||'Пользователь',
      recipients:row.recipients_mode||'all',_recipients:recipients,responseType:row.response_type||'Форма + файлы',directorApproval:row.requires_director!==false,
      approvalRoute:row.approval_route||'Автоматически',weight:Number(row.weight||1),description:row.description||'',formFields:fields,
      repeatRule:row.repeat_rule||'Не повторять',_remote:true,_creatorId:row.creator_id||null
    };
  }

  function mapSubmission(row, fileRows=[], versions=[]){
    const files=fileRows.filter(f=>f.submission_id===row.id);
    const fieldFiles={}; const extra=[];
    files.forEach(f=>{
      const meta={id:f.id,name:f.file_name,size:Number(f.size_bytes||0),type:f.mime_type||'',path:f.path,fieldLabel:f.field_label||''};
      remoteFilesByName.set(`${row.task_id}:${row.school_id}:${f.file_name}`,meta);
      if(f.field_label)fieldFiles[f.field_label]=meta; else extra.push(meta);
    });
    const history=versions.filter(v=>v.submission_id===row.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(v=>({
      time:formatDateTime(v.created_at),actor:'Пользователь системы',action:`Сохранена версия ${v.version}: ${submissionStatus[v.status]||v.status}`
    }));
    return {
      taskId:Number(row.task_id),schoolId:row.school_id,status:row.status,answers:safeJSON(row.answers,{}),files:extra,
      fieldFiles:{...safeJSON(row.field_files,{}),...fieldFiles},comment:row.comment||'',directorComment:row.director_comment||'',
      reviewerComment:row.reviewer_comment||'',version:Number(row.current_version||1),updatedAt:formatDateTime(row.updated_at),
      submittedAt:formatDateTime(row.submitted_at),history,_remoteId:row.id,_createdBy:row.created_by||null
    };
  }

  function mapExam(row,schoolMap){
    return {
      id:row.source_row_id||row.id,year:row.academic_year,name:row.student_name,school:schoolMap.get(row.school_id)||row.school_id,
      className:row.class_name||'',exam:row.exam_type,subject:row.subject,score:row.score===null?'':Number(row.score),grade:row.grade||'',
      status:row.result_status||'Сдал',lateMinutes:Number(row.late_minutes||0),period:row.period||'Основной',source:'Supabase',_remoteId:row.id,schoolId:row.school_id,importId:row.import_id||null,createdAt:row.created_at||null
    };
  }

  async function fetchAllExamResults(){
    const pageSize=1000;let from=0;const all=[];
    while(true){
      const {data,error}=await client.from('exam_results').select('*').order('created_at',{ascending:false}).range(from,from+pageSize-1);
      if(error)return {data:null,error};
      const batch=data||[];all.push(...batch);
      if(batch.length<pageSize)break;
      from+=pageSize;
      if(from>=100000)return {data:all,error:null};
    }
    return {data:all,error:null};
  }

  async function loadRemoteData({silent=false}={}){
    if(!currentSession)return;
    if(!silent)setLoginState('Загрузка данных из Supabase…');
    const [departmentsRes,schoolsRes,profilesRes,tasksRes,submissionsRes,versionsRes,filesRes,auditRes,examsRes,perfRes,designRes] = await Promise.all([
      client.from('departments').select('*').eq('active',true).order('name'),
      client.from('schools').select('*').eq('active',true).order('name'),
      client.from('profiles').select('*').order('full_name'),
      client.from('tasks').select('*,task_recipients(*)').order('created_at',{ascending:false}),
      client.from('submissions').select('*').order('updated_at',{ascending:false}),
      client.from('submission_versions').select('*').order('created_at',{ascending:false}),
      client.from('files').select('*').order('created_at',{ascending:false}),
      client.from('audit_log').select('*').order('created_at',{ascending:false}).limit(100),
      fetchAllExamResults(),
      client.from('department_performance').select('*'),
      client.from('design_settings').select('settings,updated_at').eq('id',1).maybeSingle()
    ]);

    const errors=[departmentsRes,schoolsRes,profilesRes,tasksRes,submissionsRes,versionsRes,filesRes,auditRes,examsRes,perfRes,designRes].map(x=>x.error).filter(Boolean);
    if(errors.length){
      const missing=errors.find(e=>/does not exist|schema cache|relation/i.test(e.message||''));
      if(missing){showSetupRequired(missing.message);return;}
      throw errors[0];
    }

    DEPARTMENTS.splice(0,DEPARTMENTS.length,...(departmentsRes.data||[]).map(mapDepartment));
    const sortedSchools=(schoolsRes.data||[]).sort((a,b)=>Number(b.rating||0)-Number(a.rating||0));
    SCHOOLS.splice(0,SCHOOLS.length,...sortedSchools.map(mapSchool));
    const remoteUsers=(profilesRes.data||[]).map(mapProfileUser);
    if(remoteUsers.length){USERS.splice(0,USERS.length,...remoteUsers);const me=remoteUsers.find(u=>u._profileId===currentProfile.id);if(me)ROLE_USER_MAP[currentProfile.role]=me.id;}
    state.tasks=(tasksRes.data||[]).map(mapTask);
    state.audit=(auditRes.data||[]).map(row=>{
      const item={time:formatDateTime(row.created_at),user:row.actor_name||'Пользователь',action:row.action,object:row.details?.object||row.entity_id||'',type:row.entity_type||'system',device:'Онлайн · Supabase',_remoteId:row.id};
      syncedAuditFingerprints.add(auditFingerprint(item)); return item;
    });
    v4State.submissions=(submissionsRes.data||[]).map(row=>mapSubmission(row,filesRes.data||[],versionsRes.data||[]));
    deriveSchoolPerformance(tasksRes.data||[],submissionsRes.data||[]);
    const schoolMap=new Map(SCHOOLS.map(s=>[s.id,s.name]));
    v7ExamRows=(examsRes.data||[]).map(row=>mapExam(row,schoolMap));
    v7ExamIssues=[];

    if(Array.isArray(perfRes.data)){
      const performance=new Map(perfRes.data.map(x=>[x.id,x]));
      V7_DEPARTMENT_PROFILES.splice(0,V7_DEPARTMENT_PROFILES.length,...DEPARTMENTS.filter(d=>d.id!=='management').map(d=>{
        const p=performance.get(d.id)||{};
        const headProfile=(profilesRes.data||[]).find(x=>x.department_id===d.id&&x.role==='department_head');
        const seen=headProfile?.last_seen_at?Date.parse(headProfile.last_seen_at):0;
        const isOnline=seen>0&&(Date.now()-seen)<15*60*1000;
        const tasksGiven=Number(p.tasks_given||0),responses=Number(p.responses||0);
        const rating=finiteOrNull(p.rating);
        return {id:d.id,code:(d.short||d.name).slice(0,2).toUpperCase(),name:d.name,email:d.email||'',head:d.head||headProfile?.full_name||'Начальник отдела не указан',
          lastLogin:headProfile?.last_seen_at?formatDateTime(headProfile.last_seen_at):'Не входил',online:isOnline,tasksGiven,completed:Number(p.completed||0),waitingReview:Number(p.waiting_review||0),
          overdue:Number(p.overdue||0),avgReview:finiteOrNull(p.avg_review_hours),responses,rating:(tasksGiven||responses)?rating:null,sourceDirection:d.short||d.name};
      }));
    }

    const remoteDesign=designRes.data?.settings;
    let localDesign=null;
    try{localDesign=JSON.parse(localStorage.getItem('achkhoy_roo_visual_editor_v6')||'null');}catch(_){localDesign=null;}
    const localTime=Date.parse(localDesign?.updatedAt||0)||0;
    const remoteTime=Date.parse(remoteDesign?.updatedAt||designRes.data?.updated_at||0)||0;
    if(localDesign?.global && localDesign?.elements && localTime>remoteTime+500){
      window.ROODesignEditor?.applyState(localDesign,false);
      setTimeout(()=>syncDesign(localDesign),900);
    }else if(remoteDesign && Object.keys(remoteDesign).length){
      try{localStorage.setItem('achkhoy_roo_visual_editor_v6',JSON.stringify(remoteDesign));window.ROODesignEditor?.applyState(remoteDesign,false);}catch(_){ }
    }else if(localDesign?.global && localDesign?.elements){
      window.ROODesignEditor?.applyState(localDesign,false);
      setTimeout(()=>syncDesign(localDesign),900);
    }

    populateDirectionSelects();
    renderAll();
    v7PopulateExamFilters?.(); v7RenderExams?.(); v7RenderDepartments?.();
    document.dispatchEvent(new CustomEvent('roo-online-data-loaded'));
    if(!silent)setLoginState('Подключение установлено. Данные загружены.');
  }

  window.ROOReloadOnlineData = async function(){ await loadRemoteData({silent:true}); return true; };

  function showSetupRequired(details=''){
    onlineReady=false;
    const login=document.getElementById('loginScreen'); const app=document.getElementById('app');
    app?.classList.add('hidden'); login?.classList.remove('hidden');
    setLoginState('База ещё не подготовлена. Выполните файл supabase/SETUP_CLEAN_SUPABASE.sql в SQL Editor.', 'warning');
    const form=document.getElementById('loginForm');
    if(form && !document.getElementById('rooSetupHelp')){
      const panel=document.createElement('div');panel.id='rooSetupHelp';panel.className='roo-setup-panel';
      panel.innerHTML='<b>Остался один обязательный шаг</b><br>Supabase → SQL Editor → New query → вставить содержимое файла:<code>supabase/SETUP_CLEAN_SUPABASE.sql</code>Нажать <b>Run</b>, затем вернуться на сайт и обновить страницу.'+(details?`<small>${details}</small>`:'');
      form.appendChild(panel);
    }
  }

  async function bootOnline(session){
    currentSession=session;
    try{
      const profile=await getProfile(session.user.id);
      if(!profile){showSetupRequired('Профиль пользователя не создан.');return;}
      if(profile.role==='pending'||!profile.active){
        setLoginState('Эта почта не добавлена администратором. Попросите начальника РОО создать приглашение.', 'warning');
        await client.auth.signOut(); return;
      }
      installProfile(profile,session);
      applyRole(profile.role);
      await client.from('profiles').update({last_seen_at:new Date().toISOString()}).eq('id',profile.id);
      document.getElementById('loginScreen')?.classList.add('hidden');
      document.getElementById('app')?.classList.remove('hidden');
      onlineReady=true;
      await loadRemoteData();
      applyRole(profile.role);
      document.getElementById('loginScreen')?.classList.add('hidden');
      document.getElementById('app')?.classList.remove('hidden');
      await insertAudit('Вход в систему','security','session',{object:ROLE_LABELS[profile.role]||profile.role});
      subscribeRealtime();
      updateVersionUI();
    }catch(error){
      const msg=onlineError(error,'Не удалось загрузить профиль');
      if(/does not exist|schema cache|relation/i.test(msg))showSetupRequired(msg); else setLoginState(msg,'error');
    }
  }

  async function login(event){
    event.preventDefault(); event.stopImmediatePropagation();
    const email=document.getElementById('emailInput').value.trim();
    const password=document.getElementById('passwordInput').value;
    if(!email||!password){setLoginState('Введите рабочую почту и пароль.','warning');return;}
    setLoginState('Вход…');
    const {data,error}=await client.auth.signInWithPassword({email,password});
    if(error){setLoginState(error.message==='Invalid login credentials'?'Неверная почта или пароль.':error.message,'error');return;}
    await bootOnline(data.session);
  }

  async function register(){
    const email=document.getElementById('emailInput').value.trim();
    const password=document.getElementById('passwordInput').value;
    if(!email||password.length<6){setLoginState('Укажите почту и пароль минимум из 6 символов.','warning');return;}
    const fullName=prompt('Введите Ф.И.О. пользователя:','');
    if(!fullName)return;
    setLoginState('Создание аккаунта…');
    const redirectTo=location.href.split('#')[0].split('?')[0];
    const {data,error}=await client.auth.signUp({email,password,options:{data:{full_name:fullName},emailRedirectTo:redirectTo}});
    if(error){setLoginState(error.message,'error');return;}
    if(data.session){await bootOnline(data.session);}
    else setLoginState('Аккаунт создан. Откройте письмо Supabase и подтвердите почту, затем войдите.');
  }

  async function resetPassword(){
    const email=document.getElementById('emailInput').value.trim();
    if(!email){setLoginState('Сначала укажите почту.','warning');return;}
    const redirectTo=location.href.split('#')[0].split('?')[0];
    const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo});
    if(error)setLoginState(error.message,'error'); else setLoginState('Ссылка для восстановления отправлена на почту.');
  }

  async function logout(event){
    event?.preventDefault(); event?.stopImmediatePropagation();
    await client.auth.signOut();
    onlineReady=false;currentProfile=null;currentSession=null;window.ROOCurrentProfile=null;window.ROOCurrentSession=null;
    document.getElementById('app')?.classList.add('hidden');
    document.getElementById('loginScreen')?.classList.remove('hidden');
    setLoginState('Вы вышли из системы.');
  }

  function auditFingerprint(item){return `${item.time}|${item.user}|${item.action}|${item.object}|${item.type}`;}

  async function insertAudit(action,entityType='system',entityId='',details={}){
    if(!currentProfile)return;
    const {error}=await client.from('audit_log').insert({actor_id:currentProfile.id,actor_name:currentProfile.full_name,action,entity_type:entityType,entity_id:String(entityId||''),details});
    if(error)console.warn('audit',error.message);
  }

  function scheduleTaskSync(){clearTimeout(taskSyncTimer);taskSyncTimer=setTimeout(syncTasks,450);}
  function scheduleSubmissionSync(){clearTimeout(submissionSyncTimer);submissionSyncTimer=setTimeout(syncSubmissions,350);}
  function scheduleExamSync(){clearTimeout(examSyncTimer);examSyncTimer=setTimeout(syncExamRows,500);}
  function scheduleAuditSync(){clearTimeout(auditSyncTimer);auditSyncTimer=setTimeout(syncAudit,350);}

  async function syncTasks(){
    if(!onlineReady||syncing)return;
    const rows=state.tasks.filter(t=>t._remote).map(t=>({
      id:Number(t.id),title:t.title,description:t.description||'',department_id:t.departmentId,direction:t.direction||'',
      creator_name:t.creator||currentProfile?.full_name,creator_id:t._creatorId||currentProfile?.id,status:t.status,priority:t.priority||'Обычное',deadline:t.deadlineDate||new Date().toISOString(),
      response_type:t.responseType||'Форма + файлы',requires_director:t.directorApproval!==false,approval_route:t.approvalRoute||'',weight:Number(t.weight||1),
      repeat_rule:t.repeatRule||'',recipients_mode:typeof t.recipients==='string'?t.recipients:'selected',form_schema:{fields:t.formFields||[]},
      published_at:['active','review','overdue','done'].includes(t.status)?(t.published_at||new Date().toISOString()):null
    }));
    if(!rows.length)return;
    const {error}=await client.from('tasks').upsert(rows,{onConflict:'id'});if(error)onlineError(error,'Не удалось сохранить поручения');
  }

  async function createOnlineTask(event){
    event.preventDefault();event.stopImmediatePropagation();
    if(!currentProfile)return;
    const title=dom.newTaskTitle.value.trim(); if(!title)return showToast('Введите название поручения');
    const date=dom.newTaskDate.value,time=dom.newTaskTime.value;
    const deadline=new Date(`${date}T${time||'00:00'}`); if(Number.isNaN(deadline.getTime()))return showToast('Укажите корректный срок');
    const recipientsMode=dom.newTaskRecipients.value;
    let status='draft';
    if(state.role==='chief'||state.role==='deputy')status='active';
    else if(state.role==='department_head')status=(recipientsMode==='all'||dom.newTaskPriority.value==='Критическое')?'pending_approval':'active';
    const payload={
      title,description:dom.newTaskDescription.value.trim(),department_id:dom.newTaskDirection.value,direction:DEPARTMENTS.find(d=>d.id===dom.newTaskDirection.value)?.short||'',
      creator_id:currentProfile.id,creator_name:currentProfile.full_name,status,priority:dom.newTaskPriority.value,deadline:deadline.toISOString(),
      response_type:dom.newTaskResponseType.value,requires_director:dom.newTaskDirectorApproval.value==='yes',approval_route:dom.newTaskApprovalRoute.value,
      weight:Number(dom.newTaskWeight.value),repeat_rule:dom.newTaskRepeat.value,recipients_mode:recipientsMode,form_schema:{fields:[...state.formFields]},
      published_at:status==='active'?new Date().toISOString():null
    };
    const {data,error}=await client.from('tasks').insert(payload).select('id').single();
    if(error)return onlineError(error,'Не удалось создать поручение');
    let schools=[...SCHOOLS];
    if(recipientsMode==='city')schools=schools.filter(s=>/^г\./i.test(s.locality));
    if(recipientsMode==='rural')schools=schools.filter(s=>!/^г\./i.test(s.locality));
    if(recipientsMode==='selected')schools=schools.slice(0,1);
    if(schools.length){
      const {error:recError}=await client.from('task_recipients').insert(schools.map(s=>({task_id:data.id,school_id:s.id,status:'new'})));
      if(recError)return onlineError(recError,'Поручение создано, но получатели не добавлены');
    }
    await insertAudit('Создал поручение','task',data.id,{object:title});
    closeModal('taskModal');event.target.reset();state.formFields=['Количество обучающихся','Основной показатель','Комментарий','Подтверждающий файл'];renderFormFields();
    await loadRemoteData({silent:true});showToast(status==='active'?'Поручение опубликовано':'Поручение сохранено');
  }

  async function syncSubmissions(){
    if(!onlineReady||syncing)return;
    for(const s of v4State.submissions){
      if(!Number.isFinite(Number(s.taskId))||!s.schoolId)continue;
      const payload={task_id:Number(s.taskId),school_id:s.schoolId,status:s.status,current_version:Number(s.version||1),answers:s.answers||{},
        field_files:s.fieldFiles||{},comment:s.comment||'',director_comment:s.directorComment||'',reviewer_comment:s.reviewerComment||'',
        created_by:s._createdBy||currentProfile?.id,reviewed_by:['review','returned','accepted'].includes(s.status)&&!['school_director','school_staff'].includes(currentProfile?.role)?currentProfile.id:null,
        submitted_at:s.submittedAt?new Date().toISOString():null};
      let query=client.from('submissions').upsert(payload,{onConflict:'task_id,school_id'}).select('id').single();
      const {data,error}=await query;if(error){onlineError(error,'Не удалось сохранить отчёт школы');continue;}
      s._remoteId=data.id;
      await client.from('submission_versions').upsert({submission_id:data.id,version:Number(s.version||1),status:s.status,answers:s.answers||{},field_files:s.fieldFiles||{},comment:s.comment||'',director_comment:s.directorComment||'',reviewer_comment:s.reviewerComment||'',created_by:currentProfile?.id},{onConflict:'submission_id,version'});
    }
  }

  function queueFiles(files,fieldLabel=''){
    [...files].forEach(file=>{
      if(file.size>15*1024*1024){showToast(`Файл ${file.name} больше 15 МБ`);return;}
      const key=`${fieldLabel}|${file.name}|${file.size}`;
      if(fieldLabel)fieldUploadQueue.set(key,{file,fieldLabel});else uploadQueue.set(key,{file,fieldLabel:''});
    });
  }

  async function uploadQueuedFiles(){
    if(!currentProfile||!v4State.context)return;
    const submission=ensureSubmission(v4State.context.taskId,v4State.context.schoolId);
    await syncSubmissions();
    const remoteId=submission._remoteId;if(!remoteId)return;
    const task=state.tasks.find(t=>Number(t.id)===Number(submission.taskId));
    const allowedExtras=new Set((v4State.pendingFiles||[]).map(f=>`${f.name}|${f.size}`));
    const allowedFields=new Map(Object.entries(v4State.pendingFieldFiles||{}).map(([label,f])=>[label,`${f.name}|${f.size}`]));
    const all=[...uploadQueue.values()].filter(e=>allowedExtras.has(`${e.file.name}|${e.file.size}`))
      .concat([...fieldUploadQueue.values()].filter(e=>allowedFields.get(e.fieldLabel)===`${e.file.name}|${e.file.size}`));
    for(const entry of all){
      const file=entry.file;
      const safe=file.name.replace(/[^a-zA-Z0-9а-яА-Я._-]+/g,'_');
      const path=`user/${currentProfile.id}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
      const {error:uploadError}=await client.storage.from(cfg.bucket).upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
      if(uploadError){onlineError(uploadError,`Не удалось загрузить ${file.name}`);continue;}
      const {error:fileError}=await client.from('files').insert({task_id:Number(submission.taskId),submission_id:remoteId,uploader_id:currentProfile.id,
        school_id:submission.schoolId,department_id:task?.departmentId||currentProfile.department_id,bucket:cfg.bucket,path,file_name:file.name,mime_type:file.type,size_bytes:file.size,field_label:entry.fieldLabel||null});
      if(fileError)onlineError(fileError,'Файл загружен, но запись не создана');
    }
    uploadQueue.clear();fieldUploadQueue.clear();
  }

  async function interceptSubmissionAction(event,kind){
    event.preventDefault();event.stopImmediatePropagation();
    const button=event.currentTarget;button.disabled=true;const old=button.textContent;button.innerHTML='<span class="roo-sync-spinner"></span> Сохранение';
    try{
      await uploadQueuedFiles();
      if(kind==='draft')original.saveSubmissionDraft(false); else original.submitSchoolReport();
      await syncSubmissions();
      showToast(kind==='draft'?'Черновик сохранён в облаке':'Отчёт отправлен и сохранён в облаке');
    }finally{button.disabled=false;button.textContent=old;}
  }

  async function syncAudit(){
    if(!onlineReady)return;
    for(const item of state.audit){
      if(item._remoteId)continue;
      const fp=auditFingerprint(item);if(syncedAuditFingerprints.has(fp))continue;
      const {data,error}=await client.from('audit_log').insert({actor_id:currentProfile.id,actor_name:currentProfile.full_name,action:item.action,entity_type:item.type||'system',entity_id:'',details:{object:item.object||''}}).select('id').single();
      if(!error){item._remoteId=data.id;syncedAuditFingerprints.add(fp);}
    }
  }

  function examSchoolId(row){
    if(row.schoolId)return row.schoolId;
    return SCHOOLS.find(s=>s.name===row.school)?.id||null;
  }

  async function syncExamRows(){
    if(!onlineReady||!['chief','deputy','department_head','specialist'].includes(currentProfile?.role))return;
    const rows=v7ExamRows.filter(r=>r.source!=='Демо-набор').map(r=>({
      source_row_id:String(r.id||crypto.randomUUID()),academic_year:r.year||defaultAcademicYear(),exam_type:r.exam,period:'Основной',school_id:examSchoolId(r),
      student_name:r.name,class_name:r.className||'',subject:r.subject,score:r.score===''?null:Number(r.score),grade:r.grade===''?null:Number(r.grade),
      result_status:r.status||'Сдал',late_minutes:Number(r.lateMinutes||0),passed:v7StatusKey(r)==='passed',metadata:{source:r.source||''}
    })).filter(r=>r.school_id&&r.student_name&&r.subject);
    if(!rows.length)return;
    for(let i=0;i<rows.length;i+=500){
      const {error}=await client.from('exam_results').upsert(rows.slice(i,i+500),{onConflict:'source_row_id'});if(error)return onlineError(error,'Не удалось сохранить результаты экзаменов');
    }
  }

  async function syncDesign(settings){
    if(!onlineReady||!['chief','deputy'].includes(currentProfile?.role))return;
    clearTimeout(designSyncTimer);
    document.dispatchEvent(new CustomEvent('roo-design-cloud-status',{detail:{status:'saving'}}));
    designSyncTimer=setTimeout(async()=>{
      const payload={...settings,version:11,updatedAt:settings?.updatedAt||new Date().toISOString()};
      let {data,error}=await client.from('design_settings').update({settings:payload,updated_by:currentProfile.id,updated_at:new Date().toISOString()}).eq('id',1).select('id').maybeSingle();
      if(!error&&!data){
        const inserted=await client.from('design_settings').upsert({id:1,settings:payload,updated_by:currentProfile.id,updated_at:new Date().toISOString()},{onConflict:'id'}).select('id').maybeSingle();
        data=inserted.data;error=inserted.error;
      }
      if(error){document.dispatchEvent(new CustomEvent('roo-design-cloud-status',{detail:{status:'error',message:error.message}}));onlineError(error,'Не удалось сохранить дизайн для всех пользователей');return;}
      document.dispatchEvent(new CustomEvent('roo-design-cloud-status',{detail:{status:'saved'}}));
    },300);
  }

  async function reloadRemoteDesign(){
    if(!onlineReady)return;
    const {data,error}=await client.from('design_settings').select('settings,updated_at').eq('id',1).maybeSingle();
    if(error||!data?.settings)return;
    let local=null;try{local=JSON.parse(localStorage.getItem('achkhoy_roo_visual_editor_v6')||'null');}catch(_){ }
    const localTime=Date.parse(local?.updatedAt||0)||0;
    const remoteTime=Date.parse(data.settings.updatedAt||data.updated_at||0)||0;
    if(remoteTime>localTime+250){localStorage.setItem('achkhoy_roo_visual_editor_v6',JSON.stringify(data.settings));window.ROODesignEditor?.applyState(data.settings,false);}
  }

  const EXAM_COLUMN_ALIASES = {
    student_name:['фио','ф и о','фамилия имя отчество','ученик','обучающийся','выпускник','student'],
    school:['школа','оо','образовательная организация','образовательное учреждение','наименование оо','организация'],
    class_name:['класс','class'],
    exam_type:['экзамен','тип экзамена','вид экзамена','гиа','exam'],
    subject:['предмет','учебный предмет','дисциплина','subject'],
    score:['балл','баллы','тестовый балл','итоговый балл','результат','score'],
    grade:['оценка','отметка','grade'],
    result_status:['статус','результат сдачи','сдал не сдал','явка'],
    academic_year:['учебный год','год','academic year'],
    period:['период','этап','основной дополнительный'],
    scheduled_time:['время начала','плановое время','время экзамена'],
    arrival_time:['время прибытия','фактическое время','прибыл'],
    late_minutes:['опоздание','минут опоздания','опоздание минут']
  };

  function normalizeHeader(value){return String(value??'').toLowerCase().replace(/ё/g,'е').replace(/[\n\r]+/g,' ').replace(/[._/\\-]+/g,' ').replace(/\s+/g,' ').trim();}
  function detectHeaderRow(matrix){
    let best={index:0,score:-1,map:{}};
    matrix.slice(0,20).forEach((row,index)=>{
      const map={};let score=0;
      row.forEach((cell,col)=>{
        const h=normalizeHeader(cell);if(!h)return;
        for(const [field,aliases] of Object.entries(EXAM_COLUMN_ALIASES)){
          if(map[field]!==undefined)continue;
          const hit=aliases.some(a=>h===a||h.includes(a)||a.includes(h));
          if(hit){map[field]=col;score+=['student_name','school','subject','score'].includes(field)?3:1;break;}
        }
      });
      if(score>best.score)best={index,score,map};
    });
    return best;
  }
  function cell(row,map,key){const idx=map[key];return idx===undefined?'':String(row[idx]??'').trim();}
  function detectExamType(value,fileName=''){const s=`${value} ${fileName}`.toUpperCase();return s.includes('ЕГЭ')?'ЕГЭ':s.includes('ОГЭ')?'ОГЭ':s.includes('ГИА')?'ГИА':'';}
  function defaultAcademicYear(){const d=new Date();const y=d.getFullYear(),m=d.getMonth()+1;return m>=8?`${y}/${y+1}`:`${y-1}/${y}`;}
  function parseTime(value){const m=String(value||'').match(/(\d{1,2})[:.](\d{2})/);return m?`${String(m[1]).padStart(2,'0')}:${m[2]}`:null;}
  function minutesLate(scheduled,arrival,explicit){const e=Number(String(explicit||'').replace(',','.').replace(/[^0-9.-]/g,''));if(Number.isFinite(e)&&e>0)return Math.round(e);if(!scheduled||!arrival)return 0;const [sh,sm]=scheduled.split(':').map(Number),[ah,am]=arrival.split(':').map(Number);return Math.max(0,(ah*60+am)-(sh*60+sm));}
  function normalizeSchoolName(value){return String(value||'').replace(/[«»"']/g,'').replace(/\s+/g,' ').trim().toLowerCase();}
  function slugId(value){const translit={'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ы':'y','э':'e','ю':'yu','я':'ya','ь':'','ъ':''};return 'school-'+normalizeSchoolName(value).split('').map(c=>translit[c]??c).join('').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,52)+'-'+Math.abs([...String(value)].reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0));}
  function examIdentityKey(r){
    return [r.academic_year,r.exam_type,r.period||'Основной',normalizeSchoolName(r.school),normalizeHeader(r.student_name),normalizeHeader(r.class_name),normalizeHeader(r.subject)].join('|');
  }
  function examValueKey(r){
    return [examIdentityKey(r),r.score??'',r.grade??'',normalizeHeader(r.result_status),Number(r.late_minutes||0)].join('|');
  }
  function fastHash(value){let h=2166136261;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
  function sourceRowId(r){return `exam-${fastHash(examIdentityKey(r))}`;}
  function matrixFingerprint(matrix,file){
    const sample=matrix.map(row=>row.map(v=>String(v??'').trim()).join('\u001f')).join('\u001e');
    return `fnv1a-${fastHash(`${file.size}|${sample}`)}`;
  }

  async function readExamMatrix(file){
    if(/\.(xlsx|xls)$/i.test(file.name)){
      if(!window.XLSX)throw new Error('Модуль Excel не загрузился. Проверьте интернет и обновите страницу.');
      const wb=window.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
      const sheet=wb.Sheets[wb.SheetNames[0]];
      return window.XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:false});
    }
    const text=await file.text();
    const delimiter=(text.split(/\r?\n/)[0].match(/;/g)||[]).length>(text.split(/\r?\n/)[0].match(/,/g)||[]).length?';':',';
    return text.split(/\r?\n/).filter(x=>x.trim()).map(line=>{const out=[];let cur='',quote=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quote&&line[i+1]==='"'){cur+='"';i++;}else quote=!quote;}else if(c===delimiter&&!quote){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;});
  }

  function prepareExamImport(matrix,file){
    if(!matrix.length)throw new Error('Файл пустой.');
    const detected=detectHeaderRow(matrix);
    const required=['student_name','school'];
    const missing=required.filter(k=>detected.map[k]===undefined);
    if(missing.length)throw new Error('Не удалось распознать обязательные колонки: ФИО и Школа. Используйте шаблон или переименуйте заголовки.');
    const rows=[],issues=[],rejectedRows=[];
    const existingByIdentity=new Map();
    (v7ExamRows||[]).forEach(row=>{
      const normalized={academic_year:row.year,exam_type:row.exam,period:row.period||'Основной',school:row.school,student_name:row.name,class_name:row.className,subject:row.subject,score:row.score===''?null:Number(row.score),grade:row.grade===''?null:Number(row.grade),result_status:row.status,late_minutes:Number(row.lateMinutes||0)};
      existingByIdentity.set(examIdentityKey(normalized),normalized);
    });
    const seenInFile=new Map();
    let dataRowCount=0,duplicateCount=0,conflictCount=0;
    matrix.slice(detected.index+1).forEach((raw,i)=>{
      if(!raw.some(v=>String(v).trim()))return;
      dataRowCount++;
      const sourceLine=i+detected.index+2;
      const student_name=cell(raw,detected.map,'student_name');
      const school=cell(raw,detected.map,'school');
      const subject=cell(raw,detected.map,'subject');
      const scoreRaw=cell(raw,detected.map,'score');
      const gradeRaw=cell(raw,detected.map,'grade');
      const statusRaw=cell(raw,detected.map,'result_status');
      const exam_type=detectExamType(cell(raw,detected.map,'exam_type'),file.name)||detectExamType('',file.name);
      const score=scoreRaw===''?null:Number(scoreRaw.replace(',','.').replace(/[^0-9.-]/g,''));
      let grade=gradeRaw===''?null:Number(gradeRaw.replace(/[^2-5]/g,''));
      let result_status=statusRaw||((score!==null&&Number.isFinite(score))?'Сдал':'Не явился');
      if(/не\s*сдал|неуд/i.test(result_status))result_status='Не сдал'; else if(/не\s*яв|отсут/i.test(result_status))result_status='Не явился'; else result_status='Сдал';
      if(grade===null&&score!==null&&Number.isFinite(score)){
        grade=v7Grade(score,result_status);
        issues.push({row:sourceLine,type:'warning',code:'AUTO_GRADE',text:`Оценка рассчитана автоматически по общей шкале для ${student_name||'ученика'}. Для официального анализа лучше добавить колонку «Оценка».`});
      }
      const scheduled=parseTime(cell(raw,detected.map,'scheduled_time')),arrival=parseTime(cell(raw,detected.map,'arrival_time'));
      const r={academic_year:cell(raw,detected.map,'academic_year')||defaultAcademicYear(),exam_type,period:cell(raw,detected.map,'period')||'Основной',school,student_name,class_name:cell(raw,detected.map,'class_name'),subject,score:Number.isFinite(score)?score:null,grade:Number.isFinite(grade)?grade:null,result_status,scheduled_time:scheduled,arrival_time:arrival,late_minutes:minutesLate(scheduled,arrival,cell(raw,detected.map,'late_minutes')),source_line:sourceLine};
      const errs=[];
      if(!student_name)errs.push('нет ФИО');
      if(!school)errs.push('нет школы');
      if(!subject)errs.push('нет предмета');
      if(!exam_type)errs.push('не определён тип экзамена');
      if(scoreRaw!==''&&!Number.isFinite(score))errs.push('некорректный балл');
      if(r.score!==null&&(r.score<0||r.score>100))errs.push('балл вне диапазона 0–100');
      if(r.grade!==null&&![2,3,4,5].includes(r.grade))errs.push('оценка должна быть от 2 до 5');
      if(result_status==='Не явился'&&r.score!==null)issues.push({row:sourceLine,type:'warning',code:'ABSENT_WITH_SCORE',text:`${student_name}: указан балл при статусе «Не явился». Проверьте строку.`});
      if(errs.length){
        const issue={row:sourceLine,type:'error',code:'INVALID_ROW',text:`${student_name||'Строка'}: ${errs.join(', ')}`};issues.push(issue);rejectedRows.push({...r,reason:issue.text});return;
      }
      const identity=examIdentityKey(r),values=examValueKey(r);
      const sameFile=seenInFile.get(identity);
      if(sameFile){
        duplicateCount++;
        const exact=examValueKey(sameFile)===values;
        const issue={row:sourceLine,type:exact?'warning':'error',code:exact?'DUPLICATE_IN_FILE':'CONFLICT_IN_FILE',text:exact?`${student_name}: точная повторная строка в этом файле пропущена.`:`${student_name}: в файле есть две строки одного экзамена с разными значениями. Обе требуют проверки.`};
        issues.push(issue);rejectedRows.push({...r,reason:issue.text});if(!exact)conflictCount++;return;
      }
      const existing=existingByIdentity.get(identity);
      if(existing){
        duplicateCount++;
        const exact=examValueKey(existing)===values;
        const issue={row:sourceLine,type:exact?'warning':'error',code:exact?'ALREADY_IMPORTED':'CONFLICT_EXISTING',text:exact?`${student_name}: такой результат уже есть в базе и повторно не импортирован.`:`${student_name}: в базе уже есть результат этого экзамена с другими значениями. Сначала проверьте историю импортов или отмените ошибочную загрузку.`};
        issues.push(issue);rejectedRows.push({...r,reason:issue.text});if(!exact)conflictCount++;return;
      }
      seenInFile.set(identity,r);
      r.source_row_id=sourceRowId(r);
      rows.push(r);
    });
    const known=new Map(SCHOOLS.map(s=>[normalizeSchoolName(s.name),s]));
    const unknown=[...new Set(rows.map(r=>r.school).filter(n=>!known.has(normalizeSchoolName(n))))];
    const errorCount=issues.filter(x=>x.type==='error').length;
    const warningCount=issues.filter(x=>x.type==='warning').length;
    return {file,fileHash:matrixFingerprint(matrix,file),detected,rows,issues,unknown,totalRows:dataRowCount,rejectedRows,duplicateCount,conflictCount,errorCount,warningCount};
  }

  async function checkPreviouslyImportedFile(prepared){
    try{
      const {data,error}=await client.from('exam_imports').select('id,source_file,status,created_at').eq('file_hash',prepared.fileHash).in('status',['processing','completed','partial']).limit(1);
      if(error){
        if(/file_hash|status|schema cache/i.test(error.message||''))return prepared;
        throw error;
      }
      if(data?.length){
        const previous=data[0];
        prepared.blockedReason=`Этот файл уже был загружен ранее (${previous.source_file||prepared.file.name}). Откройте «Историю импортов» и проверьте предыдущую загрузку.`;
        prepared.issues.unshift({row:'—',type:'error',code:'DUPLICATE_FILE',text:prepared.blockedReason});
        prepared.errorCount+=1;
      }
    }catch(error){console.warn('Не удалось проверить отпечаток файла',error);}
    return prepared;
  }

  function showExamImportPreview(prepared){
    pendingExamImport=prepared;
    const recognized=Object.keys(prepared.detected.map).map(k=>`<span class="tag green">${escapeHTML(k)}</span>`).join(' ');
    const unknown=prepared.unknown.length?`<div class="roo-setup-panel"><b>Новые школы (${prepared.unknown.length})</b><p>${prepared.unknown.map(escapeHTML).join('<br>')}</p>${['chief','deputy'].includes(currentProfile?.role)?'<label><input type="checkbox" id="rooCreateUnknownSchools" checked> Создать эти школы автоматически</label>':'<p>Начальник отдела не может создавать школы. Попросите руководство добавить их.</p>'}</div>`:'';
    const issuePreview=prepared.issues.slice(0,30).map(x=>`<p class="${x.type==='error'?'delta-down':'muted'}"><b>Строка ${x.row}</b> · ${escapeHTML(x.text)}</p>`).join('');
    const warnings=prepared.warningCount?`<div class="v24-import-warning"><b>Предупреждения: ${prepared.warningCount}.</b> Они не блокируют корректные строки, но должны быть проверены.</div>`:'';
    const errors=prepared.errorCount?`<div class="v24-import-error"><b>Ошибки: ${prepared.errorCount}.</b> ${prepared.blockedReason?escapeHTML(prepared.blockedReason):'Ошибочные и конфликтующие строки не будут сохранены.'}</div>`:'';
    showInfoModal('Предпросмотр импорта',`<div class="v24-import-preview-summary"><div><strong>${prepared.totalRows}</strong><span>строк в файле</span></div><div><strong>${prepared.rows.length}</strong><span>готово</span></div><div><strong>${prepared.rejectedRows.length}</strong><span>отклонено</span></div><div><strong>${prepared.duplicateCount}</strong><span>дубли</span></div><div><strong>${prepared.unknown.length}</strong><span>новых школ</span></div></div>${errors}${warnings}<div class="drawer-card"><h3>Распознанные поля</h3><div class="v7-column-tags">${recognized}</div><p class="muted">Строка заголовков: ${prepared.detected.index+1}. Отпечаток файла: ${escapeHTML(prepared.fileHash)}.</p></div>${unknown}<div class="drawer-card"><h3>Первые корректные строки</h3><div style="overflow:auto"><table class="compact-table"><thead><tr><th>ФИО</th><th>Школа</th><th>Экзамен</th><th>Предмет</th><th>Балл</th><th>Оценка</th></tr></thead><tbody>${prepared.rows.slice(0,8).map(r=>`<tr><td>${escapeHTML(r.student_name)}</td><td>${escapeHTML(r.school)}</td><td>${r.exam_type}</td><td>${escapeHTML(r.subject)}</td><td>${r.score??'—'}</td><td>${r.grade??'—'}</td></tr>`).join('')||'<tr><td colspan="6">Нет строк, готовых к импорту</td></tr>'}</tbody></table></div></div>${prepared.issues.length?`<div class="drawer-card"><h3>Протокол проверки</h3>${issuePreview}${prepared.issues.length>30?`<p class="muted">Показаны первые 30 из ${prepared.issues.length} замечаний. Полный протокол сохранится в истории импорта.</p>`:''}</div>`:''}<label class="v6-checkbox"><input type="checkbox" id="rooImportValidOnly" checked> Сохранить только строки, прошедшие проверку</label><button class="primary-button full" id="rooConfirmExamImport" ${(!prepared.rows.length||prepared.blockedReason||(!['chief','deputy'].includes(currentProfile?.role)&&prepared.unknown.length))?'disabled':''}>Подтвердить безопасный импорт</button>`,'Автоматическая проверка Excel / CSV');
    setTimeout(()=>document.getElementById('rooConfirmExamImport')?.addEventListener('click',confirmExamImport),0);
  }

  async function ensureImportSchools(prepared){
    const existing=new Map(SCHOOLS.map(s=>[normalizeSchoolName(s.name),s]));
    const createdSchoolIds=[];
    if(prepared.unknown.length){
      if(!['chief','deputy'].includes(currentProfile?.role)||!document.getElementById('rooCreateUnknownSchools')?.checked)throw new Error('Сначала добавьте неизвестные школы в справочник.');
      const inserts=prepared.unknown.map(name=>({id:slugId(name),name,locality:'',director_name:'',responsible_name:'',rating:null,metadata:{created_from_exam_import:true}}));
      const {error}=await client.from('schools').upsert(inserts,{onConflict:'id'});if(error)throw error;
      inserts.forEach(s=>{existing.set(normalizeSchoolName(s.name),{id:s.id,name:s.name});createdSchoolIds.push(s.id);});
    }
    return {schools:existing,createdSchoolIds};
  }

  async function confirmExamImport(){
    const prepared=pendingExamImport;if(!prepared)return;
    const button=document.getElementById('rooConfirmExamImport');if(button){button.disabled=true;button.innerHTML='<span class="roo-sync-spinner"></span> Импорт';}
    let importId=null;
    try{
      if(!document.getElementById('rooImportValidOnly')?.checked&&prepared.rejectedRows.length)throw new Error('Для безопасности включите импорт только строк, прошедших проверку.');
      const {schools,createdSchoolIds}=await ensureImportSchools(prepared);
      const first=prepared.rows[0];
      const importRecord={academic_year:first.academic_year,exam_type:first.exam_type,subject:[...new Set(prepared.rows.map(r=>r.subject))].length===1?first.subject:null,period:first.period,source_file:prepared.file.name,imported_rows:0,accepted_rows:prepared.rows.length,rejected_rows:prepared.rejectedRows.length,errors_count:prepared.errorCount,warnings_count:prepared.warningCount,duplicates_count:prepared.duplicateCount,unknown_schools_count:prepared.unknown.length,file_hash:prepared.fileHash,status:'processing',mapping:{header_row:prepared.detected.index+1,columns:prepared.detected.map},issues:prepared.issues,metadata:{total_rows:prepared.totalRows,created_school_ids:createdSchoolIds,client_version:24},uploaded_by:currentProfile.id};
      const {data:imp,error:impErr}=await client.from('exam_imports').insert(importRecord).select('id').single();
      if(impErr){if(/accepted_rows|warnings_count|file_hash|schema cache/i.test(impErr.message||''))throw new Error('В Supabase ещё не выполнен PATCH_V24_DATA_QUALITY.sql. Запустите SQL-патч и повторите импорт.');throw impErr;}
      importId=imp.id;
      const payload=prepared.rows.map(r=>({import_id:importId,source_row_id:r.source_row_id,academic_year:r.academic_year,exam_type:r.exam_type,period:r.period,school_id:schools.get(normalizeSchoolName(r.school))?.id,student_name:r.student_name,class_name:r.class_name,subject:r.subject,score:r.score,grade:r.grade,result_status:r.result_status,scheduled_time:r.scheduled_time,arrival_time:r.arrival_time,late_minutes:r.late_minutes,passed:r.result_status==='Сдал'&&r.grade!==2,metadata:{source_file:prepared.file.name,automatic_mapping:true,source_line:r.source_line,file_hash:prepared.fileHash}})).filter(r=>r.school_id);
      for(let i=0;i<payload.length;i+=400){const {error}=await client.from('exam_results').insert(payload.slice(i,i+400));if(error)throw error;}
      const {error:finishError}=await client.from('exam_imports').update({status:prepared.rejectedRows.length?'partial':'completed',imported_rows:payload.length,accepted_rows:payload.length,metadata:{...importRecord.metadata,completed_at:new Date().toISOString()}}).eq('id',importId);
      if(finishError)throw finishError;
      await insertAudit('Импортировал результаты экзаменов','exam_import',importId,{object:prepared.file.name,rows:payload.length,rejected:prepared.rejectedRows.length,duplicates:prepared.duplicateCount,warnings:prepared.warningCount});
      closeModal('infoModal');pendingExamImport=null;await loadRemoteData({silent:true});document.dispatchEvent(new CustomEvent('roo-exam-import-changed'));navigate('exams');showToast(`Импортировано ${payload.length} строк. Отклонено: ${prepared.rejectedRows.length}.`);
    }catch(error){
      if(importId){
        await client.from('exam_results').delete().eq('import_id',importId);
        await client.from('exam_imports').update({status:'failed',metadata:{failed_at:new Date().toISOString(),error:String(error?.message||error)}}).eq('id',importId);
      }
      onlineError(error,'Не удалось импортировать файл');if(button){button.disabled=false;button.textContent='Повторить импорт';}
    }
  }

  async function importExamFileV10(event){
    const file=event.target.files?.[0];if(!file)return;
    event.preventDefault();event.stopImmediatePropagation();
    const status=document.getElementById('examImportStatus');
    try{if(status){status.textContent='Чтение и распознавание файла…';status.classList.remove('error');}const matrix=await readExamMatrix(file);const prepared=await checkPreviouslyImportedFile(prepareExamImport(matrix,file));if(status)status.textContent=prepared.blockedReason?'Файл уже был загружен. Откройте историю импортов.':`Готово: ${prepared.rows.length}. Отклонено: ${prepared.rejectedRows.length}. Дубли: ${prepared.duplicateCount}.`;showExamImportPreview(prepared);}catch(error){if(status){status.textContent=error.message;status.classList.add('error');}onlineError(error,'Не удалось прочитать файл');}finally{event.target.value='';}
  }

  async function createInvitation(event){
    event.preventDefault();event.stopImmediatePropagation();
    if(!['chief','deputy'].includes(currentProfile?.role))return showToast('Только руководство может добавлять пользователей');
    const email=document.getElementById('newUserEmail').value.trim();
    const fullName=document.getElementById('newUserName').value.trim();
    const role=document.getElementById('newUserRole').value;
    const unit=document.getElementById('newUserUnit').value;
    const department=DEPARTMENTS.find(d=>d.name===unit||d.short===unit);
    const school=SCHOOLS.find(s=>s.name===unit);
    const {error}=await client.from('user_invitations').upsert({email,full_name:fullName,role,department_id:department?.id||null,school_id:school?.id||null,invited_by:currentProfile.id},{onConflict:'email'});
    if(error)return onlineError(error,'Не удалось создать приглашение');
    closeModal('userModal');event.target.reset();await insertAudit('Создал приглашение пользователя','security',email,{object:`${fullName} · ${ROLE_LABELS[role]||role}`});
    showInfoModal('Приглашение создано',`<p>Пользователь <b>${escapeHTML(fullName)}</b> должен открыть сайт, указать почту <b>${escapeHTML(email)}</b> и нажать <b>«Первый вход / создать пароль»</b>.</p>`,'Онлайн-аккаунт');
  }

  async function downloadRemoteFile(event){
    const button=event.target.closest('[data-demo-file]');if(!button)return;
    const name=button.dataset.demoFile;const ctx=v4State.context;
    const key=ctx?`${ctx.taskId}:${ctx.schoolId}:${name}`:'';
    const file=remoteFilesByName.get(key)||[...remoteFilesByName.values()].find(f=>f.name===name);
    if(!file)return;
    event.preventDefault();event.stopImmediatePropagation();
    const {data,error}=await client.storage.from(cfg.bucket).createSignedUrl(file.path,120);
    if(error)return onlineError(error,'Не удалось открыть файл');
    window.open(data.signedUrl,'_blank','noopener');
  }

  function scheduleReload(){
    if(!onlineReady||syncing)return;
    clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>loadRemoteData({silent:true}).catch(console.error),700);
  }

  function subscribeRealtime(){
    if(window.rooRealtimeChannel)return;
    window.rooRealtimeChannel=client.channel('roo-online-v11')
      .on('postgres_changes',{event:'*',schema:'public',table:'tasks'},scheduleReload)
      .on('postgres_changes',{event:'*',schema:'public',table:'task_recipients'},scheduleReload)
      .on('postgres_changes',{event:'*',schema:'public',table:'submissions'},scheduleReload)
      .on('postgres_changes',{event:'*',schema:'public',table:'exam_results'},scheduleReload)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'design_settings'},reloadRemoteDesign)
      .subscribe();
  }

  function patchApplication(){
    original.saveState=saveState;
    saveState=function(){original.saveState();if(onlineReady){scheduleTaskSync();scheduleAuditSync();}};
    original.saveV4=saveV4;
    saveV4=function(){original.saveV4();if(onlineReady)scheduleSubmissionSync();};
    original.v7SaveExamRows=v7SaveExamRows;
    v7SaveExamRows=function(){original.v7SaveExamRows();if(onlineReady)scheduleExamSync();};
    original.addSubmissionAttachments=addSubmissionAttachments;
    addSubmissionAttachments=function(files){queueFiles(files);return original.addSubmissionAttachments(files);};
    original.saveSubmissionDraft=saveSubmissionDraft;
    original.submitSchoolReport=submitSchoolReport;
    original.resetDemo=resetDemo;
    resetDemo=function(){if(onlineReady){showToast('В онлайн-версии общий сброс отключён');return;}return original.resetDemo();};
  }

  async function createOnlineSchool(event){
    if(!event.target.closest('#addSchoolButton'))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(!['chief','deputy'].includes(currentProfile?.role))return showToast('Добавлять школы может руководство РОО');
    const name=prompt('Полное название школы:','');if(!name)return;
    const locality=prompt('Населённый пункт:','')||'';
    const director=prompt('Ф.И.О. директора:','')||'';
    const responsible=prompt('Ф.И.О. ответственного:','')||'';
    const email=prompt('Рабочая почта школы:','')||'';
    const {error}=await client.from('schools').insert({id:slugId(name),name,locality,director_name:director,responsible_name:responsible,email,rating:null,metadata:{}});
    if(error)return onlineError(error,'Не удалось добавить школу');
    await insertAudit('Добавил школу','school',slugId(name),{object:name});await loadRemoteData({silent:true});navigate('schools');showToast('Школа добавлена');
  }

  function bindOnlineEvents(){
    const loginForm=document.getElementById('loginForm');
    loginForm?.addEventListener('submit',login,true);
    document.getElementById('rooRegisterButton')?.addEventListener('click',register);
    document.getElementById('rooResetPasswordButton')?.addEventListener('click',resetPassword);
    document.getElementById('logoutButton')?.addEventListener('click',logout,true);
    document.getElementById('taskForm')?.addEventListener('submit',createOnlineTask,true);
    document.getElementById('userForm')?.addEventListener('submit',createInvitation,true);
    document.getElementById('examFileInput')?.addEventListener('change',importExamFileV10,true);
    document.getElementById('submissionSaveDraftButton')?.addEventListener('click',e=>interceptSubmissionAction(e,'draft'),true);
    document.getElementById('submissionSubmitButton')?.addEventListener('click',e=>interceptSubmissionAction(e,'submit'),true);
    document.getElementById('submissionFields')?.addEventListener('change',event=>{
      const input=event.target.closest('input[type="file"][data-field-label]');if(input?.files?.length)queueFiles(input.files,input.dataset.fieldLabel||'');
    },true);
    document.addEventListener('click',downloadRemoteFile,true);
    document.addEventListener('click',createOnlineSchool,true);
    document.addEventListener('roo-design-saved',event=>syncDesign(event.detail));
  }

  function clearLegacyDemoStorage(){
    const keys=['achkhoyEduDemoTasksV2','achkhoyEduDemoRoleV2','achkhoyEduDemoAuditV2','achkhoyEduDemoResolvedApprovalsV2','achkhoyEduSchoolOverridesV2','achkhoyEduDemoV3','achkhoyEduSubmissionsV4','achkhoyEduExamRowsV7','achkhoyEduDeptOverridesV7','achkhoyEduSelectedDeptV7'];
    keys.forEach(k=>{try{localStorage.removeItem(k)}catch(_){}});try{sessionStorage.removeItem('achkhoyEduLoggedV2')}catch(_){}
  }

  async function initializeOnline(){
    clearLegacyDemoStorage();injectStyle();addOnlineLoginControls();updateVersionUI();patchApplication();bindOnlineEvents();
    try{
      const {data,error}=await client.auth.getSession();if(error)throw error;
      if(data.session)await bootOnline(data.session); else {document.getElementById('app')?.classList.add('hidden');document.getElementById('loginScreen')?.classList.remove('hidden');setLoginState('Подключение к Supabase готово. Войдите или создайте пароль.');}
    }catch(error){setLoginState(onlineError(error),'error');}
    client.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_IN'&&session&&!onlineReady)setTimeout(()=>bootOnline(session),0);
      if(event==='SIGNED_OUT'){onlineReady=false;currentProfile=null;currentSession=null;window.ROOCurrentProfile=null;window.ROOCurrentSession=null;}
      if(event==='PASSWORD_RECOVERY'){
        const password=prompt('Введите новый пароль (минимум 6 символов):','');
        if(password&&password.length>=6)client.auth.updateUser({password}).then(({error})=>setLoginState(error?error.message:'Пароль изменён. Войдите в систему.',error?'error':''));
      }
    });
  }

  document.addEventListener('DOMContentLoaded',initializeOnline);
})();
