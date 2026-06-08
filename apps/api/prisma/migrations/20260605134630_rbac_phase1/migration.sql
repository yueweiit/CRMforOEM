-- AlterTable
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "module" TEXT;
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "group" TEXT;
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "dependsOn" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "level" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_permission_grants" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_grants_pkey" PRIMARY KEY ("userId", "permissionId")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_permission_grants_permissionId_idx" ON "user_permission_grants"("permissionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "permissions_organizationId_module_idx" ON "permissions"("organizationId", "module");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "roles_organizationId_level_idx" ON "roles"("organizationId", "level");

-- AddForeignKey (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_permission_grants_userId_fkey'
      AND conrelid = '"user_permission_grants"'::regclass
  ) THEN
    ALTER TABLE "user_permission_grants"
      ADD CONSTRAINT "user_permission_grants_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_permission_grants_permissionId_fkey'
      AND conrelid = '"user_permission_grants"'::regclass
  ) THEN
    ALTER TABLE "user_permission_grants"
      ADD CONSTRAINT "user_permission_grants_permissionId_fkey"
      FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
