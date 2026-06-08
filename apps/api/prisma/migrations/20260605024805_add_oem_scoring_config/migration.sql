-- CreateTable
CREATE TABLE "oem_scoring_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oem_scoring_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oem_scoring_configs_organizationId_key" ON "oem_scoring_configs"("organizationId");

-- AddForeignKey
ALTER TABLE "oem_scoring_configs" ADD CONSTRAINT "oem_scoring_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
