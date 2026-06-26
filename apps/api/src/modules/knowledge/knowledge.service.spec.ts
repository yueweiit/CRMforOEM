import * as assert from "node:assert/strict";
import { KnowledgeService } from "./knowledge.service";

const user = { id: "user-1", organizationId: "org-1" };

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function buildPrisma() {
  const calls: {
    certificateCreate?: { data: Record<string, unknown> };
    certificateUpdate?: { data: Record<string, unknown> };
    caseStudyCreate?: { data: Record<string, unknown> };
    caseStudyUpdate?: { data: Record<string, unknown> };
  } = {};

  const profile = { id: "profile-1", organizationId: user.organizationId };

  return {
    calls,
    prisma: {
      companyProfile: {
        findFirst: async () => profile
      },
      certificate: {
        create: async (args: { data: Record<string, unknown> }) => {
          calls.certificateCreate = args;
          return { id: "certificate-1", ...args.data };
        },
        findFirst: async () => ({ id: "certificate-1", companyProfileId: profile.id, name: "Old cert" }),
        update: async (args: { data: Record<string, unknown> }) => {
          calls.certificateUpdate = args;
          return { id: "certificate-1", ...args.data };
        }
      },
      caseStudy: {
        create: async (args: { data: Record<string, unknown> }) => {
          calls.caseStudyCreate = args;
          return { id: "case-1", ...args.data };
        },
        findFirst: async () => ({ id: "case-1", companyProfileId: profile.id, title: "Old case" }),
        update: async (args: { data: Record<string, unknown> }) => {
          calls.caseStudyUpdate = args;
          return { id: "case-1", ...args.data };
        }
      },
      auditLog: {
        create: async () => ({ id: "audit-1" })
      }
    }
  };
}

async function main() {
  {
    const { prisma, calls } = buildPrisma();
    const service = new KnowledgeService(prisma as never);

    const payload = {
      name: "ISO 9001",
      certType: "ISO",
      description: "Quality management certificate",
      fileAssetId: "legacy-file",
      fileAssetIds: ["file-a", "file-b"]
    } as Record<string, unknown>;
    await service.createCertificate(user as never, payload as never);

    const data = calls.certificateCreate?.data ?? {};
    assert.equal(hasOwn(data, "fileAssetId"), false, "createCertificate must not write deprecated fileAssetId");
    assert.equal(data.description, "Quality management certificate");
    assert.deepEqual(data.fileAssetIds, ["file-a", "file-b"]);
  }

  {
    const { prisma, calls } = buildPrisma();
    const service = new KnowledgeService(prisma as never);

    const payload = {
      description: "Updated certificate note",
      fileAssetId: "legacy-file",
      fileAssetIds: ["file-c"]
    } as Record<string, unknown>;
    await service.updateEntity(user as never, "certificates", "certificate-1", payload as never);

    const data = calls.certificateUpdate?.data ?? {};
    assert.equal(hasOwn(data, "fileAssetId"), false, "certificate update must not write deprecated fileAssetId");
    assert.equal(data.description, "Updated certificate note");
    assert.deepEqual(data.fileAssetIds, ["file-c"]);
  }

  {
    const { prisma, calls } = buildPrisma();
    const service = new KnowledgeService(prisma as never);

    const payload = {
      title: "Retail launch",
      summary: "OEM retail launch",
      result: "Delivered",
      fileAssetId: "legacy-file",
      fileAssetIds: ["case-file-a"]
    } as Record<string, unknown>;
    await service.createCaseStudy(user as never, payload as never);

    const data = calls.caseStudyCreate?.data ?? {};
    assert.equal(hasOwn(data, "fileAssetId"), false, "createCaseStudy must not write deprecated fileAssetId");
    assert.deepEqual(data.fileAssetIds, ["case-file-a"]);
  }

  {
    const { prisma, calls } = buildPrisma();
    const service = new KnowledgeService(prisma as never);

    const payload = {
      result: "Updated result",
      fileAssetId: "legacy-file",
      fileAssetIds: ["case-file-b"]
    } as Record<string, unknown>;
    await service.updateEntity(user as never, "case-studies", "case-1", payload as never);

    const data = calls.caseStudyUpdate?.data ?? {};
    assert.equal(hasOwn(data, "fileAssetId"), false, "case study update must not write deprecated fileAssetId");
    assert.deepEqual(data.fileAssetIds, ["case-file-b"]);
  }
}

void main();
