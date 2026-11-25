import type { Pool, PoolClient } from 'pg';
import { AppError } from '../../errors';

type Db = Pool | PoolClient;

export type OperationKind = 'topup' | 'charge' | 'refund' | 'correction' | 'expire';

const NEVER_EXPIRES = '9999-12-31';

interface LedgerRow {
  lessons: number;
  expires_on: string | null;
  op_date: string;
}

interface Pack {
  expiresOn: string | null;
  remaining: number;
}

/**
 * Остаток = неиспользованные занятия неистёкших пакетов. Списание расходует пакеты, действовавшие
 * на момент списания (раньше истекает — раньше расходуется), поэтому просроченные занятия исчезают
 * из остатка, но и списать их нельзя.
 */
export async function computeBalance(
  db: Db,
  studioId: string,
  membershipId: string
): Promise<number> {
  const today = await db.query<{ today: string }>(
    `SELECT (now() AT TIME ZONE timezone)::date::text AS today FROM studios WHERE id = $1`,
    [studioId]
  );
  const todayValue = today.rows[0]?.today;
  if (!todayValue) {
    throw new AppError(404, 'NOT_FOUND', 'Студия не найдена');
  }

  const { rows } = await db.query<LedgerRow>(
    `SELECT o.lessons,
            o.expires_on::text AS expires_on,
            (o.created_at AT TIME ZONE s.timezone)::date::text AS op_date
       FROM lesson_balance_operations o
       JOIN studios s ON s.id = o.studio_id
      WHERE o.studio_id = $1 AND o.membership_id = $2
      ORDER BY o.created_at, o.id`,
    [studioId, membershipId]
  );

  const packs: Pack[] = [];
  for (const op of rows) {
    if (op.lessons > 0) {
      packs.push({ expiresOn: op.expires_on, remaining: op.lessons });
      continue;
    }

    let needed = -op.lessons;
    const valid = packs
      .filter((pack) => pack.remaining > 0 && wasValidOn(pack, op.op_date))
      .sort(byExpiry);
    needed = consume(valid, needed);

    if (needed > 0) {
      consume(
        packs.filter((pack) => pack.remaining > 0).sort(byExpiry),
        needed
      );
    }
  }

  return packs
    .filter((pack) => !isExpired(pack, todayValue))
    .reduce((sum, pack) => sum + pack.remaining, 0);
}

function consume(packs: Pack[], needed: number): number {
  let left = needed;
  for (const pack of packs) {
    if (left === 0) break;
    const spent = Math.min(pack.remaining, left);
    pack.remaining -= spent;
    left -= spent;
  }
  return left;
}

function expiryOf(pack: Pack): string {
  return pack.expiresOn ?? NEVER_EXPIRES;
}

function byExpiry(left: Pack, right: Pack): number {
  return expiryOf(left).localeCompare(expiryOf(right));
}

function wasValidOn(pack: Pack, date: string): boolean {
  return pack.expiresOn === null || pack.expiresOn >= date;
}

function isExpired(pack: Pack, today: string): boolean {
  return pack.expiresOn !== null && pack.expiresOn < today;
}

async function lockMembership(
  db: Db,
  studioId: string,
  membershipId: string
): Promise<void> {
  const { rowCount } = await db.query(
    `SELECT id FROM memberships WHERE studio_id = $1 AND id = $2 FOR UPDATE`,
    [studioId, membershipId]
  );
  if ((rowCount ?? 0) === 0) {
    throw new AppError(422, 'NOT_A_STUDENT', 'Участник не найден в студии');
  }
}

async function sessionBalance(db: Db, studioId: string, membershipId: string, sessionId: string) {
  const { rows } = await db.query<{ net: number }>(
    `SELECT coalesce(sum(lessons), 0)::int AS net
       FROM lesson_balance_operations
      WHERE studio_id = $1 AND membership_id = $2 AND session_id = $3`,
    [studioId, membershipId, sessionId]
  );
  return rows[0]?.net ?? 0;
}

export interface AttendanceBalanceInput {
  studioId: string;
  sessionId: string;
  membershipId: string;
  actorUserId: string | null;
}

/** Списывает занятие за сеанс; вызывается внутри транзакции отметки. */
export async function chargeAttendanceLesson(
  db: Db,
  input: AttendanceBalanceInput
): Promise<void> {
  await lockMembership(db, input.studioId, input.membershipId);
  const net = await sessionBalance(db, input.studioId, input.membershipId, input.sessionId);
  if (net < 0) {
    return;
  }

  const balance = await computeBalance(db, input.studioId, input.membershipId);
  if (balance < 1) {
    throw new AppError(409, 'NO_LESSONS_LEFT', 'На балансе нет занятий');
  }

  const charged = await db.query(
    `SELECT 1 FROM lesson_balance_operations
      WHERE studio_id = $1 AND membership_id = $2 AND session_id = $3 AND kind = 'charge'`,
    [input.studioId, input.membershipId, input.sessionId]
  );
  await db.query(
    `INSERT INTO lesson_balance_operations (studio_id, membership_id, kind, lessons, session_id, created_by)
     VALUES ($1, $2, $3, -1, $4, $5)`,
    [
      input.studioId,
      input.membershipId,
      (charged.rowCount ?? 0) > 0 ? 'correction' : 'charge',
      input.sessionId,
      input.actorUserId
    ]
  );
}

