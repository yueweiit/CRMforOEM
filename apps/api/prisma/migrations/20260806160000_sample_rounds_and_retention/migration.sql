-- CreateEnum
CREATE TYPE "SampleRoundStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVAL_REJECTED', 'PREPARING', 'RETAINED', 'SHIPPED', 'DELIVERED', 'AWAITING_FEEDBACK', 'FEEDBACK_RECEIVED', 'COMPLETED', 'VOIDED');

-- CreateEnum
CREATE TYPE "SampleFeedbackResult" AS ENUM ('ACCEPTED', 'RESAMPLE_REQUIRED', 'CUSTOMER_REJECTED');

-- CreateEnum
CREATE TYPE "SampleDispositionStatus" AS ENUM ('PENDING', 'RETURNED', 'CUSTOMER_KEPT', 'DISPOSED');

-- CreateEnum
CREATE TYPE "SampleRetentionEvidenceStatus" AS ENUM ('PENDING', 'RECORDED');

-- CreateEnum
CREATE TYPE "SampleFeeCostNature" AS ENUM ('ACTUAL_COST', 'CUSTOMER_CHARGE');

-- CreateEnum
CREATE TYPE "SampleFeeResponsibility" AS ENUM ('FACTORY', 'CUSTOMER', 'SUPPLIER', 'NEGOTIATED');

-- CreateEnum
CREATE TYPE "SampleFeePaymentStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'RECEIVED', 'WAIVED', 'REFUNDED');

ALTER TYPE "SampleHistoryAction" ADD VALUE IF NOT EXISTS 'ROUND_CREATED';
ALTER TYPE "SampleHistoryAction" ADD VALUE IF NOT EXISTS 'RETAINED';
ALTER TYPE "SampleHistoryAction" ADD VALUE IF NOT EXISTS 'SHIPPED';
ALTER TYPE "SampleHistoryAction" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "SampleHistoryAction" ADD VALUE IF NOT EXISTS 'FEEDBACK_RECORDED';
ALTER TYPE "SampleHistoryAction" ADD VALUE IF NOT EXISTS 'RESAMPLE_CREATED';
ALTER TYPE "SampleHistoryAction" ADD VALUE IF NOT EXISTS 'CUSTOMER_KEPT';

-- CreateTable
CREATE TABLE "sample_rounds" (
    "id" TEXT NOT NULL,
    "sampleRequestId" TEXT NOT NULL,
    "roundNo" INTEGER NOT NULL,
    "previousRoundId" TEXT,
    "status" "SampleRoundStatus" NOT NULL DEFAULT 'DRAFT',
    "specification" TEXT,
    "material" TEXT,
    "process" TEXT,
    "requestedQuantity" INTEGER,
    "deliveryDeadline" TIMESTAMP(3),
    "fileAssetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "trackingNo" TEXT,
    "carrier" TEXT,
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvalComment" TEXT,
    "producedQuantity" INTEGER,
    "shippedQuantity" INTEGER,
    "feedback" TEXT,
    "feedbackResult" "SampleFeedbackResult",
    "feedbackAt" TIMESTAMP(3),
    "resampleReason" TEXT,
    "changeSummary" TEXT,
    "dispositionStatus" "SampleDispositionStatus" NOT NULL DEFAULT 'PENDING',
    "retentionEvidenceStatus" "SampleRetentionEvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sample_rounds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sample_rounds_roundNo_check" CHECK ("roundNo" > 0),
    CONSTRAINT "sample_rounds_requestedQuantity_check" CHECK ("requestedQuantity" IS NULL OR "requestedQuantity" > 0),
    CONSTRAINT "sample_rounds_producedQuantity_check" CHECK ("producedQuantity" IS NULL OR "producedQuantity" >= 0),
    CONSTRAINT "sample_rounds_shippedQuantity_check" CHECK ("shippedQuantity" IS NULL OR "shippedQuantity" >= 0),
    CONSTRAINT "sample_rounds_shippedWithinProduced_check" CHECK ("producedQuantity" IS NULL OR "shippedQuantity" IS NULL OR "shippedQuantity" <= "producedQuantity")
);

-- CreateTable
CREATE TABLE "sample_retention_records" (
    "id" TEXT NOT NULL,
    "sampleRoundId" TEXT NOT NULL,
    "retainedQuantity" INTEGER NOT NULL,
    "retainedAt" TIMESTAMP(3) NOT NULL,
    "retainedLocation" TEXT NOT NULL,
    "fileAssetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "retainedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sample_retention_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sample_retention_records_retainedQuantity_check" CHECK ("retainedQuantity" > 0),
    CONSTRAINT "sample_retention_records_retainedLocation_check" CHECK (length(btrim("retainedLocation")) > 0)
);

