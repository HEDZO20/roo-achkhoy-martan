'use strict';

/* V4 — полноценное выполнение поручений школой */
const V4_STORAGE_KEY = 'achkhoyEduOnlineSubmissionsV10';
const V4_VERSION_KEY = 'achkhoyEduVersionV4';

const V4_SEED_SUBMISSIONS = [];

function v4Clone(value){ return JSON.parse(JSON.stringify(value)); }
function v4Load(){
  try {
    const raw = localGet(V4_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return v4Clone(V4_SEED_SUBMISSIONS);
}

const v4State = {
  submissions: v4Load(),
  context: null,
  pendingFiles: [],
  pendingFieldFiles: {}
};
let v4AutosaveTimer = null;

function saveV4(){
  localSet(V4_STORAGE_KEY, JSON.stringify(v4State.submissions));
  localSet(V4_VERSION_KEY, '4');
}

function submissionKey(taskId, schoolId){ return `${schoolId}:${taskId}`; }
function getSubmission(taskId, schoolId){
  return v4State.submissions.find(item => Number(item.taskId) === Number(taskId) && item.schoolId === schoolId) || null;
}
function ensureSubmission(taskId, schoolId){
  let submission = getSubmission(taskId, schoolId);
  if (!submission) {
    submission = {
      taskId:Number(taskId), schoolId, status:'draft', answers:{}, files:[], fieldFiles:{}, comment:'',
      directorComment:'', reviewerComment:'', version:1, updatedAt:'', submittedAt:'', history:[]
    };
    v4State.submissions.push(submission);
  }
  submission.answers ||= {};
  submission.files ||= [];
  submission.fieldFiles ||= {};
  submission.history ||= [];
  return submission;
}
function submissionSchool(submission){ return SCHOOLS.find(s => s.id === submission.schoolId); }
function submissionTask(submission){ return state.tasks.find(t => Number(t.id) === Number(submission.taskId)); }
function nowRu(){
  return new Date().toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',', '');
}
function addSubmissionHistory(submission, action, actor=state.currentUser?.name || 'Пользователь'){
  submission.history.unshift({time:nowRu(), actor, action});
  submission.history = submission.history.slice(0,30);
}

function submissionStatusInfo(status){
  return ({
    draft:{text:'Черновик',css:'gray',detail:'Данные сохраняются и ещё не отправлены'},
    director:{text:'У директора',css:'purple',detail:'Ожидает подтверждения директора школы'},
    review:{text:'На проверке РОО',css:'orange',detail:'Отчёт отправлен в отдел образования'},
    returned:{text:'На исправлении',css:'red',detail:'Получены замечания, отчёт необходимо исправить'},
    accepted:{text:'Принято',css:'green',detail:'Отчёт принят отделом образования'}
  })[status] || {text:'В работе',css:'blue',detail:'Поручение выполняется'};
}

function v4FieldKind(label){
  const value = String(label).toLowerCase();
  if (/файл|документ|excel|word|pdf|фото|акт|паспорт/.test(value)) return 'file';
  if (/дата/.test(value)) return 'date';
  if (/время/.test(value)) return 'time';
  if (/процент|балл|колич|всего|допущ|результат|единиц|работает|ваканс|совмест|стаж|участник|дефицит|налич|лагер|трудоустр|охвачен|замечан|устранено|класс/.test(value)) return 'number';
  if (/комментар|описан|обоснован|примечан/.test(value)) return 'textarea';
  return 'text';
}
function v4FieldHint(label, kind){
  if (kind === 'number' && /процент/.test(label.toLowerCase())) return 'От 0 до 100';
  if (kind === 'file') return 'PDF, Word, Excel или изображение';
  return 'Обязательное поле';
}
function formatFileSize(bytes){
  const n=Number(bytes)||0;
  if(n<1024) return `${n} Б`;
  if(n<1024*1024) return `${Math.round(n/1024)} КБ`;
  return `${(n/1024/1024).toFixed(1)} МБ`;
}
function fileIcon(name){
  const ext=(String(name).split('.').pop()||'').toLowerCase();
  if(['xlsx','xls','csv'].includes(ext)) return 'XL';
  if(['doc','docx'].includes(ext)) return 'W';
  if(ext==='pdf') return 'PDF';
  if(['jpg','jpeg','png','webp'].includes(ext)) return 'IMG';
  return 'FILE';
}

const _taskOwnStatusV3 = taskOwnStatus;
taskOwnStatus = function(task){
  if (isSchoolRole() && state.currentUser?.schoolId) {
    const submission = getSubmission(task.id, state.currentUser.schoolId);
    if (submission) {
      const info = submissionStatusInfo(submission.status);
      return {status:submission.status, text:info.text, detail:info.detail};
    }
  }
  return _taskOwnStatusV3(task);
};

const _schoolActionButtonsV3 = schoolActionButtons;
schoolActionButtons = function(task, own){
  const schoolId = state.currentUser?.schoolId;
  const submission = schoolId ? getSubmission(task.id, schoolId) : null;
  const effectiveStatus = submission?.status || own.status;
  if (state.role === 'school_staff') {
    if (effectiveStatus === 'new') return `<button class="primary-button" data-school-action="accept" data-task="${task.id}">Принять в работу</button>`;
    if (['working','draft','returned','overdue'].includes(effectiveStatus)) {
      return `<button class="primary-button" data-school-action="open_work" data-task="${task.id}">✎ Открыть и заполнить форму</button><button class="secondary-button" data-school-action="question" data-task="${task.id}">Задать вопрос</button>`;
    }
    if (effectiveStatus === 'director') return `<span class="tag purple">Отчёт ожидает директора</span><button class="secondary-button" data-school-action="view_report" data-task="${task.id}">Посмотреть отправленные данные</button>`;
    if (effectiveStatus === 'review') return `<span class="tag orange">Отчёт проверяет РОО</span><button class="secondary-button" data-school-action="view_report" data-task="${task.id}">Посмотреть отчёт</button>`;
    if (effectiveStatus === 'accepted') return `<span class="tag green">Работа принята</span><button class="secondary-button" data-school-action="view_report" data-task="${task.id}">Открыть принятую версию</button>`;
  }
  if (state.role === 'school_director') {
    if (effectiveStatus === 'director') return `<button class="primary-button" data-school-action="director_review" data-task="${task.id}">Проверить заполненный отчёт</button>`;
    if (effectiveStatus === 'review') return `<span class="tag orange">Отправлено в РОО</span><button class="secondary-button" data-school-action="view_report" data-task="${task.id}">Посмотреть отчёт</button>`;
    if (effectiveStatus === 'returned') return `<span class="tag red">РОО вернуло отчёт ответственному</span><button class="secondary-button" data-school-action="view_report" data-task="${task.id}">Посмотреть замечания</button>`;
    if (effectiveStatus === 'accepted') return `<span class="tag green">Отчёт принят РОО</span><button class="secondary-button" data-school-action="view_report" data-task="${task.id}">Посмотреть</button>`;
    return '<span class="tag gray">Сотрудник ещё не отправил заполненную форму</span>';
  }
  return _schoolActionButtonsV3(task, own);
};

const _handleSchoolActionV3 = handleSchoolAction;
handleSchoolAction = function(taskId, action){
  const task = state.tasks.find(t => Number(t.id) === Number(taskId));
  const schoolId = state.currentUser?.schoolId;
  if (!task || !schoolId) return _handleSchoolActionV3(taskId, action);
  if (action === 'accept') {
    const submission = ensureSubmission(taskId, schoolId);
    submission.status = 'draft';
    submission.updatedAt = nowRu();
    addSubmissionHistory(submission,'Подтвердил получение и начал выполнение');
    state.schoolOverrides[submissionKey(taskId,schoolId)] = {status:'working',text:'В работе',detail:'Получение подтверждено, открыт черновик формы'};
    addAudit('Подтвердил получение поручения',task.title,'submission');
    saveV4(); saveState(); renderAll(); openSubmissionEditor(taskId);
    return;
  }
  if (action === 'open_work') return openSubmissionEditor(taskId);
  if (action === 'director_review') return openSubmissionReview(taskId,schoolId,'director');
  if (action === 'view_report') return openSubmissionReview(taskId,schoolId,'view');
  if (action === 'question') {
    const question = prompt('Напишите вопрос специалисту РОО:','Уточните, пожалуйста, какие сведения необходимо указать в поле…');
    if (question) {
      const submission = ensureSubmission(taskId,schoolId);
      addSubmissionHistory(submission,`Задал вопрос: ${question}`);
      saveV4(); addAudit('Задал вопрос по поручению',task.title,'submission');
      showToast('Вопрос сохранён в обсуждении поручения');
    }
    return;
  }
  return _handleSchoolActionV3(taskId, action);
};

function inputForTaskField(field,index,submission){
  const kind = v4FieldKind(field);
  const value = submission.answers?.[field] ?? '';
  const common = `data-submission-field="${index}" data-field-label="${escapeHTML(field)}"`;
  if (kind === 'textarea') return `<textarea ${common} rows="4" placeholder="Введите сведения">${escapeHTML(value)}</textarea>`;
  if (kind === 'file') {
    const stored = submission.fieldFiles?.[field];
    return `<div class="submission-file-field"><input ${common} type="file" data-file-field="${index}" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.webp"/><div class="field-file-current" id="field-file-current-${index}">${stored?renderMiniFile(stored):'<span>Файл ещё не выбран</span>'}</div></div>`;
  }
  const max = kind==='number' && /процент/.test(field.toLowerCase()) ? 'max="100" min="0"' : kind==='number' ? 'min="0" step="any"' : '';
  return `<input ${common} type="${kind}" ${max} value="${escapeHTML(value)}" placeholder="Введите значение"/>`;
}
function renderMiniFile(file){
  return `<span class="mini-file"><b>${fileIcon(file.name)}</b><span>${escapeHTML(file.name)}<small>${formatFileSize(file.size)}</small></span></span>`;
}

function openSubmissionEditor(taskId){
  const task = state.tasks.find(t => Number(t.id) === Number(taskId));
  const schoolId = state.currentUser?.schoolId;
  if (!task || !schoolId || state.role !== 'school_staff') return;
  const submission = ensureSubmission(taskId,schoolId);
  v4State.context = {taskId:Number(taskId),schoolId,mode:'edit'};
  v4State.pendingFiles = v4Clone(submission.files || []);
  v4State.pendingFieldFiles = v4Clone(submission.fieldFiles || {});
  document.getElementById('submissionModalTitle').textContent = task.title;
  const school=currentSchool();
  document.getElementById('submissionModalMeta').innerHTML = `<span>${escapeHTML(school?.name||'Школа')}</span><span>Срок: <b>${escapeHTML(task.deadline)}</b></span><span>Версия: <b>${submission.version||1}</b></span><span id="submissionAutosaveState">Все изменения сохранены</span>`;
  document.getElementById('submissionFields').innerHTML = task.formFields.map((field,index)=>{
    const kind=v4FieldKind(field);
    return `<label class="submission-field ${kind==='textarea'||kind==='file'?'wide':''}"><span>${index+1}. ${escapeHTML(field)} <b>*</b></span>${inputForTaskField(field,index,submission)}<small>${v4FieldHint(field,kind)}</small></label>`;
  }).join('');
  document.getElementById('submissionComment').value = submission.comment || '';
  renderAttachmentList();
  renderSubmissionMessages(submission);
  updateSubmissionCompletion();
  document.getElementById('submissionSubmitButton').textContent = task.directorApproval ? 'Отправить директору' : 'Отправить в РОО';
  document.getElementById('submissionReturnedNotice').classList.toggle('hidden', submission.status !== 'returned');
  document.getElementById('submissionReturnedText').textContent = submission.reviewerComment || submission.directorComment || 'Исправьте замечания и отправьте новую версию.';
  bindSubmissionFieldEvents();
  openModal('submissionModal');
}

function bindSubmissionFieldEvents(){
  document.querySelectorAll('#submissionFields [data-submission-field]').forEach(input=>{
    input.addEventListener('input',()=>{updateSubmissionCompletion();scheduleSubmissionAutosave();});
    input.addEventListener('change',event=>{
      if(event.target.type==='file'){
        const file=event.target.files?.[0];
        const label=event.target.dataset.fieldLabel;
        if(file){
          const meta={name:file.name,size:file.size,type:file.type,lastModified:file.lastModified};
          v4State.pendingFieldFiles[label]=meta;
          const index=event.target.dataset.fileField;
          document.getElementById(`field-file-current-${index}`).innerHTML=renderMiniFile(meta);
        }
      }
      updateSubmissionCompletion();scheduleSubmissionAutosave();
    });
  });
}
function scheduleSubmissionAutosave(){
  const status=document.getElementById('submissionAutosaveState');
  if(status)status.textContent='Сохранение…';
  clearTimeout(v4AutosaveTimer);
  v4AutosaveTimer=setTimeout(()=>saveSubmissionDraft(true),900);
}

function updateSubmissionCompletion(){
  const task=state.tasks.find(t=>Number(t.id)===Number(v4State.context?.taskId));
  if(!task)return;
  let filled=0;
  task.formFields.forEach((field,index)=>{
    const kind=v4FieldKind(field);
    if(kind==='file') { if(v4State.pendingFieldFiles[field]) filled++; }
    else {
      const input=document.querySelector(`#submissionFields [data-submission-field="${index}"]`);
      if(String(input?.value||'').trim()) filled++;
    }
  });
  const percent=Math.round((filled/Math.max(1,task.formFields.length))*100);
  document.getElementById('submissionProgressValue').textContent=`${percent}%`;
  document.getElementById('submissionProgressBar').style.width=`${percent}%`;
  document.getElementById('submissionProgressText').textContent=`Заполнено ${filled} из ${task.formFields.length} обязательных полей`;
}
function collectSubmissionValues(validate=false){
  const task=state.tasks.find(t=>Number(t.id)===Number(v4State.context?.taskId));
  const answers={}; const missing=[];
  task.formFields.forEach((field,index)=>{
    const kind=v4FieldKind(field);
    if(kind==='file'){
      if(!v4State.pendingFieldFiles[field]) missing.push(field);
      return;
    }
    const input=document.querySelector(`#submissionFields [data-submission-field="${index}"]`);
    const value=String(input?.value||'').trim();
    answers[field]=value;
    if(validate && !value) missing.push(field);
    if(validate && kind==='number' && /процент/.test(field.toLowerCase()) && (Number(value)<0||Number(value)>100)) missing.push(`${field} (значение от 0 до 100)`);
  });
  const requiresAttachment=/файл|pdf|excel|word|фото/i.test(task.responseType||'') && !task.formFields.some(field=>v4FieldKind(field)==='file');
  if(validate && requiresAttachment && v4State.pendingFiles.length===0)missing.push('Подтверждающий файл');
  return {answers,missing};
}
function saveSubmissionDraft(silent=false){
  const isSilent=silent===true;
  const ctx=v4State.context;if(!ctx||ctx.mode!=='edit')return;
  const submission=ensureSubmission(ctx.taskId,ctx.schoolId);
  const collected=collectSubmissionValues(false);
  submission.answers=collected.answers;
  submission.files=v4Clone(v4State.pendingFiles);
  submission.fieldFiles=v4Clone(v4State.pendingFieldFiles);
  submission.comment=document.getElementById('submissionComment').value.trim();
  submission.status=submission.status==='returned'?'returned':'draft';
  submission.updatedAt=nowRu();
  if(!isSilent)addSubmissionHistory(submission,'Сохранил черновик');
  state.schoolOverrides[submissionKey(ctx.taskId,ctx.schoolId)]={status:submission.status==='returned'?'returned':'working',text:submission.status==='returned'?'На исправлении':'В работе',detail:'Черновик сохранён, можно продолжить заполнение'};
  saveV4();saveState();
  const autosave=document.getElementById('submissionAutosaveState');if(autosave)autosave.textContent=`Сохранено ${new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;
  if(!isSilent){renderAll();showToast('Черновик сохранён');}
}
function submitSchoolReport(){
  const ctx=v4State.context;if(!ctx)return;
  const task=state.tasks.find(t=>Number(t.id)===Number(ctx.taskId));
  const submission=ensureSubmission(ctx.taskId,ctx.schoolId);
  const collected=collectSubmissionValues(true);
  if(collected.missing.length){
    document.getElementById('submissionValidation').innerHTML=`<strong>Нельзя отправить отчёт</strong><span>Заполните: ${collected.missing.map(escapeHTML).join(', ')}</span>`;
    document.getElementById('submissionValidation').classList.remove('hidden');
    showToast('Заполнены не все обязательные поля');
    return;
  }
  document.getElementById('submissionValidation').classList.add('hidden');
  const wasReturned=submission.status==='returned';
  submission.answers=collected.answers;
  submission.files=v4Clone(v4State.pendingFiles);
  submission.fieldFiles=v4Clone(v4State.pendingFieldFiles);
  submission.comment=document.getElementById('submissionComment').value.trim();
  if(wasReturned) submission.version=(submission.version||1)+1;
  submission.status=task.directorApproval?'director':'review';
  submission.updatedAt=nowRu();submission.submittedAt=nowRu();
  submission.directorComment='';
  if(wasReturned) submission.reviewerComment='';
  addSubmissionHistory(submission,task.directorApproval?'Отправил заполненный отчёт директору':'Отправил заполненный отчёт в РОО');
  const info=submissionStatusInfo(submission.status);
  state.schoolOverrides[submissionKey(ctx.taskId,ctx.schoolId)]={status:submission.status,text:info.text,detail:info.detail};
  syncTaskExecution(task);
  addAudit(task.directorApproval?'Отправил заполненный отчёт директору школы':'Отправил заполненный отчёт в РОО',task.title,'submission');
  saveV4();saveState();closeModal('submissionModal');renderAll();openTaskDrawer(task.id);showToast(info.text);
}

function renderAttachmentList(){
  const list=document.getElementById('submissionAttachmentList');
  list.innerHTML=v4State.pendingFiles.map((file,index)=>`<div class="uploaded-file"><b>${fileIcon(file.name)}</b><div><strong>${escapeHTML(file.name)}</strong><span>${formatFileSize(file.size)}</span></div><button type="button" data-remove-attachment="${index}">×</button></div>`).join('')||'<div class="empty-upload">Дополнительные файлы не прикреплены</div>';
  list.querySelectorAll('[data-remove-attachment]').forEach(button=>button.addEventListener('click',()=>{v4State.pendingFiles.splice(Number(button.dataset.removeAttachment),1);renderAttachmentList();scheduleSubmissionAutosave();}));
}
function addSubmissionAttachments(files){
  [...files].forEach(file=>{
    if(file.size>15*1024*1024){showToast(`Файл ${file.name} больше 15 МБ`);return;}
    v4State.pendingFiles.push({name:file.name,size:file.size,type:file.type,lastModified:file.lastModified});
  });
  renderAttachmentList();scheduleSubmissionAutosave();
}
function renderSubmissionMessages(submission){
  const box=document.getElementById('submissionMessages');
  const items=[];
  if(submission.directorComment)items.push(`<div class="message-card director"><strong>Комментарий директора</strong><p>${escapeHTML(submission.directorComment)}</p></div>`);
  if(submission.reviewerComment)items.push(`<div class="message-card reviewer"><strong>Замечание РОО</strong><p>${escapeHTML(submission.reviewerComment)}</p></div>`);
  box.innerHTML=items.join('');
  box.classList.toggle('hidden',items.length===0);
}

function renderSubmissionReadOnly(submission){
  const task=submissionTask(submission),school=submissionSchool(submission),info=submissionStatusInfo(submission.status);
  const answerRows=(task?.formFields||Object.keys(submission.answers||{})).map(field=>{
    const file=submission.fieldFiles?.[field];
    const value=file?renderMiniFile(file):escapeHTML(submission.answers?.[field]||'—');
    return `<div class="answer-row"><span>${escapeHTML(field)}</span><strong>${value}</strong></div>`;
  }).join('');
  const files=(submission.files||[]).map(file=>`<div class="review-file">${renderMiniFile(file)}<button type="button" data-demo-file="${escapeHTML(file.name)}">Открыть</button></div>`).join('')||'<span class="muted">Дополнительных файлов нет</span>';
  const history=(submission.history||[]).map(item=>`<div class="timeline-item"><i class="timeline-dot"></i><div><strong>${escapeHTML(item.action)}</strong><span>${escapeHTML(item.actor)}</span></div><time>${escapeHTML(item.time)}</time></div>`).join('');
  return `<div class="review-summary"><div><span class="tag ${info.css}">${info.text}</span><h3>${escapeHTML(school?.name||'Школа')}</h3><p>${escapeHTML(task?.title||'Поручение')}</p></div><div class="review-version">Версия <b>${submission.version||1}</b><span>${escapeHTML(submission.updatedAt||'')}</span></div></div>
    <div class="review-section"><h4>Заполненные сведения</h4><div class="answer-list">${answerRows}</div></div>
    <div class="review-section"><h4>Комментарий школы</h4><p>${escapeHTML(submission.comment||'Комментарий не указан')}</p></div>
    <div class="review-section"><h4>Приложения</h4><div class="review-files">${files}</div></div>
    ${submission.directorComment?`<div class="review-section comment-director"><h4>Подтверждение директора</h4><p>${escapeHTML(submission.directorComment)}</p></div>`:''}
    ${submission.reviewerComment?`<div class="review-section comment-reviewer"><h4>Замечание РОО</h4><p>${escapeHTML(submission.reviewerComment)}</p></div>`:''}
    <div class="review-section"><h4>История версии</h4><div class="timeline">${history}</div></div>`;
}

function openSubmissionReview(taskId,schoolId,mode='review'){
  const submission=getSubmission(taskId,schoolId);
  if(!submission){showToast('Школа ещё не заполняла это поручение');return;}
  v4State.context={taskId:Number(taskId),schoolId,mode};
  document.getElementById('reviewSubmissionTitle').textContent=submissionTask(submission)?.title||'Отчёт школы';
  document.getElementById('reviewSubmissionContent').innerHTML=renderSubmissionReadOnly(submission);
  document.getElementById('reviewSubmissionComment').value = mode==='director' ? submission.directorComment||'' : submission.reviewerComment||'';
  const actions=document.getElementById('reviewSubmissionActions');
  if(mode==='director' && state.role==='school_director' && submission.status==='director'){
    actions.innerHTML=`<button class="secondary-button" data-review-action="director_return">Вернуть сотруднику</button><button class="primary-button" data-review-action="director_approve">Подтвердить и отправить в РОО</button>`;
    document.getElementById('reviewCommentLabel').textContent='Комментарий директора';
    document.getElementById('reviewCommentWrap').classList.remove('hidden');
  }else if(mode==='review' && !isSchoolRole() && ['review','returned'].includes(submission.status)){
    actions.innerHTML=`<button class="secondary-button danger-outline" data-review-action="roo_return">Вернуть на исправление</button><button class="primary-button" data-review-action="roo_accept">Принять отчёт</button>`;
    document.getElementById('reviewCommentLabel').textContent='Комментарий проверяющего';
    document.getElementById('reviewCommentWrap').classList.remove('hidden');
  }else{
    actions.innerHTML=`<button class="primary-button" data-close-modal="reviewSubmissionModal">Закрыть</button>`;
    document.getElementById('reviewCommentWrap').classList.add('hidden');
  }
  actions.querySelectorAll('[data-review-action]').forEach(button=>button.addEventListener('click',()=>processSubmissionDecision(button.dataset.reviewAction)));
  document.querySelectorAll('[data-demo-file]').forEach(button=>button.addEventListener('click',()=>showToast(`Демо-файл «${button.dataset.demoFile}» доступен в онлайн-версии`)));
  openModal('reviewSubmissionModal');
}

function processSubmissionDecision(action){
  const ctx=v4State.context;if(!ctx)return;
  const submission=getSubmission(ctx.taskId,ctx.schoolId),task=submissionTask(submission),school=submissionSchool(submission);
  const comment=document.getElementById('reviewSubmissionComment').value.trim();
  if(action==='director_return'){
    if(!comment)return showToast('Укажите, что нужно исправить');
    submission.status='returned';submission.directorComment=comment;submission.updatedAt=nowRu();
    addSubmissionHistory(submission,'Директор вернул отчёт сотруднику');
    addAudit('Вернул отчёт сотруднику на исправление',`${task.title} · ${school.name}`,'submission');
  }
  if(action==='director_approve'){
    submission.status='review';submission.directorComment=comment||'Достоверность предоставленных сведений подтверждаю.';submission.updatedAt=nowRu();
    addSubmissionHistory(submission,'Директор подтвердил и отправил отчёт в РОО');
    addAudit('Подтвердил отчёт и отправил в РОО',`${task.title} · ${school.name}`,'submission');
  }
  if(action==='roo_return'){
    if(!comment)return showToast('Укажите замечание для школы');
    submission.status='returned';submission.reviewerComment=comment;submission.updatedAt=nowRu();
    addSubmissionHistory(submission,'РОО вернуло отчёт на исправление');
    addAudit('Вернул отчёт школы на исправление',`${task.title} · ${school.name}`,'submission');
  }
  if(action==='roo_accept'){
    submission.status='accepted';submission.reviewerComment=comment;submission.updatedAt=nowRu();
    addSubmissionHistory(submission,'РОО приняло отчёт');
    addAudit('Принял отчёт школы',`${task.title} · ${school.name}`,'submission');
  }
  const info=submissionStatusInfo(submission.status);
  state.schoolOverrides[submissionKey(ctx.taskId,ctx.schoolId)]={status:submission.status,text:info.text,detail:info.detail};
  syncTaskExecution(task);saveV4();saveState();closeModal('reviewSubmissionModal');renderAll();openTaskDrawer(task.id);showToast(info.text);
}

function syncTaskExecution(task){
  const submissions=v4State.submissions.filter(s=>Number(s.taskId)===Number(task.id));
  const sent=submissions.filter(s=>['director','review','accepted'].includes(s.status)).length;
  const accepted=submissions.filter(s=>s.status==='accepted').length;
  const returned=submissions.filter(s=>s.status==='returned').length;
  task.opened=Math.max(task.opened||0,submissions.length);
  task.completed=Math.max(task.completed||0,accepted);
  task.returned=Math.max(task.returned||0,returned);
  const actual=Math.round(((accepted+sent*.7)/Math.max(1,task.total))*100);
  task.progress=Math.max(task.progress||0,Math.min(100,actual));
}

const _openTaskDrawerV3 = openTaskDrawer;
openTaskDrawer = function(taskId){
  _openTaskDrawerV3(taskId);
  const task=state.tasks.find(t=>Number(t.id)===Number(taskId));
  if(!task||!dom.taskDrawerContent)return;
  const existing=document.getElementById('v4SubmissionCard');if(existing)existing.remove();
  let html='';
  if(isSchoolRole()){
    const submission=getSubmission(task.id,state.currentUser.schoolId);
    if(submission){
      const info=submissionStatusInfo(submission.status);
      const filled=task.formFields.filter(field=>v4FieldKind(field)==='file'?submission.fieldFiles?.[field]:String(submission.answers?.[field]||'').trim()).length;
      html=`<div class="drawer-card v4-submission-card" id="v4SubmissionCard"><div class="panel-head"><div><span class="eyebrow">Рабочая форма школы</span><h3>Заполненные данные</h3></div><span class="tag ${info.css}">${info.text}</span></div><div class="submission-quick-stats"><div><strong>${filled}/${task.formFields.length}</strong><span>полей заполнено</span></div><div><strong>${submission.files.length+Object.keys(submission.fieldFiles||{}).length}</strong><span>файлов приложено</span></div><div><strong>V${submission.version||1}</strong><span>текущая версия</span></div></div>${submission.reviewerComment?`<div class="drawer-notice danger"><b>Замечание РОО:</b> ${escapeHTML(submission.reviewerComment)}</div>`:''}${submission.directorComment&&submission.status==='returned'?`<div class="drawer-notice warning"><b>Замечание директора:</b> ${escapeHTML(submission.directorComment)}</div>`:''}<div class="drawer-actions">${state.role==='school_staff'&&['draft','returned'].includes(submission.status)?`<button class="primary-button" data-v4-edit-submission="${task.id}">Продолжить заполнение</button>`:''}<button class="secondary-button" data-v4-view-submission="${task.id}">Просмотреть отчёт</button></div></div>`;
    }else{
      html=`<div class="drawer-card v4-submission-card" id="v4SubmissionCard"><span class="eyebrow">Рабочая форма школы</span><h3>Отчёт ещё не заполнен</h3><p class="muted">Ответственный сотрудник должен принять поручение и заполнить обязательные поля.</p></div>`;
    }
  }else{
    const submissions=v4State.submissions.filter(s=>Number(s.taskId)===Number(task.id));
    const rows=submissions.map(submission=>{
      const school=submissionSchool(submission),info=submissionStatusInfo(submission.status);
      return `<div class="real-submission-row"><div><strong>${escapeHTML(school?.name||submission.schoolId)}</strong><span>Версия ${submission.version||1} · обновлено ${escapeHTML(submission.updatedAt||'—')}</span></div><span class="tag ${info.css}">${info.text}</span><button class="table-action-button ${submission.status==='review'?'primary':''}" data-v4-review-school="${submission.schoolId}" data-task="${task.id}">${submission.status==='review'?'Проверить':'Открыть'}</button></div>`;
    }).join('');
    html=`<div class="drawer-card v4-submission-card" id="v4SubmissionCard"><div class="panel-head"><div><span class="eyebrow">Фактические ответы</span><h3>Отчёты, заполненные в демо</h3></div><span class="tag blue">${submissions.length}</span></div><div class="real-submission-list">${rows||'<div class="empty-state">Пока ни одна школа не отправила данные через рабочую форму</div>'}</div></div>`;
  }
  const historyCard=[...dom.taskDrawerContent.children].find(el=>el.querySelector('h3')?.textContent==='История поручения');
  if(historyCard)historyCard.insertAdjacentHTML('beforebegin',html);else dom.taskDrawerContent.insertAdjacentHTML('beforeend',html);
  document.querySelectorAll('[data-v4-edit-submission]').forEach(button=>button.addEventListener('click',()=>openSubmissionEditor(Number(button.dataset.v4EditSubmission))));
  document.querySelectorAll('[data-v4-view-submission]').forEach(button=>button.addEventListener('click',()=>openSubmissionReview(Number(button.dataset.v4ViewSubmission),state.currentUser.schoolId,'view')));
  document.querySelectorAll('[data-v4-review-school]').forEach(button=>button.addEventListener('click',()=>openSubmissionReview(Number(button.dataset.task),button.dataset.v4ReviewSchool,button.classList.contains('primary')?'review':'view')));
};

const _downloadTaskSummaryV3 = downloadTaskSummary;
downloadTaskSummary = function(task){
  const submissions=v4State.submissions.filter(s=>Number(s.taskId)===Number(task.id));
  if(!submissions.length)return _downloadTaskSummaryV3(task);
  const fields=task.formFields||[];
  const rows=[['Школа','Статус','Версия','Обновлено',...fields,'Комментарий','Файлы']];
  submissions.forEach(s=>{
    const school=submissionSchool(s),info=submissionStatusInfo(s.status);
    rows.push([school?.name||s.schoolId,info.text,s.version||1,s.updatedAt||'',...fields.map(f=>s.fieldFiles?.[f]?.name||s.answers?.[f]||''),s.comment||'',[...(s.files||[]).map(f=>f.name),...Object.values(s.fieldFiles||{}).map(f=>f.name)].join(', ')]);
  });
  downloadCSV(`svod_poruchenie_${task.id}_otvety_shkol.csv`,rows);
  addAudit('Экспортировал заполненные ответы школ',task.title,'task');
  showToast('Свод с заполненными данными скачан');
};

const _resetDemoV3 = resetDemo;
resetDemo = function(){
  localRemove(V4_STORAGE_KEY);localRemove(V4_VERSION_KEY);
  v4State.submissions=v4Clone(V4_SEED_SUBMISSIONS);
  _resetDemoV3();
  saveV4();
};

function bindV4StaticEvents(){
  document.getElementById('submissionSaveDraftButton')?.addEventListener('click',saveSubmissionDraft);
  document.getElementById('submissionSubmitButton')?.addEventListener('click',submitSchoolReport);
  document.getElementById('submissionAttachmentInput')?.addEventListener('change',event=>{addSubmissionAttachments(event.target.files||[]);event.target.value='';});
  document.getElementById('submissionComment')?.addEventListener('input',scheduleSubmissionAutosave);
  document.getElementById('submissionDropzone')?.addEventListener('dragover',event=>{event.preventDefault();event.currentTarget.classList.add('dragging');});
  document.getElementById('submissionDropzone')?.addEventListener('dragleave',event=>event.currentTarget.classList.remove('dragging'));
  document.getElementById('submissionDropzone')?.addEventListener('drop',event=>{event.preventDefault();event.currentTarget.classList.remove('dragging');addSubmissionAttachments(event.dataTransfer.files||[]);});
  document.getElementById('submissionDropzone')?.addEventListener('click',()=>document.getElementById('submissionAttachmentInput')?.click());
}

document.addEventListener('DOMContentLoaded',()=>{
  bindV4StaticEvents();
  saveV4();
  const versionButton=document.getElementById('versionButton');if(versionButton)versionButton.textContent='V4';
  const banner=document.getElementById('systemUpdateBanner');
  if(banner){
    banner.querySelector('strong').textContent='Система обновлена до V4';
    banner.querySelector('small').textContent='Теперь школа может заполнять поручения, прикреплять файлы, сохранять черновики и отправлять отчёты на проверку.';
  }
});
