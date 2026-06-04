-- AlterTable
ALTER TABLE "email_drafts" ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "fromEmailSnapshot" TEXT,
ADD COLUMN     "fromNameSnapshot" TEXT,
ADD COLUMN     "toNameSnapshot" TEXT;

-- CreateIndex
CREATE INDEX "email_drafts_customerId_purpose_idx" ON "email_drafts"("customerId", "purpose");
