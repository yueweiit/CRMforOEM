DO $$
BEGIN
  CREATE TYPE "SampleHistoryAction" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'FEE_ADDED', 'QUOTE_LINKED', 'RETURNED', 'STORED', 'VOIDED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "SampleFeeType" AS ENUM ('SAMPLE_MAKING', 'COURIER', 'PACKAGING', 'RETURN', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "SampleReturnType" AS ENUM ('RETURNED', 'STORED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'APPROVING';
ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'STORED';
ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'VOIDED';

ALTER TABLE "sample_requests"
ADD COLUMN IF NOT EXISTS "quoteId" TEXT,
ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "returnedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "storedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sample_requests_quoteId_fkey'
      AND conrelid = '"sample_requests"'::regclass
  ) THEN
    ALTER TABLE "sample_requests"
      ADD CONSTRAINT "sample_requests_quoteId_fkey"
      FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "sample_requests_quoteId_idx" ON "sample_requests"("quoteId");

CREATE TABLE IF NOT EXISTS "sample_histories" (
    "id" TEXT NOT NULL,
    "sampleRequestId" TEXT NOT NULL,
    "action" "SampleHistoryAction" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "comment" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sample_histories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sample_fees" (
    "id" TEXT NOT NULL,
    "sampleRequestId" TEXT NOT NULL,
    "feeType" "SampleFeeType" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "note" TEXT,
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sample_fees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sample_return_records" (
    "id" TEXT NOT NULL,
    "sampleRequestId" TEXT NOT NULL,
    "returnType" "SampleReturnType" NOT NULL,
    "receiverName" TEXT,
    "destination" TEXT,
    "note" TEXT,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sample_return_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sample_histories_sampleRequestId_createdAt_idx" ON "sample_histories"("sampleRequestId", "createdAt");
CREATE INDEX IF NOT EXISTS "sample_fees_sampleRequestId_incurredAt_idx" ON "sample_fees"("sampleRequestId", "incurredAt");
CREATE INDEX IF NOT EXISTS "sample_return_records_sampleRequestId_recordedAt_idx" ON "sample_return_records"("sampleRequestId", "recordedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sample_histories_sampleRequestId_fkey'
      AND conrelid = '"sample_histories"'::regclass
  ) THEN
    ALTER TABLE "sample_histories"
      ADD CONSTRAINT "sample_histories_sampleRequestId_fkey"
      FOREIGN KEY ("sampleRequestId") REFERENCES "sample_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sample_fees_sampleRequestId_fkey'
      AND conrelid = '"sample_fees"'::regclass
  ) THEN
    ALTER TABLE "sample_fees"
      ADD CONSTRAINT "sample_fees_sampleRequestId_fkey"
      FOREIGN KEY ("sampleRequestId") REFERENCES "sample_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sample_return_records_sampleRequestId_fkey'
      AND conrelid = '"sample_return_records"'::regclass
  ) THEN
    ALTER TABLE "sample_return_records"
      ADD CONSTRAINT "sample_return_records_sampleRequestId_fkey"
      FOREIGN KEY ("sampleRequestId") REFERENCES "sample_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
