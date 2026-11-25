export interface Membership {
  membershipId: string;
  studioId: string;
  studioName: string;
  roles: string[];
  status: string;
}

export interface WorkingHour {
  weekday: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

export interface StudioView {
  studio: { id: string; name: string; timezone: string };
  workingHours: WorkingHour[];
  myRoles: string[];
  referralCode: string;
  referralUrl: string;
}

export interface Member {
  membershipId: string;
  email: string | null;
  displayName: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  about?: string | null;
  roles: string[];
  status: string;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  description: string | null;
  archived: boolean;
}

export interface Course {
  id: string;
  name: string;
  direction: string | null;
  level: string;
  kind: string;
  defaultDurationMin: number;
  capacity: number;
  color: string;
  teacherMembershipId: string | null;
  teacherName: string | null;
  archived: boolean;
}

export const COURSE_COLORS = [
  { code: 'violet', label: 'Фиолетовый', hex: '#8b5cf6' },
  { code: 'indigo', label: 'Индиго', hex: '#6366f1' },
  { code: 'blue', label: 'Синий', hex: '#3b82f6' },
  { code: 'sky', label: 'Голубой', hex: '#0ea5e9' },
  { code: 'teal', label: 'Бирюзовый', hex: '#14b8a6' },
  { code: 'green', label: 'Зелёный', hex: '#22c55e' },
  { code: 'lime', label: 'Лаймовый', hex: '#84cc16' },
  { code: 'amber', label: 'Янтарный', hex: '#f59e0b' },
  { code: 'orange', label: 'Оранжевый', hex: '#f97316' },
  { code: 'red', label: 'Красный', hex: '#ef4444' },
  { code: 'rose', label: 'Розовый', hex: '#f43f5e' },
  { code: 'pink', label: 'Малиновый', hex: '#ec4899' }
] as const;

export function courseColorHex(code: string | undefined): string {
  return COURSE_COLORS.find((item) => item.code === code)?.hex ?? '#8b5cf6';
}

export interface Teacher {
  membershipId: string;
  displayName: string;
}

export interface SessionItem {
  sessionId: string;
  courseId: string;
  courseName: string;
  roomId: string;
  roomName: string;
  teacherMembershipId: string;
  teacherName: string;
  startsAt: string;
  endsAt: string;
  status: string;
  seriesId: string | null;
}

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  curator: 'Куратор',
  teacher: 'Преподаватель',
  assistant: 'Ассистент',
  student: 'Ученик'
};

export const LEVEL_LABELS: Record<string, string> = {
  beginner: 'начинающие',
  intermediate: 'средние',
  advanced: 'продвинутые',
  none: 'без уровня'
};

export const KIND_LABELS: Record<string, string> = {
  group: 'групповой',
  individual: 'индивидуальный'
};

export const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export interface AttendanceRecord {
  attendanceId: string;
  sessionId: string;
  status: string;
  markedAt: string;
  startsAt: string;
  endsAt: string;
  courseName: string;
  roomName: string;
  teacherName: string;
}

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  attended: 'пришёл',
  no_show: 'не пришёл',
  cancelled: 'отменил'
};

export interface StudentAchievement {
  awardId: string;
  achievementId: string;
  name: string;
  description: string | null;
  eventDate: string | null;
  awardedAt: string;
  comment: string | null;
  revokedAt: string | null;
}

export interface BalanceOperation {
  operationId: string;
  kind: string;
  lessons: number;
  comment: string | null;
  expiresOn: string | null;
  sessionId: string | null;
  createdAt: string;
}

export const BALANCE_KIND_LABELS: Record<string, string> = {
  topup: 'Начисление',
  charge: 'Списание',
  refund: 'Возврат',
  correction: 'Корректировка',
  expire: 'Истечение'
};
export interface Group {
  id: string;
  courseId: string;
  name: string;
  archived: boolean;
  memberCount: number;
}

export interface GroupMember {
  membershipId: string;
  displayName: string;
}

export interface AchievementCatalogItem {
  achievementId: string;
  name: string;
  description: string | null;
  eventDate: string | null;
  archived: boolean;
  awardedCount: number;
}

export interface SessionAttendanceItem {
  membershipId: string;
  studentName: string;
  attendanceId: string | null;
  status: string | null;
  markedAt: string | null;
}