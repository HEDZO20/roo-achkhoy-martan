'use strict';

const ROLE_CONFIG = {
  chief: {
    label: 'Начальник РОО',
    scope: 'Все отделы и школы района',
    pages: ['dashboard','tasks','approvals','schools','rating','departments','reports','calendar','archive','users','audit'],
    permissions: ['Создание и публикация любых поручений','Утверждение критических поручений','Управление пользователями и ролями','Просмотр и корректировка рейтинга','Полный журнал действий','Все отчёты и документы'],
    canCreate: true, canPublish: true, canApprove: true, canManageSchools: true, canManageUsers: true, canEditRating: true, canViewAudit: true
  },
  deputy: {
    label: 'Заместитель начальника РОО',
    scope: 'Все отделы в рамках курируемых направлений',
    pages: ['dashboard','tasks','approvals','schools','rating','departments','reports','calendar','archive','users','audit'],
    permissions: ['Создание и публикация поручений','Согласование поручений начальников отделов','Контроль всех школ','Просмотр пользователей без удаления','Отчёты и журнал действий'],
    canCreate: true, canPublish: true, canApprove: true, canManageSchools: true, canManageUsers: false, canEditRating: false, canViewAudit: true
  },
  department_head: {
    label: 'Начальник отдела',
    scope: 'Только назначенное подразделение',
    pages: ['dashboard','tasks','approvals','schools','rating','departments','reports','calendar','archive','audit'],
    permissions: ['Создание поручений своего отдела','Проверка ответов школ','Возврат на исправление','Своды по своему направлению','Просмотр рейтинга','Журнал действий своего отдела'],
    canCreate: true, canPublish: false, canApprove: true, canManageSchools: false, canManageUsers: false, canEditRating: false, canViewAudit: true
  },
  specialist: {
    label: 'Специалист отдела',
    scope: 'Назначенные поручения своего подразделения',
    pages: ['dashboard','tasks','schools','rating','reports','calendar','archive'],
    permissions: ['Подготовка черновиков поручений','Проверка назначенных ответов','Формирование сводов своего отдела','Просмотр школ и рейтинга'],
    canCreate: true, canPublish: false, canApprove: false, canManageSchools: false, canManageUsers: false, canEditRating: false, canViewAudit: false
  },
  school_director: {
    label: 'Директор школы',
    scope: 'Только назначенная образовательная организация',
    pages: ['dashboard','tasks','rating','calendar','archive'],
    permissions: ['Все поручения своей школы','Назначение ответственного','Подтверждение отчёта перед отправкой','Рейтинг и причины снижения своей школы','Архив документов школы'],
    canCreate: false, canPublish: false, canApprove: true, canManageSchools: false, canManageUsers: false, canEditRating: false, canViewAudit: false
  },
  school_staff: {
    label: 'Ответственный сотрудник школы',
    scope: 'Назначенные поручения своей образовательной организации',
    pages: ['dashboard','tasks','calendar','archive'],
    permissions: ['Просмотр назначенных поручений','Подтверждение получения','Заполнение форм','Загрузка файлов и отправка директору','Исправление замечаний'],
    canCreate: false, canPublish: false, canApprove: false, canManageSchools: false, canManageUsers: false, canEditRating: false, canViewAudit: false
  }
};

const DEPARTMENTS = [
  { id:'management', name:'Руководство РОО', short:'Руководство', icon:'Р', head:'Не указан', email:'', staff:0, active:0, overdue:0, completion:null },
  { id:'upbringing', name:'Отдел воспитательной работы', short:'Воспитательная работа', icon:'В', head:'Не указан', email:'ruo.ovdo@mail.ru', staff:0, active:0, overdue:0, completion:null },
  { id:'general', name:'Общий отдел', short:'Общий отдел', icon:'О', head:'Не указан', email:'ruo.npo@mail.ru', staff:0, active:0, overdue:0, completion:null },
  { id:'methodical', name:'Методический отдел', short:'Методический отдел', icon:'М', head:'Не указан', email:'infometod@bk.ru', staff:0, active:0, overdue:0, completion:null },
  { id:'resources', name:'Хозяйственный отдел', short:'Хозяйственный отдел', icon:'Х', head:'Не указан', email:'ruo.khg@mail.ru', staff:0, active:0, overdue:0, completion:null },
  { id:'information', name:'Информационный отдел', short:'Информационный отдел', icon:'И', head:'Не указан', email:'roo.inform@mail.ru', staff:0, active:0, overdue:0, completion:null }
];

const USERS = [{ id:'bootstrap-chief', role:'chief', name:'Пользователь', initials:'П', email:'', unit:'Руководство РОО', departmentId:'management', lastLogin:'', active:true }];

const ROLE_USER_MAP = {
  chief:'bootstrap-chief', deputy:'bootstrap-chief', department_head:'bootstrap-chief', specialist:'bootstrap-chief', school_director:'bootstrap-chief', school_staff:'bootstrap-chief'
};

const SCHOOLS = [];

const SEED_TASKS = [];

const BASE_AUDIT = [];

const STATIC_APPROVALS = [];

const NOTIFICATIONS = [];

const PAGE_META = {
  dashboard:['Панель управления','Сводная ситуация'],
  tasks:['Управление поручениями','Поручения'],
  approvals:['Контроль решений','Согласования'],
  schools:['Организации района','Школы'],
  rating:['Исполнительская дисциплина','Рейтинг школ'],
  departments:['Структура РОО','Отделы и направления'],
  reports:['Сводная аналитика','Отчёты и сводки'],
  calendar:['Планирование','Календарь'],
  archive:['Хранилище документов','Архив'],
  users:['Администрирование','Пользователи и права'],
  audit:['Безопасность','Журнал действий']
};

const STORAGE_KEYS = {
  tasks:'achkhoyEduOnlineTasksV10',
  role:'achkhoyEduOnlineRoleV10',
  audit:'achkhoyEduOnlineAuditV10',
  approvals:'achkhoyEduOnlineApprovalsV10',
  schoolOverrides:'achkhoyEduOnlineSchoolOverridesV10',
  theme:'achkhoyEduThemeV2'
};


function localGet(key) { try { return window.localStorage.getItem(key); } catch (_) { return null; } }
function localSet(key, value) { try { window.localStorage.setItem(key, value); } catch (_) {} }
function localRemove(key) { try { window.localStorage.removeItem(key); } catch (_) {} }
function sessionGet(key) { try { return window.sessionStorage.getItem(key); } catch (_) { return null; } }
function sessionSet(key, value) { try { window.sessionStorage.setItem(key, value); } catch (_) {} }
function sessionRemove(key) { try { window.sessionStorage.removeItem(key); } catch (_) {} }

const state = {
  role: localGet(STORAGE_KEYS.role) || 'chief',
  currentUser: null,
  currentPage: 'dashboard',
  taskFilter: 'all',
  ratingPeriod: 'july',
  tasks: loadJSON(STORAGE_KEYS.tasks, SEED_TASKS),
  audit: loadJSON(STORAGE_KEYS.audit, BASE_AUDIT),
  resolvedApprovals: new Set(loadJSON(STORAGE_KEYS.approvals, [])),
  schoolOverrides: loadJSON(STORAGE_KEYS.schoolOverrides, {}),
  notifications: NOTIFICATIONS.map(item => ({...item})),
  formFields: ['Количество обучающихся','Основной показатель','Комментарий','Подтверждающий файл'],
  selectedCalendarDay: 21
};

const dom = {};
let toastTimer;

function loadJSON(key, fallback) {
  try {
    const raw = localGet(key);
    return raw ? JSON.parse(raw) : structuredClone(fallback);
  } catch (_) {
    return structuredClone(fallback);
  }
}

function saveState() {
  localSet(STORAGE_KEYS.tasks, JSON.stringify(state.tasks));
  localSet(STORAGE_KEYS.audit, JSON.stringify(state.audit));
  localSet(STORAGE_KEYS.approvals, JSON.stringify([...state.resolvedApprovals]));
  localSet(STORAGE_KEYS.schoolOverrides, JSON.stringify(state.schoolOverrides));
  localSet(STORAGE_KEYS.role, state.role);
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function roleConfig() { return ROLE_CONFIG[state.role]; }
function isManagement() { return ['chief','deputy'].includes(state.role); }
function isDepartmentRole() { return ['department_head','specialist'].includes(state.role); }
function isSchoolRole() { return ['school_director','school_staff'].includes(state.role); }
function currentSchool() { return SCHOOLS.find(s => s.id === state.currentUser?.schoolId) || null; }
function currentDepartment() { return DEPARTMENTS.find(d => d.id === state.currentUser?.departmentId) || null; }

function getVisibleTasks() {
  if (isManagement()) return state.tasks;
  if (isDepartmentRole()) return state.tasks.filter(task => task.departmentId === state.currentUser.departmentId);
  if (isSchoolRole()) {
    return state.tasks.filter(task => !['draft','pending_approval'].includes(task.status) && (task.recipients === 'all' || (Array.isArray(task.recipients) && task.recipients.includes(state.currentUser.schoolId))));
  }
  return [];
}

function getVisibleSchools() {
  if (isSchoolRole()) return SCHOOLS.filter(s => s.id === state.currentUser.schoolId);
  return SCHOOLS;
}

function getRatingSchools() {
  if (state.role === 'school_staff') return SCHOOLS.filter(s => s.id === state.currentUser.schoolId);
  if (state.role === 'school_director') {
    const own = currentSchool();
    return [...SCHOOLS.filter(s => s.place <= 3), ...(own && own.place > 3 ? [own] : [])];
  }
  return SCHOOLS;
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 2700);
}

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }
function closeFloatingPanels(exceptId='') {
  ['notificationPanel','profilePanel'].forEach(id => { if (id !== exceptId) document.getElementById(id)?.classList.add('hidden'); });
}

function showInfoModal(title, content, eyebrow='Информация') {
  document.getElementById('infoModalTitle').textContent = title;
  document.getElementById('infoModalEyebrow').textContent = eyebrow;
  document.getElementById('infoModalContent').innerHTML = content;
  openModal('infoModal');
}

function resetDemo() {
  Object.values(STORAGE_KEYS).forEach(key => localRemove(key));
  state.tasks = structuredClone(SEED_TASKS);
  state.audit = structuredClone(BASE_AUDIT);
  state.resolvedApprovals = new Set();
  state.schoolOverrides = {};
  state.role = 'chief';
  saveState();
  applyRole('chief');
  showToast('Локальные данные восстановлены');
}

