const { PrismaClient } = require("../node_modules/.prisma/client");
const p = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://oem_crm:oem_crm_password@localhost:5432/oem_crm?schema=public"
    }
  }
});

const stmts = [
  'ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "module" TEXT',
  'ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "group" TEXT',
  'ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "dependsOn" JSONB NOT NULL DEFAULT \'[]\'',
  'ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "level" INTEGER NOT NULL DEFAULT 0',
  'CREATE TABLE IF NOT EXISTS "user_permission_grants" ("userId" TEXT NOT NULL, "permissionId" TEXT NOT NULL, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "user_permission_grants_pkey" PRIMARY KEY ("userId", "permissionId"))',
  'CREATE INDEX IF NOT EXISTS "user_permission_grants_permissionId_idx" ON "user_permission_grants"("permissionId")',
  'CREATE INDEX IF NOT EXISTS "permissions_organizationId_module_idx" ON "permissions"("organizationId", "module")',
  'CREATE INDEX IF NOT EXISTS "roles_organizationId_level_idx" ON "roles"("organizationId", "level")'
];

const fks = [
  'ALTER TABLE "user_permission_grants" ADD CONSTRAINT "user_permission_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE "user_permission_grants" ADD CONSTRAINT "user_permission_grants_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE'
];

async function main() {
  for (const stmt of stmts) {
    try {
      await p.$executeRawUnsafe(stmt);
      console.log("OK:", stmt.substring(0, 80));
    } catch (e) {
      if (e.message.includes("already exists")) {
        console.log("SKIP (exists):", stmt.substring(0, 60));
      } else {
        console.log("ERR:", e.message.substring(0, 200));
      }
    }
  }
  for (const fk of fks) {
    try {
      await p.$executeRawUnsafe(fk);
      console.log("FK OK:", fk.substring(0, 80));
    } catch (e) {
      console.log("FK SKIP:", e.message.substring(0, 100));
    }
  }
  console.log("All done");
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  p.$disconnect().then(() => process.exit(1));
});
