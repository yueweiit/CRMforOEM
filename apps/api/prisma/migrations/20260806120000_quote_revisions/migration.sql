ALTER TYPE "QuoteHistoryAction" ADD VALUE IF NOT EXISTS 'REVISION_CREATED';

CREATE TABLE "quote_revision_groups" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "baseQuoteNo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_revision_groups_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quotes"
    ADD COLUMN "revisionGroupId" TEXT,
    ADD COLUMN "previousRevisionId" TEXT,
    ADD COLUMN "revisionNo" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "revisionReason" TEXT,
    ADD COLUMN "revisedById" TEXT,
    ADD COLUMN "revisedAt" TIMESTAMP(3);

INSERT INTO "quote_revision_groups" ("id", "customerId", "baseQuoteNo", "createdAt", "updatedAt")
SELECT 'quote-revision-group-' || "id", "customerId", "quoteNo", "createdAt", "updatedAt"
FROM "quotes";

UPDATE "quotes"
SET "revisionGroupId" = 'quote-revision-group-' || "id";

ALTER TABLE "quotes"
    ALTER COLUMN "revisionGroupId" SET NOT NULL;

CREATE UNIQUE INDEX "quote_revision_groups_baseQuoteNo_key" ON "quote_revision_groups"("baseQuoteNo");
CREATE INDEX "quote_revision_groups_customerId_idx" ON "quote_revision_groups"("customerId");
CREATE UNIQUE INDEX "quotes_previousRevisionId_key" ON "quotes"("previousRevisionId");
CREATE UNIQUE INDEX "quotes_revisionGroupId_revisionNo_key" ON "quotes"("revisionGroupId", "revisionNo");
CREATE INDEX "quotes_revisionGroupId_revisionNo_idx" ON "quotes"("revisionGroupId", "revisionNo");

ALTER TABLE "quote_revision_groups"
    ADD CONSTRAINT "quote_revision_groups_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quotes"
    ADD CONSTRAINT "quotes_revisionGroupId_fkey"
    FOREIGN KEY ("revisionGroupId") REFERENCES "quote_revision_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quotes"
    ADD CONSTRAINT "quotes_previousRevisionId_fkey"
    FOREIGN KEY ("previousRevisionId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quotes"
    ADD CONSTRAINT "quotes_revisedById_fkey"
    FOREIGN KEY ("revisedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
