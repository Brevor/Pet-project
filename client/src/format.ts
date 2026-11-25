const dateFormatCache = new Map<string, Intl.DateTimeFormat>();

function dateTimeFormat(timeZone: string, withTime: boolean): Intl.DateTimeFormat {
  const key = `${timeZone}:${withTime}`;
  const cached = dateFormatCache.get(key);
  if (cached) return cached;
  const format = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone
  });
  dateFormatCache.set(key, format);
  return format;
}

export function formatDateTime(iso: string, timeZone: string): string {
  return dateTimeFormat(timeZone, true).format(new Date(iso));
}

export function formatDate(iso: string, timeZone: string): string {
  return dateTimeFormat(timeZone, false).format(new Date(iso));
}

export function formatIsoDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

export function pluralLessons(count: number): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'занятий';
  if (last === 1) return 'занятие';
  if (last >= 2 && last <= 4) return 'занятия';
  return 'занятий';
}

export function isFresh(iso: string, days = 7): boolean {
  return Date.now() - Date.parse(iso) < days * 24 * 60 * 60 * 1000;
}
