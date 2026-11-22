-- 003: залы и каталог курсов
CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios (id) ON DELETE CASCADE,
  name text NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  description text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, id)
);

CREATE UNIQUE INDEX rooms_name_key ON rooms (studio_id, lower(name));

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 140),
  direction text,
  level text NOT NULL DEFAULT 'none' CHECK (level IN ('beginner', 'intermediate', 'advanced', 'none')),
  kind text NOT NULL CHECK (kind IN ('group', 'individual')),
  default_duration_min integer NOT NULL CHECK (default_duration_min IN (45, 60, 75, 90, 120)),
  capacity integer NOT NULL CHECK (capacity > 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, id)
);

CREATE UNIQUE INDEX courses_name_key ON courses (studio_id, lower(name));
