import type { Pool } from 'pg';
import { AppError } from '../../errors';
import { chargeAttendanceLesson, refundAttendanceLesson } from '../balance/repository';

export const ATTENDANCE_STATUSES = ['attended', 'no_show', 'cancelled'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface SessionAttendanceContext {
  sessionId: string;
  courseId: string;
  status: string;
  startsAt: string;
  studioArchived: boolean;
  beforeStart: boolean;
  withinCheckIn: boolean;
  afterStudioCreated: boolean;
}

interface SessionContextRow {
  session_id: string;
  course_id: string;
  status: string;
  starts_at: Date;
  studio_archived: boolean;
  before_start: boolean;
  within_check_in: boolean;
  after_studio_created: boolean;
}

const SESSION_CONTEXT_SQL = `
  SELECT s.id AS session_id,
         s.course_id,
         s.status,
         s.starts_at,
         st.archived_at IS NOT NULL AS studio_archived,
         now() < s.starts_at AS before_start,
         now() >= s.starts_at
           AND now() <= (((s.starts_at AT TIME ZONE st.timezone) + interval '120 minutes') AT TIME ZONE st.timezone)
           AS within_check_in,
         (s.starts_at AT TIME ZONE st.timezone)::date
           >= (st.created_at AT TIME ZONE st.timezone)::date AS after_studio_created
    FROM class_sessions s
    JOIN studios st ON st.id = s.studio_id
   WHERE s.studio_id = $1 AND s.id = $2
`;

export async function getSessionAttendanceContext(
  pool: Pool,
  studioId: string,
  sessionId: string
): Promise<SessionAttendanceContext | null> {
  const { rows } = await pool.query<SessionContextRow>(SESSION_CONTEXT_SQL, [studioId, sessionId]);
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    sessionId: row.session_id,
    courseId: row.course_id,
    status: row.status,
    startsAt: row.starts_at.toISOString(),
    studioArchived: row.studio_archived,
    beforeStart: row.before_start,
    withinCheckIn: row.within_check_in,
    afterStudioCreated: row.after_studio_created
  };
}

export async function isStudentMember(
  pool: Pool,
  studioId: string,
  membershipId: string
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1
       FROM memberships m
      WHERE m.studio_id = $1 AND m.id = $2 AND m.status = 'active'
        AND EXISTS (
          SELECT 1 FROM membership_roles r
           WHERE r.membership_id = m.id AND r.role = 'student'
        )`,
    [studioId, membershipId]
  );
  return (rowCount ?? 0) > 0;
}

export async function isInRoster(
  pool: Pool,
  studioId: string,
  courseId: string,
  membershipId: string
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1
       FROM course_group_members g
       JOIN memberships m ON m.id = g.membership_id AND m.status = 'active'
       JOIN membership_roles r ON r.membership_id = m.id AND r.role = 'student'
      WHERE g.studio_id = $1 AND g.course_id = $2 AND g.membership_id = $3`,
    [studioId, courseId, membershipId]
  );
  return (rowCount ?? 0) > 0;
}

export interface AttendanceView {
  attendanceId: string;
  sessionId: string;
  membershipId: string;
  status: AttendanceStatus;
  markedAt: string;
}

interface AttendanceDbRow {
  id: string;
  session_id: string;
  membership_id: string;
  status: string;
  marked_at: Date;
}

function toAttendanceView(row: AttendanceDbRow): AttendanceView {
  return {
    attendanceId: row.id,
    sessionId: row.session_id,
    membershipId: row.membership_id,
    status: row.status as AttendanceStatus,
    markedAt: row.marked_at.toISOString()
  };
}

export interface CreateAttendanceInput {
  studioId: string;
  sessionId: string;
  membershipId: string;
  status: AttendanceStatus;
  actorUserId: string | null;
}

export async function createAttendance(
  pool: Pool,
  input: CreateAttendanceInput
): Promise<AttendanceView> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<AttendanceDbRow>(
      `INSERT INTO attendance (studio_id, session_id, membership_id, status, marked_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, session_id, membership_id, status, marked_at`,
      [input.studioId, input.sessionId, input.membershipId, input.status, input.actorUserId]
    );
    if (input.status === 'attended') {
      await chargeAttendanceLesson(client, {
        studioId: input.studioId,
        sessionId: input.sessionId,
        membershipId: input.membershipId,
        actorUserId: input.actorUserId
      });
    }
    await client.query('COMMIT');
    return toAttendanceView(rows[0]!);
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'ALREADY_MARKED', 'Отметка на этот сеанс уже существует');
    }
    throw error;
  } finally {
    client.release();
  }
}

