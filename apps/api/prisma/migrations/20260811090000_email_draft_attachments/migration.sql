-- CreateTable
CREATE TABLE "email_draft_attachments" (
    "id" TEXT NOT NULL,
    "emailDraftId" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_draft_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_draft_attachments_emailDraftId_fileAssetId_key" ON "email_draft_attachments"("emailDraftId", "fileAssetId");

-- CreateIndex
CREATE INDEX "email_draft_attachments_emailDraftId_sortOrder_idx" ON "email_draft_attachments"("emailDraftId", "sortOrder");

-- CreateIndex
CREATE INDEX "email_draft_attachments_fileAssetId_idx" ON "email_draft_attachments"("fileAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "email_attachments_emailMessageId_fileAssetId_key" ON "email_attachments"("emailMessageId", "fileAssetId");

-- CreateIndex
CREATE INDEX "email_attachments_fileAssetId_idx" ON "email_attachments"("fileAssetId");

-- AddForeignKey
ALTER TABLE "email_draft_attachments" ADD CONSTRAINT "email_draft_attachments_emailDraftId_fkey" FOREIGN KEY ("emailDraftId") REFERENCES "email_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_draft_attachments" ADD CONSTRAINT "email_draft_attachments_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
