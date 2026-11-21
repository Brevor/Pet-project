// Headless-проверка логики прототипа: DOM-заглушка + vm
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

const idx = script.lastIndexOf('})();');
if (idx < 0) throw new Error('не найден конец IIFE');
const instrumented = script.slice(0, idx) +
  'globalThis.__t = { db, weekOccurrences, findConflicts, capacityWarning, occursOn, ' +
  'dateKey, startOfWeek, addDays, parseKey, DAY_START, DAY_END, titleOf, roomById };\n})();';

const mkEl = () => {
  const el = {
    innerHTML: '', textContent: '', value: '', hidden: false, dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, focus() {}, reset() {},
    querySelector() { return mkEl(); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; }
  };
  return el;
};

const cache = new Map();
const sandbox = {
  console,
  setTimeout: () => 0,
  clearTimeout: () => {},
  confirm: () => true,
  localStorage: (() => {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  })(),
  document: {
    querySelector: sel => { if (!cache.has(sel)) cache.set(sel, mkEl()); return cache.get(sel); },
    querySelectorAll: () => [],
    createElement: () => mkEl(),
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

/* 0. статические проверки разметки */
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
ok('нет дубликатов id', dup.length === 0, dup.join(', '));

const refs = [...new Set([...script.matchAll(/qs\('(#[A-Za-z0-9_-]+)/g)].map(m => m[1].slice(1)))];
const missing = refs.filter(id => !ids.includes(id));
ok('все qs("#…") ссылаются на существующие id', missing.length === 0, missing.join(', '));

/* 1. неделя: 15 еженедельных + 1 разовое = 16 */
const occ = t.weekOccurrences();
ok('16 занятий в текущей неделе', occ.length === 16, 'получено ' + occ.length);

const byDay = [0, 0, 0, 0, 0, 0, 0];
occ.forEach(o => byDay[o.i]++);
ok('распределение по дням 3/2/2/2/2/4/1',
  byDay.join(',') === '3,2,2,2,2,4,1', byDay.join(','));

/* 2. конфликт по залу и преподавателю */
const base = { id: 'test-1', kind: 'group', groupId: 'g1', teacherId: 't1', roomId: 'r1',
  repeat: 'weekly', weekday: 0, date: null, start: 1080, duration: 90, until: null };
const c1 = t.findConflicts(base, null);
ok('конфликт: занято и зал, и преподаватель', c1.length >= 2, JSON.stringify(c1));
ok('сообщение про Зал А', c1.some(m => m.includes('Зал А')), JSON.stringify(c1));
ok('сообщение про Анну', c1.some(m => m.includes('Анна')), JSON.stringify(c1));

/* 3. свободный слот — конфликтов нет */
const free = { ...base, id: 'test-2', roomId: 'r2', teacherId: 't4', weekday: 2, start: 700, duration: 60 };
ok('свободный слот без конфликтов', t.findConflicts(free, null).length === 0,
  JSON.stringify(t.findConflicts(free, null)));

/* 4. занят только преподаватель */
const teacherBusy = { ...base, id: 'test-3', roomId: 'r1', teacherId: 't2', weekday: 1, start: 1170, duration: 60 };
const c4 = t.findConflicts(teacherBusy, null);
ok('конфликт только по преподавателю', c4.length === 1 && c4[0].includes('Мария'), JSON.stringify(c4));

/* 5. редактирование самого себя не даёт конфликтов */
ok('правка занятия не конфликтует сама с собой',
  t.findConflicts({ ...base, id: 'c02' }, 'c02').length === 0);

/* 6. разовое занятие попадает на понедельник этой недели */
const ws = t.startOfWeek(new Date());
const monday = t.addDays(ws, 0);
const once = { ...base, id: 'test-4', repeat: 'once', weekday: null,
  teacherId: 't4', roomId: 'r2', date: t.dateKey(monday), start: 600, duration: 60 };
const c6 = t.findConflicts(once, null);
ok('разовое в понедельник 10:00 конфликтует со Stretching',
  c6.length >= 1 && c6.some(m => m.includes('Stretching')), JSON.stringify(c6));

/* 7. разовое в другой день — без конфликта */
const onceFree = { ...once, id: 'test-5', date: t.dateKey(t.addDays(ws, 2)), start: 600 };
ok('разовое в среду 10:00 свободно', t.findConflicts(onceFree, null).length === 0,
  JSON.stringify(t.findConflicts(onceFree, null)));

/* 8. предупреждение о вместимости */
ok('вместимость: 22 ученика в зал на 14',
  t.capacityWarning({ kind: 'group', groupId: 'g7', roomId: 'r2', teacherId: 't1', start: 600, duration: 60 })
    .includes('больше вместимости'));
ok('вместимость: инд. занятие не проверяется',
  t.capacityWarning({ kind: 'individual', student: 'X', roomId: 'r2', teacherId: 't1', start: 600, duration: 60 }) === '');

/* 9. повторяемость по дням */
ok('c01 идёт только по понедельникам',
  t.occursOn(t.db.classes.find(c => c.id === 'c01'), t.addDays(ws, 0), 0) === true &&
  t.occursOn(t.db.classes.find(c => c.id === 'c01'), t.addDays(ws, 1), 1) === false);

/* 10. серия с датой окончания */
const until = t.dateKey(t.addDays(ws, 30));
const limited = { ...base, id: 'test-6', weekday: 0, start: 600, roomId: 'r3', teacherId: 't3', until };
const perDay = [];
t.db.classes.push(limited);
const occ2 = t.weekOccurrences().filter(o => o.c.id === 'test-6');
t.db.classes = t.db.classes.filter(c => c.id !== 'test-6');
ok('серия с until=+30 дней видна на текущей неделе', occ2.length === 1, 'вхождений: ' + occ2.length);
ok('серия с until в прошлом не отображается',
  (() => {
    const past = { ...limited, id: 'test-7', until: t.dateKey(t.addDays(ws, -10)) };
    t.db.classes.push(past);
    const n = t.weekOccurrences().filter(o => o.c.id === 'test-7').length;
    t.db.classes = t.db.classes.filter(c => c.id !== 'test-7');
    return n === 0;
  })());

/* 11. занятие за пределами рабочего дня отсекается валидацией (проверяем границы констант) */
ok('рабочий день 09:00–22:00', t.DAY_START === 540 && t.DAY_END === 1320);

console.log('\n' + (fails ? fails + ' проверок провалено' : 'все проверки пройдены'));
process.exit(fails ? 1 : 0);