function addAudit(action, object, type='task') {
  const now = new Date();
  const timestamp = now.toLocaleString('ru-RU', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',', '');
  state.audit.unshift({ time:timestamp, user:state.currentUser.name, action, object, type, device:'Веб-браузер' });
  state.audit = state.audit.slice(0, 100);
  saveState();
}

function deadlineUrgency(task, index=0) {
  if (task.status === 'overdue') return 'Просрочено';
  const options = ['2 ч','5 ч','1 д','2 д','3 д'];
  return options[index % options.length];
}

function statusClass(status) {
  return ({active:'blue',review:'orange',pending_approval:'purple',overdue:'red',done:'green',draft:'gray'})[status] || 'blue';
}

function tagClassForDirection(direction) {
  const map = {'ГИА':'blue','ВПР':'purple','Кадры':'green','Безопасность':'red','Питание':'orange','Воспитание':'purple','Обеспечение':'blue','Хозяйство':'orange','Общее образование':'blue'};
  return map[direction] || 'blue';
}

function riskLabel(risk) {
  return ({good:'Стабильно',attention:'Требует внимания',critical:'Высокий риск'})[risk] || 'Стабильно';
}

function ratingValue(school) {
  if (state.ratingPeriod === 'june') return school.june;
  if (state.ratingPeriod === 'year') return school.year;
  return school.rating;
}

function roleLabel(role) { return ROLE_CONFIG[role]?.label || role; }

function taskOwnStatus(task) {
  const override = state.schoolOverrides[`${state.currentUser.schoolId}:${task.id}`];
  if (override) return override;
  const school = currentSchool();
  if (!school) return { status:'new', text:'Новое', detail:'Поручение ещё не открыто' };
  const seed = (task.id * 7 + school.place * 3) % 10;
  if (task.status === 'done') return { status:'accepted', text:'Принято', detail:'Работа принята отделом образования' };
  if (task.status === 'overdue' && seed > 5) return { status:'overdue', text:'Просрочено', detail:'Срок выполнения истёк' };
  if (task.status === 'review') return seed > 4 ? { status:'review', text:'На проверке', detail:'Отчёт отправлен в отдел' } : { status:'returned', text:'На исправлении', detail:'Получены замечания проверяющего' };
  if (seed <= 2) return { status:'new', text:'Новое', detail:'Не подтверждено получение' };
  if (seed <= 5) return { status:'working', text:'В работе', detail:'Ответственный приступил к выполнению' };
  return { status:'director', text:'У директора', detail:'Ожидает подтверждения директора' };
}

function applyRole(role) {
  state.role = ROLE_CONFIG[role] ? role : 'chief';
  state.currentUser = USERS.find(u => u.id === ROLE_USER_MAP[state.role]) || {id:`fallback-${state.role}`,role:state.role,name:'Пользователь',initials:'П',email:'',unit:ROLE_CONFIG[state.role]?.label||'Система',departmentId:null,schoolId:null,active:true};
  saveState();

  const config = roleConfig();
  dom.sidebarRoleName.textContent = config.label;
  dom.sidebarScopeText.textContent = config.scope;
  dom.userName.textContent = state.currentUser.name;
  dom.userRole.textContent = config.label;
  dom.userAvatar.textContent = state.currentUser.initials;
  dom.profileName.textContent = state.currentUser.name;
  dom.profilePosition.textContent = config.label;
  dom.profileAvatar.textContent = state.currentUser.initials;
  dom.quickRoleSwitcher.value = state.role;
  dom.roleSelect.value = state.role;
  dom.emailInput.value = state.currentUser.email;

  document.querySelectorAll('.nav-item').forEach(button => {
    button.classList.toggle('hidden', !config.pages.includes(button.dataset.page));
  });

  const canCreate = config.canCreate;
  [dom.createTaskButton, dom.dashboardCreateTask].forEach(button => button?.classList.toggle('hidden', !canCreate));
  dom.addSchoolButton.classList.toggle('hidden', !config.canManageSchools);
  dom.addDepartmentButton.classList.toggle('hidden', !isManagement());
  dom.addUserButton.classList.toggle('hidden', !config.canManageUsers);
  dom.dashboardApprovalPanel.classList.toggle('hidden', !config.pages.includes('approvals'));

  if (!config.pages.includes(state.currentPage)) state.currentPage = 'dashboard';
  populateDirectionSelects();
  updateTaskPermissionHint();
  navigate(state.currentPage, false);
  renderAll();
}

function populateDirectionSelects() {
  const allDirections = [...new Set(state.tasks.map(t => t.direction))].sort();
  const allowedDirections = isDepartmentRole()
    ? [...new Set(state.tasks.filter(t => t.departmentId === state.currentUser.departmentId).map(t => t.direction))]
    : allDirections;

  dom.taskDirection.innerHTML = '<option value="all">Все направления</option>' + allowedDirections.map(d => `<option>${escapeHTML(d)}</option>`).join('');
  dom.ratingDirection.innerHTML = '<option value="all">Все направления</option>' + allDirections.map(d => `<option>${escapeHTML(d)}</option>`).join('');
  dom.newTaskDirection.innerHTML = DEPARTMENTS
    .filter(d => isManagement() || d.id === state.currentUser.departmentId)
    .map(d => `<option value="${d.id}">${escapeHTML(d.short)}</option>`).join('');

  dom.userRoleFilter.innerHTML = '<option value="all">Все роли</option>' + Object.entries(ROLE_CONFIG).map(([id,r]) => `<option value="${id}">${r.label}</option>`).join('');
  dom.newUserRole.innerHTML = Object.entries(ROLE_CONFIG).map(([id,r]) => `<option value="${id}">${r.label}</option>`).join('');
  dom.newUserUnit.innerHTML = [...DEPARTMENTS.map(d => `<option>${escapeHTML(d.name)}</option>`), ...SCHOOLS.map(s => `<option>${escapeHTML(s.name)}</option>`)].join('');
}

function updateTaskPermissionHint() {
  const config = roleConfig();
  let text = '';
  if (config.canPublish) text = 'Поручение будет опубликовано сразу. Критическое поручение сохраняет запись об утверждении в журнале.';
  else if (state.role === 'department_head') text = 'Поручение для всех школ или с критическим приоритетом будет направлено заместителю начальника на согласование.';
  else if (state.role === 'specialist') text = 'Специалист может сохранить только черновик. Публикацию выполняет начальник отдела.';
  else text = 'Для вашей роли создание поручений недоступно.';
  dom.taskPermissionHint.textContent = text;
  dom.taskSubmitButton.textContent = state.role === 'specialist' ? 'Сохранить черновик' : state.role === 'department_head' ? 'Создать поручение' : 'Создать и отправить';
}

