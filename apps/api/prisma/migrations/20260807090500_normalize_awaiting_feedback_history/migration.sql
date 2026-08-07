BEGIN;
UPDATE "sample_histories"
SET "before" = jsonb_set("before", '{status}', '"DELIVERED"'::jsonb, false)
WHERE "before"->>'status' = 'AWAITING_FEEDBACK';

UPDATE "sample_histories"
SET "after" = jsonb_set("after", '{status}', '"DELIVERED"'::jsonb, false)
WHERE "after"->>'status' = 'AWAITING_FEEDBACK';
COMMIT;
