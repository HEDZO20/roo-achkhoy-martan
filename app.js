(() => {
  'use strict';

  const C = window.ROO_CONFIG || {};
  const E = window.ROOAnalysisEngine;
  let sb = null;
  let me = null;
  let currentPage = 'dashboard';
  let schools = [];
  let departments = [];
  let analysisDocuments = [];
  let currentAnalysis = null;
  let pendingAnalysis = null;
  let pendingAnalysisFile = null;
  let pendingBrandFile = null;
  let branding = {
    logo_url: '',
    background: '#ffffff',
    padding: 8,
    short_name: 'Ачхой-Мартан',
    subtitle: 'Отдел образования',
    full_name: 'Отдел образования Ачхой-Мартановского района'
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const safeFileName = (name) => String(name || 'document')
    .normalize('NFKD')
    .replace(/[^a-zA-Zа-яА-Я0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
  const fmtDate = (value, withTime = false) => value
    ? new Date(value).toLocaleString('ru-RU', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
    : '—';

  const roleNames = {
    pending: 'Ожидает назначения',
    roo_head: 'Начальник РОО',
    roo_deputy: 'Заместитель начальника РОО',
    department_head: 'Начальник отдела',
    department_staff: 'Специалист отдела',
    school_director: 'Директор школы',
    school_staff: 'Сотрудник школы'
  };
  const roleMenus = {
    roo_head: ['dashboard', 'tasks', 'schools', 'exams', 'departments', 'reports', 'users', 'settings'],
    roo_deputy: ['dashboard', 'tasks', 'schools', 'exams', 'departments', 'reports', 'users'],
    department_head: ['dashboard', 'tasks', 'responses', 'exams', 'reports'],
    department_staff: ['dashboard', 'tasks', 'responses', 'exams'],
    school_director: ['dashboard', 'tasks', 'school', 'exams', 'reports', 'staff'],
    school_staff: ['dashboard', 'tasks', 'school', 'exams'],
    pending: ['pending']
  };
  const pages = {
    dashboard: 'Главная', tasks: 'Поручения', schools: 'Школы', school: 'Моя школа',
    exams: 'Анализ экзаменов', departments: 'Отделы', reports: 'Отчёты', users: 'Пользователи и роли',
    settings: 'Настройки', responses: 'Ответы школ', staff: 'Сотрудники', pending: 'Ожидание доступа'
  };
  const analysisRoles = ['roo_head', 'roo_deputy', 'department_head', 'department_staff'];
  const managerRoles = ['roo_head', 'roo_deputy'];

  function toast(text, timeout = 3200) {
    const element = $('#toast');
    if (!element) return;
    element.textContent = text;
    element.classList.add('show');
    window.setTimeout(() => element.classList.remove('show'), timeout);
  }

  function modal(html, wide = false) {
    const dialog = $('#modal');
    const body = $('#modalBody');
    body.innerHTML = html;
    dialog.querySelector('.modal-box')?.classList.toggle('wide', wide);
    dialog.showModal();
  }

  function closeModal() {
    if ($('#modal')?.open) $('#modal').close();
  }

  function empty(title, text, action = '') {
    return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
  }

  function initClient() {
    if (!window.supabase) throw new Error('Не загрузился модуль Supabase');
    if (!C.supabaseUrl || !C.supabaseKey) throw new Error('Не настроены Project URL и Publishable key');
    sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
  }

  async function boot() {
    try {
      initClient();
      await loadBranding();
      bindAuth();
      const { data: { session } } = await sb.auth.getSession();
      if (session) await enter(session.user);
      else showAuth();
    } catch (error) {
      console.error(error);
      applyBranding();
      showAuth();
      toast(error.message || 'Не удалось запустить сайт');
    }
  }

  async function loadBranding() {
    const local = localStorage.getItem('roo_branding_v26');
    if (local) {
      try { branding = { ...branding, ...JSON.parse(local) }; } catch (_) { /* ignored */ }
    }
    if (sb) {
      try {
        const { data, error } = await sb.from('site_settings').select('value').eq('key', 'branding').maybeSingle();
        if (!error && data?.value) branding = { ...branding, ...data.value };
      } catch (_) { /* V26 SQL may not be installed yet */ }
    }
    applyBranding();
  }

  function applyBranding() {
    const logoUrl = branding.logo_url || '';
    const background = branding.background || '#ffffff';
    const padding = Number.isFinite(+branding.padding) ? Math.max(0, Math.min(28, +branding.padding)) : 8;
    document.documentElement.style.setProperty('--logo-bg', background);
    document.documentElement.style.setProperty('--logo-pad', `${padding}px`);

    ['auth', 'side'].forEach((prefix) => {
      const image = $(`#${prefix}BrandImage`);
      const mark = $(`#${prefix}BrandMark`);
      if (!image || !mark) return;
      const fallback = $('.brand-fallback', mark);
      if (logoUrl) {
        // Не прячем запасной знак до успешной загрузки файла.
        // Так битая или удалённая ссылка не показывает значок сломанного изображения.
        image.hidden = true;
        if (fallback) fallback.hidden = false;
        image.onload = () => {
          image.hidden = false;
          if (fallback) fallback.hidden = true;
        };
        image.onerror = () => {
          image.hidden = true;
          if (fallback) fallback.hidden = false;
        };
        image.src = logoUrl;
      } else {
        image.onload = null;
        image.onerror = null;
        image.removeAttribute('src');
        image.hidden = true;
        if (fallback) fallback.hidden = false;
      }
      mark.style.setProperty('--logo-bg', background);
      mark.style.setProperty('--logo-pad', `${padding}px`);
    });

    if ($('#brandShortName')) $('#brandShortName').textContent = branding.short_name || 'Ачхой-Мартан';
    if ($('#brandSubtitle')) $('#brandSubtitle').textContent = branding.subtitle || 'Отдел образования';
    if ($('#authBrandTitle')) $('#authBrandTitle').textContent = branding.full_name || 'Отдел образования Ачхой-Мартановского района';
    document.title = branding.full_name || 'РОО Ачхой-Мартановского района';
  }

  function showAuth() {
    $('#auth').hidden = false;
    $('#app').hidden = true;
  }

  function setAuthStatus(text = '', type = 'info') {
    const element = $('#loginStatus');
    if (!element) return;
    element.textContent = text;
    element.hidden = !text;
    element.style.color = type === 'error' ? '#a12b2b' : type === 'success' ? '#13795b' : '#5f6f68';
  }

  function bindAuth() {
    $$('.tab').forEach((button) => {
      button.onclick = async () => {
        $$('.tab').forEach((item) => item.classList.toggle('active', item === button));
        $('#loginForm').hidden = button.dataset.auth !== 'login';
        $('#registerForm').hidden = button.dataset.auth !== 'register';
        if (button.dataset.auth === 'register') await loadUnitsForRegister();
      };
    });

    const loginForm = $('#loginForm');
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const email = $('#loginEmail').value.trim();
      const password = $('#loginPassword').value;
      const button = $('#loginSubmit');
      if (!email || !password) {
        loginForm.reportValidity();
        return;
      }

      button.disabled = true;
      button.textContent = 'Входим…';
      setAuthStatus('Проверяем почту и пароль…');

      try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
          const message = String(error.message || 'Ошибка входа');
          if (/invalid login credentials/i.test(message)) {
            setAuthStatus('Неверная почта или пароль. Проверьте данные или восстановите пароль.', 'error');
            toast('Неверная почта или пароль.', 5000);
            return;
          }
          if (/email not confirmed/i.test(message)) {
            setAuthStatus('Почта ещё не подтверждена. Откройте письмо Supabase.', 'error');
            toast('Подтвердите почту через письмо Supabase.', 5500);
            return;
          }
          setAuthStatus(message, 'error');
          toast(message, 5000);
          return;
        }

        const user = data?.user || data?.session?.user;
        if (!user) throw new Error('Supabase подтвердил вход, но не вернул пользователя.');

        // V26.3.5 repairs profiles for accounts that existed before the clean migration.
        // A missing RPC does not block an already valid profile.
        let repairError = null;
        try {
          const repair = await sb.rpc('ensure_my_profile');
          repairError = repair.error || null;
        } catch (error) {
          repairError = error;
        }

        const entered = await enter(user, { quietMissing: true });
        if (!entered) {
          const detail = repairError?.message ? ` (${repairError.message})` : '';
          setAuthStatus(`Вход подтверждён, но профиль сотрудника не создан. Выполните PATCH_V26_3_5_LOGIN_PROFILE.sql${detail}`, 'error');
          toast('Вход подтверждён, но профиль сотрудника не найден.', 6500);
          return;
        }

        setAuthStatus('Вход выполнен.', 'success');
      } catch (error) {
        console.error(error);
        setAuthStatus(error.message || 'Не удалось выполнить вход.', 'error');
        toast(error.message || 'Не удалось выполнить вход', 5500);
      } finally {
        button.disabled = false;
        button.textContent = 'Войти';
      }
    });

    const forgotPassword = $('#forgotPassword');
    if (forgotPassword) {
      forgotPassword.onclick = async () => {
        const email = $('#loginEmail').value.trim();
        if (!email) return toast('Сначала укажите рабочую почту.');
        const redirectTo = `${location.origin}${location.pathname}`;
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) return toast(error.message || 'Не удалось отправить письмо', 5000);
        toast('Письмо для смены пароля отправлено. Проверьте входящие и папку «Спам».', 6000);
      };
    }

    sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') openPasswordRecoveryModal();
    });

    $('#registerForm').onsubmit = async (event) => {
      event.preventDefault();
      const metadata = {
        full_name: $('#regName').value.trim(),
        phone: $('#regPhone').value.trim(),
        place: $('#regPlace').value,
        requested_unit_id: $('#regUnit').value || null
      };
      const { error } = await sb.auth.signUp({
        email: $('#regEmail').value.trim(),
        password: $('#regPassword').value,
        options: { data: metadata }
      });
      if (error) {
        const message = String(error.message || 'Ошибка регистрации');
        if (/приглаш|administrator|admin/i.test(message)) {
          return toast('На сервере осталась старая проверка приглашений. Выполните PATCH_V26_3_REMOVE_INVITE_GATE.sql.');
        }
        return toast(message);
      }
      modal('<h2>Заявка отправлена</h2><p>Подтвердите почту. После этого начальник РОО назначит вам роль и организацию.</p>');
    };

    $('#logout').onclick = async () => {
      await sb.auth.signOut();
      location.reload();
    };
    $('#menuBtn').onclick = () => $('.sidebar').classList.toggle('open');
  }

  function openPasswordRecoveryModal() {
    showAuth();
    modal(`<h2>Установите новый пароль</h2>
      <p class="hint">Пароль должен содержать не менее 8 символов.</p>
      <label>Новый пароль<input id="recoveryPassword" type="password" minlength="8" autocomplete="new-password"></label>
      <label>Повторите пароль<input id="recoveryPassword2" type="password" minlength="8" autocomplete="new-password"></label>
      <button id="saveRecoveryPassword" type="button" class="primary">Сохранить пароль</button>`);
    window.setTimeout(() => {
      const button = $('#saveRecoveryPassword');
      if (!button) return;
      button.onclick = async () => {
        const first = $('#recoveryPassword').value;
        const second = $('#recoveryPassword2').value;
        if (first.length < 8) return toast('Минимальная длина пароля — 8 символов.');
        if (first !== second) return toast('Пароли не совпадают.');
        button.disabled = true;
        const { error } = await sb.auth.updateUser({ password: first });
        button.disabled = false;
        if (error) return toast(error.message || 'Не удалось изменить пароль', 5000);
        closeModal();
        toast('Пароль изменён. Теперь можно войти.', 5000);
        await sb.auth.signOut();
        showAuth();
      };
    }, 0);
  }

  async function loadUnitsForRegister() {
    try {
      const [depResult, schoolResult] = await Promise.all([
        sb.from('departments').select('id,name').order('name'),
        sb.from('schools').select('id,short_name,name').order('name')
      ]);
      const list = [
        ...(depResult.data || []).map((item) => ({ id: item.id, name: `РОО — ${item.name}` })),
        ...(schoolResult.data || []).map((item) => ({ id: item.id, name: `Школа — ${item.short_name || item.name}` }))
      ];
      $('#regUnit').innerHTML = '<option value="">Организации нет в списке / выберу позже</option>' +
        list.map((item) => `<option value="${item.id}">${esc(item.name)}</option>`).join('');
    } catch (_) {
      $('#regUnit').innerHTML = '<option value="">Организацию назначит начальник РОО</option>';
    }
  }

  async function enter(user, options = {}) {
    const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error || !data) {
      showAuth();
      if (!options.quietMissing) {
        const detail = error?.message ? `: ${error.message}` : '';
        setAuthStatus(`Вход подтверждён, но профиль сотрудника недоступен${detail}`, 'error');
        toast('Профиль сотрудника не найден. Запустите исправление V26.3.5.', 6000);
      }
      return false;
    }
    me = data;
    $('#auth').hidden = true;
    $('#app').hidden = false;
    $('#userName').textContent = me.full_name || user.email;
    $('#userRole').textContent = roleNames[me.role] || 'Роль не назначена';
    $('#avatar').textContent = (me.full_name || user.email).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    renderNav();
    await navigate(roleMenus[me.role]?.[0] || 'pending');
    return true;
  }

  function renderNav() {
    const menu = roleMenus[me.role] || ['pending'];
    $('#nav').innerHTML = menu.map((key) => `<button class="nav-btn" data-page="${key}">${pages[key]}</button>`).join('');
    $$('.nav-btn').forEach((button) => { button.onclick = () => navigate(button.dataset.page); });
  }

  async function navigate(page) {
    currentPage = page;
    $$('.nav-btn').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
    $('#pageTitle').textContent = pages[page] || page;
    $('#crumb').textContent = branding.short_name || 'Рабочая система РОО';
    $('.sidebar').classList.remove('open');
    const renderer = {
      dashboard: renderDashboard,
      pending: renderPending,
      tasks: renderTasks,
      responses: renderTasks,
      schools: renderSchools,
      school: renderMySchool,
      exams: renderExams,
      reports: renderReports,
      users: renderUsers,
      staff: renderUsers,
      departments: renderDepartments,
      settings: renderSettings
    }[page] || renderDashboard;
    try { await renderer(); } catch (error) {
      console.error(error);
      $('#content').innerHTML = empty('Раздел временно недоступен', error.message || 'Произошла ошибка загрузки');
    }
  }

  async function countRows(table, modifier = (query) => query) {
    try {
      const result = await modifier(sb.from(table).select('id', { count: 'exact', head: true }));
      return result.error ? 0 : (result.count || 0);
    } catch (_) { return 0; }
  }

  async function renderDashboard() {
    const [taskCount, schoolCount, documentCount, pendingCount] = await Promise.all([
      countRows('tasks'),
      countRows('schools'),
      countRows('exam_documents'),
      countRows('profiles', (query) => query.eq('role', 'pending'))
    ]);
    $('#content').innerHTML = `
      <div class="grid cols-4">
        <article class="panel stat"><b>${taskCount || '—'}</b><small>Поручения</small></article>
        <article class="panel stat"><b>${schoolCount || '—'}</b><small>Школы</small></article>
        <article class="panel stat"><b>${documentCount || '—'}</b><small>Аналитические документы</small></article>
        <article class="panel stat"><b>${pendingCount || '—'}</b><small>Новые заявки</small></article>
      </div>
      <div class="grid cols-2" style="margin-top:18px">
        <article class="panel"><h3>Что требует внимания</h3>${pendingCount
          ? `<div class="notice">Новых пользователей без роли: <b>${pendingCount}</b></div>`
          : empty('Нет срочных действий', 'Новые события появятся здесь.')}</article>
        <article class="panel"><h3>Быстрый старт</h3><div class="actions">
          <button class="secondary" data-go="tasks">Создать поручение</button>
          <button class="secondary" data-go="exams">Проанализировать документ</button>
          <button class="secondary" data-go="reports">Собрать отчёт</button>
        </div></article>
      </div>`;
    $$('[data-go]').forEach((button) => { button.onclick = () => navigate(button.dataset.go); });
  }

  async function renderPending() {
    $('#content').innerHTML = `<article class="panel">${empty(
      'Заявка ожидает подтверждения',
      'Начальник РОО должен назначить вам роль и организацию. После назначения выйдите и войдите снова.'
    )}</article>`;
  }

  async function renderTasks() {
    const { data, error } = await sb.from('tasks').select('id,title,description,status,due_at,created_at').order('created_at', { ascending: false }).limit(150);
    if (error) throw error;
    const rows = data || [];
    const canCreate = ['roo_head', 'roo_deputy', 'department_head'].includes(me.role);
    $('#content').innerHTML = `
      <div class="toolbar"><div><h3>Поручения</h3><p class="hint">Создано → в работе → на проверке → принято.</p></div>
      ${canCreate ? '<button id="newTask" class="primary">Новое поручение</button>' : ''}</div>
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Поручение</th><th>Статус</th><th>Срок</th><th>Создано</th></tr></thead><tbody>${rows.map((row) => `
        <tr><td><b>${esc(row.title)}</b><br><small>${esc(row.description || '')}</small></td><td><span class="badge">${esc(row.status || 'Новое')}</span></td><td>${fmtDate(row.due_at)}</td><td>${fmtDate(row.created_at)}</td></tr>`).join('')}</tbody></table></div>`
        : empty('Поручений пока нет', 'Создайте первое поручение для отдела или школы.')}`;
    if ($('#newTask')) $('#newTask').onclick = openTaskModal;
  }

  function openTaskModal() {
    modal(`<h2>Новое поручение</h2>
      <label>Название<input id="mTaskTitle" maxlength="180"></label>
      <label>Описание<textarea id="mTaskDesc"></textarea></label>
      <label>Срок<input id="mTaskDue" type="date"></label>
      <button type="button" id="saveTask" class="primary">Создать</button>`);
    $('#saveTask').onclick = saveTask;
  }

  async function saveTask() {
    const title = $('#mTaskTitle').value.trim();
    if (!title) return toast('Введите название');
    const { error } = await sb.from('tasks').insert({
      title,
      description: $('#mTaskDesc').value.trim(),
      due_at: $('#mTaskDue').value || null,
      status: 'new',
      created_by: me.id
    });
    if (error) return toast(error.message);
    closeModal();
    toast('Поручение создано');
    await renderTasks();
  }

  function schoolPercent(school) {
    const fields = ['name', 'short_name', 'address', 'locality', 'phone', 'email', 'director_name', 'students_total', 'classes_total', 'teachers_total', 'grade9_students', 'grade11_students'];
    return Math.round(fields.filter((key) => school[key] !== null && school[key] !== '' && school[key] !== undefined).length / fields.length * 100);
  }

  async function loadSchools() {
    const { data, error } = await sb.from('schools').select('*').order('name');
    if (error) throw error;
    schools = data || [];
    return schools;
  }

  async function renderSchools() {
    await loadSchools();
    $('#content').innerHTML = `
      <div class="toolbar"><div><h3>Школы</h3><p class="hint">Директор заполняет паспорт, начальник РОО проверяет сведения.</p></div>
      ${managerRoles.includes(me.role) ? '<button id="addSchool" class="primary">Добавить школу</button>' : ''}</div>
      ${schools.length ? `<div class="grid cols-3">${schools.map((school) => `
        <article class="panel school-card" data-school="${school.id}"><h3>${esc(school.short_name || school.name)}</h3><p>${esc(school.locality || 'Населённый пункт не указан')}</p>
          <div class="school-progress"><div class="ring" style="--p:${schoolPercent(school)}%"><b>${schoolPercent(school)}%</b></div><small>Заполнение паспорта</small></div>
          <button class="secondary" style="margin-top:14px" data-edit-school="${school.id}">Открыть паспорт</button>
        </article>`).join('')}</div>` : empty('Школы не добавлены', 'Добавьте справочник школ, затем назначайте директоров.')}`;
    if ($('#addSchool')) $('#addSchool').onclick = () => openSchoolModal({});
    $$('[data-edit-school]').forEach((button) => {
      button.onclick = () => openSchoolModal(schools.find((item) => item.id === button.dataset.editSchool) || {});
    });
  }

  async function renderMySchool() {
    if (!me.school_id) {
      $('#content').innerHTML = empty('Школа не назначена', 'Начальник РОО должен закрепить за вашей учётной записью школу.');
      return;
    }
    const { data, error } = await sb.from('schools').select('*').eq('id', me.school_id).single();
    if (error) throw error;
    $('#content').innerHTML = `<div class="toolbar"><div><h3>${esc(data.short_name || data.name)}</h3><p class="hint">Заполнено ${schoolPercent(data)}%. После заполнения данные можно передать на проверку.</p></div><button id="editMySchool" class="primary">Заполнить паспорт</button></div>
      <div class="grid cols-3"><article class="panel stat"><b>${data.students_total ?? '—'}</b><small>Учеников</small></article><article class="panel stat"><b>${data.teachers_total ?? '—'}</b><small>Педагогов</small></article><article class="panel stat"><b>${data.classes_total ?? '—'}</b><small>Классов</small></article></div>`;
    $('#editMySchool').onclick = () => openSchoolModal(data, true);
  }

  function openSchoolModal(school = {}, own = false) {
    const canSave = managerRoles.includes(me.role) || (own && me.role === 'school_director');
    modal(`<h2>${school.id ? 'Паспорт школы' : 'Новая школа'}</h2>
      <div class="wizard">
        <div class="notice">Заполните сведения поэтапно. Поля можно сохранить как черновик.</div>
        <div class="field-row"><label>Полное название<input id="sName" value="${esc(school.name || '')}"></label><label>Краткое название<input id="sShort" value="${esc(school.short_name || '')}"></label></div>
        <div class="field-row"><label>Населённый пункт<input id="sLoc" value="${esc(school.locality || '')}"></label><label>Адрес<input id="sAddr" value="${esc(school.address || '')}"></label></div>
        <div class="field-row"><label>Телефон<input id="sPhone" value="${esc(school.phone || '')}"></label><label>Почта<input id="sEmail" type="email" value="${esc(school.email || '')}"></label></div>
        <label>Ф.И.О. директора<input id="sDirector" value="${esc(school.director_name || '')}"></label>
        <div class="field-row"><label>Всего учеников<input id="sStudents" type="number" min="0" value="${school.students_total ?? ''}"></label><label>Всего классов<input id="sClasses" type="number" min="0" value="${school.classes_total ?? ''}"></label></div>
        <div class="field-row"><label>Педагогов<input id="sTeachers" type="number" min="0" value="${school.teachers_total ?? ''}"></label><label>Количество смен<input id="sShifts" type="number" min="1" value="${school.shifts_count ?? ''}"></label></div>
        <div class="field-row"><label>Выпускников 9 классов<input id="sGrade9" type="number" min="0" value="${school.grade9_students ?? ''}"></label><label>Выпускников 11 классов<input id="sGrade11" type="number" min="0" value="${school.grade11_students ?? ''}"></label></div>
        <label>Проектная вместимость<input id="sCapacity" type="number" min="0" value="${school.capacity ?? ''}"></label>
        ${canSave ? `<button type="button" id="saveSchool" class="primary">${school.id ? 'Сохранить паспорт' : 'Добавить школу'}</button>` : ''}
      </div>`, true);
    if ($('#saveSchool')) $('#saveSchool').onclick = () => saveSchool(school.id || null);
  }

  async function saveSchool(id) {
    const numeric = (selector) => $('#'+selector).value === '' ? null : Number($('#'+selector).value);
    const payload = {
      name: $('#sName').value.trim(), short_name: $('#sShort').value.trim(), locality: $('#sLoc').value.trim(),
      address: $('#sAddr').value.trim(), phone: $('#sPhone').value.trim(), email: $('#sEmail').value.trim(),
      director_name: $('#sDirector').value.trim(), students_total: numeric('sStudents'), classes_total: numeric('sClasses'),
      teachers_total: numeric('sTeachers'), shifts_count: numeric('sShifts'), grade9_students: numeric('sGrade9'),
      grade11_students: numeric('sGrade11'), capacity: numeric('sCapacity'), updated_at: new Date().toISOString()
    };
    if (!payload.name) return toast('Введите полное название школы');
    const query = id ? sb.from('schools').update(payload).eq('id', id) : sb.from('schools').insert(payload);
    const { error } = await query;
    if (error) return toast(error.message);
    closeModal();
    toast('Паспорт школы сохранён');
    await navigate(currentPage);
  }

  async function loadDepartments() {
    const { data, error } = await sb.from('departments').select('*').order('name');
    if (error) throw error;
    departments = data || [];
    return departments;
  }

  async function renderDepartments() {
    await loadDepartments();
    $('#content').innerHTML = `<div class="toolbar"><div><h3>Отделы РОО</h3><p class="hint">Показатели появляются только при наличии реальных поручений и ответов.</p></div></div>
      <div class="grid cols-3">${departments.map((dep) => `<article class="panel"><h3>${esc(dep.name)}</h3><p>${esc(dep.email || 'Почта не указана')}</p><div class="notice">Рейтинг: <b>—</b><br><small>Будет рассчитан после появления завершённых поручений.</small></div></article>`).join('')}</div>`;
  }

  async function renderUsers() {
    if (!managerRoles.includes(me.role) && currentPage !== 'staff') {
      $('#content').innerHTML = empty('Недостаточно прав', 'Назначать роли может начальник РОО или его заместитель.');
      return;
    }
    let query = sb.from('profiles').select('id,email,full_name,phone,role,status,department_id,school_id,requested_unit_id,created_at').order('created_at', { ascending: false });
    if (currentPage === 'staff' && me.school_id) query = query.eq('school_id', me.school_id);
    const [{ data: users, error }, depResult, schoolResult] = await Promise.all([
      query,
      sb.from('departments').select('id,name').order('name'),
      sb.from('schools').select('id,name,short_name').order('name')
    ]);
    if (error) throw error;
    departments = depResult.data || [];
    schools = schoolResult.data || [];
    const pending = (users || []).filter((u) => u.role === 'pending' || u.status === 'pending');
    const active = (users || []).filter((u) => !pending.includes(u));
    const table = (rows) => rows.length ? `<div class="table-wrap"><table><thead><tr><th>Пользователь</th><th>Роль</th><th>Статус</th><th>Организация</th><th></th></tr></thead><tbody>${rows.map((u) => {
      const dep = departments.find((d) => d.id === u.department_id);
      const school = schools.find((s) => s.id === u.school_id);
      return `<tr><td><b>${esc(u.full_name || 'Без имени')}</b><br><small>${esc(u.email || '')}</small></td><td>${esc(roleNames[u.role] || u.role)}</td><td><span class="badge ${u.status === 'blocked' ? 'danger' : u.status === 'pending' ? 'warn' : ''}">${esc(u.status)}</span></td><td>${esc(dep?.name || school?.short_name || school?.name || 'Не назначена')}</td><td>${managerRoles.includes(me.role) ? `<button class="secondary" data-user="${u.id}">Назначить</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : empty('Пользователей нет', 'Новые заявки появятся после регистрации.');
    $('#content').innerHTML = `<div class="toolbar"><div><h3>Пользователи и роли</h3><p class="hint">Пользователь не выбирает роль сам. Начальник РОО назначает её после регистрации.</p></div></div>
      <article class="panel"><h3>Новые заявки <span class="badge warn">${pending.length}</span></h3>${table(pending)}</article>
      <article class="panel" style="margin-top:18px"><h3>Активные пользователи</h3>${table(active)}</article>`;
    $$('[data-user]').forEach((button) => { button.onclick = () => openAssignModal((users || []).find((u) => u.id === button.dataset.user)); });
  }

  function openAssignModal(user) {
    const roleOptions = Object.entries(roleNames).filter(([key]) => key !== 'pending').map(([key, name]) => `<option value="${key}" ${user.role === key ? 'selected' : ''}>${name}</option>`).join('');
    modal(`<h2>Назначить роль</h2><p><b>${esc(user.full_name || user.email)}</b><br>${esc(user.email || '')}</p>
      <label>Роль<select id="aRole"><option value="pending">Ожидает назначения</option>${roleOptions}</select></label>
      <label>Отдел<select id="aDepartment"><option value="">Не назначен</option>${departments.map((d) => `<option value="${d.id}" ${user.department_id === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
      <label>Школа<select id="aSchool"><option value="">Не назначена</option>${schools.map((s) => `<option value="${s.id}" ${user.school_id === s.id ? 'selected' : ''}>${esc(s.short_name || s.name)}</option>`).join('')}</select></label>
      <label>Статус<select id="aStatus"><option value="active" ${user.status === 'active' ? 'selected' : ''}>Активен</option><option value="pending" ${user.status === 'pending' ? 'selected' : ''}>Ожидает</option><option value="blocked" ${user.status === 'blocked' ? 'selected' : ''}>Заблокирован</option></select></label>
      <button id="saveAssignment" type="button" class="primary">Сохранить</button>`);
    $('#saveAssignment').onclick = async () => {
      const role = $('#aRole').value;
      const departmentId = $('#aDepartment').value || null;
      const schoolId = $('#aSchool').value || null;
      if (['school_director', 'school_staff'].includes(role) && !schoolId) return toast('Для школьной роли выберите школу');
      if (['department_head', 'department_staff'].includes(role) && !departmentId) return toast('Для роли отдела выберите отдел');
      const { error } = await sb.from('profiles').update({
        role,
        status: $('#aStatus').value,
        department_id: departmentId,
        school_id: schoolId,
        updated_at: new Date().toISOString()
      }).eq('id', user.id);
      if (error) return toast(error.message);
      closeModal();
      toast('Роль и организация назначены');
      await renderUsers();
    };
  }

  async function renderExams() {
    if (!analysisRoles.includes(me.role)) {
      $('#content').innerHTML = `<article class="panel"><h3>Результаты вашей школы</h3><p class="hint">Районные документы с пофамильными данными доступны только уполномоченным сотрудникам РОО.</p>${empty('Данные школы появятся здесь', 'После загрузки и утверждения районного анализа вам будут показаны только показатели вашей школы без чужих персональных данных.')}</article>`;
      return;
    }

    const result = await sb.from('exam_documents')
      .select('id,file_name,title,academic_year,exam_type,storage_path,analysis_json,tables_count,subjects_count,warnings_count,created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (result.error) {
      const missingTable = /exam_documents|relation .* does not exist/i.test(result.error.message || '');
      $('#content').innerHTML = `<div class="analysis-upload-card"><div><h3>Умный анализ ГИА, ЕГЭ и ОГЭ</h3><p>Загрузите DOCX, XLSX, XLS или CSV. Система прочитает все таблицы, рассчитает показатели, построит сравнения и сформирует выводы.</p></div><button id="openSmartImport" class="primary">Загрузить документ</button></div>
        <article class="panel">${missingTable
          ? `<div class="issue error"><b>Не установлен SQL V26</b><br>Сначала выполните PATCH_V26_SMART_ANALYSIS.sql в отдельном проекте Supabase для РОО.</div>`
          : `<div class="issue error">${esc(result.error.message)}</div>`}</article>`;
      $('#openSmartImport').onclick = openSmartImportWizard;
      return;
    }

    analysisDocuments = result.data || [];
    if (!currentAnalysis && analysisDocuments[0]?.analysis_json) currentAnalysis = analysisDocuments[0].analysis_json;
    $('#content').innerHTML = `
      <div class="analysis-upload-card"><div><h3>Умный анализ ГИА, ЕГЭ и ОГЭ</h3><p>Сайт понимает районные аналитические справки: таблицы по предметам и школам, динамику, аттестаты, высокие баллы, ОГЭ и ошибки в расчётах.</p></div><div class="actions"><button id="openSmartImport" class="primary">Загрузить и проанализировать</button><button id="openAnalysisHistory" class="secondary">История</button></div></div>
      <div id="analysisHost">${currentAnalysis ? E.renderDashboard(currentAnalysis) : empty('Аналитических документов пока нет', 'Загрузите DOCX или Excel — система покажет полный интерактивный анализ.')}</div>`;
    if (currentAnalysis) E.bindDashboard($('#analysisHost'));
    $('#openSmartImport').onclick = openSmartImportWizard;
    $('#openAnalysisHistory').onclick = showAnalysisHistory;
  }

  function openSmartImportWizard() {
    pendingAnalysis = null;
    pendingAnalysisFile = null;
    modal(`<h2>Полный анализ документа</h2>
      <div class="wizard">
        <div class="steps"><div class="step active">1. Параметры</div><div class="step">2. Чтение таблиц</div><div class="step">3. Проверка</div><div class="step">4. Анализ</div><div class="step">5. Сохранение</div></div>
        <div class="notice"><b>Не нужно переделывать документ под шаблон.</b><br>Система читает сводные таблицы, пофамильные списки, динамику по годам, аттестаты и обычный текст. Одна непонятная строка не блокирует весь документ.</div>
        <div class="field-row"><label>Учебный год<input id="smartYear" value="2025/2026"></label><label>Вид экзамена<select id="smartExam"><option>ГИА</option><option>ЕГЭ</option><option>ОГЭ</option><option>ГВЭ</option><option>Комплексный анализ</option></select></label></div>
        <label class="drop">Выберите DOCX, XLSX, XLS или CSV<input id="smartFile" type="file" accept=".docx,.xlsx,.xls,.csv" style="margin-top:12px"></label>
        <button id="parseSmartFile" type="button" class="primary">Прочитать и полностью проанализировать</button>
        <div id="smartImportResult"></div>
      </div>`, true);
    $('#parseSmartFile').onclick = parseSmartFile;
  }

  async function parseSmartFile() {
    const file = $('#smartFile').files[0];
    if (!file) return toast('Выберите документ');
    if (!E) return toast('Модуль анализа не загрузился');
    pendingAnalysisFile = file;
    const host = $('#smartImportResult');
    const button = $('#parseSmartFile');
    button.disabled = true;
    host.innerHTML = `<div class="parse-progress"><b>Читаем документ…</b><div class="progress"><i style="width:28%"></i></div><small>Извлекаем таблицы и текст, определяем структуру.</small></div>`;
    try {
      const extracted = await E.extractFile(file);
      host.innerHTML = `<div class="parse-progress"><b>Рассчитываем показатели…</b><div class="progress"><i style="width:72%"></i></div><small>Проверяем суммы, проценты, школы, предметы и динамику.</small></div>`;
      await new Promise((resolve) => setTimeout(resolve, 80));
      pendingAnalysis = E.analyze({
        fileName: file.name,
        academicYear: $('#smartYear').value.trim(),
        examType: $('#smartExam').value,
        tables: extracted.tables,
        text: extracted.text
      });
      host.innerHTML = `<div class="notice"><b>Документ распознан.</b> Найдено таблиц: ${pendingAnalysis.tables.length}; предметов: ${pendingAnalysis.subjectResults.length}; замечаний для проверки: ${pendingAnalysis.warnings.length}.</div>
        <div id="smartAnalysisPreview" style="margin-top:16px">${E.renderDashboard(pendingAnalysis)}</div>
        <div class="toolbar" style="margin-top:18px"><button id="saveSmartAnalysis" type="button" class="primary">Сохранить документ и анализ</button><button id="cancelSmartAnalysis" type="button" class="ghost">Не сохранять</button></div>`;
      E.bindDashboard($('#smartAnalysisPreview'));
      $('#saveSmartAnalysis').onclick = saveSmartAnalysis;
      $('#cancelSmartAnalysis').onclick = closeModal;
    } catch (error) {
      console.error(error);
      host.innerHTML = `<div class="issue error"><b>Не удалось обработать документ</b><br>${esc(error.message)}</div>`;
    } finally {
      button.disabled = false;
    }
  }

  async function saveSmartAnalysis() {
    if (!pendingAnalysis || !pendingAnalysisFile) return toast('Сначала выполните анализ');
    const button = $('#saveSmartAnalysis');
    button.disabled = true;
    button.textContent = 'Сохраняем…';
    try {
      const path = `exam-analysis/${me.id}/${Date.now()}_${safeFileName(pendingAnalysisFile.name)}`;
      const upload = await sb.storage.from('roo-exam-analysis').upload(path, pendingAnalysisFile, {
        upsert: false,
        contentType: pendingAnalysisFile.type || undefined
      });
      if (upload.error) throw new Error(`Документ не загружен: ${upload.error.message}`);
      const payload = {
        file_name: pendingAnalysisFile.name,
        title: pendingAnalysis.meta.title,
        academic_year: pendingAnalysis.meta.academicYear,
        exam_type: pendingAnalysis.meta.examType,
        storage_path: path,
        analysis_json: pendingAnalysis,
        tables_count: pendingAnalysis.tables.length,
        subjects_count: pendingAnalysis.subjectResults.length,
        warnings_count: pendingAnalysis.warnings.length,
        created_by: me.id
      };
      const { data, error } = await sb.from('exam_documents').insert(payload).select('id').single();
      if (error) {
        await sb.storage.from('roo-exam-analysis').remove([path]);
        throw error;
      }
      await sb.from('audit_log').insert({ user_id: me.id, action: 'exam_document_analyzed', entity_type: 'exam_document', entity_id: data.id, details: { file_name: pendingAnalysisFile.name, tables: pendingAnalysis.tables.length } });
      currentAnalysis = pendingAnalysis;
      pendingAnalysis = null;
      pendingAnalysisFile = null;
      closeModal();
      toast('Документ и полный анализ сохранены');
      await renderExams();
    } catch (error) {
      console.error(error);
      toast(error.message || 'Не удалось сохранить анализ', 5000);
      button.disabled = false;
      button.textContent = 'Сохранить документ и анализ';
    }
  }

  function showAnalysisHistory() {
    modal(`<h2>История аналитических документов</h2>${analysisDocuments.length ? `<div class="analysis-history">${analysisDocuments.map((doc) => `
      <div class="analysis-history-item"><div><b>${esc(doc.title || doc.file_name)}</b><p>${esc(doc.file_name)} · ${esc(doc.academic_year || '')} · ${fmtDate(doc.created_at, true)}<br>${doc.tables_count || 0} таблиц · ${doc.subjects_count || 0} предметов · ${doc.warnings_count || 0} замечаний</p></div><button type="button" class="secondary" data-open-analysis="${doc.id}">Открыть</button></div>`).join('')}</div>` : empty('История пуста', 'Загруженные документы появятся здесь.')}`, true);
    $$('[data-open-analysis]', $('#modalBody')).forEach((button) => {
      button.onclick = () => {
        const doc = analysisDocuments.find((item) => item.id === button.dataset.openAnalysis);
        if (!doc) return;
        currentAnalysis = doc.analysis_json;
        closeModal();
        $('#analysisHost').innerHTML = E.renderDashboard(currentAnalysis);
        E.bindDashboard($('#analysisHost'));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    });
  }

  async function renderReports() {
    let docs = analysisDocuments;
    if (!docs.length && analysisRoles.includes(me.role)) {
      const result = await sb.from('exam_documents').select('id,file_name,title,academic_year,exam_type,analysis_json,created_at').order('created_at', { ascending: false }).limit(50);
      if (!result.error) docs = result.data || [];
    }
    const available = docs.filter((doc) => doc.analysis_json);
    $('#content').innerHTML = `<div class="toolbar"><div><h3>Конструктор оформленных отчётов</h3><p class="hint">Создаёт единый отчёт РОО по распознанным данным, а не простой список строк.</p></div></div>
      <div class="grid cols-2"><article class="panel">
        <label>Источник анализа<select id="reportDocument">${available.length ? available.map((doc) => `<option value="${doc.id}">${esc(doc.title || doc.file_name)} — ${esc(doc.academic_year || '')}</option>`).join('') : '<option value="">Нет сохранённых анализов</option>'}</select></label>
        <label>Формат<select id="reportFormat"><option value="docx">Word DOCX с диаграммой</option><option value="html">HTML / печать в PDF</option><option value="xlsx">Excel с отдельными листами</option></select></label>
        <button id="buildReport" class="primary" ${available.length ? '' : 'disabled'}>Сформировать отчёт</button>
        <div class="settings-help" style="margin-top:14px">В отчёт входят титульный блок, ключевые показатели, выводы, предметы, школы, динамика, высокие баллы и замечания к данным.</div>
      </article><article class="report-preview"><div class="report-head"><div class="report-logo" id="reportLogoPreview">РОО</div><h2>Информационно-аналитическая справка</h2><p>Ачхой-Мартановский муниципальный район</p></div><h3>Автоматически формируются</h3><p>Таблицы, диаграммы, динамика, сильные стороны, зоны внимания и рекомендации по проверке данных.</p><div class="chart"><div class="bar" style="height:82%"><b>99%</b><span>Русский</span></div><div class="bar" style="height:73%"><b>88%</b><span>Общество</span></div><div class="bar" style="height:90%"><b>95%</b><span>Биология</span></div><div class="bar" style="height:78%"><b>87%</b><span>Химия</span></div></div></article></div>`;
    if ($('#buildReport')) $('#buildReport').onclick = () => buildAnalysisReport(available);
  }

  function getSelectedAnalysis(documents) {
    const id = $('#reportDocument').value;
    const doc = documents.find((item) => item.id === id);
    return doc?.analysis_json || currentAnalysis;
  }

  function makeReportHtml(analysis) {
    const subjects = analysis.subjectRanking || [];
    const schoolsRank = analysis.schoolRanking || [];
    const conclusions = analysis.conclusions || [];
    const maxSuccess = Math.max(100, ...subjects.map((x) => Number(x.success) || 0));
    const logo = branding.logo_url ? `<div class="logo"><img src="${esc(branding.logo_url)}" alt="Логотип"></div>` : '<div class="logo fallback">РОО</div>';
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(analysis.meta.title)}</title><style>
      @page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#183326;margin:0;line-height:1.42}.cover{text-align:center;min-height:245mm;display:flex;flex-direction:column;align-items:center;justify-content:center;page-break-after:always}.logo{width:105px;height:105px;border-radius:24px;display:grid;place-items:center;background:${esc(branding.background || '#fff')};padding:${Number(branding.padding)||0}px;margin:auto}.logo img{width:100%;height:100%;object-fit:contain}.logo.fallback{background:#176b4d;color:white;font-weight:bold;font-size:26px}.cover h1{font-size:25px;margin:30px 0 10px}.cover h2{font-size:18px;font-weight:normal}.section{page-break-inside:avoid;margin:24px 0}h2{color:#176b4d;border-bottom:2px solid #176b4d;padding-bottom:7px}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:10.5pt}th,td{border:1px solid #9aafa1;padding:6px 7px;text-align:left}th{background:#dfece2}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.kpi{border:1px solid #b9ccbe;border-radius:10px;padding:12px;text-align:center}.kpi b{font-size:23px;color:#176b4d}.conclusion{padding:10px 12px;margin:8px 0;border-left:5px solid #176b4d;background:#f2f7f3}.bars{display:grid;gap:8px}.barrow{display:grid;grid-template-columns:160px 1fr 55px;gap:10px;align-items:center}.track{height:14px;background:#e5ede7;border-radius:99px;overflow:hidden}.fill{height:100%;background:#2b7c59}.footer{margin-top:35px;display:flex;justify-content:space-between}.muted{color:#61766a;font-size:9.5pt}</style></head><body>
      <section class="cover">${logo}<h1>${esc(branding.full_name || 'Отдел образования Ачхой-Мартановского района')}</h1><h2>${esc(analysis.meta.title)}</h2><p>${esc(analysis.meta.examType)} · ${esc(analysis.meta.academicYear)}</p><p class="muted">Сформировано системой ${new Date().toLocaleDateString('ru-RU')}</p></section>
      <section class="section"><h2>1. Основные показатели</h2><div class="kpis"><div class="kpi"><b>${analysis.kpi?.participants ?? '—'}</b><br>участников</div><div class="kpi"><b>${analysis.kpi?.subjects ?? '—'}</b><br>предметов</div><div class="kpi"><b>${analysis.kpi?.schools ?? '—'}</b><br>школ</div><div class="kpi"><b>${analysis.kpi?.highScores ?? '—'}</b><br>высоких баллов</div><div class="kpi"><b>${analysis.kpi?.certificates ?? '—'}</b><br>аттестатов</div><div class="kpi"><b>${analysis.kpi?.warnings ?? 0}</b><br>замечаний</div></div></section>
      <section class="section"><h2>2. Аналитические выводы</h2>${conclusions.map((item) => `<div class="conclusion"><b>${esc(item.title)}</b><br>${esc(item.text)}</div>`).join('') || '<p>Выводы не сформированы.</p>'}</section>
      <section class="section"><h2>3. Успеваемость по предметам</h2><div class="bars">${subjects.map((item) => `<div class="barrow"><span>${esc(item.subject)}</span><div class="track"><div class="fill" style="width:${Math.max(1,(Number(item.success)||0)/maxSuccess*100)}%"></div></div><b>${item.success ?? '—'}%</b></div>`).join('')}</div></section>
      <section class="section"><h2>4. Сводные результаты по предметам</h2><table><thead><tr><th>Предмет</th><th>Всего</th><th>5</th><th>4</th><th>3</th><th>2</th><th>Сдали</th><th>Не сдали</th><th>КЗ</th><th>Усп.</th></tr></thead><tbody>${subjects.map((item) => `<tr><td>${esc(item.subject)}</td><td>${item.total}</td><td>${item.count5}</td><td>${item.count4}</td><td>${item.count3}</td><td>${item.count2}</td><td>${item.passed}</td><td>${item.failed}</td><td>${item.quality ?? '—'}%</td><td>${item.success ?? '—'}%</td></tr>`).join('')}</tbody></table></section>
      <section class="section"><h2>5. Сравнение школ</h2><table><thead><tr><th>№</th><th>Школа</th><th>Предметов</th><th>Участий</th><th>КЗ</th><th>Усп.</th><th>Средняя оценка</th></tr></thead><tbody>${schoolsRank.map((item, index) => `<tr><td>${index+1}</td><td>${esc(item.school)}</td><td>${item.subjects}</td><td>${item.participants}</td><td>${item.quality ?? '—'}%</td><td>${item.success ?? '—'}%</td><td>${item.avg ?? '—'}</td></tr>`).join('')}</tbody></table></section>
      ${(analysis.averageScores || []).length ? `<section class="section"><h2>6. Динамика среднего тестового балла</h2><table><thead><tr><th>Предмет</th><th>2024</th><th>2025</th><th>2026</th><th>Изменение 2025→2026</th></tr></thead><tbody>${analysis.averageScores.map((item) => `<tr><td>${esc(item.subject)}</td><td>${item.y2024 ?? '—'}</td><td>${item.y2025 ?? '—'}</td><td>${item.y2026 ?? '—'}</td><td>${item.y2025 !== null && item.y2026 !== null ? `${item.y2026-item.y2025>=0?'+':''}${(item.y2026-item.y2025).toFixed(1)}` : '—'}</td></tr>`).join('')}</tbody></table></section>` : ''}
      ${(analysis.highScores || []).length ? `<section class="section"><h2>7. Высокие результаты (80+)</h2><table><thead><tr><th>№</th><th>Школа</th><th>Ф.И.О.</th><th>Предмет</th><th>Баллы</th></tr></thead><tbody>${analysis.highScores.map((item,index) => `<tr><td>${index+1}</td><td>${esc(item.school)}</td><td>${esc(item.name)}</td><td>${esc(item.subject)}</td><td>${item.score}</td></tr>`).join('')}</tbody></table></section>` : ''}
      <section class="section"><h2>8. Проверка качества данных</h2>${(analysis.warnings || []).length ? `<table><thead><tr><th>Таблица</th><th>Строка</th><th>Замечание</th></tr></thead><tbody>${analysis.warnings.map((item) => `<tr><td>${esc(item.table || '')}</td><td>${item.row || '—'}</td><td>${esc(item.text)}</td></tr>`).join('')}</tbody></table>` : '<p>Расхождений не найдено.</p>'}</section>
      <div class="footer"><span>Ответственный: ____________________</span><span>Дата: ____________________</span></div>
      </body></html>`;
  }

  async function buildAnalysisReport(documents) {
    const analysis = getSelectedAnalysis(documents);
    if (!analysis) return toast('Выберите сохранённый анализ');
    const format = $('#reportFormat').value;
    if (format === 'xlsx') return exportAnalysisXlsx(analysis);
    const base = `Анализ_${safeFileName(analysis.meta.examType)}_${safeFileName(analysis.meta.academicYear)}`;
    if (format === 'docx') {
      if (!window.ROODocxExporter) return toast('Модуль DOCX не загрузился');
      try {
        await window.ROODocxExporter.export(analysis, branding, `${base}.docx`);
        toast('DOCX с диаграммой сформирован');
      } catch (error) {
        console.error(error);
        toast(`Не удалось создать DOCX: ${error.message}`, 5000);
      }
      return;
    }
    const html = makeReportHtml(analysis);
    const win = window.open('', '_blank');
    if (!win) return toast('Браузер заблокировал новое окно');
    win.document.write(html);
    win.document.close();
    window.setTimeout(() => win.print(), 350);
  }

  function exportAnalysisXlsx(analysis) {
    if (!window.XLSX) return toast('Модуль Excel не загрузился');
    const wb = XLSX.utils.book_new();
    const summary = [
      [branding.full_name], [analysis.meta.title], ['Учебный год', analysis.meta.academicYear], ['Вид экзамена', analysis.meta.examType],
      ['Дата формирования', new Date().toLocaleString('ru-RU')], [],
      ['Показатель', 'Значение'], ['Участников', analysis.kpi?.participants], ['Предметов', analysis.kpi?.subjects], ['Школ', analysis.kpi?.schools],
      ['Высоких баллов', analysis.kpi?.highScores], ['Аттестатов', analysis.kpi?.certificates], ['Замечаний', analysis.kpi?.warnings], [],
      ['Автоматические выводы'], ...(analysis.conclusions || []).map((item) => [item.title, item.text])
    ];
    const subjectRows = (analysis.subjectRanking || []).map((item) => ({
      'Предмет': item.subject, 'Всего': item.total, '5': item.count5, '4': item.count4, '3': item.count3, '2': item.count2,
      'Сдали': item.passed, 'Не сдали': item.failed, 'Качество знаний, %': item.quality, 'Успеваемость, %': item.success, 'Средняя оценка': item.avg
    }));
    const schoolRows = (analysis.schoolRanking || []).map((item, index) => ({
      '№': index + 1, 'Школа': item.school, 'Предметов': item.subjects, 'Участий': item.participants, 'Сдали': item.passed,
      'Не сдали': item.failed, 'Качество знаний, %': item.quality, 'Успеваемость, %': item.success, 'Средняя оценка': item.avg
    }));
    const highRows = (analysis.highScores || []).map((item, index) => ({ '№': index + 1, 'Школа': item.school, 'Ф.И.О.': item.name, 'Предмет': item.subject, 'Баллы': item.score }));
    const warningRows = (analysis.warnings || []).map((item) => ({ 'Таблица': item.table, 'Строка': item.row || '', 'Уровень': item.level, 'Замечание': item.text }));
    const dynamicsRows = (analysis.averageScores || []).map((item) => ({ 'Предмет': item.subject, '2024': item.y2024, '2025': item.y2025, '2026': item.y2026, 'Динамика 2026': item.d2026 }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Сводка');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subjectRows), 'Предметы');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(schoolRows), 'Школы');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dynamicsRows), 'Динамика');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(highRows), 'Высокие баллы');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(warningRows), 'Проверка данных');
    XLSX.writeFile(wb, `Анализ_${safeFileName(analysis.meta.examType)}_${safeFileName(analysis.meta.academicYear)}.xlsx`);
    toast('Excel сформирован');
  }

  function download(blob, name) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1500);
  }

  async function renderSettings() {
    if (me.role !== 'roo_head') {
      $('#content').innerHTML = empty('Недостаточно прав', 'Менять логотип и оформление может только начальник РОО.');
      return;
    }
    $('#content').innerHTML = `<div class="toolbar"><div><h3>Фирменное оформление</h3><p class="hint">Логотип автоматически вписывается без обрезки. Для непрозрачного PNG фон определяется по краям изображения.</p></div></div>
      <article class="panel"><div class="logo-preview-shell"><div class="logo-preview-stage"><div class="brand-mark" id="logoPreviewMark"><img id="logoPreviewImage" alt="Предпросмотр" ${branding.logo_url ? `src="${esc(branding.logo_url)}"` : 'hidden'}><span class="brand-fallback" ${branding.logo_url ? 'hidden' : ''}>РОО</span></div></div>
      <div class="logo-controls"><label>PNG, JPG, SVG или WebP<input id="brandFile" type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/*"></label>
        <div class="color-row"><label>Фон вокруг логотипа<input id="brandBackgroundText" value="${esc(branding.background || '#ffffff')}"></label><input id="brandBackgroundColor" type="color" value="${normalizeHexColor(branding.background)}" title="Выбрать цвет"></div>
        <div class="range-row"><label>Внутренний отступ<input id="brandPadding" type="range" min="0" max="28" value="${Number(branding.padding) || 0}"></label><output id="brandPaddingValue">${Number(branding.padding) || 0}px</output></div>
        <label>Краткое название<input id="brandShort" value="${esc(branding.short_name || '')}"></label>
        <label>Подпись<input id="brandSub" value="${esc(branding.subtitle || '')}"></label>
        <label>Полное название<input id="brandFull" value="${esc(branding.full_name || '')}"></label>
        <div class="actions"><button id="saveBranding" class="primary">Сохранить оформление</button><button id="removeBranding" class="danger">Убрать логотип</button></div>
        <div class="settings-help"><b>Как работает адаптация:</b> прозрачный PNG остаётся прозрачным; у изображения с фоном система анализирует крайние пиксели и устанавливает такой же фон контейнера. <code>object-fit: contain</code> исключает обрезку.</div>
      </div></div></article>`;

    const fileInput = $('#brandFile');
    const backgroundText = $('#brandBackgroundText');
    const backgroundColor = $('#brandBackgroundColor');
    const padding = $('#brandPadding');
    const previewMark = $('#logoPreviewMark');
    const previewImage = $('#logoPreviewImage');
    const fallback = $('.brand-fallback', previewMark);

    const refreshPreview = () => {
      previewMark.style.setProperty('--logo-bg', backgroundText.value || '#ffffff');
      previewMark.style.setProperty('--logo-pad', `${padding.value}px`);
      $('#brandPaddingValue').textContent = `${padding.value}px`;
    };
    backgroundText.oninput = () => { backgroundColor.value = normalizeHexColor(backgroundText.value); refreshPreview(); };
    backgroundColor.oninput = () => { backgroundText.value = backgroundColor.value; refreshPreview(); };
    padding.oninput = refreshPreview;

    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      if (!file) return;
      pendingBrandFile = file;
      const url = URL.createObjectURL(file);
      previewImage.src = url;
      previewImage.hidden = false;
      fallback.hidden = true;
      try {
        const detected = await E.detectLogoBackground(file);
        backgroundText.value = detected.background;
        backgroundColor.value = normalizeHexColor(detected.background);
        refreshPreview();
        toast(detected.transparent ? 'Прозрачный фон распознан' : 'Цвет фона подобран автоматически');
      } catch (error) {
        toast(error.message);
      }
      previewImage.onload = () => URL.revokeObjectURL(url);
    };

    $('#saveBranding').onclick = saveBrandingSettings;
    $('#removeBranding').onclick = removeBrandingLogo;
    refreshPreview();
  }

  function normalizeHexColor(value) {
    const text = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text;
    const match = text.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (match) return `#${[match[1], match[2], match[3]].map((x) => Math.max(0, Math.min(255, Number(x))).toString(16).padStart(2, '0')).join('')}`;
    return '#ffffff';
  }

  async function saveBrandingSettings() {
    const button = $('#saveBranding');
    button.disabled = true;
    button.textContent = 'Сохраняем…';
    try {
      let logoUrl = branding.logo_url || '';
      if (pendingBrandFile) {
        const extension = (pendingBrandFile.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        const path = `branding/logo.${extension}`;
        const upload = await sb.storage.from('roo-public').upload(path, pendingBrandFile, { upsert: true, contentType: pendingBrandFile.type || undefined });
        if (upload.error) throw new Error(`Логотип не загружен: ${upload.error.message}`);
        const { data } = sb.storage.from('roo-public').getPublicUrl(path);
        logoUrl = `${data.publicUrl}?v=${Date.now()}`;
      }
      const next = {
        logo_url: logoUrl,
        background: $('#brandBackgroundText').value.trim() || '#ffffff',
        padding: Number($('#brandPadding').value) || 0,
        short_name: $('#brandShort').value.trim() || 'Ачхой-Мартан',
        subtitle: $('#brandSub').value.trim() || 'Отдел образования',
        full_name: $('#brandFull').value.trim() || 'Отдел образования Ачхой-Мартановского района'
      };
      const { error } = await sb.from('site_settings').upsert({ key: 'branding', value: next, updated_by: me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      branding = next;
      localStorage.setItem('roo_branding_v26', JSON.stringify(branding));
      pendingBrandFile = null;
      applyBranding();
      toast('Логотип и оформление сохранены');
      await renderSettings();
    } catch (error) {
      console.error(error);
      toast(error.message || 'Не удалось сохранить оформление', 5000);
    } finally {
      button.disabled = false;
      button.textContent = 'Сохранить оформление';
    }
  }

  async function removeBrandingLogo() {
    const next = { ...branding, logo_url: '', background: '#ffffff', padding: 8 };
    const { error } = await sb.from('site_settings').upsert({ key: 'branding', value: next, updated_by: me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return toast(error.message);
    branding = next;
    localStorage.setItem('roo_branding_v26', JSON.stringify(branding));
    pendingBrandFile = null;
    applyBranding();
    toast('Логотип удалён');
    await renderSettings();
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
