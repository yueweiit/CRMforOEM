-- Repair databases where the sample workflow migrations were marked applied
-- before their final SQL was present on disk.
BEGIN;

-- Normalize persisted legacy values before narrowing the enum definitions.
UPDATE "sample_rounds"
SET "status" = 'DELIVERED'::"SampleRoundStatus"
WHERE "status"::text = 'AWAITING_FEEDBACK';

UPDATE "sample_rounds"
SET "dispositionStatus" = 'PENDING'::"SampleDispositionStatus"
WHERE "dispositionStatus"::text IN ('RETURN_PENDING', 'LEGACY_UNRESOLVED');

UPDATE "sample_return_records"
SET "dispositionStatus" = 'PENDING'::"SampleDispositionStatus"
WHERE "dispositionStatus"::text IN ('RETURN_PENDING', 'LEGACY_UNRESOLVED');

UPDATE "sample_rounds"
SET "retentionEvidenceStatus" = 'PENDING'::"SampleRetentionEvidenceStatus"
WHERE "retentionEvidenceStatus"::text = 'LEGACY_UNRECORDED';

UPDATE "sample_histories"
SET "before" = jsonb_set("before", '{status}', '"DELIVERED"'::jsonb, false)
WHERE "before"->>'status' = 'AWAITING_FEEDBACK';

UPDATE "sample_histories"
SET "after" = jsonb_set("after", '{status}', '"DELIVERED"'::jsonb, false)
WHERE "after"->>'status' = 'AWAITING_FEEDBACK';

UPDATE "sample_histories"
SET "before" = jsonb_set("before", '{dispositionStatus}', '"PENDING"'::jsonb, false)
WHERE "before"->>'dispositionStatus' IN ('RETURN_PENDING', 'LEGACY_UNRESOLVED');

UPDATE "sample_histories"
SET "after" = jsonb_set("after", '{dispositionStatus}', '"PENDING"'::jsonb, false)
WHERE "after"->>'dispositionStatus' IN ('RETURN_PENDING', 'LEGACY_UNRESOLVED');

-- Rebuild enums so removed labels cannot be written or decoded again.
CREATE TYPE "SampleRoundStatus_new" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVAL_REJECTED', 'PREPARING', 'RETAINED', 'SHIPPED', 'DELIVERED', 'FEEDBACK_RECEIVED', 'COMPLETED', 'VOIDED');
ALTER TABLE "sample_rounds" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "sample_rounds" ALTER COLUMN "status" TYPE "SampleRoundStatus_new" USING ("status"::text::"SampleRoundStatus_new");
ALTER TYPE "SampleRoundStatus" RENAME TO "SampleRoundStatus_old";
ALTER TYPE "SampleRoundStatus_new" RENAME TO "SampleRoundStatus";
DROP TYPE "SampleRoundStatus_old";
ALTER TABLE "sample_rounds" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

CREATE TYPE "SampleDispositionStatus_new" AS ENUM ('PENDING', 'RETURNED', 'CUSTOMER_KEPT', 'DISPOSED');
ALTER TABLE "sample_rounds" ALTER COLUMN "dispositionStatus" DROP DEFAULT;
ALTER TABLE "sample_return_records" ALTER COLUMN "dispositionStatus" DROP DEFAULT;
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

-- Remove the legacy request-level state and fields now owned by SampleRound.
DROP INDEX IF EXISTS "sample_requests_status_updatedAt_idx";
ALTER TABLE "sample_requests"
    DROP COLUMN IF EXISTS "status",
    DROP COLUMN IF EXISTS "specification",
    DROP COLUMN IF EXISTS "material",
    DROP COLUMN IF EXISTS "process",
    DROP COLUMN IF EXISTS "sampleQuantity",
    DROP COLUMN IF EXISTS "deliveryDeadline",
    DROP COLUMN IF EXISTS "fileAssetIds",
    DROP COLUMN IF EXISTS "trackingNo",
    DROP COLUMN IF EXISTS "carrier",
    DROP COLUMN IF EXISTS "shippedAt",
    DROP COLUMN IF EXISTS "deliveredAt",
    DROP COLUMN IF EXISTS "approvedAt",
    DROP COLUMN IF EXISTS "approvalComment",
    DROP COLUMN IF EXISTS "returnedAt",
    DROP COLUMN IF EXISTS "storedAt",
    DROP COLUMN IF EXISTS "voidedAt",
    DROP COLUMN IF EXISTS "feedback";

DROP TYPE IF EXISTS "SampleRequestStatus";
DROP TYPE IF EXISTS "SampleStatus";
DROP TYPE IF EXISTS "SampleReturnType";

COMMIT;
