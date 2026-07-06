DO $$
BEGIN
  CREATE TYPE "QuoteApprovalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "QuoteHistoryAction" AS ENUM ('CREATED', 'UPDATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'VOIDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'VOIDED';

ALTER TABLE "quotes"
ADD COLUMN IF NOT EXISTS "approvalStatus" "QuoteApprovalStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN IF NOT EXISTS "approvalComment" TEXT,
ADD COLUMN IF NOT EXISTS "approvalSubmittedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "approvalSubmittedById" TEXT,
ADD COLUMN IF NOT EXISTS "approvalReviewedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "approvalReviewedById" TEXT;

CREATE TABLE IF NOT EXISTS "quote_histories" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "action" "QuoteHistoryAction" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "comment" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_histories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "quote_histories_quoteId_createdAt_idx" ON "quote_histories"("quoteId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quote_histories_quoteId_fkey'
      AND conrelid = '"quote_histories"'::regclass
  ) THEN
    ALTER TABLE "quote_histories"
      ADD CONSTRAINT "quote_histories_quoteId_fkey"
      FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
