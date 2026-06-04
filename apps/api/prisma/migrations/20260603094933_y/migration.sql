/*
  Warnings:

  - A unique constraint covering the columns `[organizationId]` on the table `company_profiles` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "company_profiles_organizationId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "company_profiles_organizationId_key" ON "company_profiles"("organizationId");