/** Возвращает занятие при снятии отметки; вызывается внутри транзакции правки. */
export async function refundAttendanceLesson(
  db: Db,
  input: AttendanceBalanceInput & { reason: string | null }
): Promise<void> {
  await lockMembership(db, input.studioId, input.membershipId);
  const net = await sessionBalance(db, input.studioId, input.membershipId, input.sessionId);
  if (net >= 0) {
    return;
  }

  await db.query(
    `INSERT INTO lesson_balance_operations
       (studio_id, membership_id, kind, lessons, comment, session_id, created_by)
     VALUES ($1, $2, 'refund', 1, $3, $4, $5)`,
    [input.studioId, input.membershipId, input.reason, input.sessionId, input.actorUserId]
  );
}

export interface OperationView {
  operationId: string;
  kind: OperationKind;
  lessons: number;
  comment: string | null;
  expiresOn: string | null;
  sessionId: string | null;
  createdAt: string;
  createdByName: string | null;
}

interface OperationRow {
  id: string;
  kind: string;
  lessons: number;
  comment: string | null;
  expires_on: string | null;
  session_id: string | null;
  created_at: Date;
  created_by_name: string | null;
}

function toOperation(row: OperationRow): OperationView {
  return {
    operationId: row.id,
    kind: row.kind as OperationKind,
    lessons: row.lessons,
    comment: row.comment,
    expiresOn: row.expires_on,
    sessionId: row.session_id,
    createdAt: row.created_at.toISOString(),
    createdByName: row.created_by_name
  };
}

export interface TopupInput {
  studioId: string;
  membershipId: string;
  lessons: number;
  comment: string | null;
  expiresInMonths: number | null;
  actorUserId: string;
}

export interface TopupResult {
  operation: OperationView;
  balance: number;
}

export async function topUp(pool: Pool, input: TopupInput): Promise<TopupResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockMembership(client, input.studioId, input.membershipId);

    const { rows } = await client.query<OperationRow>(
      `INSERT INTO lesson_balance_operations
         (studio_id, membership_id, kind, lessons, comment, expires_on, created_by)
       VALUES ($1, $2, 'topup', $3, $4,
               CASE WHEN $5::int IS NULL THEN NULL
                    ELSE ((now() AT TIME ZONE (SELECT timezone FROM studios WHERE id = $1))
                          + make_interval(months => $5))::date
               END,
               $6)
       RETURNING id, kind, lessons, comment, expires_on::text AS expires_on, session_id, created_at,
                 NULL::text AS created_by_name`,
      [
        input.studioId,
        input.membershipId,
        input.lessons,
        input.comment,
        input.expiresInMonths,
        input.actorUserId
      ]
    );

    const balance = await computeBalance(client, input.studioId, input.membershipId);
    const actor = await client.query<{ name: string | null }>(
      `SELECT coalesce(display_name, email) AS name FROM users WHERE id = $1`,
      [input.actorUserId]
    );
    const operation = toOperation(rows[0]!);
    operation.createdByName = actor.rows[0]?.name ?? null;
    await client.query('COMMIT');
    return { operation, balance };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface OperationsPage {
  items: OperationView[];
  total: number;
  page: number;
  perPage: number;
}

export async function listBalanceOperations(
  pool: Pool,
  studioId: string,
  membershipId: string,
  page: number,
  perPage: number
): Promise<OperationsPage> {
  const count = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total
       FROM lesson_balance_operations
      WHERE studio_id = $1 AND membership_id = $2`,
    [studioId, membershipId]
  );

  const { rows } = await pool.query<OperationRow>(
    `SELECT o.id, o.kind, o.lessons, o.comment, o.expires_on::text AS expires_on,
            o.session_id, o.created_at,
            coalesce(u.display_name, u.email) AS created_by_name
       FROM lesson_balance_operations o
       LEFT JOIN users u ON u.id = o.created_by
      WHERE o.studio_id = $1 AND o.membership_id = $2
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT $3 OFFSET $4`,
    [studioId, membershipId, perPage, (page - 1) * perPage]
  );

  return {
    items: rows.map(toOperation),
    total: Number(count.rows[0]?.total ?? '0'),
    page,
    perPage
  };
}