function navigate(page, scroll=true) {
  if (!roleConfig().pages.includes(page)) {
    showToast('У вашей роли нет доступа к этому разделу');
    return;
  }
  state.currentPage = page;
  document.querySelectorAll('.page').forEach(section => section.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  document.getElementById(`page-${page}`)?.classList.add('active');
  const meta = PAGE_META[page] || PAGE_META.dashboard;
  dom.pageEyebrow.textContent = meta[0];
  dom.pageTitle.textContent = meta[1];
  dom.sidebar.classList.remove('open');
  closeFloatingPanels();
  if (scroll) window.scrollTo({top:0,behavior:'smooth'});
}

function renderAll() {
  renderNavigationBadges();
  renderNotifications();
  renderDashboard();
  renderTasks();
  renderApprovals();
  renderSchools();
  renderRating();
  renderDepartments();
  renderReports();
  renderCalendar();
  renderArchive();
  renderUsers();
  renderAudit();
  renderFormFields();
}

function renderNavigationBadges() {
  const tasks = getVisibleTasks();
  dom.taskNavBadge.textContent = tasks.filter(t => ['active','review','overdue'].includes(t.status)).length;
  dom.approvalNavBadge.textContent = getApprovalItems().length;
  dom.pendingApprovalHeading.textContent = `${getApprovalItems().length} ожидают`;
}

function renderDashboard() {
  const tasks = getVisibleTasks();
  const active = tasks.filter(t => t.status === 'active').length;
  const review = tasks.filter(t => t.status === 'review').length;
  const overdue = tasks.filter(t => t.status === 'overdue').length;
  const completed = tasks.filter(t => t.status === 'done').length;
  const school = currentSchool();
  const dept = currentDepartment();

  const roleTexts = {
    chief:['Исполнение поручений под контролем','Сводка формируется по фактическим поручениям, срокам и ответам школ.','Вы видите доступные данные района','Доступны школы, отделы, пользователи, рейтинги и журнал действий в пределах назначенных прав.'],
    deputy:['Контроль курируемых направлений и согласований','На согласовании находятся важные поручения и сводные отчёты подразделений.','Доступ заместителя начальника','Доступны поручения всех отделов, рейтинги, школы и решения по согласованию.'],
    department_head:['Работа вашего отдела','Здесь отображаются поручения и ответы школ, доступные вашему подразделению.','Данные ограничены вашим отделом','Отображаются поручения, отчёты и журнал назначенного подразделения.'],
    specialist:['Ваши поручения и ответы школ','Продолжите проверку поступивших отчётов или подготовьте новый черновик поручения.','Доступ специалиста отдела','Вы видите только поручения своего отдела и назначенные рабочие материалы.'],
    school_director:['Исполнительская дисциплина вашей школы','Подтвердите отчёты сотрудников перед окончательной отправкой в отдел образования.','Кабинет директора школы','Доступны только поручения, рейтинг и документы вашей образовательной организации.'],
    school_staff:['Новые поручения и ближайшие сроки','Подтвердите получение, заполните форму и отправьте отчёт директору школы.','Кабинет ответственного сотрудника','Отображаются только назначенные поручения вашей школы.']
  }[state.role];

  dom.welcomeTitle.textContent = roleTexts[0];
  dom.welcomeText.textContent = roleTexts[1];
  dom.scopeBannerTitle.textContent = roleTexts[2];
  dom.scopeBannerText.textContent = roleTexts[3];
  dom.dashboardRatingTitle.textContent = isSchoolRole() ? 'Показатели вашей школы' : 'Лучшие школы июля';

  let score = 88;
  let scoreLabel = 'Общий показатель района за июль';
  if (isDepartmentRole()) { score = dept?.completion || 91; scoreLabel = 'Исполнение поручений вашего отдела'; }
  if (isSchoolRole()) { score = Math.round(school?.rating || 0); scoreLabel = 'Рейтинг вашей школы за июль'; }
  dom.districtProgressRing.style.setProperty('--progress', score);
  dom.districtProgressValue.textContent = `${score}%`;
  dom.districtProgressLabel.textContent = scoreLabel;

  const stats = isSchoolRole() ? [
    {icon:'✓',color:'blue',label:'Назначено поручений',value:tasks.length,note:'За текущий период'},
    {icon:'◷',color:'orange',label:'Требуют действия',value:tasks.filter(t => ['active','review','overdue'].includes(t.status)).length,note:'Открыть список поручений'},
    {icon:'↺',color:'purple',label:'Возвращено',value:school?.returned || 0,note:'Нужно исправить замечания'},
    {icon:'★',color:'green',label:'Рейтинг школы',value:`${school?.rating || 0}%`,note:`${school?.place || 0} место в районе`}
  ] : [
    {icon:'✓',color:'blue',label:'Активные поручения',value:active,note:isDepartmentRole() ? 'В вашем отделе' : 'По доступному контуру'},
    {icon:'◈',color:'orange',label:'Ожидают проверки',value:review,note:'Поступившие ответы школ'},
    {icon:'!',color:'red',label:'Просрочено',value:overdue,note:isManagement() ? 'Требуют управленческого решения' : 'Требуют внимания'},
    {icon:'✔',color:'green',label:'Завершено',value:completed,note:'Принято и перенесено в архив'}
  ];

  dom.dashboardStats.innerHTML = stats.map(item => `<article class="stat-card"><div class="stat-icon ${item.color}">${item.icon}</div><div><span>${item.label}</span><strong>${item.value}</strong><small>${item.note}</small></div></article>`).join('');

  const chartData = isSchoolRole()
    ? [{label:'Фев',main:88,muted:10},{label:'Мар',main:91,muted:8},{label:'Апр',main:94,muted:5},{label:'Май',main:92,muted:7},{label:'Июн',main:96,muted:3},{label:'Июл',main:99,muted:1}]
    : [{label:'Фев',main:75,muted:24},{label:'Мар',main:82,muted:20},{label:'Апр',main:88,muted:15},{label:'Май',main:80,muted:22},{label:'Июн',main:91,muted:12},{label:'Июл',main:94,muted:8}];
  dom.barChart.innerHTML = chartData.map(item => `<div class="chart-group"><div class="chart-bar main" style="height:${item.main}%"></div><div class="chart-bar muted" style="height:${item.muted}%"></div><span class="chart-label">${item.label}</span></div>`).join('');

  const attentionTasks = tasks.filter(t => ['active','review','overdue'].includes(t.status)).slice(0,4);
  dom.deadlineList.innerHTML = attentionTasks.map((task,index) => {
    const own = isSchoolRole() ? taskOwnStatus(task) : null;
    return `<div class="deadline-item" data-open-task="${task.id}"><div class="deadline-time">${deadlineUrgency(task,index)}</div><div><strong>${escapeHTML(task.title)}</strong><span>${isSchoolRole() ? own.text : task.deadline}</span></div><div class="deadline-progress"><b>${isSchoolRole() ? own.text : `${task.completed}/${task.total}`}</b><small>${isSchoolRole() ? 'статус' : 'школ'}</small></div></div>`;
  }).join('') || '<div class="empty-state">Нет поручений, требующих внимания</div>';

  if (isSchoolRole()) {
    const s = school;
    const breakdown = s && Number(s.tasks)>0 ? [
      ['Сроки', Math.round((Number(s.onTime||0)/Math.max(1,Number(s.tasks||0)))*100)], ['Качество',s.quality], ['Полнота',s.completeness], ['Реакция',s.response]
    ].filter(([,value])=>Number.isFinite(Number(value))) : [];
    dom.topSchools.innerHTML = breakdown.length ? breakdown.map(([label,value],i) => `<div class="top-school"><div class="rank ${i===0?'gold':''}">${i+1}</div><div><strong>${label}</strong><span>Составляющая рейтинга</span></div><div class="school-score"><b>${value}%</b><small>${value>=90?'Высоко':'Улучшить'}</small></div></div>`).join('') : '<div class="empty-state">Рейтинг появится после выполнения поручений</div>';
  } else {
    dom.topSchools.innerHTML = SCHOOLS.slice(0,4).map((s,i) => `<div class="top-school" data-school-card="${s.id}"><div class="rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</div><div><strong>${escapeHTML(s.name)}</strong><span>${s.tasks} поручения · ${s.overdue} просрочек</span></div><div class="school-score"><b>${s.rating}%</b><small class="${s.trend>=0?'delta-up':'delta-down'}">${s.trend>=0?'↑':'↓'} ${Math.abs(s.trend)}</small></div></div>`).join('');
  }

  dom.activityList.innerHTML = state.audit.slice(0,5).map(item => `<div class="activity-item"><div class="activity-dot">${item.type==='rating'?'★':item.type==='security'?'⌁':item.type==='submission'?'✓':'+'}</div><p><b>${escapeHTML(item.user)}</b> — ${escapeHTML(item.action)}<br>${escapeHTML(item.object)}</p><time>${escapeHTML(item.time.split(' ')[1] || item.time)}</time></div>`).join('');

  const approvals = getApprovalItems().slice(0,3);
  dom.dashboardApprovals.innerHTML = approvals.map(item => `<div class="compact-approval-card"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.author)} · ${escapeHTML(item.date || item.deadline)}</span><button class="secondary-button small" data-open-approval="${item.id}">Рассмотреть</button></div>`).join('') || '<div class="empty-state">Нет документов на согласовании</div>';

  bindDynamicOpeners();
}

function renderTasks() {
  const visible = getVisibleTasks();
  const query = dom.taskSearch.value.trim().toLowerCase();
  const direction = dom.taskDirection.value;
  const filtered = visible.filter(task => {
    const matchesStatus = state.taskFilter === 'all' || task.status === state.taskFilter;
    const matchesQuery = !query || `${task.title} ${task.direction} ${task.creator}`.toLowerCase().includes(query);
    const matchesDirection = direction === 'all' || task.direction === direction;
    return matchesStatus && matchesQuery && matchesDirection;
  });

  const counts = {
    all:visible.length, active:visible.filter(t=>t.status==='active').length, review:visible.filter(t=>t.status==='review').length,
    pending_approval:visible.filter(t=>t.status==='pending_approval').length, overdue:visible.filter(t=>t.status==='overdue').length, done:visible.filter(t=>t.status==='done').length
  };
  dom.taskCountAll.textContent = counts.all;
  dom.taskCountActive.textContent = counts.active;
  dom.taskCountReview.textContent = counts.review;
  dom.taskCountPending.textContent = counts.pending_approval;
  dom.taskCountOverdue.textContent = counts.overdue;
  dom.taskCountDone.textContent = counts.done;
  dom.tasksPageDescription.textContent = isSchoolRole() ? 'Получение, заполнение и отправка поручений вашей школы.' : isDepartmentRole() ? 'Поручения и ответы школ только по вашему направлению.' : 'Создание, распределение, контроль выполнения и проверка отчётов школ.';

  dom.tasksTableBody.innerHTML = filtered.map(task => {
    const own = isSchoolRole() ? taskOwnStatus(task) : null;
    const statusText = isSchoolRole() ? own.text : task.statusText;
    const status = isSchoolRole() ? ({new:'blue',working:'orange',director:'purple',review:'orange',returned:'red',overdue:'red',accepted:'green'})[own.status] : statusClass(task.status);
    const execution = isSchoolRole()
      ? `<div class="task-title-cell"><strong>${escapeHTML(own.detail)}</strong><span>Вес в рейтинге ×${task.weight}</span></div>`
      : `<div class="execution-head"><span>${task.completed} из ${task.total}</span><b>${task.progress}%</b></div><div class="mini-progress"><i style="width:${task.progress}%"></i></div>`;
    return `<tr>
      <td class="task-title-cell"><strong>${escapeHTML(task.title)}</strong><span>${escapeHTML(task.priority)} · №${String(task.id).padStart(3,'0')} · ${escapeHTML(task.responseType)}</span></td>
      <td><span class="tag ${tagClassForDirection(task.direction)}">${escapeHTML(task.direction)}</span><div class="task-title-cell"><span>${escapeHTML(DEPARTMENTS.find(d=>d.id===task.departmentId)?.short || '')}</span></div></td>
      <td>${escapeHTML(task.deadline)}</td>
      <td class="execution-cell">${execution}</td>
      <td><span class="tag ${status}">${escapeHTML(statusText)}</span></td>
      <td><div class="table-action-group"><button class="table-action-button primary" data-open-task="${task.id}">Открыть</button>${task.status==='draft' && state.role==='department_head' ? `<button class="table-action-button" data-submit-draft="${task.id}">На согласование</button>` : ''}</div></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="empty-state">Поручения по выбранным условиям не найдены</td></tr>';

  document.querySelectorAll('[data-submit-draft]').forEach(button => button.addEventListener('click', () => submitDraftForApproval(Number(button.dataset.submitDraft))));
  bindDynamicOpeners();
}

function getApprovalItems() {
  const taskItems = state.tasks.filter(t => t.status === 'pending_approval').map(t => ({
    id:`task-${t.id}`, taskId:t.id, type:'task', title:t.title, author:t.creator, date:t.deadline, description:`${t.priority} поручение для ${t.total} школ. Маршрут: ${t.approvalRoute}.`, level:t.approvalRoute.includes('начальником') ? 'chief' : 'deputy', departmentId:t.departmentId
  }));
  return [...taskItems, ...STATIC_APPROVALS].filter(item => {
    if (state.resolvedApprovals.has(item.id)) return false;
    if (isManagement()) return true;
    if (state.role === 'department_head') return item.level === 'department_head' && item.departmentId === state.currentUser.departmentId;
    if (state.role === 'school_director') return item.type === 'school';
    return false;
  });
}

function renderApprovals() {
  if (!roleConfig().pages.includes('approvals')) return;
  const filter = dom.approvalTypeFilter.value;
  const items = getApprovalItems().filter(item => filter === 'all' || item.type === filter);
  dom.approvalQueue.innerHTML = items.map(item => {
    const canDecide = roleConfig().canApprove && (isManagement() || (state.role === 'department_head' && item.level === 'department_head'));
    return `<article class="approval-card">
      <div class="approval-card-head"><div><h4>${escapeHTML(item.title)}</h4><p>${escapeHTML(item.description)}</p></div><span class="tag ${item.type==='task'?'blue':item.type==='rating'?'purple':item.type==='report'?'green':'orange'}">${item.type==='task'?'Поручение':item.type==='rating'?'Рейтинг':item.type==='report'?'Отчёт':'Ответ школы'}</span></div>
      <div class="approval-meta"><span>Автор: ${escapeHTML(item.author)}</span><span>Создано: ${escapeHTML(item.date)}</span><span>Уровень: ${escapeHTML(item.level==='chief'?'Начальник РОО':item.level==='deputy'?'Заместитель':'Начальник отдела')}</span></div>
      <div class="approval-actions"><button class="secondary-button" data-view-approval="${item.id}">Подробнее</button>${canDecide?`<button class="primary-button" data-approve="${item.id}">Согласовать</button><button class="secondary-button" data-return-approval="${item.id}">Вернуть</button>`:'<span class="tag gray">Только просмотр</span>'}</div>
    </article>`;
  }).join('') || '<div class="empty-state">Нет документов, ожидающих вашего решения</div>';

  const routes = [
    ['Обычное поручение отдела','Специалист','Начальник отдела','Публикация'],
    ['Важное поручение всем школам','Начальник отдела','Заместитель','Публикация'],
    ['Критическое поручение','Начальник отдела','Заместитель','Начальник РОО','Публикация'],
    ['Отчёт школы','Ответственный школы','Директор школы','Специалист РОО','Начальник отдела']
  ];
  dom.approvalRoutes.innerHTML = routes.map(route => `<div class="route-item"><strong>${route[0]}</strong><div class="route-chain">${route.slice(1).map((step,i)=>`${i?'<i>→</i>':''}<span>${step}</span>`).join('')}</div></div>`).join('');

  document.querySelectorAll('[data-approve]').forEach(button => button.addEventListener('click', () => resolveApproval(button.dataset.approve, true)));
  document.querySelectorAll('[data-return-approval]').forEach(button => button.addEventListener('click', () => resolveApproval(button.dataset.returnApproval, false)));
  document.querySelectorAll('[data-view-approval]').forEach(button => button.addEventListener('click', () => viewApproval(button.dataset.viewApproval)));
}

function resolveApproval(id, approved) {
  const taskMatch = id.match(/^task-(\d+)$/);
  if (taskMatch) {
    const task = state.tasks.find(t => t.id === Number(taskMatch[1]));
    if (task) {
      task.status = approved ? 'active' : 'draft';
      task.statusText = approved ? 'Активно' : 'Черновик';
      if (approved) { task.received = task.total; task.opened = 0; }
      addAudit(approved ? 'Согласовал и опубликовал поручение' : 'Вернул поручение на доработку', task.title, 'task');
    }
  } else {
    state.resolvedApprovals.add(id);
    const item = STATIC_APPROVALS.find(a => a.id === id);
    addAudit(approved ? 'Согласовал документ' : 'Вернул документ на доработку', item?.title || id, item?.type === 'rating' ? 'rating' : 'task');
  }
  saveState();
  renderAll();
  showToast(approved ? 'Документ согласован' : 'Документ возвращён на доработку');
}

function viewApproval(id) {
  const item = getApprovalItems().find(a => a.id === id) || STATIC_APPROVALS.find(a => a.id === id);
  if (!item) return;
  showInfoModal(item.title, `<p>${escapeHTML(item.description)}</p><h3>Маршрут</h3><p>Автор: ${escapeHTML(item.author)}<br>Уровень решения: ${escapeHTML(item.level)}<br>Дата: ${escapeHTML(item.date)}</p>`, 'Согласование');
}

function submitDraftForApproval(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.status = 'pending_approval';
  task.statusText = 'На согласовании';
  addAudit('Направил черновик на согласование', task.title, 'task');
  saveState();
  renderAll();
  showToast('Черновик направлен заместителю начальника');
}

function renderSchools() {
  const visible = getVisibleSchools();
  const query = dom.schoolSearch.value.trim().toLowerCase();
  const risk = dom.schoolRiskFilter.value;
  const filtered = visible.filter(s => (!query || `${s.name} ${s.director} ${s.locality}`.toLowerCase().includes(query)) && (risk === 'all' || s.risk === risk));

  const summary = [
    [visible.length, isSchoolRole()?'Ваша организация':'Школ в доступе'],
    [visible.filter(s=>s.online).length, 'Сейчас активны'],
    [visible.filter(s=>s.overdue===0).length, 'Без просрочек'],
    [visible.filter(s=>s.risk!=='good').length, 'Требуют внимания']
  ];
  dom.schoolsSummary.innerHTML = summary.map(([value,label]) => `<div class="summary-card"><strong>${value}</strong><span>${label}</span></div>`).join('');

  dom.schoolGrid.innerHTML = filtered.map((school,index) => `<article class="school-card">
    <div class="school-card-head"><div class="school-logo">${school.place}</div><div><span class="tag ${school.rating>=90?'green':school.rating>=80?'orange':'red'}">${school.rating}%</span></div></div>
    <h3>${escapeHTML(school.name)}</h3><p>${escapeHTML(school.director)} · ${escapeHTML(school.locality)}</p>
    <div class="school-metrics"><div><strong>${school.tasks}</strong><span>Поручений</span></div><div><strong>${school.overdue}</strong><span>Просрочено</span></div><div><strong>${school.returned}</strong><span>Возвратов</span></div></div>
    <div class="school-card-footer"><span class="risk-badge ${school.risk==='good'?'delta-up':school.risk==='critical'?'delta-down':''}">${riskLabel(school.risk)} · ${school.online?'в сети':'не в сети'}</span><button data-school-card="${school.id}">Карточка школы →</button></div>
  </article>`).join('') || '<div class="empty-state">Школы не найдены</div>';
  bindDynamicOpeners();
}

function openSchoolModal(schoolId) {
  const school=SCHOOLS.find(s=>s.id===schoolId);if(!school)return;
  dom.schoolModalTitle.textContent=school.name;
  const rating=Number.isFinite(Number(school.rating))?Number(school.rating):null;
  const closed=Number(school.onTime||0)+Number(school.overdue||0);
  const deadlineScore=closed?Math.round(Number(school.onTime||0)/closed*100):null;
  const parts=[['Соблюдение сроков',deadlineScore],['Качество данных',school.quality],['Полнота ответа',school.completeness],['Скорость реакции',school.response]];
  dom.schoolModalContent.innerHTML=`
    <div class="school-profile-head"><div class="school-logo">${school.place||'—'}</div><div><strong>${escapeHTML(school.name)}</strong><span>Директор: ${escapeHTML(school.director||'не указан')}<br>Ответственный: ${escapeHTML(school.responsible||'не указан')}</span></div></div>
    <div class="school-profile-stats"><div><b>${rating===null?'—':rating.toFixed(1)+'%'}</b><span>Рейтинг</span></div><div><b>${school.place||'—'}</b><span>Место</span></div><div><b>${school.overdue||0}</b><span>Просрочки</span></div><div><b>${school.returned||0}</b><span>Возвраты</span></div></div>
    <div class="drawer-card"><h3>Составляющие рейтинга</h3><div class="rating-breakdown">${parts.map(([label,value])=>{const n=Number(value);const ok=Number.isFinite(n);return `<div class="breakdown-row"><span>${label}</span><div class="mini-progress"><i style="width:${ok?Math.max(0,Math.min(100,n)):0}%"></i></div><b>${ok?Math.round(n)+'%':'—'}</b></div>`;}).join('')}</div></div>
    <div class="drawer-card"><h3>Замечания и история</h3><div class="empty-state">Записи появятся после проверки реальных отчётов школы.</div></div>
    <div class="modal-actions"><button class="secondary-button" data-school-report="${school.id}">Скачать карточку</button></div>`;
  openModal('schoolModal');
  document.querySelector('[data-school-report]')?.addEventListener('click',()=>downloadSchoolCard(school));
}

function renderRating() {
  const query=dom.ratingSearch.value.trim().toLowerCase();
  const visible=getRatingSchools().filter(s=>(!query||s.name.toLowerCase().includes(query))&&Number.isFinite(Number(s.rating))).sort((a,b)=>Number(b.rating)-Number(a.rating));
  const values=visible.map(s=>Number(s.rating));const average=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  const own=currentSchool();const ownRating=Number.isFinite(Number(own?.rating))?Number(own.rating):null;
  dom.ratingHero.innerHTML=`<div class="rating-main-card"><span>${isSchoolRole()?'Рейтинг вашей школы':'Средний рейтинг доступного контура'}</span><strong>${isSchoolRole()?(ownRating===null?'—':ownRating.toFixed(1)+'%'):(average===null?'—':average.toFixed(1)+'%')}</strong><small>${values.length?'Рассчитано по фактическим данным':'Недостаточно данных для расчёта'}</small></div>`;
  dom.ratingTableBody.innerHTML=visible.length?visible.map((school,index)=>`<tr><td><span class="position-badge ${index<3?'top':''}">${school.place||index+1}</span></td><td class="task-title-cell"><strong>${escapeHTML(school.name)}</strong><span>${escapeHTML(school.director||'Директор не указан')}</span></td><td>${school.tasks||0}</td><td>${school.onTime||0}</td><td>${school.overdue||0}</td><td>${school.returned||0}</td><td>${Number.isFinite(Number(school.quality))?Math.round(Number(school.quality))+'%':'—'}</td><td>${Number.isFinite(Number(school.trend))?(Number(school.trend)>=0?'↑ ':'↓ ')+Math.abs(Number(school.trend)):'—'}</td><td><button class="rating-score" data-school-card="${school.id}">${Number(school.rating).toFixed(1)}%</button></td></tr>`).join(''):'<tr><td colspan="9" class="empty-state">Рейтинг ещё не рассчитан</td></tr>';
  bindDynamicOpeners();
}

function renderDepartments() {
  if(!roleConfig().pages.includes('departments'))return;
  const visible=isDepartmentRole()?DEPARTMENTS.filter(d=>d.id===state.currentUser.departmentId):DEPARTMENTS;
  dom.departmentGrid.innerHTML=visible.length?visible.map(dept=>{const value=Number(dept.completion);const rated=Number.isFinite(value);return `<article class="department-card"><div class="department-card-head"><div class="department-icon">${dept.icon}</div><span class="tag">${rated?value+'%':'Не рассчитано'}</span></div><h3>${escapeHTML(dept.name)}</h3><p>Начальник: ${escapeHTML(dept.head||'не указан')}</p><div class="department-stats"><div><b>${dept.staff||0}</b><span>Сотрудников</span></div><div><b>${dept.active||0}</b><span>Активных</span></div><div><b>${dept.overdue||0}</b><span>Просрочек</span></div></div></article>`;}).join(''):'<div class="empty-state">Подразделения не добавлены</div>';
  const maxActive=Math.max(...visible.map(d=>Number(d.active)||0),1);
  dom.departmentLoadChart.innerHTML=visible.map(dept=>`<div class="horizontal-row"><span>${escapeHTML(dept.short)}</span><div class="horizontal-track"><i style="width:${Math.round((Number(dept.active)||0)/maxActive*100)}%"></i></div><b>${Number(dept.active)||0}</b></div>`).join('');
  dom.departmentHeads.innerHTML=visible.map(dept=>`<div class="person-item"><div class="avatar">${dept.icon}</div><div><strong>${escapeHTML(dept.head||'Не указан')}</strong><span>${escapeHTML(dept.short)}</span></div><b>${Number.isFinite(Number(dept.completion))?dept.completion+'%':'—'}</b></div>`).join('');
}

function renderReports() {
  const tasks=getVisibleTasks();const completed=tasks.filter(t=>['done','accepted'].includes(t.status)).length;const overdue=tasks.filter(t=>t.status==='overdue').length;
  dom.reportSummary.innerHTML=[[tasks.length,'Поручений в доступе'],[completed,'Завершено'],[overdue,'Просрочено'],[getVisibleSchools().length,'Школ в доступе']].map(([value,label])=>`<div class="summary-card"><strong>${value}</strong><span>${label}</span></div>`).join('');
  const reports=[['XLS','Рейтинг школ','Только рассчитанные показатели','rating'],['PDF','Исполнительская дисциплина','Поручения и фактические статусы','discipline'],['XLS','Анализ результатов экзаменов','По загруженным результатам','gia'],['PDF','Просроченные поручения','Фактический список просрочек','overdue'],['XLS','Работа отделов РОО','Поручения и ответы подразделений','departments']];
  dom.reportGrid.innerHTML=reports.map(([icon,title,subtitle,type])=>`<article class="report-card"><div class="report-icon">${icon}</div><div><strong>${title}</strong><span>${subtitle}</span></div><button data-download-report="${type}">Скачать</button></article>`).join('');
  document.querySelectorAll('[data-download-report]').forEach(button=>button.addEventListener('click',()=>downloadReport(button.dataset.downloadReport)));
}

function renderCalendar() {
  const now=new Date(),year=now.getFullYear(),month=now.getMonth();const first=new Date(year,month,1);const daysInMonth=new Date(year,month+1,0).getDate();const offset=(first.getDay()+6)%7;const dueDays=new Set(getVisibleTasks().map(t=>new Date(t.deadlineDate||'')).filter(d=>!Number.isNaN(d.getTime())&&d.getFullYear()===year&&d.getMonth()===month).map(d=>d.getDate()));
  const days=[];for(let i=0;i<offset;i++)days.push({n:'',dim:true});for(let i=1;i<=daysInMonth;i++)days.push({n:i,today:i===now.getDate(),event:dueDays.has(i)});
  dom.calendarDays.innerHTML=days.map(d=>d.dim?'<span class="calendar-day dim"></span>':`<button class="calendar-day ${d.today?'today':''} ${d.event?'has-event':''} ${d.n===state.selectedCalendarDay?'selected':''}" data-calendar-day="${d.n}"><b>${d.n}</b></button>`).join('');
  if(!state.selectedCalendarDay||state.selectedCalendarDay>daysInMonth)state.selectedCalendarDay=now.getDate();renderAgenda(state.selectedCalendarDay);
  document.querySelectorAll('[data-calendar-day]').forEach(button=>button.addEventListener('click',()=>{state.selectedCalendarDay=Number(button.dataset.calendarDay);renderCalendar();}));
}

function renderAgenda(day) {
  const now=new Date(),date=new Date(now.getFullYear(),now.getMonth(),day);dom.agendaDate.textContent=date.toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
  const tasks=getVisibleTasks().filter(t=>{const d=new Date(t.deadlineDate||'');return !Number.isNaN(d.getTime())&&d.toDateString()===date.toDateString();});
  dom.agendaList.innerHTML=tasks.length?tasks.map(t=>`<div class="agenda-item ${t.status==='overdue'?'red':'orange'}"><time>${escapeHTML((t.deadline||'').split(', ')[1]||'—')}</time><strong>${escapeHTML(t.title)}</strong><span>${escapeHTML(t.direction||'Направление не указано')}</span></div>`).join(''):'<div class="empty-state">На этот день сроки не назначены</div>';
}

function renderArchive() {
  const grouped={};getVisibleTasks().forEach(t=>{const d=new Date(t.deadlineDate||Date.now());const y=d.getMonth()>=7?`${d.getFullYear()}–${d.getFullYear()+1}`:`${d.getFullYear()-1}–${d.getFullYear()}`;grouped[y]=(grouped[y]||0)+1;});
  const years=Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0]));
  dom.archiveYears.innerHTML=years.length?years.map(([year,tasks])=>`<article><span>${year}</span><strong>${tasks} поручений</strong><small>Документы появляются после загрузки файлов</small><button data-archive-year="${year}">Открыть →</button></article>`).join(''):'<div class="empty-state">Архив появится после создания поручений</div>';
  document.querySelectorAll('[data-archive-year]').forEach(button=>button.addEventListener('click',()=>showToast(`Открыт архив ${button.dataset.archiveYear} учебного года`)));
}

function renderUsers() {
  if (!roleConfig().pages.includes('users')) return;
  const config = roleConfig();
  dom.permissionOverview.innerHTML = [
    ['Начальник РОО','Полный доступ ко всем модулям и решениям.'],
    ['Заместители','Контроль направлений, публикация и согласование.'],
    ['Начальники отделов','Поручения, проверки и сводки своего отдела.'],
    ['Специалисты','Черновики и назначенная рабочая зона.'],
    ['Директора школ','Все документы и подтверждения своей школы.'],
    ['Ответственные школ','Только выполнение назначенных поручений.']
  ].map(([title,text])=>`<div class="permission-card"><strong>${title}</strong><span>${text}</span></div>`).join('');

  const query = dom.userSearch.value.trim().toLowerCase();
  const filter = dom.userRoleFilter.value;
  const visibleUsers = USERS.filter(u => (!query || `${u.name} ${u.unit} ${roleLabel(u.role)}`.toLowerCase().includes(query)) && (filter==='all'||u.role===filter));
  dom.usersTableBody.innerHTML = visibleUsers.map(user=>`<tr><td class="task-title-cell"><strong>${escapeHTML(user.name)}</strong><span>${escapeHTML(user.email)}</span></td><td><span class="tag blue">${roleLabel(user.role)}</span></td><td>${escapeHTML(user.unit)}</td><td>${escapeHTML(user.lastLogin)}</td><td><span class="status-pill ${user.active?'':'inactive'}">${user.active?'Активен':'Заблокирован'}</span></td><td><div class="table-action-group"><button class="table-action-button" data-user-view="${user.id}">Права</button>${config.canManageUsers?`<button class="table-action-button ${user.active?'danger':'primary'}" data-user-toggle="${user.id}">${user.active?'Блокировать':'Включить'}</button>`:''}</div></td></tr>`).join('');
  document.querySelectorAll('[data-user-view]').forEach(button=>button.addEventListener('click',()=>showUserPermissions(button.dataset.userView)));
  document.querySelectorAll('[data-user-toggle]').forEach(button=>button.addEventListener('click',()=>showToast('Изменение статуса доступно пользователям с соответствующими правами')));
}

function showUserPermissions(userId) {
  const user = USERS.find(u=>u.id===userId);
  const config = ROLE_CONFIG[user.role];
  showInfoModal(`Права: ${user.name}`, `<p><b>${config.label}</b><br>${config.scope}</p><ul>${config.permissions.map(p=>`<li>${escapeHTML(p)}</li>`).join('')}</ul>`, 'Разграничение доступа');
}

function renderAudit() {
  if (!roleConfig().pages.includes('audit')) return;
  let entries = state.audit;
  if (state.role === 'department_head') entries = entries.filter(a => a.object.toLowerCase().includes('гиа') || ['Марьям С. Хамидова','Али М. Исаев','Система'].includes(a.user));
  const query = dom.auditSearch.value.trim().toLowerCase();
  const filter = dom.auditTypeFilter.value;
  entries = entries.filter(a => (!query || `${a.user} ${a.action} ${a.object}`.toLowerCase().includes(query)) && (filter==='all'||a.type===filter));
  dom.auditSummary.innerHTML = [[state.audit.length,'Действий сохранено'],[state.audit.filter(a=>a.type==='task').length,'По поручениям'],[state.audit.filter(a=>a.type==='submission').length,'По отчётам школ'],[state.audit.filter(a=>a.type==='security').length,'Событий безопасности']].map(([v,l])=>`<div class="summary-card"><strong>${v}</strong><span>${l}</span></div>`).join('');
  dom.auditTableBody.innerHTML = entries.map(item=>`<tr><td>${escapeHTML(item.time)}</td><td>${escapeHTML(item.user)}</td><td>${escapeHTML(item.action)}</td><td class="task-title-cell"><strong>${escapeHTML(item.object)}</strong></td><td><span class="audit-type ${item.type}">${item.type==='task'?'Поручение':item.type==='submission'?'Отчёт школы':item.type==='rating'?'Рейтинг':'Доступ'}</span></td><td>${escapeHTML(item.device)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty-state">Записи не найдены</td></tr>';
}

function renderNotifications() {
  const unread = state.notifications.filter(n=>n.unread).length;
  dom.notificationCount.textContent = unread;
  dom.notificationCount.classList.toggle('hidden', unread===0);
  dom.notificationList.innerHTML = state.notifications.map(n=>`<div class="notification-item ${n.unread?'unread':''}"><div class="notification-icon">${n.icon}</div><div><strong>${escapeHTML(n.title)}</strong><span>${escapeHTML(n.text)}</span></div></div>`).join('');
}

function renderFormFields() {
  dom.formFieldList.innerHTML = state.formFields.map((field,index)=>`<span class="form-field-chip">${escapeHTML(field)}<button type="button" data-remove-field="${index}">×</button></span>`).join('');
  document.querySelectorAll('[data-remove-field]').forEach(button=>button.addEventListener('click',()=>{ state.formFields.splice(Number(button.dataset.removeField),1); renderFormFields(); }));
}

function openTaskDrawer(taskId) {
  const task = state.tasks.find(t=>t.id===Number(taskId));
  if (!task) return;
  dom.drawerTaskTitle.textContent = task.title;
  const department = DEPARTMENTS.find(d=>d.id===task.departmentId);
  const own = isSchoolRole() ? taskOwnStatus(task) : null;
  const statusTag = isSchoolRole() ? own.text : task.statusText;
  const statusCss = isSchoolRole() ? (own.status==='accepted'?'green':own.status==='overdue'||own.status==='returned'?'red':own.status==='director'?'purple':'orange') : statusClass(task.status);

  let recipientBlock = '';
  if (isSchoolRole()) {
    recipientBlock = `<div class="drawer-card"><h3>Выполнение вашей школой</h3><div class="detail-grid"><div class="detail-item"><span>Статус</span><strong>${escapeHTML(own.text)}</strong></div><div class="detail-item"><span>Подробно</span><strong>${escapeHTML(own.detail)}</strong></div></div><div class="drawer-actions" style="margin-top:12px">${schoolActionButtons(task,own)}</div></div>`;
  } else {
    const submissions = SCHOOLS.slice(0,12).map((school,index)=>{
      const submitted = index < Math.min(task.completed,12);
      const late = task.status==='overdue' && index>=8;
      const text = submitted ? (index%5===0?'Возвращено':'Принято') : late?'Просрочено':'В работе';
      const cls = submitted ? (index%5===0?'red':'green') : late?'red':'orange';
      return `<div class="submission-row"><strong>${escapeHTML(school.name)}</strong><span class="tag ${cls}">${text}</span><span>${submitted?`${10+index}:2${index%10}`:'—'}</span></div>`;
    }).join('');
    recipientBlock = `<div class="drawer-card"><h3>Исполнение школами</h3><div class="submission-list">${submissions}</div><div class="drawer-actions" style="margin-top:12px"><button class="secondary-button" data-task-reminder="${task.id}">Напомнить невыполнившим</button><button class="secondary-button" data-export-task="${task.id}">Скачать свод</button></div></div>`;
  }

  dom.taskDrawerContent.innerHTML = `
    <div class="drawer-card"><div class="approval-card-head"><div><span class="tag ${statusCss}">${escapeHTML(statusTag)}</span></div><span class="tag ${tagClassForDirection(task.direction)}">${escapeHTML(task.direction)}</span></div><p class="muted">${escapeHTML(task.description)}</p></div>
    <div class="drawer-card"><h3>Основные параметры</h3><div class="detail-grid"><div class="detail-item"><span>Срок</span><strong>${escapeHTML(task.deadline)}</strong></div><div class="detail-item"><span>Приоритет</span><strong>${escapeHTML(task.priority)}</strong></div><div class="detail-item"><span>Ответственный отдел</span><strong>${escapeHTML(department?.short||'')}</strong></div><div class="detail-item"><span>Автор</span><strong>${escapeHTML(task.creator)}</strong></div><div class="detail-item"><span>Формат ответа</span><strong>${escapeHTML(task.responseType)}</strong></div><div class="detail-item"><span>Вес в рейтинге</span><strong>×${task.weight}</strong></div><div class="detail-item"><span>Подтверждение директора</span><strong>${task.directorApproval?'Обязательно':'Не требуется'}</strong></div><div class="detail-item"><span>Согласование</span><strong>${escapeHTML(task.approvalRoute)}</strong></div></div></div>
    <div class="drawer-card"><h3>Поля формы</h3><div class="form-field-list">${task.formFields.map(f=>`<span class="form-field-chip">${escapeHTML(f)}</span>`).join('')}</div></div>
    ${recipientBlock}
    <div class="drawer-card"><h3>История поручения</h3><div class="timeline"><div class="timeline-item"><i class="timeline-dot"></i><div><strong>Поручение создано</strong><span>${escapeHTML(task.creator)}</span></div><time>18 июля</time></div><div class="timeline-item"><i class="timeline-dot"></i><div><strong>${task.status==='pending_approval'?'Направлено на согласование':'Опубликовано школам'}</strong><span>${escapeHTML(task.approvalRoute)}</span></div><time>18 июля</time></div><div class="timeline-item"><i class="timeline-dot"></i><div><strong>Автоматическое напоминание</strong><span>За 24 часа до срока</span></div><time>20 июля</time></div></div></div>
    <div class="drawer-actions">${managementTaskActions(task)}</div>`;

  dom.taskDrawer.classList.remove('hidden');
  dom.drawerOverlay.classList.remove('hidden');
  bindDrawerActions(task);
}

function schoolActionButtons(task, own) {
  if (state.role === 'school_staff') {
    if (own.status === 'new') return `<button class="primary-button" data-school-action="accept" data-task="${task.id}">Принять в работу</button>`;
    if (['working','returned','overdue'].includes(own.status)) return `<button class="primary-button" data-school-action="submit" data-task="${task.id}">Заполнить и отправить директору</button><button class="secondary-button" data-school-action="question" data-task="${task.id}">Задать вопрос</button>`;
    return '<span class="tag blue">Ожидайте действия директора или РОО</span>';
  }
  if (state.role === 'school_director') {
    if (own.status === 'director') return `<button class="primary-button" data-school-action="director_approve" data-task="${task.id}">Подтвердить и отправить в РОО</button><button class="secondary-button" data-school-action="director_return" data-task="${task.id}">Вернуть сотруднику</button>`;
    return '<span class="tag gray">Нет отчёта, ожидающего подтверждения</span>';
  }
  return '';
}

function managementTaskActions(task) {
  if (isSchoolRole()) return '';
  const buttons = [`<button class="secondary-button" data-export-task="${task.id}">Экспортировать свод</button>`];
  if (task.status === 'pending_approval' && roleConfig().canApprove) buttons.push(`<button class="primary-button" data-direct-approve-task="${task.id}">Согласовать и опубликовать</button>`);
  if (task.status === 'review' && (state.role==='department_head'||isManagement())) buttons.push(`<button class="primary-button" data-accept-submissions="${task.id}">Принять проверенные ответы</button>`);
  if (['active','overdue'].includes(task.status) && (state.role==='department_head'||isManagement())) buttons.push(`<button class="secondary-button" data-task-reminder="${task.id}">Отправить напоминание</button>`);
  return buttons.join('');
}

function bindDrawerActions(task) {
  document.querySelectorAll('[data-school-action]').forEach(button=>button.addEventListener('click',()=>handleSchoolAction(Number(button.dataset.task),button.dataset.schoolAction)));
  document.querySelectorAll('[data-task-reminder]').forEach(button=>button.addEventListener('click',()=>{ addAudit('Отправил напоминание школам',task.title,'task'); showToast('Напоминание отправлено невыполнившим школам'); renderAudit(); }));
  document.querySelectorAll('[data-export-task]').forEach(button=>button.addEventListener('click',()=>downloadTaskSummary(task)));
  document.querySelectorAll('[data-direct-approve-task]').forEach(button=>button.addEventListener('click',()=>{ resolveApproval(`task-${task.id}`,true); closeTaskDrawer(); }));
  document.querySelectorAll('[data-accept-submissions]').forEach(button=>button.addEventListener('click',()=>{ task.status='done';task.statusText='Завершено';task.progress=100;task.completed=task.total;addAudit('Завершил проверку поручения',task.title,'task');saveState();closeTaskDrawer();renderAll();showToast('Поручение завершено и перенесено в архив'); }));
}

function handleSchoolAction(taskId, action) {
  const key = `${state.currentUser.schoolId}:${taskId}`;
  const task = state.tasks.find(t=>t.id===taskId);
  if (!task) return;
  const actions = {
    accept:{status:'working',text:'В работе',detail:'Получение подтверждено, ответственный приступил к выполнению',audit:'Подтвердил получение поручения'},
    submit:{status:'director',text:'У директора',detail:'Отчёт отправлен директору школы на подтверждение',audit:'Отправил отчёт директору школы'},
    director_approve:{status:'review',text:'На проверке',detail:'Директор подтвердил отчёт и отправил его в РОО',audit:'Подтвердил и отправил отчёт в РОО'},
    director_return:{status:'returned',text:'На исправлении',detail:'Директор вернул отчёт ответственному сотруднику',audit:'Вернул отчёт сотруднику на исправление'}
  };
  if (action === 'question') { showToast('Вопрос добавлен в обсуждение поручения'); addAudit('Задал вопрос по поручению',task.title,'submission'); return; }
  const next = actions[action];
  if (!next) return;
  state.schoolOverrides[key] = {status:next.status,text:next.text,detail:next.detail};
  addAudit(next.audit,task.title,'submission');
  saveState();
  openTaskDrawer(taskId);
  renderAll();
  showToast(next.text);
}

function closeTaskDrawer() {
  dom.taskDrawer.classList.add('hidden');
  dom.drawerOverlay.classList.add('hidden');
}

function bindDynamicOpeners() {
  document.querySelectorAll('[data-open-task]').forEach(button => {
    button.onclick = () => openTaskDrawer(Number(button.dataset.openTask));
  });
  document.querySelectorAll('[data-school-card]').forEach(button => {
    button.onclick = () => openSchoolModal(button.dataset.schoolCard);
  });
  document.querySelectorAll('[data-open-approval]').forEach(button => {
    button.onclick = () => { navigate('approvals'); viewApproval(button.dataset.openApproval); };
  });
}

function createTaskFromForm(event) {
  event.preventDefault();
  if (!roleConfig().canCreate) return showToast('У вашей роли нет права создавать поручения');
  const title = dom.newTaskTitle.value.trim();
  if (!title) return showToast('Введите название поручения');
  const departmentId = dom.newTaskDirection.value;
  const dept = DEPARTMENTS.find(d=>d.id===departmentId);
  const priority = dom.newTaskPriority.value;
  const recipients = dom.newTaskRecipients.value;
  const date = dom.newTaskDate.value;
  const time = dom.newTaskTime.value;
  const dateObj = new Date(`${date}T${time}:00`);
  const monthNames = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const deadline = `${dateObj.getDate()} ${monthNames[dateObj.getMonth()]}, ${time}`;
  let status = 'active';
  let statusText = 'Активно';
  if (state.role === 'specialist') { status='draft';statusText='Черновик'; }
  else if (state.role === 'department_head' && (recipients==='all' || priority==='Критическое' || dom.newTaskApprovalRoute.value!=='none')) { status='pending_approval';statusText='На согласовании'; }
  const citySchools=SCHOOLS.filter(s=>/^г\./i.test(s.locality||''));const ruralSchools=SCHOOLS.filter(s=>!/^г\./i.test(s.locality||''));const total=recipients==='city'?citySchools.length:recipients==='rural'?ruralSchools.length:recipients==='selected'?Math.min(1,SCHOOLS.length):SCHOOLS.length;
  const routes = {auto:'Автоматически по должности',deputy:'Через заместителя начальника',chief:'Только начальником РОО',none:'Без дополнительного согласования'};
  const task = {
    id:Math.max(0,...state.tasks.map(t=>t.id))+1,
    title, departmentId, direction: dept?.short || 'Общее образование', deadlineDate:`${date}T${time}`, deadline,
    progress:0, completed:0, total, received:status==='active'?total:0, opened:0, overdue:0, returned:0,
    status,statusText,priority,creator:state.currentUser.name,recipients:recipients==='all'?'all':SCHOOLS.slice(0,total).map(s=>s.id),
    responseType:dom.newTaskResponseType.value,directorApproval:dom.newTaskDirectorApproval.value==='yes',
    approvalRoute:routes[dom.newTaskApprovalRoute.value],weight:Number(dom.newTaskWeight.value),
    description:dom.newTaskDescription.value.trim() || 'Описание не указано.', formFields:[...state.formFields]
  };
  state.tasks.unshift(task);
  addAudit(status==='active'?'Создал и опубликовал поручение':status==='draft'?'Создал черновик поручения':'Направил поручение на согласование',title,'task');
  saveState();
  closeModal('taskModal');
  event.target.reset();
  dom.newTaskDate.value=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  dom.newTaskTime.value='14:00';
  state.formFields=['Количество обучающихся','Основной показатель','Комментарий','Подтверждающий файл'];
  renderAll();
  navigate('tasks');
  showToast(status==='active'?`Поручение отправлено ${total} школам`:status==='draft'?'Черновик сохранён':'Поручение направлено на согласование');
}

function downloadCSV(filename, rows) {
  const csv = '\uFEFF' + rows.map(row=>row.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
}

function downloadTaskSummary(task) {
  const recipients=Array.isArray(task._recipients)?task._recipients:[];
  const bySchool=new Map(recipients.map(r=>[r.school_id,r]));
  const schools=recipients.length?SCHOOLS.filter(s=>bySchool.has(s.id)):getVisibleSchools();
  const rows=[['Школа','Статус','Срок','Рейтинг'],...schools.map(s=>{const r=bySchool.get(s.id);return [s.name,r?({new:'Новое',working:'В работе',director:'У директора',review:'На проверке',returned:'На исправлении',accepted:'Принято',overdue:'Просрочено'}[r.status]||r.status):'Нет статуса',task.deadline||'',Number.isFinite(Number(s.rating))?s.rating:''];})];
  downloadCSV(`svod_poruchenie_${task.id}.csv`,rows);
  addAudit('Экспортировал свод по поручению',task.title,'task');
  showToast('Свод по поручению скачан');
}

function downloadSchoolCard(school) {
  downloadCSV(`kartochka_shkoly_${school.place}.csv`,[['Показатель','Значение'],['Школа',school.name],['Директор',school.director],['Рейтинг',Number.isFinite(Number(school.rating))?school.rating:'Не рассчитан'],['Место',school.place||'Не присвоено'],['Поручений',school.tasks],['Просрочено',school.overdue],['Возвраты',school.returned]]);
  showToast('Карточка школы скачана');
}

function downloadReport(type) {
  if (type==='rating') return exportRating();
  if (type==='overdue') {
    downloadCSV('prosrochennye_porucheniya.csv',[['Поручение','Отдел','Срок','Выполнено','Всего'],...state.tasks.filter(t=>t.status==='overdue').map(t=>[t.title,t.direction,t.deadline,t.completed,t.total])]);
  } else if (type==='departments') {
    downloadCSV('rabota_otdelov.csv',[['Отдел','Сотрудников','Активных поручений','Просрочек','Исполнение'],...DEPARTMENTS.map(d=>[d.name,d.staff||0,d.active||0,d.overdue||0,Number.isFinite(Number(d.completion))?`${d.completion}%`:'Не рассчитано'])]);
  } else {
    downloadCSV(`otchet_${type}.csv`,[['Раздел','Значение'],['Тип отчёта',type],['Дата формирования',new Date().toLocaleDateString('ru-RU')],['Доступная роль',roleConfig().label],['Количество поручений',getVisibleTasks().length],['Количество школ',getVisibleSchools().length]]);
  }
  addAudit('Сформировал отчёт',type,'submission');
  showToast('Отчёт сформирован и скачан');
}

function exportRating() {
  const schools=getRatingSchools().filter(s=>Number.isFinite(Number(s.rating)));
  if(!schools.length)return showToast('Рейтинг ещё не рассчитан');
  const period=new Date().toLocaleDateString('ru-RU',{month:'long',year:'numeric'}).replace(/\s+/g,'_');
  downloadCSV(`reiting_shkol_${period}.csv`,[['Место','Школа','Назначено','Вовремя','Просрочено','Возвраты','Качество','Рейтинг'],...schools.map(s=>[s.place||'',s.name,s.tasks||0,s.onTime||0,s.overdue||0,s.returned||0,s.quality??'',s.rating])]);
  addAudit('Экспортировал рейтинг школ',period,'rating');
  showToast('Рейтинг школ скачан');
}

function exportAudit() {
  downloadCSV('zhurnal_deystviy.csv',[['Время','Пользователь','Действие','Объект','Тип','Устройство'],...state.audit.map(a=>[a.time,a.user,a.action,a.object,a.type,a.device])]);
  showToast('Журнал действий скачан');
}

function generateCustomReport() {
  const type = dom.reportType.value;
  const period = dom.reportPeriod.value;
  const format = dom.reportFormat.value;
  downloadCSV('avtomaticheskaya_svodka.csv',[['Автоматическая сводка'],['Тип',type],['Период',period],['Формат',format],['Поручений',getVisibleTasks().length],['Школ',getVisibleSchools().length],['Сформировано',new Date().toLocaleString('ru-RU')]]);
  addAudit('Сформировал автоматическую сводку',`${type} · ${period}`,'submission');
  showToast('Автоматическая сводка сформирована');
}

function globalSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) return;
  const task = getVisibleTasks().find(t=>`${t.title} ${t.direction}`.toLowerCase().includes(q));
  const school = getVisibleSchools().find(s=>`${s.name} ${s.director}`.toLowerCase().includes(q));
  const user = USERS.find(u=>`${u.name} ${u.unit}`.toLowerCase().includes(q));
  if (task) { navigate('tasks');dom.taskSearch.value=query;renderTasks();return; }
  if (school && roleConfig().pages.includes('schools')) { navigate('schools');dom.schoolSearch.value=query;renderSchools();return; }
  if (user && roleConfig().pages.includes('users')) { navigate('users');dom.userSearch.value=query;renderUsers();return; }
  showToast('По вашему запросу ничего не найдено в доступном контуре');
}

function initializeDOM() {
  const ids = [
    'loginScreen','app','sidebar','toast','roleSelect','emailInput','passwordInput','sidebarRoleName','sidebarScopeText','userName','userRole','userAvatar','profileName','profilePosition','profileAvatar','quickRoleSwitcher','pageEyebrow','pageTitle','createTaskButton','dashboardCreateTask','addSchoolButton','addDepartmentButton','addUserButton','dashboardApprovalPanel','notificationPanel','profilePanel','notificationCount','notificationList','taskNavBadge','approvalNavBadge','pendingApprovalHeading','welcomeTitle','welcomeText','scopeBannerTitle','scopeBannerText','districtProgressRing','districtProgressValue','districtProgressLabel','dashboardStats','barChart','deadlineList','dashboardRatingTitle','topSchools','activityList','dashboardApprovals','taskSearch','taskDirection','taskCountAll','taskCountActive','taskCountReview','taskCountPending','taskCountOverdue','taskCountDone','tasksPageDescription','tasksTableBody','approvalTypeFilter','approvalQueue','approvalRoutes','schoolSearch','schoolRiskFilter','schoolsSummary','schoolGrid','schoolModalTitle','schoolModalContent','ratingHero','ratingSearch','ratingDirection','ratingTableBody','departmentGrid','departmentLoadChart','departmentHeads','reportSummary','reportGrid','reportType','reportPeriod','reportFormat','calendarDays','agendaDate','agendaList','archiveYears','archiveSearch','archiveYear','archiveSearchResult','permissionOverview','userSearch','userRoleFilter','newUserRole','newUserUnit','usersTableBody','auditSummary','auditSearch','auditTypeFilter','auditTableBody','newTaskTitle','newTaskDirection','newTaskPriority','newTaskDate','newTaskTime','newTaskDescription','newTaskRecipients','newTaskResponseType','newTaskDirectorApproval','newTaskRepeat','newTaskWeight','newTaskApprovalRoute','formFieldList','taskPermissionHint','taskSubmitButton','taskDrawer','drawerOverlay','drawerTaskTitle','taskDrawerContent'
  ];
  ids.forEach(id=>dom[id]=document.getElementById(id));
}

function bindStaticEvents() {
  document.getElementById('loginForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!dom.passwordInput.value.trim()) return showToast('Введите пароль');
    state.role = dom.roleSelect.value;
    localSet(STORAGE_KEYS.role,state.role);
    dom.loginScreen.classList.add('hidden');
    dom.app.classList.remove('hidden');
    window.scrollTo({top:0,left:0,behavior:'auto'});
    sessionSet('achkhoyEduLoggedV2','1');
    applyRole(state.role);
    requestAnimationFrame(() => window.scrollTo({top:0,left:0,behavior:'auto'}));
    addAudit('Вход в систему',roleConfig().label,'security');
    showToast(`Выполнен вход: ${roleConfig().label}`);
  });

  dom.roleSelect.addEventListener('change',()=>{
    const user = USERS.find(u=>u.id===ROLE_USER_MAP[dom.roleSelect.value]);
    if (user) dom.emailInput.value=user.email;
  });
  document.getElementById('togglePassword').addEventListener('click',()=>{ dom.passwordInput.type=dom.passwordInput.type==='password'?'text':'password'; });
  document.getElementById('logoutButton').addEventListener('click',()=>{ sessionRemove('achkhoyEduLoggedV2');dom.app.classList.add('hidden');dom.loginScreen.classList.remove('hidden');closeFloatingPanels(); });
  document.getElementById('menuButton').addEventListener('click',()=>dom.sidebar.classList.toggle('open'));
  document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.page)));
  document.querySelectorAll('[data-page-jump]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.pageJump)));

  document.querySelectorAll('[data-open-task-modal]').forEach(button=>button.addEventListener('click',()=>{
    if (!roleConfig().canCreate) return showToast('У вашей роли нет права создавать поручения');
    openModal('taskModal');
  }));
  document.querySelectorAll('[data-close-modal]').forEach(button=>button.addEventListener('click',()=>closeModal(button.dataset.closeModal)));
  document.querySelectorAll('.modal-backdrop').forEach(backdrop=>backdrop.addEventListener('click',event=>{ if(event.target===backdrop) closeModal(backdrop.id); }));
  document.querySelectorAll('[data-close-floating]').forEach(button=>button.addEventListener('click',()=>button.closest('.floating-panel').classList.add('hidden')));

  document.getElementById('notificationButton').addEventListener('click',()=>{ const panel=dom.notificationPanel;const opening=panel.classList.contains('hidden');closeFloatingPanels(opening?'notificationPanel':'');panel.classList.toggle('hidden',!opening); });
  document.getElementById('userCardButton').addEventListener('click',()=>{ const panel=dom.profilePanel;const opening=panel.classList.contains('hidden');closeFloatingPanels(opening?'profilePanel':'');panel.classList.toggle('hidden',!opening); });
  document.getElementById('markAllReadButton').addEventListener('click',()=>{ state.notifications.forEach(n=>n.unread=false);renderNotifications();showToast('Все уведомления отмечены прочитанными'); });
  dom.quickRoleSwitcher.addEventListener('change',()=>{ applyRole(dom.quickRoleSwitcher.value);closeFloatingPanels();showToast(`Роль переключена: ${roleConfig().label}`); });
  document.getElementById('profilePermissionsButton').addEventListener('click',()=>showInfoModal(`Права: ${roleConfig().label}`,`<p>${escapeHTML(roleConfig().scope)}</p><ul>${roleConfig().permissions.map(p=>`<li>${escapeHTML(p)}</li>`).join('')}</ul>`,'Разграничение доступа'));
  document.getElementById('resetDemoButton').addEventListener('click',resetDemo);
  document.getElementById('resetDemoFromLogin').addEventListener('click',resetDemo);

  document.getElementById('themeButton').addEventListener('click',()=>{ document.body.classList.toggle('light-theme');localSet(STORAGE_KEYS.theme,document.body.classList.contains('light-theme')?'light':'dark'); });
  document.getElementById('helpButton').addEventListener('click',()=>showInfoModal('Как работает система','<h3>Поручения</h3><p>Ответственный сотрудник получает поручение, подтверждает его, заполняет форму и направляет директору. После подтверждения директора отчёт поступает в РОО.</p><h3>Рейтинг</h3><p>Сроки — 40%, качество — 30%, полнота — 20%, скорость реакции — 10%. Все ручные изменения фиксируются.</p><h3>Права</h3><p>Каждая должность видит только разрешённые разделы и данные.</p>','Справка'));

  document.querySelectorAll('#taskTabs button').forEach(button=>button.addEventListener('click',()=>{ document.querySelectorAll('#taskTabs button').forEach(b=>b.classList.remove('active'));button.classList.add('active');state.taskFilter=button.dataset.filter;renderTasks(); }));
  dom.taskSearch.addEventListener('input',renderTasks);
  dom.taskDirection.addEventListener('change',renderTasks);
  dom.approvalTypeFilter.addEventListener('change',renderApprovals);
  dom.schoolSearch.addEventListener('input',renderSchools);
  dom.schoolRiskFilter.addEventListener('change',renderSchools);
  dom.ratingSearch.addEventListener('input',renderRating);
  dom.ratingDirection.addEventListener('change',renderRating);
  document.querySelectorAll('#ratingTabs button').forEach(button=>button.addEventListener('click',()=>{ document.querySelectorAll('#ratingTabs button').forEach(b=>b.classList.remove('active'));button.classList.add('active');state.ratingPeriod=button.dataset.period;renderRating(); }));
  dom.userSearch.addEventListener('input',renderUsers);
  dom.userRoleFilter.addEventListener('change',renderUsers);
  dom.auditSearch.addEventListener('input',renderAudit);
  dom.auditTypeFilter.addEventListener('change',renderAudit);

  document.getElementById('taskForm').addEventListener('submit',createTaskFromForm);
  document.getElementById('addFormFieldButton').addEventListener('click',()=>{ const names=['Числовой показатель','Процент','Дата','Выбор из списка','Комментарий','Файл Excel','Подтверждение Да/Нет'];state.formFields.push(names[state.formFields.length%names.length]);renderFormFields(); });
  document.getElementById('addSchoolButton').addEventListener('click',()=>showInfoModal('Добавление школы','<p>В рабочей версии начальник РОО или заместитель сможет создать карточку школы, назначить директора и ответственных сотрудников, а также временно блокировать доступ.</p>','Организации'));
  document.getElementById('addDepartmentButton').addEventListener('click',()=>showInfoModal('Добавление подразделения','<p>Подразделение получает собственные направления, сотрудников, маршруты согласования и область видимости данных.</p>','Структура РОО'));
  document.getElementById('addUserButton').addEventListener('click',()=>{ if(!roleConfig().canManageUsers)return showToast('Только начальник РОО может создавать пользователей');openModal('userModal'); });
  document.getElementById('userForm').addEventListener('submit',event=>{ event.preventDefault();closeModal('userModal');addAudit('Создал учётную запись',document.getElementById('newUserName').value,'security');showToast('Учётная запись создана');event.target.reset();renderAudit(); });

  document.getElementById('exportRatingButton').addEventListener('click',exportRating);
  document.getElementById('exportAuditButton').addEventListener('click',exportAudit);
  document.getElementById('generateReportButton').addEventListener('click',generateCustomReport);
  document.getElementById('buildReportButton').addEventListener('click',()=>document.querySelector('.report-builder-panel').scrollIntoView({behavior:'smooth'}));
  document.getElementById('ratingRulesButton').addEventListener('click',()=>showInfoModal('Правила рейтинга','<ul><li><b>40% — соблюдение сроков:</b> выполнено вовремя, просрочка и длительность задержки.</li><li><b>30% — качество:</b> принятие с первого раза и количество возвратов.</li><li><b>20% — полнота:</b> заполнение обязательных полей и наличие файлов.</li><li><b>10% — скорость реакции:</b> время открытия и принятия поручения в работу.</li></ul><p>Важные поручения получают коэффициент ×1,25, срочные ×1,5, критические ×2.</p>','Исполнительская дисциплина'));

  document.getElementById('archiveSearchButton').addEventListener('click',()=>{ const q=dom.archiveSearch.value.trim();dom.archiveSearchResult.innerHTML=q?`Найдено 6 документов по запросу <b>${escapeHTML(q)}</b>. В рабочей версии здесь откроется список файлов и версий.`:'Введите название документа или школы.'; });
  document.getElementById('downloadArchiveButton').addEventListener('click',()=>{const grouped={};getVisibleTasks().forEach(t=>{const d=new Date(t.deadlineDate||t.createdAt||Date.now());const y=d.getMonth()>=7?`${d.getFullYear()}–${d.getFullYear()+1}`:`${d.getFullYear()-1}–${d.getFullYear()}`;grouped[y]=(grouped[y]||0)+1;});const rows=Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0])).map(([year,count])=>[year,count,'']);downloadCSV('perechen_arhiva.csv',[['Учебный год','Поручений','Документов'],...rows]);});
  document.getElementById('addEventButton').addEventListener('click',()=>showToast('В рабочей версии откроется форма события и напоминаний'));

  dom.closeTaskDrawer = document.getElementById('closeTaskDrawer');
  dom.closeTaskDrawer.addEventListener('click',closeTaskDrawer);
  dom.drawerOverlay.addEventListener('click',closeTaskDrawer);
  dom.globalSearch = document.getElementById('globalSearch');
  dom.globalSearch.addEventListener('keydown',event=>{ if(event.key==='Enter') globalSearch(event.target.value); });

  document.addEventListener('keydown',event=>{ if(event.key==='Escape'){ closeTaskDrawer();document.querySelectorAll('.modal-backdrop').forEach(m=>m.classList.add('hidden'));closeFloatingPanels(); } });
  document.addEventListener('click',event=>{ if(!event.target.closest('#notificationPanel')&&!event.target.closest('#notificationButton'))dom.notificationPanel.classList.add('hidden');if(!event.target.closest('#profilePanel')&&!event.target.closest('#userCardButton'))dom.profilePanel.classList.add('hidden'); });
}

function init() {
  initializeDOM();
  bindStaticEvents();
  if (localGet(STORAGE_KEYS.theme)==='light') document.body.classList.add('light-theme');
  const logged = sessionGet('achkhoyEduLoggedV2')==='1';
  if (logged) { dom.loginScreen.classList.add('hidden');dom.app.classList.remove('hidden'); }
  else { dom.loginScreen.classList.remove('hidden');dom.app.classList.add('hidden'); }
  applyRole(state.role);
}

document.addEventListener('DOMContentLoaded',init);
