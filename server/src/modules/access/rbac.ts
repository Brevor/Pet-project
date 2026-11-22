export const ROLES = ['owner', 'admin', 'curator', 'teacher', 'assistant', 'student'] as const;
export type Role = (typeof ROLES)[number];

export type Action =
  | 'studio.read'
  | 'studio.write'
  | 'studio.archive'
  | 'members.read'
  | 'members.write'
  | 'students.write'
  | 'rooms.write'
  | 'courses.write'
  | 'schedule.read'
  | 'schedule.write';

const PERMISSIONS: Record<Action, Role[]> = {
  'studio.read': ['owner', 'admin', 'curator', 'teacher', 'assistant', 'student'],
  'studio.write': ['owner', 'admin'],
  'studio.archive': ['owner'],
  'members.read': ['owner', 'admin', 'curator'],
  'members.write': ['owner', 'admin'],
  'students.write': ['owner', 'admin', 'curator'],
  'rooms.write': ['owner', 'admin', 'curator'],
  'courses.write': ['owner', 'admin', 'curator'],
  'schedule.read': ['owner', 'admin', 'curator', 'teacher', 'assistant', 'student'],
  'schedule.write': ['owner', 'admin', 'curator']
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Права — объединение ролей: достаточно совпадения хотя бы одной. */
export function can(roles: readonly string[], action: Action): boolean {
  const allowed = PERMISSIONS[action];
  return roles.some((role) => (allowed as readonly string[]).includes(role));
}