export interface UpdateAttendanceInput {
  studioId: string;
  attendanceId: string;
  status: AttendanceStatus;
  reason: string | null;
  actorUserId: string;
}

interface AttendanceGuardRow {
  id: string;
  session_id: string;
  membership_id: string;
  status: string;
  marked_at: Date;
  session_status: string;
  studio_archived: boolean;
}

export async function updateAttendance(
  pool: Pool,
  input: UpdateAttendanceInput
): Promise<AttendanceView> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<AttendanceGuardRow>(
      `SELECT a.id, a.session_id, a.membership_id, a.status, a.marked_at,
              s.status AS session_status,
              st.archived_at IS NOT NULL AS studio_archived
         FROM attendance a
         JOIN class_sessions s ON s.id = a.session_id
         JOIN studios st ON st.id = a.studio_id
        WHERE a.studio_id = $1 AND a.id = $2
        FOR UPDATE OF a`,
      [input.studioId, input.attendanceId]
    );
    const current = rows[0];
    if (!current) {
      throw new AppError(404, 'NOT_FOUND', 'Отметка не найдена');
    }
    if (current.studio_archived) {
      throw new AppError(403, 'STUDIO_ARCHIVED', 'Студия в архиве — отметки запрещены');
    }
    if (current.session_status === 'cancelled') {
      throw new AppError(409, 'SESSION_CANCELLED', 'Сеанс отменён — отметки запрещены');
    }

    let markedAt = current.marked_at;
    if (current.status !== input.status) {
      const updated = await client.query<{ marked_at: Date }>(
        `UPDATE attendance
            SET status = $3, updated_by = $4, updated_at = now()
          WHERE studio_id = $1 AND id = $2
          RETURNING marked_at`,
        [input.studioId, input.attendanceId, input.status, input.actorUserId]
      );
      markedAt = updated.rows[0]!.marked_at;
      await client.query(
        `INSERT INTO attendance_revisions
           (studio_id, attendance_id, from_status, to_status, reason, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [input.studioId, input.attendanceId, current.status, input.status, input.reason, input.actorUserId]
      );
      if (input.status === 'attended') {
        await chargeAttendanceLesson(client, {
          studioId: input.studioId,
          sessionId: current.session_id,
          membershipId: current.membership_id,
          actorUserId: input.actorUserId
        });
      } else if (current.status === 'attended') {
        await refundAttendanceLesson(client, {
          studioId: input.studioId,
          sessionId: current.session_id,
          membershipId: current.membership_id,
          actorUserId: input.actorUserId,
          reason: input.reason
        });
      }
    }

    await client.query('COMMIT');
    return {
      attendanceId: current.id,
      sessionId: current.session_id,
      membershipId: current.membership_id,
      status: input.status,
      markedAt: markedAt.toISOString()
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface SessionAttendanceItem {
  membershipId: string;
  studentName: string;
  attendanceId: string | null;
  status: AttendanceStatus | null;
  markedAt: string | null;
}

interface SessionAttendanceRow {
  membership_id: string;
  student_name: string;
  attendance_id: string | null;
  status: string | null;
  marked_at: Date | null;
}

function toSessionAttendanceItem(row: SessionAttendanceRow): SessionAttendanceItem {
  return {
    membershipId: row.membership_id,
    studentName: row.student_name,
    attendanceId: row.attendance_id,
    status: row.status as AttendanceStatus | null,
    markedAt: row.marked_at ? row.marked_at.toISOString() : null
  };
}

export async function listSessionAttendance(
  pool: Pool,
  studioId: string,
  sessionId: string,
  courseId: string,
  onlyMembershipId?: string
): Promise<SessionAttendanceItem[]> {
  const [roster, added] = await Promise.all([
    pool.query<SessionAttendanceRow>(
      `SELECT g.membership_id,
              coalesce(u.display_name, u.email) AS student_name,
              a.id AS attendance_id,
              a.status,
              a.marked_at
         FROM course_group_members g
         JOIN memberships m ON m.id = g.membership_id AND m.status = 'active'
         JOIN users u ON u.id = m.user_id
         JOIN membership_roles r ON r.membership_id = m.id AND r.role = 'student'
         LEFT JOIN attendance a ON a.session_id = $3 AND a.membership_id = g.membership_id
        WHERE g.studio_id = $1 AND g.course_id = $2
          AND ($4::uuid IS NULL OR g.membership_id = $4)
        ORDER BY student_name`,
      [studioId, courseId, sessionId, onlyMembershipId ?? null]
    ),
    pool.query<SessionAttendanceRow>(
      `SELECT a.membership_id,
              coalesce(u.display_name, u.email) AS student_name,
              a.id AS attendance_id,
              a.status,
              a.marked_at
         FROM attendance a
         JOIN memberships m ON m.id = a.membership_id
         JOIN users u ON u.id = m.user_id
        WHERE a.studio_id = $1 AND a.session_id = $3
          AND NOT EXISTS (
            SELECT 1 FROM course_group_members g
             WHERE g.studio_id = $1 AND g.course_id = $2 AND g.membership_id = a.membership_id
          )
          AND ($4::uuid IS NULL OR a.membership_id = $4)
        ORDER BY student_name`,
      [studioId, courseId, sessionId, onlyMembershipId ?? null]
    )
  ]);

  return [...roster.rows, ...added.rows].map(toSessionAttendanceItem);
}

export interface AttendanceRevisionView {
  fromStatus: AttendanceStatus;
  toStatus: AttendanceStatus;
  reason: string | null;
  changedAt: string;
  changedByName: string | null;
}

export interface StudentAttendanceItem {
  attendanceId: string;
  sessionId: string;
  status: AttendanceStatus;
  markedAt: string;
  startsAt: string;
  endsAt: string;
  courseName: string;
  roomName: string;
  teacherName: string;
  revisions?: AttendanceRevisionView[];
}

interface HistoryRow {
  id: string;
  status: string;
  marked_at: Date;
  session_id: string;
  starts_at: Date;
  ends_at: Date;
  course_name: string;
  room_name: string;
  teacher_name: string;
}

interface RevisionRow {
  attendance_id: string;
  from_status: string;
  to_status: string;
  reason: string | null;
  changed_at: Date;
  changed_by_name: string | null;
}

export interface StudentAttendancePage {
  items: StudentAttendanceItem[];
  total: number;
  page: number;
  perPage: number;
}

export async function listStudentAttendance(
  pool: Pool,
  studioId: string,
  membershipId: string,
  page: number,
  perPage: number,
  includeRevisions: boolean
): Promise<StudentAttendancePage> {
  const count = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total
       FROM attendance
      WHERE studio_id = $1 AND membership_id = $2`,
    [studioId, membershipId]
  );

  const { rows } = await pool.query<HistoryRow>(
    `SELECT a.id,
            a.status,
            a.marked_at,
            s.id AS session_id,
            s.starts_at,
            s.ends_at,
            c.name AS course_name,
            r.name AS room_name,
            coalesce(u.display_name, u.email) AS teacher_name
       FROM attendance a
       JOIN class_sessions s ON s.id = a.session_id
       JOIN courses c ON c.id = s.course_id
       JOIN rooms r ON r.id = s.room_id
       JOIN memberships tm ON tm.id = s.teacher_membership_id
       JOIN users u ON u.id = tm.user_id
      WHERE a.studio_id = $1 AND a.membership_id = $2
      ORDER BY s.starts_at DESC
      LIMIT $3 OFFSET $4`,
    [studioId, membershipId, perPage, (page - 1) * perPage]
  );

  let revisions = new Map<string, AttendanceRevisionView[]>();
  if (includeRevisions && rows.length > 0) {
    const { rows: revisionRows } = await pool.query<RevisionRow>(
      `SELECT r.attendance_id, r.from_status, r.to_status, r.reason, r.changed_at,
              coalesce(u.display_name, u.email) AS changed_by_name
         FROM attendance_revisions r
         LEFT JOIN users u ON u.id = r.changed_by
        WHERE r.studio_id = $1 AND r.attendance_id = ANY($2::uuid[])
        ORDER BY r.changed_at`,
      [studioId, rows.map((row) => row.id)]
    );
    revisions = revisionRows.reduce((map, row) => {
      const list = map.get(row.attendance_id) ?? [];
      list.push({
        fromStatus: row.from_status as AttendanceStatus,
        toStatus: row.to_status as AttendanceStatus,
        reason: row.reason,
        changedAt: row.changed_at.toISOString(),
        changedByName: row.changed_by_name
      });
      map.set(row.attendance_id, list);
      return map;
    }, new Map<string, AttendanceRevisionView[]>());
  }

  const items = rows.map<StudentAttendanceItem>((row) => {
    const item: StudentAttendanceItem = {
      attendanceId: row.id,
      sessionId: row.session_id,
      status: row.status as AttendanceStatus,
      markedAt: row.marked_at.toISOString(),
      startsAt: row.starts_at.toISOString(),
      endsAt: row.ends_at.toISOString(),
      courseName: row.course_name,
      roomName: row.room_name,
      teacherName: row.teacher_name
    };
    if (includeRevisions) {
      item.revisions = revisions.get(row.id) ?? [];
    }
    return item;
  });

  return { items, total: Number(count.rows[0]?.total ?? '0'), page, perPage };
}

