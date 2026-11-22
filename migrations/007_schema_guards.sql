-- 007: страховки схемы — диапазон дней недели и связь ролей с членством
-- Основание: architecture.md §5.8 («каждое 1–7») и §9 (составные FK исключают
-- межстудийные связи). Данные не меняются, откат — DROP CONSTRAINT.

ALTER TABLE class_series
  ADD CONSTRAINT class_series_weekdays_range
  CHECK (weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]);

ALTER TABLE membership_roles
  ADD CONSTRAINT membership_roles_membership_studio_fkey
  FOREIGN KEY (studio_id, membership_id) REFERENCES memberships (studio_id, id) ON DELETE CASCADE;

ALTER TABLE membership_roles
  DROP CONSTRAINT membership_roles_membership_id_fkey;

ALTER TABLE membership_roles
  DROP CONSTRAINT membership_roles_studio_id_fkey;
