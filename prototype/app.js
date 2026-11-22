(() => {
  'use strict';

  /* ============================ константы ============================ */
  const LS_KEY = 'studiocrm.studio.v2';
  const PX_PER_MIN = 1.05;
  const DAY_START = 9 * 60;
  const DAY_END = 22 * 60;
  const TOTAL_MIN = DAY_END - DAY_START;
  const DURATIONS = [45, 60, 75, 90, 120];
  const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const DAY_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const LEVELS = { beginner: 'начинающие', intermediate: 'средние', advanced: 'продвинутые', none: 'без уровня' };
  const KINDS = { group: 'групповой', individual: 'индивидуальный' };
  const ROLE_LABEL = {
    owner: 'Владелец', admin: 'Администратор', curator: 'Куратор',
    teacher: 'Преподаватель', assistant: 'Ассистент', student: 'Ученик'
  };
  const ROLES = Object.keys(ROLE_LABEL);
  const PERM = {
    'studio.write': ['owner', 'admin'],
    'studio.archive': ['owner'],
    'members.write': ['owner', 'admin'],
    'students.write': ['owner', 'admin', 'curator'],
    'rooms.write': ['owner', 'admin', 'curator'],
    'courses.write': ['owner', 'admin', 'curator'],
    'schedule.write': ['owner', 'admin', 'curator']
  };
  const COLORS = ['#7c3aed', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6'];

  /* ============================ утилиты ============================ */
  const pad = n => String(n).padStart(2, '0');
  const fmt = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = p => p + Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-3);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const parseTime = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };

  const dateKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseKey = k => { const p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const startOfWeek = base => {
    const d = new Date(base);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const fmtShort = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1);
  const fmtFull = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  const tint = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  };

  /* ============================ демо-данные ============================ */
  const hours = (from, to, closed) => ({ from: from, to: to, closed: !!closed });

  function seed() {
    return {
      studio: {
        name: 'Dance Lab',
        timezone: 'Europe/Moscow',
        archived: false,
        hours: [
          hours('09:00', '22:00'), hours('09:00', '22:00'), hours('09:00', '22:00'),
          hours('09:00', '22:00'), hours('09:00', '22:00'), hours('09:00', '20:00'),
          hours('09:00', '22:00', true)
        ]
      },
      members: [
        { id: 'm1', name: 'Анна Ковалёва', email: 'anna@dancelab.ru', color: '#7c3aed', roles: ['owner', 'teacher'], status: 'active' },
        { id: 'm2', name: 'Мария Соколова', email: 'maria@dancelab.ru', color: '#0ea5e9', roles: ['admin', 'teacher'], status: 'active' },
        { id: 'm3', name: 'Игорь Петров', email: 'igor@dancelab.ru', color: '#f59e0b', roles: ['curator'], status: 'active' },
        { id: 'm4', name: 'Елена Смирнова', email: 'elena@dancelab.ru', color: '#10b981', roles: ['teacher'], status: 'active' },
        { id: 'm5', name: 'Олег Смирнов', email: 'oleg@dancelab.ru', color: '#8b5cf6', roles: ['assistant'], status: 'active' },
        { id: 'm6', name: 'Алиса Ветрова', email: 'alisa@example.com', color: '#14b8a6', roles: ['student'], status: 'active' }
      ],
      directory: [
        { name: 'Пётр Сидоров', email: 'petr@studio.ru' },
        { name: 'Дарья Лебедева', email: 'darya@studio.ru' },
        { name: 'Тимур Асланов', email: 'timur@studio.ru' }
      ],
      rooms: [
        { id: 'r1', name: 'Зал А', capacity: 25, note: 'Большой зал · 80 м²', archived: false },
        { id: 'r2', name: 'Зал Б', capacity: 14, note: 'Малый зал · 45 м²', archived: false },
        { id: 'r3', name: 'Зал В', capacity: 18, note: 'Зеркальный · 60 м²', archived: false }
      ],
      courses: [
        { id: 'c1', name: 'Hip-Hop · начинающие', direction: 'Hip-Hop', level: 'beginner', kind: 'group', duration: 90, capacity: 14, archived: false },
        { id: 'c2', name: 'Hip-Hop · продвинутые', direction: 'Hip-Hop', level: 'advanced', kind: 'group', duration: 90, capacity: 12, archived: false },
        { id: 'c3', name: 'Contemporary · средние', direction: 'Contemporary', level: 'intermediate', kind: 'group', duration: 90, capacity: 10, archived: false },
        { id: 'c4', name: 'Stretching', direction: 'Body', level: 'none', kind: 'group', duration: 60, capacity: 12, archived: false },
        { id: 'c5', name: 'Открытый класс', direction: 'Hip-Hop', level: 'none', kind: 'group', duration: 120, capacity: 22, archived: false },
        { id: 'c6', name: 'Свадебный танец', direction: 'Ballroom', level: 'none', kind: 'individual', duration: 90, capacity: 2, archived: false }
      ],
      sessions: [
        { id: 's01', courseId: 'c4', memberId: 'm4', roomId: 'r2', repeat: 'weekly', weekday: 0, start: 600, duration: 60, until: null },
        { id: 's02', courseId: 'c1', memberId: 'm1', roomId: 'r1', repeat: 'weekly', weekday: 0, start: 1080, duration: 90, until: null },
        { id: 's03', courseId: 'c3', memberId: 'm2', roomId: 'r2', repeat: 'weekly', weekday: 1, start: 1140, duration: 90, until: null },
        { id: 's04', courseId: 'c2', memberId: 'm1', roomId: 'r1', repeat: 'weekly', weekday: 2, start: 1110, duration: 90, until: null },
        { id: 's05', courseId: 'c4', memberId: 'm4', roomId: 'r2', repeat: 'weekly', weekday: 2, start: 1200, duration: 60, until: null },
        { id: 's06', courseId: 'c3', memberId: 'm2', roomId: 'r1', repeat: 'weekly', weekday: 3, start: 1140, duration: 90, until: null },
        { id: 's07', courseId: 'c1', memberId: 'm1', roomId: 'r1', repeat: 'weekly', weekday: 4, start: 1170, duration: 90, until: null },
        { id: 's08', courseId: 'c4', memberId: 'm4', roomId: 'r3', repeat: 'weekly', weekday: 5, start: 780, duration: 60, until: null },
        { id: 's09', courseId: 'c5', memberId: 'm1', roomId: 'r1', repeat: 'weekly', weekday: 5, start: 960, duration: 120, until: null },
        { id: 's10', courseId: 'c6', memberId: 'm2', roomId: 'r1', repeat: 'once', weekday: null, start: 1020, duration: 90, until: null, date: null }
      ],
      me: 'm1'
    };
  }

  let db;
  try {
    const raw = localStorage.getItem(LS_KEY);
    db = raw ? JSON.parse(raw) : seed();
    if (!db || !db.studio || !Array.isArray(db.sessions)) db = seed();
  } catch (e) { db = seed(); }

  (function fixOnce() {
    const once = db.sessions.find(s => s.repeat === 'once' && !s.date);
    if (once) {
      once.date = dateKey(addDays(startOfWeek(new Date()), 5));
      save();
    }
  })();

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
  }

  /* ============================ выборки ============================ */
  const roomById = id => db.rooms.find(r => r.id === id);
  const courseById = id => db.courses.find(c => c.id === id);
  const memberById = id => db.members.find(m => m.id === id);
  const activeMembers = () => db.members.filter(m => m.status === 'active');
  const teachers = () => activeMembers().filter(m => m.roles.includes('teacher'));
  const me = () => memberById(db.me) || db.members[0];
  const roles = () => (me() ? me().roles : []);
  const can = action => (PERM[action] || []).some(r => roles().includes(r));
  const titleOf = s => (courseById(s.courseId) || {}).name || 'Курс';
  const roleChips = list => list.map(r => '<span class="chip' + (r === 'owner' ? ' owner' : r === 'student' ? ' student' : '') + '">' + ROLE_LABEL[r] + '</span>').join('');

  /* ============================ состояние UI ============================ */
  const ui = {
    view: 'schedule',
    weekOffset: 0,
    filters: { teacher: '', room: '', course: '' },
    editingSession: null,
    editingMember: null
  };

  /* ============================ повторяемость и конфликты ============================ */
  function occursOn(s, day, dayIndex) {
    if (s.repeat === 'once') return s.date === dateKey(day);
    if (s.weekday !== dayIndex) return false;
    if (s.until && dateKey(day) > s.until) return false;
    return true;
  }

  function weekStartDate() {
    const d = startOfWeek(new Date());
    d.setDate(d.getDate() + ui.weekOffset * 7);
    return d;
  }

  function weekOccurrences() {
    const ws = weekStartDate();
    const out = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(ws, i);
      for (const s of db.sessions) {
        if (occursOn(s, day, i)) out.push({ s, day, i, start: s.start, end: s.start + s.duration });
      }
    }
    return out;
  }

  function matchesFilters(o) {
    const f = ui.filters;
    return (!f.teacher || o.s.memberId === f.teacher)
      && (!f.room || o.s.roomId === f.room)
      && (!f.course || o.s.courseId === f.course);
  }

  function assignLanes(list) {
    list.sort((a, b) => a.start - b.start || a.end - b.end);
    const ends = [];
    for (const it of list) {
      let lane = ends.findIndex(e => e <= it.start);
      if (lane === -1) { lane = ends.length; ends.push(it.end); } else ends[lane] = it.end;
      it.lane = lane;
    }
    const total = Math.max(ends.length, 1);
    list.forEach(it => { it.lanes = total; });
  }

  function eachOccurrence(s, from, to, cb) {
    if (s.repeat === 'once') {
      if (!s.date) return;
      const d = parseKey(s.date);
      if (d >= from && d <= to) cb(d, s.start, s.start + s.duration);
      return;
    }
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + (s.weekday - ((d.getDay() + 6) % 7) + 7) % 7);
    let guard = 0;
    while (d <= to && guard++ < 420) {
      if (!s.until || dateKey(d) <= s.until) cb(new Date(d), s.start, s.start + s.duration);
      d.setDate(d.getDate() + 7);
    }
  }

  function occurrencesInRange(s, from, to) {
    const arr = [];
    eachOccurrence(s, from, to, (d, start, end) => arr.push({ key: dateKey(d), s: start, e: end }));
    return arr;
  }

  function findConflicts(cand, ignoreId) {
    const from = addDays(startOfWeek(new Date()), -7);
    from.setHours(0, 0, 0, 0);
    const to = addDays(from, 380);
    const mine = occurrencesInRange(cand, from, to);
    const msgs = [];

    for (const other of db.sessions) {
      if (other.id === ignoreId) continue;
      const sameRoom = other.roomId === cand.roomId;
      const sameTeacher = other.memberId === cand.memberId;
      if (!sameRoom && !sameTeacher) continue;

      let hit = null;
      for (const b of occurrencesInRange(other, from, to)) {
        for (const a of mine) {
          if (a.key === b.key && a.s < b.e && b.s < a.e) { hit = { a, b }; break; }
        }
        if (hit) break;
      }
      if (!hit) continue;

      const d = parseKey(hit.a.key);
      const dow = (d.getDay() + 6) % 7;
      const dateSpecific = cand.repeat === 'once' || other.repeat === 'once';
      const when = DAY_NAMES[dow] + ', ' + fmt(hit.b.s) + '–' + fmt(hit.b.e) + (dateSpecific ? ', ' + fmtFull(d) : '');

      if (sameRoom) msgs.push('Зал «' + ((roomById(cand.roomId) || {}).name || '') + '» занят: «' + titleOf(other) + '» ' + when);
      if (sameTeacher) msgs.push(((memberById(cand.memberId) || {}).name || 'Преподаватель') + ' уже ведёт «' + titleOf(other) + '» ' + when);
    }
    return msgs;
  }

  function workingHoursError(s) {
    const weekday = s.repeat === 'once' ? (s.date ? (parseKey(s.date).getDay() + 6) % 7 : null) : s.weekday;
    if (weekday === null || weekday === undefined) return '';
    const h = db.studio.hours[weekday];
    if (!h) return '';
    if (h.closed) return 'В ' + DAY_FULL[weekday].toLowerCase() + ' студия не работает';
    const from = parseTime(h.from), to = parseTime(h.to);
    if (s.start < from || s.start + s.duration > to) {
      return 'Сеанс выходит за рабочие часы студии (' + h.from + '–' + h.to + ')';
    }
    return '';
  }

  function capacityWarning(cand) {
    const course = courseById(cand.courseId), room = roomById(cand.roomId);
    if (course && room && course.capacity > room.capacity) {
      return 'Курс «' + course.name + '» рассчитан на ' + course.capacity + ' человек — больше вместимости «' +
        room.name + '» (' + room.capacity + '). Сохранить можно, но стоит выбрать зал побольше.';
    }
    return '';
  }

  /* ============================ операции с участниками ============================ */
  function addMember(email, chosenRoles) {
    const e = String(email || '').trim().toLowerCase();
    if (!chosenRoles || !chosenRoles.length) return { ok: false, error: 'Выберите хотя бы одну роль.' };
    if (db.members.some(m => m.email.toLowerCase() === e)) {
      return { ok: false, error: 'Этот пользователь уже участвует в студии.' };
    }
    const person = db.directory.find(p => p.email.toLowerCase() === e);
    if (!person) {
      return { ok: false, error: 'Пользователь с таким email не зарегистрирован. Аккаунт создаёт сам пользователь или ИТ-администратор.' };
    }
    const member = {
      id: uid('m'), name: person.name, email: person.email,
      color: COLORS[db.members.length % COLORS.length], roles: chosenRoles.slice(), status: 'active'
    };
    db.members.push(member);
    db.directory = db.directory.filter(p => p.email.toLowerCase() !== e);
    return { ok: true, member: member };
  }

  function updateMemberRoles(id, chosenRoles) {
    const m = memberById(id);
    if (!m) return { ok: false, error: 'Участник не найден.' };
    if (!chosenRoles || !chosenRoles.length) return { ok: false, error: 'Выберите хотя бы одну роль.' };
    if (m.roles.includes('owner') && !chosenRoles.includes('owner')) {
      return { ok: false, error: 'В студии должен остаться владелец: сначала передайте владение.' };
    }
    m.roles = chosenRoles.slice();
    return { ok: true };
  }

  function transferOwnership(id) {
    const m = memberById(id);
    if (!m || m.status !== 'active') return { ok: false, error: 'Участник не найден или деактивирован.' };
    if (m.roles.includes('owner')) return { ok: false, error: 'Этот участник уже владелец.' };
    const current = db.members.find(x => x.roles.includes('owner'));
    if (current) {
      current.roles = current.roles.filter(r => r !== 'owner');
      if (!current.roles.includes('admin')) current.roles.push('admin');
    }
    m.roles.push('owner');
    return { ok: true };
  }

  function deactivateMember(id) {
    const m = memberById(id);
    if (!m) return { ok: false, error: 'Участник не найден.' };
    if (m.roles.includes('owner')) return { ok: false, error: 'Владельца нельзя деактивировать: сначала передайте владение.' };
    m.status = 'disabled';
    return { ok: true };
  }

  function validateCourse(name, capacity) {
    const errors = [];
    if (name.length < 2 || name.length > 140) errors.push('Название курса: от 2 до 140 символов.');
    else if (db.courses.some(c => c.name.toLowerCase() === name.toLowerCase())) errors.push('Курс с таким названием уже есть.');
    if (!capacity || capacity < 1) errors.push('Вместимость должна быть больше нуля.');
    return errors;
  }

  /* ============================ рендер: шапка ============================ */
  function renderHeader() {
    qs('#studio-label').textContent = db.studio.name + (db.studio.archived ? ' · архив' : '');
    qs('#actor').innerHTML = activeMembers().map(m =>
      '<option value="' + m.id + '">' + esc(m.name) + ' — ' + m.roles.map(r => ROLE_LABEL[r]).join(', ') + '</option>').join('');
    qs('#actor').value = db.me;
    qs('#btn-new').hidden = !can('schedule.write') || db.studio.archived;
  }

  /* ============================ рендер: расписание ============================ */
  function renderSchedule() {
    const ws = weekStartDate();
    qs('#week-label').textContent = fmtShort(ws) + ' — ' + fmtFull(addDays(ws, 6));
    qs('#week-note').textContent = ui.weekOffset === 0 ? 'текущая неделя'
      : (ui.weekOffset > 0 ? '+' + ui.weekOffset + ' нед.' : ui.weekOffset + ' нед.');

    const occ = weekOccurrences().filter(matchesFilters);
    const byDay = [[], [], [], [], [], [], []];
    occ.forEach(o => byDay[o.i].push(o));
    byDay.forEach(assignLanes);

    const totalH = TOTAL_MIN * PX_PER_MIN;
    const nowKey = dateKey(new Date());
    const hourH = 60 * PX_PER_MIN;

    let head = '<div class="cal-corner"></div>';
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      const isToday = dateKey(d) === nowKey;
      head += '<div class="cal-day-head' + (isToday ? ' today' : '') + '">' +
        '<span>' + DAY_NAMES[i] + '</span><b>' + d.getDate() + '</b></div>';
    }

    let times = '';
    for (let m = DAY_START; m <= DAY_END; m += 60) {
      times += '<div class="cal-time" style="top:' + (m - DAY_START) * PX_PER_MIN + 'px">' + fmt(m) + '</div>';
    }

    const readonly = !can('schedule.write') || db.studio.archived;
    let cols = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      const isToday = dateKey(d) === nowKey;
      cols += '<div class="cal-col' + (isToday ? ' today' : '') + (readonly ? ' readonly' : '') +
        '" data-day="' + i + '" style="height:' + totalH + 'px">' +
        byDay[i].map(eventHtml).join('') +
        (isToday ? nowLineHtml() : '') +
        '</div>';
    }

    qs('#calendar').innerHTML =
      '<div class="cal-scroll"><div class="cal-inner">' +
        '<div class="cal-head">' + head + '</div>' +
        '<div class="cal-body" style="--hour-h:' + hourH + 'px">' +
          '<div class="cal-times">' + times + '</div>' + cols +
        '</div>' +
      '</div></div>';

    qs('#legend').innerHTML = db.members.filter(m => m.status === 'active')
      .map(m => '<span><i style="background:' + m.color + '"></i>' + esc(m.name) + ' · ' +
        m.roles.map(r => ROLE_LABEL[r]).join(' / ') + '</span>').join('');

    bindCalendar();
  }

  function eventHtml(o) {
    const s = o.s;
    const m = memberById(s.memberId) || { color: '#6d28d9', name: '' };
    const course = courseById(s.courseId) || {};
    const top = (o.start - DAY_START) * PX_PER_MIN;
    const height = Math.max(s.duration * PX_PER_MIN - 2, 24);
    const compact = height < 54 ? ' compact' : '';
    const meta = height >= 62
      ? '<div class="evt-m">' + esc((roomById(s.roomId) || {}).name || '') + ' · ' + esc(m.name.split(' ')[0] || '') + '</div>'
      : '';
    const badge = course.kind === 'individual' ? '<span class="evt-badge">инд</span>' : '';
    const left = 'calc(' + o.lane + ' * (100% / ' + o.lanes + ') + 2px)';
    const width = 'calc(100% / ' + o.lanes + ' - 4px)';

    return '<div class="evt' + compact + '" data-id="' + s.id + '"' +
      ' style="top:' + top + 'px;height:' + height + 'px;left:' + left + ';width:' + width +
      ';--tc:' + m.color + ';--tint:' + tint(m.color, 0.1) + '">' +
      '<div class="evt-head"><span class="evt-time">' + fmt(s.start) + '</span>' + badge + '</div>' +
      '<div class="evt-n">' + esc(titleOf(s)) + '</div>' + meta +
      '</div>';
  }

  function nowLineHtml() {
    const now = new Date();
    const m = now.getHours() * 60 + now.getMinutes();
    if (m < DAY_START || m > DAY_END) return '';
    return '<div class="now-line" style="top:' + (m - DAY_START) * PX_PER_MIN + 'px"><i></i></div>';
  }

  function bindCalendar() {
    qsa('.cal-col').forEach(col => {
      col.addEventListener('click', e => {
        const evt = e.target.closest('.evt');
        if (evt) {
          if (can('schedule.write')) openSession(evt.dataset.id);
          else toast('Просмотр расписания: редактирование недоступно для этой роли');
          return;
        }
        if (!can('schedule.write') || db.studio.archived) return;
        const rect = col.getBoundingClientRect();
        const y = clamp(e.clientY - rect.top, 0, TOTAL_MIN * PX_PER_MIN - 30);
        let mins = DAY_START + Math.round(y / PX_PER_MIN / 15) * 15;
        mins = clamp(mins, DAY_START, DAY_END - 45);
        openSession(null, { weekday: Number(col.dataset.day), start: mins });
      });
    });
  }

  /* ============================ рендер: метрики ============================ */
  function roomHours(roomId, occ) {
    return occ.filter(o => o.s.roomId === roomId).reduce((sum, o) => sum + o.s.duration, 0) / 60;
  }

  function renderStats() {
    const occ = weekOccurrences();
    const individual = occ.filter(o => (courseById(o.s.courseId) || {}).kind === 'individual').length;
    const hourCount = occ.reduce((sum, o) => sum + o.s.duration, 0) / 60;
    const capPerRoom = (TOTAL_MIN / 60) * 7;
    const activeRooms = db.rooms.filter(r => !r.archived);
    const capacityTotal = activeRooms.length * capPerRoom;
    const used = activeRooms.reduce((sum, r) => sum + roomHours(r.id, occ), 0);
    const load = capacityTotal ? Math.round(used / capacityTotal * 100) : 0;
    const activeTeachers = new Set(occ.map(o => o.s.memberId)).size;

    qs('#stats').innerHTML =
      '<div class="stat"><div class="stat-k">Сеансов на неделе</div><div class="stat-v">' + occ.length + '</div>' +
        '<div class="stat-s">' + individual + ' индивидуальных</div></div>' +
      '<div class="stat"><div class="stat-k">Загрузка залов</div><div class="stat-v">' + load + '%</div>' +
        '<div class="stat-s">' + used.toFixed(1).replace('.', ',') + ' из ' + capacityTotal + ' ч</div></div>' +
      '<div class="stat"><div class="stat-k">Преподаватели</div><div class="stat-v">' + activeTeachers + ' / ' + teachers().length + '</div>' +
        '<div class="stat-s">задействованы на неделе</div></div>' +
      '<div class="stat"><div class="stat-k">Часов в расписании</div><div class="stat-v">' + hourCount.toFixed(1).replace('.', ',') + '</div>' +
        '<div class="stat-s">суммарно по всем сеансам</div></div>';
  }

  /* ============================ рендер: курсы ============================ */
  function renderCourses() {
    const editable = can('courses.write') && !db.studio.archived;
    qs('#course-form').hidden = !editable;

    const rows = db.courses.slice().sort((a, b) => a.archived - b.archived || a.name.localeCompare(b.name)).map(c =>
      '<tr>' +
        '<td><div class="tname">' + esc(c.name) + '</div></td>' +
        '<td class="muted">' + esc(c.direction || '—') + '</td>' +
        '<td class="muted">' + LEVELS[c.level] + '</td>' +
        '<td><span class="pill ' + (c.kind === 'group' ? 'group' : 'indiv') + '">' + KINDS[c.kind] + '</span></td>' +
        '<td>' + c.duration + ' мин</td>' +
        '<td>' + c.capacity + '</td>' +
        '<td style="text-align:right; white-space:nowrap">' +
          (c.archived ? '<span class="pill arch">архив</span> ' : '') +
          (editable ? '<button class="btn ghost small" data-archive-course="' + c.id + '">' +
            (c.archived ? 'Вернуть' : 'В архив') + '</button>' : '') +
        '</td>' +
      '</tr>').join('');

    qs('#courses-body').innerHTML = rows || '<tr><td colspan="7" class="empty">Курсов пока нет</td></tr>';
    qsa('[data-archive-course]').forEach(b => b.addEventListener('click', () => {
      const c = courseById(b.dataset.archiveCourse);
      if (!c) return;
      c.archived = !c.archived;
      save(); renderCourses(); renderSchedule(); renderStats();
      toast(c.archived ? 'Курс в архиве' : 'Курс возвращён');
    }));
  }

  /* ============================ рендер: залы ============================ */
  function renderRooms() {
    const occ = weekOccurrences();
    const capPerRoom = (TOTAL_MIN / 60) * 7;
    const editable = can('rooms.write') && !db.studio.archived;

    qs('#rooms-grid').innerHTML = db.rooms.map(r => {
      const h = roomHours(r.id, occ);
      const pct = Math.round(h / capPerRoom * 100);
      const count = occ.filter(o => o.s.roomId === r.id).length;
      const used = db.sessions.some(s => s.roomId === r.id);

      return '<article class="room-card">' +
        '<header><h3>' + esc(r.name) + '</h3><span class="pill' + (r.archived ? ' arch' : '') + '">' +
          (r.archived ? 'архив' : r.capacity + ' мест') + '</span></header>' +
        '<p class="muted" style="margin:6px 0 0; font-size:12.5px">' + esc(r.note || '') + '</p>' +
        '<div class="bar"><i style="width:' + Math.min(pct, 100) + '%"></i></div>' +
        '<div class="room-meta"><span>' + h.toFixed(1).replace('.', ',') + ' ч из ' + capPerRoom + ' ч</span><b>' + pct + '%</b></div>' +
        '<div class="room-meta"><span>' + count + ' сеансов</span>' +
          (editable ? '<button class="btn ghost small danger" data-archive-room="' + r.id + '"' +
            (used && !r.archived ? ' disabled title="Зал используется в расписании"' : '') + '>' +
            (r.archived ? 'Вернуть' : 'В архив') + '</button>' : '') +
        '</div></article>';
    }).join('');

    qsa('[data-archive-room]').forEach(b => b.addEventListener('click', () => {
      const r = roomById(b.dataset.archiveRoom);
      if (!r) return;
      if (!r.archived && db.sessions.some(s => s.roomId === r.id)) return toast('Зал используется в расписании', true);
      r.archived = !r.archived;
      save(); renderRooms(); renderSchedule(); renderStats();
      toast(r.archived ? 'Зал в архиве' : 'Зал возвращён');
    }));
  }

  /* ============================ рендер: команда ============================ */
  function renderTeam() {
    const editable = can('members.write') && !db.studio.archived;
    qs('#invite-form').hidden = !editable;

    const rows = db.members.map(m =>
      '<tr>' +
        '<td><div class="tname">' + esc(m.name) + '</div></td>' +
        '<td class="muted">' + esc(m.email) + '</td>' +
        '<td><div class="chips">' + roleChips(m.roles) + '</div></td>' +
        '<td>' + (m.status === 'active' ? '<span class="pill">активен</span>' : '<span class="pill arch">деактивирован</span>') + '</td>' +
        '<td style="text-align:right">' +
          (editable ? '<button class="btn ghost small" data-edit-member="' + m.id + '">Роли</button>' : '') +
        '</td>' +
      '</tr>').join('');

    qs('#team-body').innerHTML = rows;
    qsa('[data-edit-member]').forEach(b => b.addEventListener('click', () => openMember(b.dataset.editMember)));
  }

  /* ============================ рендер: студия ============================ */
  function renderStudio() {
    qs('#s-name').value = db.studio.name;
    qs('#s-tz').value = db.studio.timezone;
    const editable = can('studio.write');
    qs('#s-name').disabled = !editable;
    qs('#s-tz').disabled = !editable;

    qs('#hours-body').innerHTML = db.studio.hours.map((h, i) =>
      '<tr><td>' + DAY_FULL[i] + '</td>' +
      '<td><input type="time" step="900" data-hour-from="' + i + '" value="' + h.from + '"' + (editable && !h.closed ? '' : ' disabled') + '></td>' +
      '<td>—</td>' +
      '<td><input type="time" step="900" data-hour-to="' + i + '" value="' + h.to + '"' + (editable && !h.closed ? '' : ' disabled') + '></td>' +
      '<td><label><input type="checkbox" data-hour-closed="' + i + '"' + (h.closed ? ' checked' : '') + (editable ? '' : ' disabled') + '> выходной</label></td></tr>').join('');

    qsa('[data-hour-closed]').forEach(cb => cb.addEventListener('change', () => {
      const i = Number(cb.dataset.hourClosed);
      db.studio.hours[i].closed = cb.checked;
      save(); renderStudio();
    }));

    qs('#btn-archive').hidden = !can('studio.archive');
    qs('#btn-archive').textContent = db.studio.archived ? 'Восстановить студию' : 'Архивировать студию';
  }

  /* ============================ сессия: модал ============================ */
  function openSession(id, prefill) {
    ui.editingSession = id || null;
    const s = id ? db.sessions.find(x => x.id === id) : null;

    qs('#modal-title').textContent = s ? 'Редактирование сеанса' : 'Новый сеанс';
    qs('#modal-sub').textContent = s ? 'Правка применяется к выбранному вхождению.' : 'Конфликты по залу и преподавателю проверяются автоматически.';
    qs('#btn-delete').hidden = !s;
    qs('#session-errors').hidden = true;

    qs('#s-course').innerHTML = db.courses.filter(c => !c.archived || (s && s.courseId === c.id))
      .map(c => '<option value="' + c.id + '">' + esc(c.name) + ' · ' + KINDS[c.kind] + '</option>').join('');
    qs('#s-room').innerHTML = db.rooms.filter(r => !r.archived || (s && s.roomId === r.id))
      .map(r => '<option value="' + r.id + '">' + esc(r.name) + ' · до ' + r.capacity + '</option>').join('');
    qs('#s-teacher').innerHTML = teachers().map(m =>
      '<option value="' + m.id + '">' + esc(m.name) + '</option>').join('');
    qs('#f-weekday').innerHTML = DAY_FULL.map((d, i) => '<option value="' + i + '">' + d + '</option>').join('');
    qs('#f-duration').innerHTML = DURATIONS.map(d => '<option value="' + d + '">' + d + ' мин</option>').join('');

    qs('#f-repeat').value = s ? s.repeat : 'weekly';
    qs('#s-course').value = s ? s.courseId : (db.courses.find(c => !c.archived) || {}).id;
    qs('#s-room').value = s ? s.roomId : (db.rooms.find(r => !r.archived) || {}).id;
    qs('#s-teacher').value = s ? s.memberId : (teachers()[0] || {}).id;
    qs('#f-weekday').value = s && s.weekday !== null ? String(s.weekday) : String((prefill && prefill.weekday) || 0);
    qs('#f-date').value = s && s.date ? s.date : dateKey(new Date());
    qs('#f-start').value = fmt(s ? s.start : (prefill && prefill.start) || 1080);
    qs('#f-duration').value = String(s ? s.duration : 60);
    qs('#f-until').value = s && s.until ? s.until : '';

    setSeg('weekly');
    syncSessionVisibility();
    updateCapacityHint();
    qs('#session-modal').hidden = false;
  }

  function setSeg(value) {
    qsa('#seg-repeat button').forEach(b => b.classList.toggle('active', b.dataset.repeat === value));
  }

  function syncSessionVisibility() {
    const repeat = qs('#f-repeat').value;
    qs('#row-weekday').hidden = repeat !== 'weekly';
    qs('#row-until').hidden = repeat !== 'weekly';
    qs('#row-date').hidden = repeat !== 'once';
  }

  function sessionFormValues() {
    return {
      courseId: qs('#s-course').value,
      roomId: qs('#s-room').value,
      memberId: qs('#s-teacher').value,
      repeat: qs('#f-repeat').value,
      weekday: Number(qs('#f-weekday').value),
      date: qs('#f-date').value,
      start: parseTime(qs('#f-start').value),
      duration: Number(qs('#f-duration').value),
      until: qs('#f-until').value || null
    };
  }

  function updateCapacityHint() {
    const box = qs('#capacity-hint');
    const msg = capacityWarning(sessionFormValues());
    box.textContent = msg;
    box.hidden = !msg;
  }

  qsa('#seg-repeat button').forEach(b => b.addEventListener('click', () => {
    qs('#f-repeat').value = b.dataset.repeat;
    setSeg(b.dataset.repeat);
    syncSessionVisibility();
  }));

  qs('#s-course').addEventListener('change', updateCapacityHint);
  qs('#s-room').addEventListener('change', updateCapacityHint);

  function submitSession(e) {
    e.preventDefault();
    const v = sessionFormValues();
    const errors = [];

    if (!v.courseId) errors.push('Выберите курс.');
    if (!v.roomId) errors.push('Выберите зал.');
    if (!v.memberId) errors.push('Выберите преподавателя.');
    if (Number.isNaN(v.start)) errors.push('Укажите время начала.');
    if (DURATIONS.indexOf(v.duration) === -1) errors.push('Длительность должна быть 45, 60, 75, 90 или 120 минут.');
    if (v.repeat === 'once' && !v.date) errors.push('Укажите дату разового сеанса.');
    if (v.repeat === 'weekly' && v.until && v.until < dateKey(new Date())) errors.push('Дата окончания серии уже прошла.');

    const cand = {
      id: ui.editingSession || uid('s'),
      courseId: v.courseId,
      roomId: v.roomId,
      memberId: v.memberId,
      repeat: v.repeat,
      weekday: v.repeat === 'weekly' ? v.weekday : null,
      date: v.repeat === 'once' ? v.date : null,
      start: v.start,
      duration: v.duration,
      until: v.repeat === 'weekly' ? v.until : null
    };

    if (!Number.isNaN(v.start)) {
      const wh = workingHoursError(cand);
      if (wh) errors.push(wh);
    }
    if (!errors.length) errors.push(...findConflicts(cand, ui.editingSession));

    if (errors.length) {
      qs('#session-errors').innerHTML = '<b>Не удалось сохранить</b><ul>' +
        errors.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
      qs('#session-errors').hidden = false;
      return;
    }

    if (ui.editingSession) {
      const i = db.sessions.findIndex(x => x.id === ui.editingSession);
      if (i >= 0) db.sessions[i] = cand; else db.sessions.push(cand);
    } else {
      db.sessions.push(cand);
    }

    save();
    closeSession();
    render();
    const warn = capacityWarning(cand);
    toast(warn ? 'Сохранено. ' + warn : 'Сеанс сохранён');
  }

  function closeSession() {
    qs('#session-modal').hidden = true;
    ui.editingSession = null;
  }

  qs('#session-form').addEventListener('submit', submitSession);
  qs('#btn-cancel').addEventListener('click', closeSession);
  qs('#session-modal').addEventListener('click', e => { if (e.target === qs('#session-modal')) closeSession(); });
  qs('#btn-delete').addEventListener('click', () => {
    if (!ui.editingSession) return;
    const s = db.sessions.find(x => x.id === ui.editingSession);
    if (!s) return;
    if (!confirm('Удалить сеанс «' + titleOf(s) + '»?')) return;
    db.sessions = db.sessions.filter(x => x.id !== s.id);
    save(); closeSession(); render(); toast('Сеанс удалён');
  });

  /* ============================ участник: модал ============================ */
  function openMember(id) {
    ui.editingMember = id || null;
    const m = id ? memberById(id) : null;
    const editable = can('members.write') && !db.studio.archived;

    qs('#m-title').textContent = m ? 'Роли участника' : 'Новый участник';
    qs('#m-sub').textContent = m
      ? 'Ролей может быть несколько — права складываются.'
      : 'Аккаунт должен быть зарегистрирован: приглашений нет.';
    qs('#m-email').value = m ? m.email : '';
    qs('#m-email').readOnly = !!m;
    qs('#m-roles').innerHTML = ROLES.map(r =>
      '<label><input type="checkbox" value="' + r + '"' + (m && m.roles.includes(r) ? ' checked' : '') + '> ' +
      ROLE_LABEL[r] + '</label>').join('');
    qs('#m-errors').hidden = true;
    qs('#m-save').disabled = !editable;

    qs('#m-transfer').hidden = !(m && can('studio.archive') && m.status === 'active' && !m.roles.includes('owner'));
    qs('#m-deactivate').hidden = !(m && editable && m.status === 'active' && !m.roles.includes('owner'));
    qs('#m-deactivate').textContent = 'Деактивировать';
    qs('#member-modal').hidden = false;
  }

  function closeMember() {
    qs('#member-modal').hidden = true;
    ui.editingMember = null;
  }

  function selectedRoles() {
    return qsa('#m-roles input:checked').map(i => i.value);
  }

  function showMemberErrors(list) {
    qs('#m-errors').innerHTML = '<b>Не удалось сохранить</b><ul>' + list.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    qs('#m-errors').hidden = false;
  }

  qs('#member-form').addEventListener('submit', e => {
    e.preventDefault();
    const chosen = selectedRoles();
    const email = qs('#m-email').value.trim();
    const errors = [];

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('Укажите корректный email.');
    if (chosen.includes('student') && !can('students.write')) {
      errors.push('Добавлять учеников может владелец, администратор или куратор.');
    }
    if (errors.length) return showMemberErrors(errors);

    const isEdit = !!ui.editingMember;
    const result = isEdit ? updateMemberRoles(ui.editingMember, chosen) : addMember(email, chosen);
    if (!result.ok) return showMemberErrors([result.error]);

    save(); closeMember(); render();
    toast(isEdit ? 'Роли обновлены' : 'Участник добавлен');
  });

  qs('#m-cancel').addEventListener('click', closeMember);
  qs('#member-modal').addEventListener('click', e => { if (e.target === qs('#member-modal')) closeMember(); });

  qs('#m-transfer').addEventListener('click', () => {
    const m = memberById(ui.editingMember);
    if (!m) return;
    if (!confirm('Сделать «' + m.name + '» владельцем студии? Текущий владелец станет администратором.')) return;
    const res = transferOwnership(m.id);
    if (!res.ok) return showMemberErrors([res.error]);
    save(); closeMember(); render(); toast('Владение передано');
  });

  qs('#m-deactivate').addEventListener('click', () => {
    const m = memberById(ui.editingMember);
    if (!m) return;
    const res = deactivateMember(m.id);
    if (!res.ok) return showMemberErrors([res.error]);
    save(); closeMember(); render(); toast('Участник деактивирован');
  });

  /* ============================ формы: курсы, залы, студия ============================ */
  qs('#course-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = qs('#c-name').value.trim();
    const capacity = Number(qs('#c-capacity').value);
    const errors = validateCourse(name, capacity);
    if (errors.length) return toast(errors[0], true);

    db.courses.push({
      id: uid('c'), name: name,
      direction: qs('#c-direction').value.trim(),
      level: qs('#c-level').value,
      kind: qs('#c-kind').value,
      duration: Number(qs('#c-duration').value),
      capacity: capacity,
      archived: false
    });
    save();
    qs('#c-name').value = ''; qs('#c-direction').value = '';
    renderCourses(); renderSchedule(); renderStats();
    toast('Курс добавлен');
  });

  qs('#room-add').addEventListener('click', () => {
    const name = qs('#room-name').value.trim();
    const capacity = Number(qs('#room-cap').value);
    if (!name) return toast('Укажите название зала', true);
    if (db.rooms.some(r => r.name.toLowerCase() === name.toLowerCase())) return toast('Зал с таким названием уже есть', true);
    if (!capacity || capacity < 1) return toast('Вместимость больше нуля', true);

    db.rooms.push({ id: uid('r'), name: name, capacity: capacity, note: qs('#room-note').value.trim(), archived: false });
    save();
    qs('#room-name').value = ''; qs('#room-note').value = '';
    renderRooms(); renderSchedule(); renderStats();
    toast('Зал добавлен');
  });

  qs('#invite-form').addEventListener('submit', e => {
    e.preventDefault();
    openMember(null);
    const email = qs('#invite-email').value.trim();
    if (email) qs('#m-email').value = email;
  });

  qs('#studio-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!can('studio.write')) return toast('Недостаточно прав', true);

    const name = qs('#s-name').value.trim();
    if (name.length < 2) return toast('Название студии слишком короткое', true);

    for (let i = 0; i < 7; i++) {
      const from = qs('[data-hour-from="' + i + '"]');
      const to = qs('[data-hour-to="' + i + '"]');
      const closed = qs('[data-hour-closed="' + i + '"]');
      const h = db.studio.hours[i];
      h.closed = closed.checked;
      if (!h.closed) {
        if (parseTime(from.value) >= parseTime(to.value)) return toast('В ' + DAY_FULL[i].toLowerCase() + ' открытие позже закрытия', true);
        h.from = from.value;
        h.to = to.value;
      }
    }

    db.studio.name = name;
    db.studio.timezone = qs('#s-tz').value;
    save(); render(); toast('Настройки студии сохранены');
  });

  qs('#btn-archive').addEventListener('click', () => {
    if (!can('studio.archive')) return toast('Архивировать студию может только владелец', true);
    db.studio.archived = !db.studio.archived;
    save(); render();
    toast(db.studio.archived ? 'Студия архивирована' : 'Студия восстановлена');
  });

  qs('#btn-reset').addEventListener('click', () => {
    if (!confirm('Сбросить демо-данные и вернуть исходное состояние?')) return;
    try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ }
    location.reload();
  });

  /* ============================ фильтры и навигация ============================ */
  function renderFilters() {
    const t = qs('#f-teacher');
    t.innerHTML = '<option value="">Все преподаватели</option>' +
      teachers().map(m => '<option value="' + m.id + '">' + esc(m.name) + '</option>').join('');
    t.value = ui.filters.teacher;

    const r = qs('#f-room');
    r.innerHTML = '<option value="">Все залы</option>' +
      db.rooms.filter(x => !x.archived).map(x => '<option value="' + x.id + '">' + esc(x.name) + '</option>').join('');
    r.value = ui.filters.room;

    const c = qs('#f-course');
    c.innerHTML = '<option value="">Все курсы</option>' +
      db.courses.filter(x => !x.archived).map(x => '<option value="' + x.id + '">' + esc(x.name) + '</option>').join('');
    c.value = ui.filters.course;
  }

  qsa('.tab').forEach(tab => tab.addEventListener('click', () => {
    ui.view = tab.dataset.view;
    qsa('.tab').forEach(x => x.classList.toggle('active', x === tab));
    qs('#view-schedule').hidden = ui.view !== 'schedule';
    qs('#view-courses').hidden = ui.view !== 'courses';
    qs('#view-rooms').hidden = ui.view !== 'rooms';
    qs('#view-team').hidden = ui.view !== 'team';
    qs('#view-studio').hidden = ui.view !== 'studio';
  }));

  qs('#prev-week').addEventListener('click', () => { ui.weekOffset--; renderSchedule(); });
  qs('#next-week').addEventListener('click', () => { ui.weekOffset++; renderSchedule(); });
  qs('#today').addEventListener('click', () => { ui.weekOffset = 0; renderSchedule(); });

  qs('#f-teacher').addEventListener('change', e => { ui.filters.teacher = e.target.value; renderSchedule(); });
  qs('#f-room').addEventListener('change', e => { ui.filters.room = e.target.value; renderSchedule(); });
  qs('#f-course').addEventListener('change', e => { ui.filters.course = e.target.value; renderSchedule(); });

  qs('#actor').addEventListener('change', e => {
    db.me = e.target.value;
    save(); render();
    toast('Вы вошли как ' + me().name);
  });

  qs('#btn-new').addEventListener('click', () => openSession(null));

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!qs('#session-modal').hidden) closeSession();
    if (!qs('#member-modal').hidden) closeMember();
  });

  /* ============================ прочее ============================ */
  let toastTimer = null;
  function toast(msg, isError) {
    const el = qs('#toast');
    el.textContent = msg;
    el.classList.toggle('err', !!isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3600);
  }

  function render() {
    renderHeader();
    renderFilters();
    renderSchedule();
    renderStats();
    renderCourses();
    renderRooms();
    renderTeam();
    renderStudio();
  }

  render();
})();
