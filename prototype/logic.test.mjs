// Headless-проверка прототипа: DOM-заглушка + vm, модель берётся из app.js
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

const idx = script.lastIndexOf('})();');
if (idx < 0) throw new Error('не найден конец IIFE в app.js');
const instrumented = script.slice(0, idx) +
  'globalThis.__t = { db, can, weekOccurrences, findConflicts, workingHoursError, capacityWarning, ' +
  'addMember, updateMemberRoles, transferOwnership, deactivateMember, validateCourse, ' +
  'dateKey, startOfWeek, addDays, parseKey, memberById, courseById, roomById };\n})();';

const mkEl = () => ({
  innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, readOnly: false,
  dataset: {}, style: {},
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  addEventListener() {}, focus() {}, reset() {},
  querySelector() { return mkEl(); },
  querySelectorAll() { return []; },
  getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; }
});

const cache = new Map();
const sandbox = {
  console,
  setTimeout: () => 0,
  clearTimeout: () => {},
  confirm: () => true,
  localStorage: (() => {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  })(),
  document: {
    querySelector: sel => { if (!cache.has(sel)) cache.set(sel, mkEl()); return cache.get(sel); },
    querySelectorAll: () => [],
    addEventListener: () => {}
  }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

vm.createContext(sandbox);
vm.runInContext(instrumented, sandbox);
const t = sandbox.__t;

let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
};

/* ---------- 0. разметка ---------- */
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
ok('нет дубликатов id', dup.length === 0, dup.join(', '));

const refs = [...new Set([...script.matchAll(/qs\('(#[A-Za-z0-9_-]+)/g)].map(m => m[1].slice(1)))];
const missing = refs.filter(id => !ids.includes(id));
ok('все qs("#…") ссылаются на существующие id', missing.length === 0, missing.join(', '));

const api = [...script.matchAll(/\/api\/v1/g)].length;
ok('прототип без обращений к API', api === 0);

/* ---------- 1. модель и неделя ---------- */
ok('9 еженедельных + 1 разовый сеанс = 10 вхождений',
  t.weekOccurrences().length === 10, 'получено ' + t.weekOccurrences().length);

const byDay = [0, 0, 0, 0, 0, 0, 0];
t.weekOccurrences().forEach(o => byDay[o.i]++);
ok('распределение 2/1/2/1/1/3/0', byDay.join(',') === '2,1,2,1,1,3,0', byDay.join(','));

/* ---------- 2. конфликты ---------- */
const base = { id: 'x1', courseId: 'c1', roomId: 'r1', memberId: 'm1', repeat: 'weekly', weekday: 0, date: null, start: 1080, duration: 90, until: null };
const c1 = t.findConflicts(base, null);
ok('конфликт по залу и преподавателю найден', c1.length === 2, JSON.stringify(c1));
ok('сообщение про Зал А', c1.some(m => m.includes('Зал А')));
ok('сообщение про Анну', c1.some(m => m.includes('Анна')));

const free = { ...base, id: 'x2', roomId: 'r3', memberId: 'm4', weekday: 1, start: 600 };
ok('свободный слот без конфликтов', t.findConflicts(free, null).length === 0);

ok('правка сеанса не конфликтует сама с собой', t.findConflicts({ ...base, id: 's02' }, 's02').length === 0);

/* ---------- 3. рабочие часы ---------- */
const sunday = { ...base, id: 'x3', repeat: 'once', weekday: null, date: null };
const ws = t.startOfWeek(new Date());
sunday.date = t.dateKey(t.addDays(ws, 6));
ok('воскресенье закрыто', t.workingHoursError(sunday).includes('не работает'), t.workingHoursError(sunday));

const late = { ...base, id: 'x4', weekday: 0, start: 21 * 60, duration: 90 };
ok('сеанс вне рабочих часов отклоняется', t.workingHoursError(late).length > 0, t.workingHoursError(late));

const inside = { ...base, id: 'x5', weekday: 0, start: 18 * 60, duration: 90 };
ok('сеанс внутри рабочих часов допустим', t.workingHoursError(inside) === '');

/* ---------- 4. вместимость ---------- */
ok('курс на 22 в зал на 14 — предупреждение',
  t.capacityWarning({ courseId: 'c5', roomId: 'r2' }).includes('больше вместимости'));
ok('курс на 10 в зал на 25 — без предупреждения',
  t.capacityWarning({ courseId: 'c3', roomId: 'r1' }) === '');

/* ---------- 5. RBAC ---------- */
const setMe = id => { t.db.me = id; };
setMe('m4');
ok('преподаватель не управляет расписанием', t.can('schedule.write') === false);
setMe('m3');
ok('куратор управляет расписанием', t.can('schedule.write') === true);
ok('куратор не управляет персоналом', t.can('members.write') === false);
setMe('m2');
ok('администратор управляет персоналом', t.can('members.write') === true);
setMe('m6');
ok('ученик только смотрит', t.can('schedule.write') === false && t.can('courses.write') === false);
setMe('m1');
ok('владелец может всё', t.can('studio.archive') && t.can('schedule.write') && t.can('members.write'));

/* ---------- 6. участники ---------- */
ok('неизвестный email отклоняется', t.addMember('nobody@example.com', ['teacher']).ok === false);
ok('участник добавляется по email из справочника', t.addMember('petr@studio.ru', ['teacher']).ok === true);
ok('в студии 7 участников', t.db.members.length === 7, 'участников: ' + t.db.members.length);
ok('повторное добавление отклоняется', t.addMember('petr@studio.ru', ['teacher']).ok === false);

const petr = t.db.members.find(m => m.email === 'petr@studio.ru');
ok('пустой набор ролей отклоняется', t.updateMemberRoles(petr.id, []).ok === false);
ok('несколько ролей назначаются', t.updateMemberRoles(petr.id, ['teacher', 'assistant']).ok === true && petr.roles.length === 2);

/* ---------- 7. владелец ---------- */
ok('передача владения работает', t.transferOwnership(petr.id).ok === true);
const owners = t.db.members.filter(m => m.roles.includes('owner'));
ok('владелец ровно один', owners.length === 1 && owners[0].id === petr.id);
const anna = t.memberById('m1');
ok('прежний владелец стал администратором', !anna.roles.includes('owner') && anna.roles.includes('admin'), JSON.stringify(anna.roles));
ok('повторная передача тому же участнику отклоняется', t.transferOwnership(petr.id).ok === false);
ok('владельца нельзя деактивировать', t.deactivateMember(petr.id).ok === false);
ok('ассистента деактивировать можно', t.deactivateMember('m5').ok === true && t.memberById('m5').status === 'disabled');

/* ---------- 8. курсы ---------- */
ok('курс 140 символов проходит', t.validateCourse('к'.repeat(140), 10).length === 0);
ok('курс 141 символ отклоняется', t.validateCourse('к'.repeat(141), 10).length > 0);
ok('дубль названия отклоняется', t.validateCourse('Stretching', 10).length > 0);
ok('нулевая вместимость отклоняется', t.validateCourse('Новый курс', 0).length > 0);

/* ---------- 9. данные не выходят за пределы модели ---------- */
ok('у каждого сеанса есть курс и зал',
  t.db.sessions.every(s => t.courseById(s.courseId) && t.roomById(s.roomId)));
ok('у каждого сеанса преподаватель с ролью teacher',
  t.db.sessions.every(s => (t.memberById(s.memberId) || { roles: [] }).roles.includes('teacher')));

console.log('\n' + (fails ? fails + ' проверок провалено' : 'все проверки пройдены'));
process.exit(fails ? 1 : 0);
