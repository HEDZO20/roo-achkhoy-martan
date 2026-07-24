'use strict';

/* ONLINE V24 — центр качества данных, история импортов и безопасный откат. */
(() => {
  let importHistory=[];
  let historyLoading=false;
  let lastQualityReport=null;

  const STATUS_LABELS={
    completed:'Завершён',partial:'Завершён с замечаниями',processing:'Выполняется',failed:'Ошибка',reverted:'Отменён'
  };

  function esc(value){return typeof escapeHTML==='function'?escapeHTML(String(value??'')):String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  function norm(value){return String(value??'').toLowerCase().replace(/ё/g,'е').replace(/[«»"']/g,'').replace(/\s+/g,' ').trim();}
  function finite(value){const n=Number(value);return Number.isFinite(n)?n:null;}
  function formatDate(value){if(!value)return '—';const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value);return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);}
  function currentProfile(){return window.ROOCurrentProfile||null;}
  function canSeeHistory(){const p=currentProfile();return !!p&&(['chief','deputy'].includes(p.role)||(['department_head','specialist'].includes(p.role)&&['methodical','information'].includes(p.department_id)));}
  function canRollback(){const p=currentProfile();return !!p&&(['chief','deputy'].includes(p.role)||(p.role==='department_head'&&['methodical','information'].includes(p.department_id)));}

  function rowIdentity(row){return [row.year,row.exam,row.period||'Основной',norm(row.school),norm(row.name),norm(row.className),norm(row.subject)].join('|');}
  function rowValues(row){return [rowIdentity(row),row.score??'',row.grade??'',norm(row.status),Number(row.lateMinutes||0)].join('|');}

  function calculateQuality(){
    const rows=Array.isArray(window.v7ExamRows)?window.v7ExamRows:(typeof v7ExamRows!=='undefined'?v7ExamRows:[]);
    const seen=new Map(),duplicates=[],issues=[];
    let complete=0;
    rows.forEach((row,index)=>{
      const line=index+1;
      const missing=[];
      if(!String(row.name||'').trim())missing.push('ФИО');
      if(!String(row.school||'').trim())missing.push('школа');
      if(!String(row.exam||'').trim())missing.push('экзамен');
      if(!String(row.subject||'').trim())missing.push('предмет');
      if(missing.length)issues.push({type:'error',title:'Не заполнены обязательные поля',text:`Строка ${line}: ${missing.join(', ')}.`});
      else complete++;

      const score=row.score===''||row.score===null?null:Number(row.score);
      const grade=row.grade===''||row.grade===null?null:Number(row.grade);
      if(score!==null&&(!Number.isFinite(score)||score<0||score>100))issues.push({type:'error',title:'Некорректный балл',text:`${row.name||`Строка ${line}`}: значение «${row.score}» вне диапазона 0–100.`});
      if(grade!==null&&![2,3,4,5].includes(grade))issues.push({type:'error',title:'Некорректная оценка',text:`${row.name||`Строка ${line}`}: оценка должна быть от 2 до 5.`});
      if(/не\s*яв/i.test(String(row.status||''))&&score!==null)issues.push({type:'warning',title:'Балл при неявке',text:`${row.name}: указан балл при статусе «Не явился».`});
      if(score!==null&&grade!==null&&typeof v7Grade==='function'&&!/не\s*яв/i.test(String(row.status||''))){
        const calculated=Number(v7Grade(score,row.status));
        if(calculated&&calculated!==grade)issues.push({type:'warning',title:'Оценка требует проверки',text:`${row.name}: в файле оценка ${grade}, общая автоматическая шкала даёт ${calculated}.`});
      }

      const identity=rowIdentity(row),values=rowValues(row),previous=seen.get(identity);
      if(previous){
        const exact=previous.values===values;
        duplicates.push({exact,row,previous:previous.row});
        issues.push({type:exact?'warning':'error',title:exact?'Точная повторная строка':'Конфликт результатов',text:exact?`${row.name}: одинаковый результат присутствует несколько раз.`:`${row.name}: для одного экзамена найдены разные значения.`});
      }else seen.set(identity,{values,row});
    });

    const latest=importHistory.find(item=>!['reverted','failed'].includes(item.status||''));
    const latestIssues=Array.isArray(latest?.issues)?latest.issues:[];
    latestIssues.slice(0,100).forEach(item=>issues.push({type:item.type==='error'?'error':'warning',title:'Замечание последнего импорта',text:`Строка ${item.row||'—'}: ${item.text||'Требуется проверка'}`}));

    const errorCount=issues.filter(x=>x.type==='error').length;
    const warningCount=issues.filter(x=>x.type==='warning').length;
    return {rows,total:rows.length,complete,duplicates,issues,errorCount,warningCount,latest};
  }

  function qualityCard(value,label,help,kind=''){
    return `<article class="v24-quality-card ${kind}"><strong>${esc(value)}</strong><span>${esc(label)}</span><small>${esc(help)}</small></article>`;
  }

  function renderQuality(){
    const summary=document.getElementById('examQualitySummary');
    const list=document.getElementById('examQualityList');
    const dupList=document.getElementById('examDuplicateList');
    if(!summary||!list||!dupList)return;
    const report=calculateQuality();lastQualityReport=report;
    const importStatus=document.getElementById('examImportStatus');
    if(importStatus){
      if(report.total){
        const latestActive=importHistory.find(item=>!['reverted','failed'].includes(historyStatus(item)));
        importStatus.textContent=latestActive?`В базе: ${report.total}. Последний импорт: ${latestActive.source_file||'файл'} · ${formatDate(latestActive.created_at)}`:`В базе результатов: ${report.total}`;
        importStatus.classList.remove('error');
      }else if(!/чтение|распознано|готово:/i.test(importStatus.textContent||'')) importStatus.textContent='Данные ещё не загружены';
    }
    const rejected=importHistory.reduce((sum,item)=>sum+Number(item.rejected_rows||0),0);
    summary.innerHTML=[
      qualityCard(report.total,'Результатов в базе',report.total?'Проверены текущие строки':'Данные ещё не загружены',report.total?'ok':''),
      qualityCard(report.complete,'Полных строк',report.total?`Из ${report.total} результатов`:'—',report.complete===report.total&&report.total?'ok':''),
      qualityCard(report.duplicates.length,'Повторных записей',report.duplicates.length?'Требуют проверки':'Точных дублей не найдено',report.duplicates.length?'warning':'ok'),
      qualityCard(report.errorCount,'Критических ошибок',rejected?`Отклонено при импортах: ${rejected}`:'Ошибочные строки не сохраняются',report.errorCount?'error':'ok')
    ].join('');

    const state=document.getElementById('examQualityState');
    if(state){
      state.className='v24-quality-state '+(report.errorCount?'error':report.warningCount?'warning':'');
      state.textContent=report.errorCount?'Требуется исправление':report.warningCount?'Требуется проверка':report.total?'Данные готовы':'Нет данных';
    }

    const visibleIssues=report.issues.slice(0,80);
    list.innerHTML=visibleIssues.length?`<div class="v24-issue-group">${visibleIssues.map(item=>`<div class="v24-issue ${item.type}"><i>${item.type==='error'?'!':'△'}</i><div><strong>${esc(item.title)}</strong><span>${esc(item.text)}</span></div></div>`).join('')}</div>${report.issues.length>80?`<p class="muted">Показаны первые 80 из ${report.issues.length} замечаний. Скачайте полный отчёт проверки.</p>`:''}`:`<div class="v24-issue-group"><div class="v24-issue"><i>✓</i><div><strong>${report.total?'Данные прошли проверку':'Данные ещё не загружены'}</strong><span>${report.total?'Критических ошибок и точных дублей не обнаружено.':'Загрузите XLSX, XLS или CSV — система выполнит проверку до сохранения.'}</span></div></div></div>`;

    const dupCount=document.getElementById('examDuplicateCount');if(dupCount)dupCount.textContent=`Найдено: ${report.duplicates.length}`;
    dupList.innerHTML=report.duplicates.length?`<div class="v24-duplicate-list">${report.duplicates.slice(0,30).map(item=>`<div class="v24-duplicate-row"><strong>${esc(item.row.name||'Ученик не указан')} · ${esc(item.row.subject||'Предмет не указан')}</strong><span>${esc(item.row.school)} · ${esc(item.row.exam)} · ${item.exact?'совпадают все значения':'значения различаются'}</span></div>`).join('')}</div>`:`<div class="empty-state">Повторных результатов не найдено</div>`;
  }

  function uploaderName(id){if(!id)return 'Не указан';const user=(typeof USERS!=='undefined'?USERS:[]).find(item=>item._profileId===id||String(item.id||'')===`remote-${id}`);return user?.name||'Пользователь системы';}
  function historyStatus(item){return item.status||((item.reverted_at)?'reverted':Number(item.errors_count||0)||Number(item.rejected_rows||0)?'partial':'completed');}

  function renderHistory(){
    const body=document.getElementById('examImportHistoryBody');const summary=document.getElementById('examHistorySummary');if(!body||!summary)return;
    if(!canSeeHistory()){
      const tab=document.querySelector('[data-exam-tab="history"]');if(tab)tab.classList.add('hidden');
      body.innerHTML='<tr><td colspan="9" class="empty-state">История импортов доступна руководству РОО и ответственным отделам.</td></tr>';summary.innerHTML='';return;
    }
    const tab=document.querySelector('[data-exam-tab="history"]');if(tab)tab.classList.remove('hidden');
    const active=importHistory.filter(x=>!['reverted','failed'].includes(historyStatus(x)));
    const reverted=importHistory.filter(x=>historyStatus(x)==='reverted').length;
    const accepted=active.reduce((sum,x)=>sum+Number(x.accepted_rows??x.imported_rows??0),0);
    const rejected=importHistory.reduce((sum,x)=>sum+Number(x.rejected_rows||0),0);
    summary.innerHTML=[
      `<article class="v24-history-card"><strong>${importHistory.length}</strong><span>Всего загрузок</span><small>Включая отменённые</small></article>`,
      `<article class="v24-history-card"><strong>${accepted}</strong><span>Действующих строк</span><small>По активным импортам</small></article>`,
      `<article class="v24-history-card"><strong>${rejected}</strong><span>Отклонено проверкой</span><small>В базу не сохранены</small></article>`,
      `<article class="v24-history-card"><strong>${reverted}</strong><span>Отменено импортов</span><small>С сохранением истории</small></article>`
    ].join('');
    const badge=document.getElementById('examHistoryBadge');if(badge){badge.textContent=String(importHistory.length);badge.classList.toggle('hidden',!importHistory.length);}
    body.innerHTML=importHistory.length?importHistory.map(item=>{
      const status=historyStatus(item),acceptedRows=Number(item.accepted_rows??item.imported_rows??0),rejectedRows=Number(item.rejected_rows||0),duplicates=Number(item.duplicates_count||0);
      const canUndo=canRollback()&&!['reverted','failed','processing'].includes(status);
      return `<tr><td>${esc(formatDate(item.created_at))}</td><td class="v24-file-cell"><strong>${esc(item.source_file||'Файл не указан')}</strong><span>${esc(item.academic_year||'')} · ${esc(item.period||'Основной')}</span></td><td>${esc(item.exam_type||'—')}${item.subject?`<br><small>${esc(item.subject)}</small>`:''}</td><td><b>${acceptedRows}</b></td><td>${rejectedRows}</td><td>${duplicates}</td><td><span class="v24-status ${status}">${esc(STATUS_LABELS[status]||status)}</span></td><td>${esc(uploaderName(item.uploaded_by))}</td><td><div class="v24-row-actions"><button data-v24-import-details="${esc(item.id)}">Подробнее</button>${canUndo?`<button class="danger" data-v24-import-rollback="${esc(item.id)}">Отменить</button>`:''}</div></td></tr>`;
    }).join(''):'<tr><td colspan="9" class="empty-state">Загрузок ещё не было. После первого импорта здесь появится журнал и возможность безопасной отмены.</td></tr>';
  }

  async function loadHistory({silent=false}={}){
    if(historyLoading||!window.rooSupabase||!canSeeHistory())return;
    historyLoading=true;
    const body=document.getElementById('examImportHistoryBody');if(body&&!silent)body.innerHTML='<tr><td colspan="9" class="empty-state">Загрузка истории…</td></tr>';
    try{
      const {data,error}=await window.rooSupabase.from('exam_imports').select('*').order('created_at',{ascending:false}).limit(300);
      if(error)throw error;
      importHistory=Array.isArray(data)?data:[];
      window.ROOExamImportHistory=importHistory;
      renderHistory();renderQuality();
    }catch(error){
      if(body)body.innerHTML=`<tr><td colspan="9" class="empty-state">Не удалось загрузить историю: ${esc(error.message||error)}</td></tr>`;
    }finally{historyLoading=false;}
  }

  function showImportDetails(id){
    const item=importHistory.find(x=>String(x.id)===String(id));if(!item)return;
    const status=historyStatus(item),issues=Array.isArray(item.issues)?item.issues:[];
    const mapping=item.mapping&&typeof item.mapping==='object'?item.mapping:{};
    const metadata=item.metadata&&typeof item.metadata==='object'?item.metadata:{};
    const details=`<div class="v24-detail-grid"><div><b>Файл</b><span>${esc(item.source_file||'—')}</span></div><div><b>Статус</b><span>${esc(STATUS_LABELS[status]||status)}</span></div><div><b>Дата</b><span>${esc(formatDate(item.created_at))}</span></div><div><b>Автор</b><span>${esc(uploaderName(item.uploaded_by))}</span></div><div><b>Принято</b><span>${Number(item.accepted_rows??item.imported_rows??0)}</span></div><div><b>Отклонено</b><span>${Number(item.rejected_rows||0)}</span></div><div><b>Дубли</b><span>${Number(item.duplicates_count||0)}</span></div><div><b>Предупреждения</b><span>${Number(item.warnings_count||0)}</span></div><div><b>Отпечаток</b><span>${esc(item.file_hash||'Не сохранён')}</span></div><div><b>Строка заголовков</b><span>${esc(mapping.header_row||'—')}</span></div></div>${item.revert_reason?`<div class="v24-import-error"><b>Причина отмены:</b> ${esc(item.revert_reason)}<br><small>${esc(formatDate(item.reverted_at))}</small></div>`:''}${issues.length?`<div class="drawer-card"><h3>Протокол проверки</h3>${issues.slice(0,100).map(issue=>`<p class="${issue.type==='error'?'delta-down':'muted'}">Строка ${esc(issue.row||'—')}: ${esc(issue.text||'')}</p>`).join('')}${issues.length>100?`<p class="muted">Показаны первые 100 из ${issues.length} замечаний.</p>`:''}</div>`:'<div class="drawer-card"><h3>Протокол проверки</h3><p class="muted">Замечаний не сохранено.</p></div>'}<p class="muted">Всего строк в исходном файле: ${esc(metadata.total_rows??'—')}.</p>`;
    showInfoModal(`Импорт: ${item.source_file||'файл'}`,details,'История экзаменационных данных');
  }

  async function rollbackImport(id){
    if(!canRollback())return showToast('У вас нет права отменять импорты');
    const item=importHistory.find(x=>String(x.id)===String(id));if(!item)return;
    const reason=prompt(`Укажите причину отмены импорта «${item.source_file||'файл'}»:`,'Файл загружен ошибочно');
    if(reason===null)return;
    if(!confirm(`Удалить из аналитики результаты только этой загрузки?\n\nФайл: ${item.source_file}\nСтрок: ${item.accepted_rows??item.imported_rows??0}\n\nИстория операции сохранится.`))return;
    try{
      showToast('Выполняется безопасная отмена импорта…');
      const {data,error}=await window.rooSupabase.rpc('rollback_exam_import',{target_import:id,rollback_reason:reason.trim()||'Причина не указана'});
      if(error){if(/rollback_exam_import|schema cache/i.test(error.message||''))throw new Error('В Supabase ещё не выполнен PATCH_V24_DATA_QUALITY.sql.');throw error;}
      await window.ROOReloadOnlineData?.();
      await loadHistory();
      renderQuality();
      showToast(`Импорт отменён. Удалено строк: ${data?.deleted_rows??0}.`);
    }catch(error){showToast(error.message||'Не удалось отменить импорт');}
  }

  function exportQuality(){
    const report=lastQualityReport||calculateQuality();
    const rows=[['Уровень','Проблема','Описание'],...report.issues.map(item=>[item.type==='error'?'Ошибка':'Предупреждение',item.title,item.text])];
    if(typeof downloadCSV==='function')downloadCSV('otchet_kachestva_ekzamenacionnyh_dannyh.csv',rows);
  }

  function bindEvents(){
    document.getElementById('examQualityRefresh')?.addEventListener('click',()=>{renderQuality();loadHistory();showToast('Проверка данных обновлена');});
    document.getElementById('examQualityExport')?.addEventListener('click',exportQuality);
    document.getElementById('examHistoryRefresh')?.addEventListener('click',()=>loadHistory());
    document.addEventListener('click',event=>{
      const details=event.target.closest('[data-v24-import-details]');if(details){showImportDetails(details.dataset.v24ImportDetails);return;}
      const rollback=event.target.closest('[data-v24-import-rollback]');if(rollback)rollbackImport(rollback.dataset.v24ImportRollback);
    });
    document.addEventListener('roo-online-data-loaded',()=>{toggleAccess();renderQuality();loadHistory({silent:true});});
    document.addEventListener('roo-exam-import-changed',()=>loadHistory());
  }

  function toggleAccess(){
    const tab=document.querySelector('[data-exam-tab="history"]');
    if(tab)tab.classList.toggle('hidden',!canSeeHistory());
  }

  const originalQuality=typeof v7RenderQuality==='function'?v7RenderQuality:null;
  window.v7RenderQuality=function(){try{renderQuality();}catch(error){console.error('V24 quality render:',error);originalQuality?.();}};

  document.addEventListener('DOMContentLoaded',()=>{bindEvents();toggleAccess();renderQuality();setTimeout(()=>loadHistory({silent:true}),800);});
})();
