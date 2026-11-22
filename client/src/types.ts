export interface Membership {
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
  email: string;
  displayName: string | null;
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
  archived: boolean;
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
