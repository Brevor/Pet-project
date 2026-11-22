-- 009: профиль пользователя (profile.md v0.4.0, PRF-1…PRF-13)
-- Аккаунт глобальный: поля добавляются в users, студийного контекста нет.
-- Все поля nullable — существующие аккаунты не ломаются; обязательность имени и фамилии
-- обеспечивает API при сохранении профиля (Q16).

ALTER TABLE users
  ADD COLUMN first_name text
    CHECK (first_name IS NULL OR char_length(first_name) BETWEEN 1 AND 80);

ALTER TABLE users
  ADD COLUMN last_name text
    CHECK (last_name IS NULL OR char_length(last_name) BETWEEN 1 AND 80);

ALTER TABLE users
  ADD COLUMN phone text
    CHECK (
      phone IS NULL
      OR (char_length(phone) BETWEEN 3 AND 32 AND phone ~ '^[0-9+() -]+$')
    );

ALTER TABLE users
  ADD COLUMN social_url text
    CHECK (social_url IS NULL OR (char_length(social_url) <= 200 AND social_url ~ '^https?://'));

ALTER TABLE users
  ADD COLUMN messenger_contact text
    CHECK (messenger_contact IS NULL OR char_length(messenger_contact) <= 100);

ALTER TABLE users
  ADD COLUMN avatar_key text
    CHECK (avatar_key IS NULL OR char_length(avatar_key) BETWEEN 1 AND 64);

ALTER TABLE users
  ADD COLUMN about text
    CHECK (about IS NULL OR char_length(about) <= 500);
