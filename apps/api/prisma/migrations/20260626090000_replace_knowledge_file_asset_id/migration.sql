-- Preserve legacy single attachments before removing deprecated fileAssetId columns.
UPDATE "certificates"
SET "fileAssetIds" = ARRAY_APPEND(COALESCE("fileAssetIds", ARRAY[]::TEXT[]), "fileAssetId")
WHERE "fileAssetId" IS NOT NULL
  AND NOT ("fileAssetId" = ANY(COALESCE("fileAssetIds", ARRAY[]::TEXT[])));

UPDATE "case_studies"
SET "fileAssetIds" = ARRAY_APPEND(COALESCE("fileAssetIds", ARRAY[]::TEXT[]), "fileAssetId")
WHERE "fileAssetId" IS NOT NULL
  AND NOT ("fileAssetId" = ANY(COALESCE("fileAssetIds", ARRAY[]::TEXT[])));

ALTER TABLE "certificates"
ADD COLUMN "description" TEXT,
DROP COLUMN "fileAssetId";

ALTER TABLE "case_studies"
DROP COLUMN "fileAssetId";
