-- 001: аккаунты, студии и рабочие часы
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  display_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TABLE studios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  timezone text NOT NULL DEFAULT 'Europe/Moscow',
  contacts jsonb,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE studio_working_hours (
  studio_id uuid NOT NULL REFERENCES studios (id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (studio_id, weekday),
  CHECK (is_closed OR closes_at > opens_at)
);
