-- 002: членство в студии и роли
CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, user_id),
  UNIQUE (studio_id, id)
);

CREATE INDEX memberships_user_idx ON memberships (user_id);

CREATE TABLE membership_roles (
  membership_id uuid NOT NULL REFERENCES memberships (id) ON DELETE CASCADE,
  studio_id uuid NOT NULL REFERENCES studios (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'curator', 'teacher', 'assistant', 'student')),
  PRIMARY KEY (membership_id, role)
);

-- ровно один владелец на студию
CREATE UNIQUE INDEX membership_single_owner ON membership_roles (studio_id) WHERE role = 'owner';
