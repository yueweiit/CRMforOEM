-- Normalize the legacy customer-rejected business state before new workflows consume it.
UPDATE "quotes"
SET "status" = 'CUSTOMER_REJECTED'::"QuoteStatus"
WHERE "status" = 'REJECTED'::"QuoteStatus"
  AND "approvalStatus" = 'APPROVED'::"QuoteApprovalStatus";

ALTER TYPE "AiGenerationType" ADD VALUE IF NOT EXISTS 'QUOTE_REPLY_CLASSIFICATION';
ALTER TYPE "QuoteHistoryAction" ADD VALUE IF NOT EXISTS 'SENT';
ALTER TYPE "QuoteHistoryAction" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE "QuoteHistoryAction" ADD VALUE IF NOT EXISTS 'CUSTOMER_REJECTED';
ALTER TYPE "QuoteHistoryAction" ADD VALUE IF NOT EXISTS 'EXPIRED';

CREATE TYPE "QuoteEmailDispatchStatus" AS ENUM (
  'PENDING',
  'SENDING',
  'SENT',
  'FAILED',
  'ACKED_PENDING_RECONCILE'
);

CREATE TYPE "QuoteReplyIntent" AS ENUM (
  'ACCEPT',
  'REJECT',
  'NEGOTIATE',
  'QUESTION',
  'UNCERTAIN'
);

CREATE TYPE "QuoteReplyAssessmentStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'DISMISSED',
  'STALE'
);

ALTER TABLE "email_drafts"
ADD COLUMN "quoteId" TEXT,
ADD COLUMN "quoteSnapshot" JSONB,
ADD COLUMN "quoteUpdatedAtSnapshot" TIMESTAMP(3),
ADD COLUMN "historicalQuoteIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "email_messages"
ADD COLUMN "quoteId" TEXT;

ALTER TABLE "quotes"
ADD COLUMN "sentAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "email_messages_messageId_key";

CREATE UNIQUE INDEX "email_messages_emailAccountId_messageId_key"
ON "email_messages"("emailAccountId", "messageId");

CREATE INDEX "email_messages_messageId_idx" ON "email_messages"("messageId");
CREATE INDEX "email_messages_quoteId_idx" ON "email_messages"("quoteId");
CREATE INDEX "email_drafts_quoteId_idx" ON "email_drafts"("quoteId");

CREATE TABLE "quote_email_dispatches" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "emailDraftId" TEXT NOT NULL,
  "emailMessageId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" "QuoteEmailDispatchStatus" NOT NULL DEFAULT 'PENDING',
  "providerMessageId" TEXT,
  "errorMessage" TEXT,
  "attemptedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quote_email_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quote_reply_assessments" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "inboundEmailMessageId" TEXT NOT NULL,
  "aiGenerationRunId" TEXT,
  "intent" "QuoteReplyIntent" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "evidence" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "QuoteReplyAssessmentStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quote_reply_assessments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quote_email_dispatches_emailDraftId_key" ON "quote_email_dispatches"("emailDraftId");
CREATE UNIQUE INDEX "quote_email_dispatches_emailMessageId_key" ON "quote_email_dispatches"("emailMessageId");
CREATE UNIQUE INDEX "quote_email_dispatches_idempotencyKey_key" ON "quote_email_dispatches"("idempotencyKey");
CREATE INDEX "quote_email_dispatches_quoteId_createdAt_idx" ON "quote_email_dispatches"("quoteId", "createdAt");
CREATE INDEX "quote_email_dispatches_status_updatedAt_idx" ON "quote_email_dispatches"("status", "updatedAt");

CREATE UNIQUE INDEX "quote_reply_assessments_inboundEmailMessageId_key"
ON "quote_reply_assessments"("inboundEmailMessageId");
CREATE INDEX "quote_reply_assessments_organizationId_status_createdAt_idx"
ON "quote_reply_assessments"("organizationId", "status", "createdAt");
CREATE INDEX "quote_reply_assessments_quoteId_status_createdAt_idx"
ON "quote_reply_assessments"("quoteId", "status", "createdAt");

ALTER TABLE "email_drafts"
ADD CONSTRAINT "email_drafts_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "email_messages"
ADD CONSTRAINT "email_messages_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quote_email_dispatches"
ADD CONSTRAINT "quote_email_dispatches_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quote_email_dispatches"
ADD CONSTRAINT "quote_email_dispatches_emailDraftId_fkey"
FOREIGN KEY ("emailDraftId") REFERENCES "email_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quote_email_dispatches"
ADD CONSTRAINT "quote_email_dispatches_emailMessageId_fkey"
FOREIGN KEY ("emailMessageId") REFERENCES "email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quote_reply_assessments"
ADD CONSTRAINT "quote_reply_assessments_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quote_reply_assessments"
ADD CONSTRAINT "quote_reply_assessments_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quote_reply_assessments"
ADD CONSTRAINT "quote_reply_assessments_inboundEmailMessageId_fkey"
FOREIGN KEY ("inboundEmailMessageId") REFERENCES "email_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quote_reply_assessments"
ADD CONSTRAINT "quote_reply_assessments_aiGenerationRunId_fkey"
FOREIGN KEY ("aiGenerationRunId") REFERENCES "ai_generation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quote_reply_assessments"
ADD CONSTRAINT "quote_reply_assessments_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
