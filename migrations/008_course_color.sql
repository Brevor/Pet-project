-- 008: цвет курса (CLS-9, Q12) — фиксированная палитра из 12 значений
-- Значение используется для блоков сеансов в календаре (SCH-21). Свободный hex не поддерживается.
ALTER TABLE courses
  ADD COLUMN color text NOT NULL DEFAULT 'violet'
  CHECK (color IN ('violet', 'indigo', 'blue', 'sky', 'teal', 'green',
                   'lime', 'amber', 'orange', 'red', 'rose', 'pink'));

-- Детерминированный бэкфилл: существующие курсы получают разные цвета по хешу id.
UPDATE courses
   SET color = (ARRAY['violet', 'indigo', 'blue', 'sky', 'teal', 'green',
                      'lime', 'amber', 'orange', 'red', 'rose', 'pink'])
               [1 + ((hashtext(id::text) % 12) + 12) % 12];