-- Add the new task, round ownership, and fee dimensions before moving legacy data.
ALTER TABLE "sample_requests"
    ADD COLUMN "currentRoundId" TEXT,
    ADD COLUMN "terminationReason" TEXT;

ALTER TABLE "sample_histories"
    ADD COLUMN "sampleRoundId" TEXT;

ALTER TABLE "sample_fees"
    ADD COLUMN "sampleRoundId" TEXT,
    ADD COLUMN "costNature" "SampleFeeCostNature",
    ADD COLUMN "responsibility" "SampleFeeResponsibility",
    ADD COLUMN "paymentStatus" "SampleFeePaymentStatus";

ALTER TABLE "sample_return_records"
    ADD COLUMN "sampleRoundId" TEXT,
    ADD COLUMN "dispositionStatus" "SampleDispositionStatus";

ALTER TABLE "sample_return_records"
    ALTER COLUMN "sampleRoundId" SET NOT NULL,
    ALTER COLUMN "dispositionStatus" SET NOT NULL;

-- Replace the mixed legacy task status and remove fields now owned by SampleRound.
ALTER TABLE "sample_requests" DROP COLUMN "status";

ALTER TABLE "sample_requests"
    DROP COLUMN "specification",
    DROP COLUMN "material",
    DROP COLUMN "process",
    DROP COLUMN "sampleQuantity",
    DROP COLUMN "deliveryDeadline",
    DROP COLUMN "fileAssetIds",
    DROP COLUMN "trackingNo",
    DROP COLUMN "carrier",
    DROP COLUMN "shippedAt",
    DROP COLUMN "deliveredAt",
    DROP COLUMN "approvedAt",
    DROP COLUMN "approvalComment",
    DROP COLUMN "returnedAt",
    DROP COLUMN "storedAt",
    DROP COLUMN "voidedAt",
    DROP COLUMN "feedback";

ALTER TABLE "sample_return_records" DROP COLUMN "returnType";

DROP TYPE "SampleStatus";
DROP TYPE "SampleReturnType";

-- CreateIndex
CREATE UNIQUE INDEX "sample_requests_currentRoundId_key" ON "sample_requests"("currentRoundId");

CREATE UNIQUE INDEX "sample_rounds_sampleRequestId_roundNo_key" ON "sample_rounds"("sampleRequestId", "roundNo");
CREATE UNIQUE INDEX "sample_rounds_previousRoundId_key" ON "sample_rounds"("previousRoundId");
CREATE INDEX "sample_rounds_sampleRequestId_status_roundNo_idx" ON "sample_rounds"("sampleRequestId", "status", "roundNo");
CREATE INDEX "sample_rounds_status_updatedAt_idx" ON "sample_rounds"("status", "updatedAt");

CREATE UNIQUE INDEX "sample_retention_records_sampleRoundId_key" ON "sample_retention_records"("sampleRoundId");

CREATE INDEX "sample_histories_sampleRoundId_createdAt_idx" ON "sample_histories"("sampleRoundId", "createdAt");
CREATE INDEX "sample_fees_sampleRoundId_incurredAt_idx" ON "sample_fees"("sampleRoundId", "incurredAt");
CREATE INDEX "sample_return_records_sampleRoundId_recordedAt_idx" ON "sample_return_records"("sampleRoundId", "recordedAt");

-- AddForeignKey
ALTER TABLE "sample_rounds"
    ADD CONSTRAINT "sample_rounds_sampleRequestId_fkey"
    FOREIGN KEY ("sampleRequestId") REFERENCES "sample_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sample_rounds"
    ADD CONSTRAINT "sample_rounds_previousRoundId_fkey"
    FOREIGN KEY ("previousRoundId") REFERENCES "sample_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sample_requests"
    ADD CONSTRAINT "sample_requests_currentRoundId_fkey"
    FOREIGN KEY ("currentRoundId") REFERENCES "sample_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sample_retention_records"
    ADD CONSTRAINT "sample_retention_records_sampleRoundId_fkey"
    FOREIGN KEY ("sampleRoundId") REFERENCES "sample_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sample_histories"
    ADD CONSTRAINT "sample_histories_sampleRoundId_fkey"
    FOREIGN KEY ("sampleRoundId") REFERENCES "sample_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sample_fees"
    ADD CONSTRAINT "sample_fees_sampleRoundId_fkey"
    FOREIGN KEY ("sampleRoundId") REFERENCES "sample_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sample_return_records"
    ADD CONSTRAINT "sample_return_records_sampleRoundId_fkey"
    FOREIGN KEY ("sampleRoundId") REFERENCES "sample_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
