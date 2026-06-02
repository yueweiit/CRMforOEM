/*
  Warnings:

  - Added the required column `certType` to the `certificates` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "brands" ADD COLUMN     "competitiveAdvantage" TEXT,
ADD COLUMN     "websiteUrl" TEXT;

-- AlterTable
ALTER TABLE "case_studies" ADD COLUMN     "clientName" TEXT,
ADD COLUMN     "cooperationDate" TIMESTAMP(3),
ADD COLUMN     "fileAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "certType" TEXT NOT NULL,
ADD COLUMN     "fileAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "company_profiles" ADD COLUMN     "factoryAddress" TEXT,
ADD COLUMN     "foundedAt" TIMESTAMP(3),
ADD COLUMN     "productionScale" TEXT;

-- AlterTable
ALTER TABLE "file_assets" ADD COLUMN     "thumbnailKey" TEXT;

-- AlterTable
ALTER TABLE "oem_capabilities" ADD COLUMN     "packagingCustomization" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "imageAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "material" TEXT,
ADD COLUMN     "specifications" JSONB,
ADD COLUMN     "targetMarkets" TEXT[] DEFAULT ARRAY[]::TEXT[];
