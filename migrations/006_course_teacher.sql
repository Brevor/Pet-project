-- 006: преподаватель по умолчанию у курса (CLS-7)
ALTER TABLE courses
  ADD COLUMN teacher_membership_id uuid;

ALTER TABLE courses
  ADD CONSTRAINT courses_teacher_membership_fk
    FOREIGN KEY (studio_id, teacher_membership_id)
    REFERENCES memberships (studio_id, id)
    ON DELETE SET NULL (teacher_membership_id);
