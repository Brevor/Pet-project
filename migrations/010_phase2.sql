-- 010_phase2.sql — Фаза 2: группы, посещаемость, баланс занятий, достижения
-- Требования: groups v1.0.0, attendance v1.0.0, balance v1.0.0, achievements v1.0.0

CREATE TABLE course_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios (id) ON DELETE CASCADE,
  course_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, id),
  UNIQUE (course_id, lower(name)),
  FOREIGN KEY (studio_id, course_id) REFERENCES courses (studio_id, id) ON DELETE CASCADE
);
CREATE INDEX course_groups_studio_idx ON course_groups (studio_id);

CREATE TABLE course_group_members (
  studio_id uuid NOT NULL,
  group_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, membership_id),
  UNIQUE (membership_id, group_id),
  FOREIGN KEY (studio_id, group_id) REFERENCES course_groups (studio_id, id) ON DELETE CASCADE,
  FOREIGN KEY (studio_id, membership_id) REFERENCES memberships (studio_id, id) ON DELETE CASCADE
);
CREATE INDEX course_group_members_studio_idx ON course_group_members (studio_id);

CREATE TABLE attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL,
  session_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('attended', 'no_show', 'cancelled')),
  marked_by uuid REFERENCES users (id) ON DELETE SET NULL,
  marked_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, id),
  UNIQUE (session_id, membership_id),
  FOREIGN KEY (studio_id, session_id) REFERENCES class_sessions (studio_id, id) ON DELETE CASCADE,
  FOREIGN KEY (studio_id, membership_id) REFERENCES memberships (studio_id, id) ON DELETE CASCADE
);
CREATE INDEX attendance_studio_idx ON attendance (studio_id);
CREATE INDEX attendance_membership_idx ON attendance (membership_id, marked_at DESC);

CREATE TABLE attendance_revisions (
  id bigserial PRIMARY KEY,
  studio_id uuid NOT NULL,
  attendance_id uuid NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 300),
  changed_by uuid REFERENCES users (id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (studio_id, attendance_id) REFERENCES attendance (studio_id, id) ON DELETE CASCADE
);
CREATE INDEX attendance_revisions_attendance_idx ON attendance_revisions (attendance_id, changed_at);

CREATE TABLE lesson_balance_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('topup', 'charge', 'refund', 'correction', 'expire')),
  lessons integer NOT NULL CHECK (lessons <> 0 AND abs(lessons) <= 999),
  expires_on date,
  comment text CHECK (comment IS NULL OR char_length(comment) <= 300),
  session_id uuid,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (studio_id, membership_id) REFERENCES memberships (studio_id, id) ON DELETE CASCADE,
  FOREIGN KEY (studio_id, session_id) REFERENCES class_sessions (studio_id, id) ON DELETE SET NULL,
  CHECK (kind <> 'topup' OR lessons > 0)
);
CREATE INDEX lesson_balance_membership_idx ON lesson_balance_operations (membership_id, created_at DESC);
CREATE UNIQUE INDEX lesson_balance_charge_once
  ON lesson_balance_operations (session_id, membership_id) WHERE kind = 'charge';

CREATE TABLE achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  description text CHECK (description IS NULL OR char_length(description) <= 300),
  event_date date,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, id),
  UNIQUE (studio_id, lower(name))
);
CREATE INDEX achievements_studio_idx ON achievements (studio_id);

CREATE TABLE student_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL,
  achievement_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  awarded_by uuid REFERENCES users (id) ON DELETE SET NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 300),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users (id) ON DELETE SET NULL,
  UNIQUE (studio_id, id),
  FOREIGN KEY (studio_id, achievement_id) REFERENCES achievements (studio_id, id) ON DELETE CASCADE,
  FOREIGN KEY (studio_id, membership_id) REFERENCES memberships (studio_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX student_achievement_active_once
  ON student_achievements (achievement_id, membership_id) WHERE revoked_at IS NULL;
CREATE INDEX student_achievements_membership_idx ON student_achievements (membership_id);
