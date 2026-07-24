'use strict';

/* V6 — полный визуальный редактор: глобальная тема + настройка отдельных элементов. */
(() => {
  const STORAGE_KEY = 'achkhoy_roo_visual_editor_v6';
  const DEFAULT_GLOBAL = {
    fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
    baseFont: 100,
    primary: '#23663b',
    secondary: '#3f8b51',
    page: '#edf2e8',
    surface: '#f8faf5',
    text: '#183428',
    muted: '#66776c',
    border: '#dce6d7',
    sidebar: '#fafcf7',
    radius: 20,
    shadow: 35,
    surfaceOpacity: 94,
    density: 'comfortable',
    backgroundUrl: 'assets/landscape.svg',
    backgroundOpacity: 22,
    sidebarWidth: 230,
    headerHeight: 78
  };
  const PRESETS = [
    {id:'sage',name:'Светлый шалфей',desc:'Текущий спокойный стиль',global:{...DEFAULT_GLOBAL}},
    {id:'mint',name:'Свежая мята',desc:'Более светлая зелёная тема',global:{...DEFAULT_GLOBAL,primary:'#247a55',secondary:'#54a878',page:'#e9f4ee',surface:'#f8fcf9',border:'#cfe4d7',sidebar:'#f3faf5'}},
    {id:'forest',name:'Официальная зелёная',desc:'Строгий контрастный вариант',global:{...DEFAULT_GLOBAL,primary:'#155b34',secondary:'#2e7b49',page:'#e7eee7',surface:'#f6f9f5',text:'#102e20',muted:'#596a60',border:'#c7d7ca'}},
    {id:'sky',name:'Мягкое небо',desc:'Сине-зелёная деловая тема',global:{...DEFAULT_GLOBAL,primary:'#286a73',secondary:'#4b9295',page:'#eaf1f0',surface:'#f8fbfa',text:'#17373a',muted:'#637477',border:'#d0dfde'}},
    {id:'sand',name:'Тёплый песок',desc:'Бежево-зелёная спокойная тема',global:{...DEFAULT_GLOBAL,primary:'#55703a',secondary:'#839d58',page:'#f1efe5',surface:'#fbfaf4',text:'#353c2b',muted:'#767769',border:'#e0ddcb',sidebar:'#f7f5ec'}},
    {id:'lilac',name:'Мягкая сирень',desc:'Спокойный современный вариант',global:{...DEFAULT_GLOBAL,primary:'#615c8d',secondary:'#8680ad',page:'#efedf5',surface:'#faf9fc',text:'#302f43',muted:'#706e7e',border:'#dedbe8',sidebar:'#f7f5fa'}}
  ];

  let editorState = loadState();
  let selectedElement = null;
  let selecting = false;
  let history = [];
  let future = [];
  let saveTimer = null;
  let mutationTimer = null;
  let selectedSaveTimer = null;
  let previewSnapshot = null;

  const $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));

  function loadState(){
    try{
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return {
        version: 11,
        updatedAt: parsed?.updatedAt || '',
        global: {...DEFAULT_GLOBAL, ...(parsed?.global || {})},
        elements: parsed?.elements || {},
        customThemes: parsed?.customThemes || []
      };
    }catch(_){ return {version:11,updatedAt:'',global:{...DEFAULT_GLOBAL},elements:{},customThemes:[]}; }
  }

  function queueSave(message='Изменения сохранены'){
    clearTimeout(saveTimer);
    editorState.version=11;
    editorState.updatedAt=new Date().toISOString();
    const stateLabel=$('v6SaveState');
    try{
      localStorage.setItem(STORAGE_KEY,JSON.stringify(editorState));
      if(stateLabel) stateLabel.textContent=`${message} · в браузере`;
      document.dispatchEvent(new CustomEvent('roo-design-saved',{detail:clone(editorState)}));
      document.dispatchEvent(new CustomEvent('roo-design-local-status',{detail:{status:'saved',message}}));
    }catch(error){
      if(stateLabel) stateLabel.textContent='Не удалось сохранить: уменьшите размер фонового фото';
      document.dispatchEvent(new CustomEvent('roo-design-local-status',{detail:{status:'error',message:error.message}}));
    }
    saveTimer=setTimeout(()=>{
      if(stateLabel && !/облаке|ошибка/i.test(stateLabel.textContent||'')) stateLabel.textContent='Все изменения сохранены';
    },2400);
  }

  function snapshot(){
    history.push(JSON.stringify(editorState));
    if(history.length>35) history.shift();
    future=[];
    updateHistoryButtons();
  }
  function commit(mutator,message){
    snapshot();
    mutator();
    applyEverything();
    queueSave(message);
  }
  function updateHistoryButtons(){
    if($('v6Undo')) $('v6Undo').disabled=history.length===0;
    if($('v6Redo')) $('v6Redo').disabled=future.length===0;
  }
  function undo(){
    if(!history.length)return;
    future.push(JSON.stringify(editorState));
    editorState=JSON.parse(history.pop());
    applyEverything();syncGlobalControls();syncSelectedControls();queueSave('Последнее изменение отменено');updateHistoryButtons();
  }
  function redo(){
    if(!future.length)return;
    history.push(JSON.stringify(editorState));
    editorState=JSON.parse(future.pop());
    applyEverything();syncGlobalControls();syncSelectedControls();queueSave('Изменение повторено');updateHistoryButtons();
  }

  function hexToRgb(hex){
    const h=String(hex||'').replace('#','').trim();
    if(h.length===3)return h.split('').map(x=>parseInt(x+x,16));
    if(h.length===6)return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
    return [248,250,245];
  }
  function rgbToHex(value,fallback='#000000'){
    if(!value)return fallback;
    if(value.startsWith('#'))return value.slice(0,7);
    const m=value.match(/[\d.]+/g);if(!m||m.length<3)return fallback;
    return '#'+m.slice(0,3).map(n=>Math.max(0,Math.min(255,Math.round(Number(n)))).toString(16).padStart(2,'0')).join('');
  }
  function cssUrl(url){
    if(!url)return 'linear-gradient(transparent,transparent)';
    return `url("${String(url).replace(/"/g,'\\"')}")`;
  }
  function cssAttrEscape(value){ return String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"'); }

  function applyGlobal(){
    const g=editorState.global;
    const root=document.documentElement.style;
    const rgb=hexToRgb(g.surface);
    root.setProperty('--v6-font',g.fontFamily);
    root.setProperty('--v6-font-scale',String(g.baseFont/100));
    root.setProperty('--v6-primary',g.primary);
    root.setProperty('--v6-secondary',g.secondary);
    root.setProperty('--v6-page',g.page);
    root.setProperty('--v6-page-rgb',hexToRgb(g.page).join(','));
    root.setProperty('--v6-surface',g.surface);
    root.setProperty('--v6-surface-rgb',rgb.join(','));
    root.setProperty('--v6-text',g.text);
    root.setProperty('--v6-muted',g.muted);
    root.setProperty('--v6-border',g.border);
    root.setProperty('--v6-sidebar',g.sidebar);
    root.setProperty('--v6-sidebar-rgb',hexToRgb(g.sidebar).join(','));
    root.setProperty('--v6-radius',`${g.radius}px`);
    root.setProperty('--v6-shadow-strength',String(g.shadow/100));
    root.setProperty('--v6-surface-opacity',String(g.surfaceOpacity/100));
    root.setProperty('--v6-bg-image',cssUrl(g.backgroundUrl));
    root.setProperty('--v6-bg-image-opacity',String(g.backgroundOpacity/100));
    root.setProperty('--v6-sidebar-width',`${g.sidebarWidth}px`);
    root.setProperty('--v6-header-height',`${g.headerHeight}px`);
    document.body.classList.remove('v6-density-compact','v6-density-comfortable','v6-density-spacious');
    document.body.classList.add(`v6-density-${g.density}`);
    const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=g.page;
  }

  function normalizeKeyPart(value){
    return String(value??'').trim().toLowerCase().replace(/\s+/g,' ').replace(/[^a-zа-яё0-9_.:@/ -]+/gi,'').slice(0,120);
  }
  function shortHash(value){
    let h=2166136261;const s=String(value||'');
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(36);
  }
  function semanticToken(el){
    if(!el)return '';
    if(el.id && !el.id.startsWith('v6'))return `id:${el.id}`;
    const attrs=['data-editor-key','data-page','data-action','data-route','data-view','data-section','data-task-id','data-school-id','data-department-id','data-dept','data-id','data-key','data-role','name','aria-label','title','href'];
    for(const name of attrs){
      const value=el.getAttribute?.(name);
      if(value && value!=='#' && !String(value).startsWith('javascript:'))return `${el.tagName.toLowerCase()}[${name}=${normalizeKeyPart(value)}]`;
    }
    return '';
  }
  function buildKey(el){
    if(!el || el===document.body || el===document.documentElement)return '';
    const direct=semanticToken(el);if(direct && direct.startsWith('id:'))return direct;
    const scopeNode=el.closest?.('[data-page],[data-section],main[id],section[id],.page[id]');
    const scope=scopeNode?semanticToken(scopeNode):'';
    const parts=[];let node=el;let depth=0;
    while(node && node!==document.body && depth<10){
      const semantic=semanticToken(node);
      if(semantic){parts.unshift(semantic);if(node!==el||semantic.startsWith('id:'))break;}
      else{
        const parent=node.parentElement;if(!parent)break;
        const same=[...parent.children].filter(x=>x.tagName===node.tagName);
        const index=Math.max(0,same.indexOf(node));
        const cls=[...node.classList].filter(c=>!c.startsWith('v6')&&!['active','hidden','light-theme','selected','open','is-active'].includes(c)).slice(0,3).join('.');
        let token=`${node.tagName.toLowerCase()}${cls?'.'+cls:''}:${index}`;
        if(!cls && node.children.length===0){const txt=(node.textContent||node.getAttribute?.('placeholder')||'').trim().replace(/\s+/g,' ').slice(0,100);if(txt)token+=`~${shortHash(txt)}`;}
        parts.unshift(token);
      }
      node=node.parentElement;depth++;
    }
    return `v11:${scope||'document'}|${parts.join('>')}`;
  }

  function assignKeys(root=document){
    const candidates=root.querySelectorAll?.('#app *, #loginScreen *') || [];
    candidates.forEach(el=>{
      if(el.closest('#visualEditorPanel')||el.id==='visualEditorFab'||['SCRIPT','STYLE','OPTION'].includes(el.tagName))return;
      if(!el.dataset.v6Key){const key=buildKey(el);if(key)el.dataset.v6Key=key;}
    });
  }

  function createRule(key,record){
    const styles={...(record.styles||{})};
    if(record.hidden)styles.display='none';
    const body=Object.entries(styles).filter(([,v])=>v!==''&&v!=null).map(([p,v])=>`${p}:${v}!important`).join(';');
    if(!body)return '';
    const escapedKey=cssAttrEscape(key);
    const selector=key.startsWith('id:')
      ? `#${CSS.escape(key.slice(3))}[data-v6-key="${escapedKey}"]`
      : `html body [data-v6-key="${escapedKey}"][data-v6-key="${escapedKey}"][data-v6-key="${escapedKey}"]`;
    const cascadeProps=['color','font-family','font-weight','letter-spacing','line-height','text-align'];
    const cascadeBody=Object.entries(styles).filter(([p,v])=>cascadeProps.includes(p)&&v!==''&&v!=null).map(([p,v])=>`${p}:${v}!important`).join(';');
    return `${selector}{${body}}${record.cascade&&cascadeBody?`${selector} *{${cascadeBody}}`:''}`;
  }

  function applyElementRecords(){
    assignKeys();
    const style=$('v6ElementOverrides');
    if(style)style.textContent=Object.entries(editorState.elements).map(([key,record])=>createRule(key,record)).filter(Boolean).join('\n');
    document.querySelectorAll('[data-v6-key]').forEach(el=>{
      const record=editorState.elements[el.dataset.v6Key];if(!record)return;
      if(record.text!==undefined && record.text!==null && canEditText(el)){
        if(isFormField(el))el.placeholder=record.text;else if(el.textContent!==record.text)el.textContent=record.text;
      }
      if(record.attrs){
        Object.entries(record.attrs).forEach(([name,value])=>{
          if(value===null||value==='')el.removeAttribute(name);else if(el.getAttribute(name)!==value)el.setAttribute(name,value);
        });
      }
    });
  }

  function applyEverything(){applyGlobal();applyElementRecords();renderThemes();}

  function isFormField(el){return ['INPUT','TEXTAREA'].includes(el?.tagName);}
  function canEditText(el){
    if(!el)return false;
    if(isFormField(el))return true;
    return !['IMG','SVG','PATH','SELECT'].includes(el.tagName)&&el.children.length===0;
  }

  function openEditor(){
    $('visualEditorPanel')?.classList.remove('hidden');
    $('v6EditorShade')?.classList.remove('hidden');
    document.body.classList.add('v6-editor-open');
    syncGlobalControls();renderThemes();
  }
  function closeEditor(){
    stopSelecting();
    $('visualEditorPanel')?.classList.add('hidden');
    $('v6EditorShade')?.classList.add('hidden');
    document.body.classList.remove('v6-editor-open');
    clearSelected();
  }
  function showFab(){
    const app=$('app');const fab=$('visualEditorFab');
    if(!fab)return;
    const logged=app&&!app.classList.contains('hidden');
    const allowed=typeof state==='undefined'||['chief','deputy'].includes(state.role);
    fab.classList.toggle('hidden',!(logged&&allowed));
  }

  function setTab(name){
    document.querySelectorAll('[data-v6-tab]').forEach(b=>b.classList.toggle('active',b.dataset.v6Tab===name));
    document.querySelectorAll('[data-v6-panel]').forEach(p=>p.classList.toggle('active',p.dataset.v6Panel===name));
  }

  function startSelecting(){
    selecting=true;document.body.classList.add('v6-selecting');
    const btn=$('v6SelectMode');if(btn){btn.classList.add('is-active');btn.innerHTML='<span>✕</span> Отменить выбор';}
    const stateLabel=$('v6SaveState');if(stateLabel)stateLabel.textContent='Нажмите на блок или надпись на странице';
  }
  function stopSelecting(){
    selecting=false;document.body.classList.remove('v6-selecting');
    const btn=$('v6SelectMode');if(btn){btn.classList.remove('is-active');btn.innerHTML='<span>◎</span> Выбрать элемент на странице';}
  }
  const PREVIEW_STYLE_PROPS=['font-family','font-size','font-weight','color','background','background-color','border-color','border-radius','opacity','padding','margin','width','min-height','line-height','letter-spacing','text-align','box-shadow','display'];
  function capturePreviewStyles(el){
    if(!el)return null;
    const capture=node=>Object.fromEntries(PREVIEW_STYLE_PROPS.map(prop=>[prop,{value:node.style.getPropertyValue(prop),priority:node.style.getPropertyPriority(prop)}]));
    return {root:capture(el),children:[...el.querySelectorAll?.('*')||[]].map(node=>({node,color:node.style.getPropertyValue('color'),colorPriority:node.style.getPropertyPriority('color'),font:node.style.getPropertyValue('font-family'),fontPriority:node.style.getPropertyPriority('font-family')}))};
  }
  function restorePreviewStyles(el){
    if(!el||!previewSnapshot)return;
    Object.entries(previewSnapshot.root||{}).forEach(([prop,item])=>{if(item.value)el.style.setProperty(prop,item.value,item.priority||'');else el.style.removeProperty(prop);});
    (previewSnapshot.children||[]).forEach(item=>{if(!item.node?.isConnected)return;if(item.color)item.node.style.setProperty('color',item.color,item.colorPriority||'');else item.node.style.removeProperty('color');if(item.font)item.node.style.setProperty('font-family',item.font,item.fontPriority||'');else item.node.style.removeProperty('font-family');});
  }
  function clearPreviewStyles(el){restorePreviewStyles(el);previewSnapshot=null;}
  function clearSelected(){
    clearTimeout(selectedSaveTimer);
    if(selectedElement){selectedElement.classList.remove('v6-editor-selected');clearPreviewStyles(selectedElement);}
    selectedElement=null;
    applyElementRecords();
  }
  function selectElement(el){
    clearSelected();selectedElement=el;selectedElement.dataset.v6Key=buildKey(selectedElement);previewSnapshot=capturePreviewStyles(selectedElement);selectedElement.classList.add('v6-editor-selected');
    stopSelecting();setTab('element');syncSelectedControls();
    const stateLabel=$('v6SaveState');if(stateLabel)stateLabel.textContent='Элемент выбран · изменения сохраняются автоматически';
  }

  function syncGlobalControls(){
    const g=editorState.global;
    const map={v6GlobalFont:'fontFamily',v6BaseFont:'baseFont',v6PrimaryColor:'primary',v6SecondaryColor:'secondary',v6PageColor:'page',v6SurfaceColor:'surface',v6TextColor:'text',v6MutedColor:'muted',v6BorderColor:'border',v6SidebarColor:'sidebar',v6Radius:'radius',v6Shadow:'shadow',v6SurfaceOpacity:'surfaceOpacity',v6Density:'density',v6BackgroundUrl:'backgroundUrl',v6BackgroundOpacity:'backgroundOpacity',v6SidebarWidth:'sidebarWidth',v6HeaderHeight:'headerHeight'};
    Object.entries(map).forEach(([id,key])=>{if($(id))$(id).value=g[key]??'';});
    updateRangeLabels();
  }
  function updateRangeLabels(){
    const pairs=[['v6BaseFontValue',`${editorState.global.baseFont}%`],['v6RadiusValue',`${editorState.global.radius} px`],['v6ShadowValue',`${editorState.global.shadow}%`],['v6SurfaceOpacityValue',`${editorState.global.surfaceOpacity}%`],['v6BackgroundOpacityValue',`${editorState.global.backgroundOpacity}%`],['v6SidebarWidthValue',`${editorState.global.sidebarWidth} px`],['v6HeaderHeightValue',`${editorState.global.headerHeight} px`]];
    pairs.forEach(([id,val])=>{if($(id))$(id).textContent=val;});
  }

  function currentRecord(){
    if(!selectedElement)return null;
    const key=selectedElement.dataset.v6Key||buildKey(selectedElement);selectedElement.dataset.v6Key=key;
    return editorState.elements[key] || {};
  }
  function syncSelectedControls(){
    const controls=$('v6ElementControls');
    if(!selectedElement||!document.contains(selectedElement)){
      controls?.classList.add('is-disabled');
      if($('v6SelectedName'))$('v6SelectedName').textContent='Ничего не выбрано';
      if($('v6SelectedPath'))$('v6SelectedPath').textContent='Включите выбор и нажмите на нужный блок или текст.';
      return;
    }
    controls?.classList.remove('is-disabled');
    const record=currentRecord();const cs=getComputedStyle(selectedElement);
    $('v6SelectedName').textContent=(selectedElement.tagName.toLowerCase()+(selectedElement.id?` #${selectedElement.id}`:'')+(selectedElement.classList.length?` .${[...selectedElement.classList].filter(c=>!c.startsWith('v6')).slice(0,2).join('.')}`:''));
    $('v6SelectedPath').textContent=(selectedElement.textContent||selectedElement.getAttribute('alt')||'Блок оформления').trim().replace(/\s+/g,' ').slice(0,90)||'Блок оформления';
    const editable=canEditText(selectedElement);
    $('v6ElementText').disabled=!editable;$('v6TextApply').disabled=!editable;$('v6TextRestore').disabled=!editable;
    $('v6ElementText').value=editable?(record.text??(isFormField(selectedElement)?selectedElement.placeholder:selectedElement.textContent.trim())):'';
    $('v6TextHint').textContent=editable?'Можно полностью изменить эту надпись.':'Выберите конкретный заголовок или подпись внутри блока.';
    $('v6ElementFont').value=record.styles?.['font-family']||'';
    $('v6ElementFontSize').value=parseFloat(record.styles?.['font-size']||cs.fontSize)||'';
    $('v6ElementWeight').value=record.styles?.['font-weight']||'';
    $('v6ElementColor').value=rgbToHex(record.styles?.color||cs.color,'#183428');
    $('v6ElementBackground').value=rgbToHex(record.styles?.['background-color']||cs.backgroundColor,'#ffffff');
    $('v6ElementBorder').value=rgbToHex(record.styles?.['border-color']||cs.borderColor,'#dce6d7');
    $('v6ElementRadius').value=parseFloat(record.styles?.['border-radius']||cs.borderRadius)||0;
    $('v6ElementOpacity').value=Math.round(Number(record.styles?.opacity||cs.opacity||1)*100);
    $('v6ElementPadding').value=record.styles?.padding||cs.padding;
    $('v6ElementMargin').value=record.styles?.margin||cs.margin;
    $('v6ElementWidth').value=record.styles?.width||'';
    $('v6ElementMinHeight').value=record.styles?.['min-height']||'';
    $('v6ElementLineHeight').value=record.styles?.['line-height']||'';
    $('v6ElementLetterSpacing').value=record.styles?.['letter-spacing']||'';
    $('v6ElementAlign').value=record.styles?.['text-align']||'';
    $('v6ElementShadow').value=record.styles?.['box-shadow']||'';
    $('v6ElementBgUrl').value=record.backgroundUrl||'';
    $('v6ElementHidden').checked=!!record.hidden;
    const image=selectedElement.tagName==='IMG';$('v6ImageControls')?.classList.toggle('hidden',!image);if(image)$('v6ImageUrl').value=record.attrs?.src||selectedElement.src||'';
    ['v6ElementFont','v6ElementFontSize','v6ElementWeight','v6ElementColor','v6ElementBackground','v6ElementBorder','v6ElementRadius','v6ElementOpacity','v6ElementPadding','v6ElementMargin','v6ElementWidth','v6ElementMinHeight','v6ElementLineHeight','v6ElementLetterSpacing','v6ElementAlign','v6ElementShadow','v6ElementBgUrl','v6ElementHidden'].forEach(id=>{const el=$(id);if(el){el.dataset.initial=el.type==='checkbox'?String(el.checked):el.value;delete el.dataset.dirty;}});
    const keyStatus=$('v11SelectedKeyStatus');if(keyStatus)keyStatus.textContent=`Постоянный ключ: ${selectedElement.dataset.v6Key}`;
  }

  function readGlobalControls(){
    return {
      fontFamily:$('v6GlobalFont').value,baseFont:+$('v6BaseFont').value,primary:$('v6PrimaryColor').value,secondary:$('v6SecondaryColor').value,page:$('v6PageColor').value,surface:$('v6SurfaceColor').value,text:$('v6TextColor').value,muted:$('v6MutedColor').value,border:$('v6BorderColor').value,sidebar:$('v6SidebarColor').value,radius:+$('v6Radius').value,shadow:+$('v6Shadow').value,surfaceOpacity:+$('v6SurfaceOpacity').value,density:$('v6Density').value,backgroundUrl:$('v6BackgroundUrl').value.trim(),backgroundOpacity:+$('v6BackgroundOpacity').value,sidebarWidth:+$('v6SidebarWidth').value,headerHeight:+$('v6HeaderHeight').value
    };
  }

  function controlDirty(id){const el=$(id);return !!el && el.dataset.dirty==='1';}
  function clearControlDirty(){
    ['v6ElementFont','v6ElementFontSize','v6ElementWeight','v6ElementColor','v6ElementBackground','v6ElementBorder','v6ElementRadius','v6ElementOpacity','v6ElementPadding','v6ElementMargin','v6ElementWidth','v6ElementMinHeight','v6ElementLineHeight','v6ElementLetterSpacing','v6ElementAlign','v6ElementShadow','v6ElementBgUrl','v6ElementHidden'].forEach(id=>{const el=$(id);if(el)delete el.dataset.dirty;});
  }
  function scheduleSelectedSave(delay=420){
    clearTimeout(selectedSaveTimer);
    selectedSaveTimer=setTimeout(()=>applyElementFromControls(true),delay);
  }
  function applyElementFromControls(auto=false){
    if(!selectedElement||!document.contains(selectedElement))return;
    const key=selectedElement.dataset.v6Key||buildKey(selectedElement);selectedElement.dataset.v6Key=key;
    const target=selectedElement;
    const values={
      font:$('v6ElementFont').value,fontSize:$('v6ElementFontSize').value,weight:$('v6ElementWeight').value,color:$('v6ElementColor').value,
      background:$('v6ElementBackground').value,border:$('v6ElementBorder').value,radius:$('v6ElementRadius').value,opacity:$('v6ElementOpacity').value,
      padding:$('v6ElementPadding').value.trim(),margin:$('v6ElementMargin').value.trim(),width:$('v6ElementWidth').value.trim(),minHeight:$('v6ElementMinHeight').value.trim(),
      lineHeight:$('v6ElementLineHeight').value.trim(),letterSpacing:$('v6ElementLetterSpacing').value.trim(),align:$('v6ElementAlign').value,shadow:$('v6ElementShadow').value,
      bgUrl:$('v6ElementBgUrl').value.trim(),hidden:$('v6ElementHidden').checked
    };
    restorePreviewStyles(target);previewSnapshot=null;
    commit(()=>{
      const old=editorState.elements[key]||{};
      const styles={...(old.styles||{})};
      const set=(id,prop,value)=>{if(controlDirty(id)||Object.prototype.hasOwnProperty.call(styles,prop)){if(value===''||value==null)delete styles[prop];else styles[prop]=value;}};
      set('v6ElementFont','font-family',values.font);
      set('v6ElementFontSize','font-size',values.fontSize?`${values.fontSize}px`:'');
      set('v6ElementWeight','font-weight',values.weight);
      set('v6ElementColor','color',values.color);
      set('v6ElementBackground','background-color',values.background);
      if(controlDirty('v6ElementBorder')||Object.prototype.hasOwnProperty.call(styles,'border-color')){set('v6ElementBorder','border-color',values.border);if(values.border){styles['border-style']='solid';styles['border-width']=styles['border-width']||'1px';}}
      set('v6ElementRadius','border-radius',values.radius===''?'':`${+values.radius||0}px`);
      set('v6ElementOpacity','opacity',values.opacity===''?'':String((+values.opacity||100)/100));
      set('v6ElementPadding','padding',values.padding);set('v6ElementMargin','margin',values.margin);set('v6ElementWidth','width',values.width);
      set('v6ElementMinHeight','min-height',values.minHeight);set('v6ElementLineHeight','line-height',values.lineHeight);set('v6ElementLetterSpacing','letter-spacing',values.letterSpacing);
      set('v6ElementAlign','text-align',values.align);set('v6ElementShadow','box-shadow',values.shadow);
      if(controlDirty('v6ElementBgUrl')||old.backgroundUrl!==undefined){if(values.bgUrl){styles['background-image']=cssUrl(values.bgUrl);styles['background-size']='cover';styles['background-position']='center';}else{delete styles['background-image'];delete styles['background-size'];delete styles['background-position'];}}
      editorState.elements[key]={...old,selectorVersion:11,label:(target.textContent||target.getAttribute('aria-label')||target.tagName).trim().replace(/\s+/g,' ').slice(0,100),backgroundUrl:values.bgUrl,hidden:controlDirty('v6ElementHidden')?values.hidden:!!old.hidden,cascade:target.children.length>0,styles};
    },auto?'Выбранный блок сохранён автоматически':'Оформление выбранного блока сохранено');
    clearControlDirty();
    previewSnapshot=capturePreviewStyles(target);
    syncSelectedControls();
  }

  function setElementText(){
    if(!selectedElement||!canEditText(selectedElement))return;
    const key=selectedElement.dataset.v6Key||buildKey(selectedElement);selectedElement.dataset.v6Key=key;const text=$('v6ElementText').value;
    const original=isFormField(selectedElement)?selectedElement.placeholder:selectedElement.textContent;
    commit(()=>{const old=editorState.elements[key]||{};editorState.elements[key]={...old,selectorVersion:11,label:String(original||'').trim().slice(0,100),originalText:old.originalText??original,text};},'Текст выбранного элемента сохранён');syncSelectedControls();
  }
  function restoreElementText(){
    if(!selectedElement)return;const key=selectedElement.dataset.v6Key;const record=editorState.elements[key]||{};
    const original=record.originalText;
    commit(()=>{if(editorState.elements[key]){delete editorState.elements[key].text;delete editorState.elements[key].originalText;}},'Текст возвращён');
    if(original!==undefined){if(isFormField(selectedElement))selectedElement.placeholder=original;else selectedElement.textContent=original;}
    syncSelectedControls();
  }
  function resetSelectedElement(){
    if(!selectedElement)return;const key=selectedElement.dataset.v6Key;const record=editorState.elements[key]||{};
    if(record.originalText!==undefined&&canEditText(selectedElement)){if(isFormField(selectedElement))selectedElement.placeholder=record.originalText;else selectedElement.textContent=record.originalText;}
    clearPreviewStyles(selectedElement);
    commit(()=>{delete editorState.elements[key];},'Настройки блока сброшены');
    selectedElement.classList.remove('v6-editor-selected');selectedElement=null;syncSelectedControls();
  }

  function fileToDataUrl(file,callback){
    if(!file)return;
    if(file.size>10*1024*1024){alert('Выберите изображение размером до 10 МБ.');return;}
    const reader=new FileReader();
    reader.onload=()=>{
      if(file.type==='image/svg+xml'||file.type==='image/gif'){callback(reader.result);return;}
      const img=new Image();
      img.onload=()=>{
        const max=1600,scale=Math.min(1,max/Math.max(img.width,img.height));
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);
        callback(canvas.toDataURL('image/jpeg',.82));
      };
      img.onerror=()=>callback(reader.result);img.src=reader.result;
    };
    reader.readAsDataURL(file);
  }

  function previewGlobalFromControls(){
    if(!$('v6GlobalFont'))return;
    editorState.global={...editorState.global,...readGlobalControls()};
    applyGlobal();
    updateRangeLabels();
  }

  function previewSelectedElement(){
    if(!selectedElement)return;
    const set=(prop,value)=>{
      if(value===''||value==null)selectedElement.style.removeProperty(prop);
      else selectedElement.style.setProperty(prop,value,'important');
    };
    set('font-family',$('v6ElementFont').value);
    set('font-size',$('v6ElementFontSize').value?`${$('v6ElementFontSize').value}px`:'');
    set('font-weight',$('v6ElementWeight').value);
    set('color',$('v6ElementColor').value);
    const bg=$('v6ElementBackground').value;
    set('background-color',bg);
    set('border-color',$('v6ElementBorder').value);
    set('border-radius',`${+$('v6ElementRadius').value||0}px`);
    set('opacity',String((+$('v6ElementOpacity').value||100)/100));
    set('padding',$('v6ElementPadding').value.trim());
    set('margin',$('v6ElementMargin').value.trim());
    set('width',$('v6ElementWidth').value.trim());
    set('min-height',$('v6ElementMinHeight').value.trim());
    set('line-height',$('v6ElementLineHeight').value.trim());
    set('letter-spacing',$('v6ElementLetterSpacing').value.trim());
    set('text-align',$('v6ElementAlign').value);
    set('box-shadow',$('v6ElementShadow').value);
    set('display',$('v6ElementHidden').checked?'none':'');
    if(selectedElement.children.length>0){
      selectedElement.querySelectorAll('*').forEach(child=>{
        if($('v6ElementColor').value)child.style.setProperty('color',$('v6ElementColor').value,'important');
        if($('v6ElementFont').value)child.style.setProperty('font-family',$('v6ElementFont').value,'important');
      });
    }
  }

  function renderThemes(){
    const root=$('v6ThemePresets');if(root)root.innerHTML=PRESETS.map(t=>themeCard(t,false)).join('');
    const custom=$('v6CustomThemes');if(custom)custom.innerHTML=editorState.customThemes.length?editorState.customThemes.map((t,i)=>themeCard(t,true,i)).join(''):'<p class="muted">Своих тем пока нет.</p>';
    document.querySelectorAll('[data-v6-theme]').forEach(b=>b.onclick=()=>{
      const customIndex=b.dataset.customIndex;
      const theme=customIndex!==undefined?editorState.customThemes[+customIndex]:PRESETS.find(x=>x.id===b.dataset.v6Theme);
      if(theme)commit(()=>{editorState.global={...DEFAULT_GLOBAL,...clone(theme.global)};},`Тема «${theme.name}» применена`);syncGlobalControls();
    });
    document.querySelectorAll('[data-delete-theme]').forEach(b=>b.onclick=e=>{e.stopPropagation();const i=+b.dataset.deleteTheme;commit(()=>editorState.customThemes.splice(i,1),'Тема удалена');});
  }
  function themeCard(theme,isCustom,index){
    const g=theme.global;return `<button class="v6-theme-card ${isCustom?'v6-custom-theme':''}" data-v6-theme="${theme.id||'custom'}" ${isCustom?`data-custom-index="${index}"`:''}><span class="v6-theme-swatches"><i style="background:${g.primary}"></i><i style="background:${g.page}"></i><i style="background:${g.surface}"></i></span><b>${escapeSafe(theme.name)}</b><small>${escapeSafe(theme.desc||'Сохранённая тема')}</small>${isCustom?`<span class="delete" data-delete-theme="${index}">×</span>`:''}</button>`;
  }
  function escapeSafe(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}

  function exportSettings(){
    const blob=new Blob([JSON.stringify(editorState,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`Oformlenie_ROO_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
  }
  function importSettings(file){
    const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(!data.global||!data.elements)throw new Error();snapshot();editorState={version:11,updatedAt:data.updatedAt||new Date().toISOString(),global:{...DEFAULT_GLOBAL,...data.global},elements:data.elements||{},customThemes:data.customThemes||[]};applyEverything();syncGlobalControls();queueSave('Настройки успешно загружены');}catch(_){alert('Не удалось прочитать файл настроек.');}};reader.readAsText(file);
  }
  function resetAll(){
    if(!confirm('Сбросить все цвета, шрифты, фоны и изменённые тексты?'))return;
    snapshot();editorState={version:11,updatedAt:new Date().toISOString(),global:{...DEFAULT_GLOBAL},elements:{},customThemes:[]};try{localStorage.removeItem(STORAGE_KEY);}catch(_){}applyEverything();syncGlobalControls();location.reload();
  }

  function bindGlobalControls(){
    const ids=['v6GlobalFont','v6BaseFont','v6PrimaryColor','v6SecondaryColor','v6PageColor','v6SurfaceColor','v6TextColor','v6MutedColor','v6BorderColor','v6SidebarColor','v6Radius','v6Shadow','v6SurfaceOpacity','v6Density','v6BackgroundUrl','v6BackgroundOpacity','v6SidebarWidth','v6HeaderHeight'];
    ids.forEach(id=>{
      const control=$(id);if(!control)return;
      control.addEventListener('input',previewGlobalFromControls);
      control.addEventListener('change',()=>{applyEverything();queueSave('Общее оформление сохранено');});
    });
  }

  function bindEvents(){
    $('visualEditorFab')?.addEventListener('click',openEditor);
    $('openVisualEditorFromSettings')?.addEventListener('click',openEditor);
    $('closeVisualEditor')?.addEventListener('click',closeEditor);$('v6Done')?.addEventListener('click',closeEditor);
    document.querySelectorAll('[data-v6-tab]').forEach(btn=>btn.addEventListener('click',()=>setTab(btn.dataset.v6Tab)));
    $('v6SelectMode')?.addEventListener('click',()=>selecting?stopSelecting():startSelecting());
    document.addEventListener('click',event=>{
      if(!selecting)return;
      const target=event.target.closest('[data-v6-key]');
      if(!target||target.closest('#visualEditorPanel')||target.id==='visualEditorFab')return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();selectElement(target);
    },true);
    $('v6ApplyElement')?.addEventListener('click',applyElementFromControls);$('v6ResetElement')?.addEventListener('click',resetSelectedElement);
    $('v6TextApply')?.addEventListener('click',setElementText);$('v6TextRestore')?.addEventListener('click',restoreElementText);
    ['v6ElementFont','v6ElementFontSize','v6ElementWeight','v6ElementColor','v6ElementBackground','v6ElementBorder','v6ElementRadius','v6ElementOpacity','v6ElementPadding','v6ElementMargin','v6ElementWidth','v6ElementMinHeight','v6ElementLineHeight','v6ElementLetterSpacing','v6ElementAlign','v6ElementShadow','v6ElementHidden','v6ElementBgUrl'].forEach(id=>{const control=$(id);if(control){const dirty=()=>{control.dataset.dirty='1';previewSelectedElement();scheduleSelectedSave(control.type==='color'?180:420);};control.addEventListener('input',dirty);control.addEventListener('change',()=>{control.dataset.dirty='1';previewSelectedElement();scheduleSelectedSave(80);});}});
    $('v6ElementText')?.addEventListener('input',()=>{if(selectedElement&&canEditText(selectedElement)){if(isFormField(selectedElement))selectedElement.placeholder=$('v6ElementText').value;else selectedElement.textContent=$('v6ElementText').value;clearTimeout(selectedSaveTimer);selectedSaveTimer=setTimeout(setElementText,650);}});
    $('v6UploadBackground')?.addEventListener('click',()=>$('v6BackgroundFile').click());
    $('v6BackgroundFile')?.addEventListener('change',e=>fileToDataUrl(e.target.files[0],url=>commit(()=>{editorState.global.backgroundUrl=url;},'Фоновое изображение сохранено')));
    $('v6ClearBackground')?.addEventListener('click',()=>commit(()=>{editorState.global.backgroundUrl='';},'Фоновое изображение удалено'));
    $('v6UploadElementBg')?.addEventListener('click',()=>$('v6ElementBgFile').click());
    $('v6ElementBgFile')?.addEventListener('change',e=>fileToDataUrl(e.target.files[0],url=>{if(!selectedElement)return;$('v6ElementBgUrl').value=url;applyElementFromControls();}));
    $('v6ClearElementBg')?.addEventListener('click',()=>{if($('v6ElementBgUrl'))$('v6ElementBgUrl').value='';applyElementFromControls();});
    $('v6UploadImage')?.addEventListener('click',()=>$('v6ImageFile').click());
    $('v6ImageFile')?.addEventListener('change',e=>fileToDataUrl(e.target.files[0],url=>setSelectedImage(url)));
    $('v6ImageUrl')?.addEventListener('change',()=>setSelectedImage($('v6ImageUrl').value.trim()));
    $('v6SaveTheme')?.addEventListener('click',()=>{const name=$('v6ThemeName').value.trim();if(!name){alert('Введите название темы.');return;}commit(()=>editorState.customThemes.push({id:`custom-${Date.now()}`,name,desc:'Собственная тема',global:clone(editorState.global)}),'Своя тема сохранена');$('v6ThemeName').value='';});
    $('v6ExportSettings')?.addEventListener('click',exportSettings);$('v6ImportSettings')?.addEventListener('click',()=>$('v6ImportFile').click());$('v6ImportFile')?.addEventListener('change',e=>importSettings(e.target.files[0]));$('v6ResetAll')?.addEventListener('click',resetAll);
    $('v6Undo')?.addEventListener('click',undo);$('v6Redo')?.addEventListener('click',redo);
    document.addEventListener('keydown',event=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();}
      if(event.key==='Escape'&&selecting)stopSelecting();
    });
    document.addEventListener('roo-design-cloud-status',event=>{const label=$('v6SaveState');if(!label)return;const d=event.detail||{};if(d.status==='saving')label.textContent='Сохранено в браузере · сохранение в облако…';else if(d.status==='saved')label.textContent='Сохранено в браузере и облаке';else if(d.status==='error')label.textContent='Сохранено в браузере · ошибка облака';});
    bindGlobalControls();
  }

  function setSelectedImage(url){
    if(!selectedElement||selectedElement.tagName!=='IMG')return;const key=selectedElement.dataset.v6Key;
    commit(()=>{const old=editorState.elements[key]||{};editorState.elements[key]={...old,attrs:{...(old.attrs||{}),src:url}};},'Изображение заменено');
  }

  function updateVersionText(){
    const version=$('versionButton');if(version)version.textContent='V24';
    const banner=$('systemUpdateBanner');if(banner){const strong=banner.querySelector('strong'),small=banner.querySelector('small');if(strong)strong.textContent='Система обновлена до ONLINE V24';if(small)small.textContent='Добавлены центр качества данных, история импортов и безопасная отмена загрузки.';}
  }

  window.ROODesignEditor={
    getState:()=>clone(editorState),
    applyState:(data,saveLocal=true)=>{
      if(!data||!data.global||!data.elements)return false;
      editorState={version:11,updatedAt:data.updatedAt||'',global:{...DEFAULT_GLOBAL,...clone(data.global)},elements:clone(data.elements||{}),customThemes:clone(data.customThemes||[])};
      applyEverything();syncGlobalControls();renderThemes();
      if(saveLocal){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(editorState));}catch(_){}}
      return true;
    }
  };

  function init(){
    assignKeys();applyEverything();syncGlobalControls();renderThemes();bindEvents();updateVersionText();showFab();updateHistoryButtons();
    const app=$('app');if(app)new MutationObserver(()=>{clearTimeout(mutationTimer);mutationTimer=setTimeout(()=>{assignKeys();applyElementRecords();showFab();},80);}).observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    if($('loginScreen'))new MutationObserver(showFab).observe($('loginScreen'),{attributes:true,attributeFilter:['class']});
  }

  document.addEventListener('DOMContentLoaded',init);
})();
