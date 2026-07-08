-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "SamplePurpose" AS ENUM ('CUSTOMER_TEST', 'EXHIBITION', 'APPEARANCE_CONFIRMATION');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "sample_requests"
  ADD COLUMN IF NOT EXISTS "specification" TEXT,
  ADD COLUMN IF NOT EXISTS "material" TEXT,
  ADD COLUMN IF NOT EXISTS "process" TEXT,
  ADD COLUMN IF NOT EXISTS "sampleQuantity" INTEGER,
  ADD COLUMN IF NOT EXISTS "samplePurpose" "SamplePurpose",
  ADD COLUMN IF NOT EXISTS "deliveryDeadline" TIMESTAMP(3);
