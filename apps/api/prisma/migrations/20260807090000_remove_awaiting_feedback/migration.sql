-- Preserve the business meaning of historical records before removing the
-- redundant intermediate status from the persisted enum.
BEGIN;
UPDATE "sample_rounds"
SET "status" = 'DELIVERED'
WHERE "status" = 'AWAITING_FEEDBACK';

UPDATE "sample_rounds"
SET "dispositionStatus" = 'PENDING'
WHERE "dispositionStatus" IN ('RETURN_PENDING', 'LEGACY_UNRESOLVED');

UPDATE "sample_return_records"
SET "dispositionStatus" = 'PENDING'
WHERE "dispositionStatus" IN ('RETURN_PENDING', 'LEGACY_UNRESOLVED');

UPDATE "sample_rounds"
SET "retentionEvidenceStatus" = 'PENDING'
WHERE "retentionEvidenceStatus" = 'LEGACY_UNRECORDED';

UPDATE "sample_histories"
SET "before" = jsonb_set("before", '{dispositionStatus}', '"PENDING"'::jsonb, false)
WHERE "before"->>'dispositionStatus' IN ('RETURN_PENDING', 'LEGACY_UNRESOLVED');

UPDATE "sample_histories"
SET "after" = jsonb_set("after", '{dispositionStatus}', '"PENDING"'::jsonb, false)
WHERE "after"->>'dispositionStatus' IN ('RETURN_PENDING', 'LEGACY_UNRESOLVED');

CREATE TYPE "SampleRoundStatus_new" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVAL_REJECTED', 'PREPARING', 'RETAINED', 'SHIPPED', 'DELIVERED', 'FEEDBACK_RECEIVED', 'COMPLETED', 'VOIDED');
ALTER TABLE "sample_rounds" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "sample_rounds" ALTER COLUMN "status" TYPE "SampleRoundStatus_new" USING ("status"::text::"SampleRoundStatus_new");
ALTER TYPE "SampleRoundStatus" RENAME TO "SampleRoundStatus_old";
ALTER TYPE "SampleRoundStatus_new" RENAME TO "SampleRoundStatus";
DROP TYPE "SampleRoundStatus_old";
ALTER TABLE "sample_rounds" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

CREATE TYPE "SampleDispositionStatus_new" AS ENUM ('PENDING', 'RETURNED', 'CUSTOMER_KEPT', 'DISPOSED');
ALTER TABLE "sample_rounds" ALTER COLUMN "dispositionStatus" DROP DEFAULT;
ALTER TABLE "sample_rounds" ALTER COLUMN "dispositionStatus" TYPE "SampleDispositionStatus_new" USING ("dispositionStatus"::text::"SampleDispositionStatus_new");
ALTER TABLE "sample_return_records" ALTER COLUMN "dispositionStatus" TYPE "SampleDispositionStatus_new" USING ("dispositionStatus"::text::"SampleDispositionStatus_new");
ALTER TYPE "SampleDispositionStatus" RENAME TO "SampleDispositionStatus_old";
ALTER TYPE "SampleDispositionStatus_new" RENAME TO "SampleDispositionStatus";
DROP TYPE "SampleDispositionStatus_old";
ALTER TABLE "sample_rounds" ALTER COLUMN "dispositionStatus" SET DEFAULT 'PENDING';

CREATE TYPE "SampleRetentionEvidenceStatus_new" AS ENUM ('PENDING', 'RECORDED');
ALTER TABLE "sample_rounds" ALTER COLUMN "retentionEvidenceStatus" DROP DEFAULT;
ALTER TABLE "sample_rounds" ALTER COLUMN "retentionEvidenceStatus" TYPE "SampleRetentionEvidenceStatus_new" USING ("retentionEvidenceStatus"::text::"SampleRetentionEvidenceStatus_new");
ALTER TYPE "SampleRetentionEvidenceStatus" RENAME TO "SampleRetentionEvidenceStatus_old";
ALTER TYPE "SampleRetentionEvidenceStatus_new" RENAME TO "SampleRetentionEvidenceStatus";
DROP TYPE "SampleRetentionEvidenceStatus_old";
ALTER TABLE "sample_rounds" ALTER COLUMN "retentionEvidenceStatus" SET DEFAULT 'PENDING';

DROP INDEX IF EXISTS "sample_requests_status_updatedAt_idx";
ALTER TABLE "sample_requests" DROP COLUMN IF EXISTS "status";
DROP TYPE IF EXISTS "SampleRequestStatus";
COMMIT;
