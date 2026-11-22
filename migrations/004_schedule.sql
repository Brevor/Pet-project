-- 004: серии и сеансы расписания
CREATE TABLE class_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios (id) ON DELETE CASCADE,
  course_id uuid NOT NULL,
  room_id uuid NOT NULL,
  teacher_membership_id uuid NOT NULL,
  weekdays smallint[] NOT NULL CHECK (array_length(weekdays, 1) > 0),
  start_time time NOT NULL,
  duration_min integer NOT NULL CHECK (duration_min BETWEEN 45 AND 120),
  starts_on date NOT NULL,
  until date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (until >= starts_on),
  UNIQUE (studio_id, id),
  FOREIGN KEY (studio_id, course_id) REFERENCES courses (studio_id, id),
  FOREIGN KEY (studio_id, room_id) REFERENCES rooms (studio_id, id),
  FOREIGN KEY (studio_id, teacher_membership_id) REFERENCES memberships (studio_id, id)
);

CREATE TABLE class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios (id) ON DELETE CASCADE,
  series_id uuid,
  course_id uuid NOT NULL,
  room_id uuid NOT NULL,
  teacher_membership_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  FOREIGN KEY (studio_id, series_id) REFERENCES class_series (studio_id, id),
  FOREIGN KEY (studio_id, course_id) REFERENCES courses (studio_id, id),
  FOREIGN KEY (studio_id, room_id) REFERENCES rooms (studio_id, id),
  FOREIGN KEY (studio_id, teacher_membership_id) REFERENCES memberships (studio_id, id)
);

CREATE INDEX class_sessions_starts_idx ON class_sessions (studio_id, starts_at);
CREATE INDEX class_sessions_room_idx ON class_sessions (studio_id, room_id, starts_at);
CREATE INDEX class_sessions_teacher_idx ON class_sessions (studio_id, teacher_membership_id, starts_at);

ALTER TABLE class_sessions ADD CONSTRAINT no_room_overlap
  EXCLUDE USING gist (room_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status = 'scheduled');

ALTER TABLE class_sessions ADD CONSTRAINT no_teacher_overlap
  EXCLUDE USING gist (teacher_membership_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status = 'scheduled');
