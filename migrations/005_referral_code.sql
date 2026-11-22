-- 005: реферальный код студии (REF-1, REF-2)
ALTER TABLE studios ADD COLUMN referral_code text;

UPDATE studios
   SET referral_code = lower(substr(md5(id::text || random()::text), 1, 8))
 WHERE referral_code IS NULL;

DO $$
BEGIN
  WHILE EXISTS (
    SELECT 1 FROM studios GROUP BY lower(referral_code) HAVING count(*) > 1
  ) LOOP
    UPDATE studios s
       SET referral_code = lower(substr(md5(random()::text || s.id::text), 1, 8))
     WHERE lower(s.referral_code) IN (
       SELECT lower(referral_code) FROM studios GROUP BY lower(referral_code) HAVING count(*) > 1
     );
  END LOOP;
END $$;

ALTER TABLE studios ALTER COLUMN referral_code SET NOT NULL;

CREATE UNIQUE INDEX studios_referral_code_key ON studios (lower(referral_code));
