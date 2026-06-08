-- CreateTable
CREATE TABLE "email_prompt_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "goal" TEXT,
    "tone" TEXT,
    "mustInclude" JSONB NOT NULL DEFAULT '[]',
    "mustAvoid" JSONB NOT NULL DEFAULT '[]',
    "structure" TEXT,
    "customInstruction" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_prompt_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_prompt_configs_organizationId_purpose_key" ON "email_prompt_configs"("organizationId", "purpose");

-- AddForeignKey
ALTER TABLE "email_prompt_configs" ADD CONSTRAINT "email_prompt_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_prompt_configs" ADD CONSTRAINT "email_prompt_configs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_prompt_configs" ADD CONSTRAINT "email_prompt_configs_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
