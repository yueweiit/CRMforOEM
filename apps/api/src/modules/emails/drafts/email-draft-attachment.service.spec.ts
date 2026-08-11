import "reflect-metadata";
import { strict as assert } from "node:assert";
import type { RequestUser } from "../../../common/auth/current-user.decorator";
import {
  EmailDraftAttachmentService,
  MAX_EMAIL_ATTACHMENT_COUNT,
  MAX_EMAIL_ATTACHMENTS_TOTAL_BYTES
} from "./email-draft-attachment.service";

const user: RequestUser = {
  id: "user-1",
  organizationId: "org-1",
  name: "Sales User",
  roleCodes: ["SALES_REP"],
  permissions: ["emails.send"],
  dataScope: "ALL"
};

function buildHarness(options: { status?: string; attachmentCount?: number; visible?: boolean } = {}) {
  const attachments = Array.from({ length: options.attachmentCount ?? 0 }, (_, index) => ({
    id: `attachment-${index}`,
    emailDraftId: "draft-1",
    fileAssetId: `file-${index}`,
    filename: `file-${index}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 100,
    sortOrder: index,
    createdById: user.id,
    createdAt: new Date()
  }));
  let draftStatus = options.status ?? "DRAFT";
  let uploaded = false;
  let deletedFileId = "";

  const prisma: Record<string, any> = {
    emailDraft: {
      findFirst: async ({ where }: any) => {
        if (where.id !== "draft-1" || options.visible === false) return null;
        return { id: "draft-1", status: draftStatus, attachments };
      },
      update: async ({ data }: any) => {
        draftStatus = data.status;
        return { id: "draft-1", status: draftStatus };
      }
    },
    emailDraftAttachment: {
      create: async ({ data }: any) => {
        const created = { id: "attachment-new", createdAt: new Date(), ...data };
        attachments.push(created);
        return created;
      },
      delete: async ({ where }: any) => {
        const index = attachments.findIndex((item) => item.id === where.id);
        return attachments.splice(index, 1)[0];
      }
    }
  };
  prisma.$transaction = async (callback: (tx: unknown) => unknown) => callback(prisma);

  const uploads = {
    uploadFile: async (file: Express.Multer.File) => {
      uploaded = true;
      return {
        id: "file-new",
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size
      };
    },
    readFile: async (id: string) => ({
      record: { id, mimeType: "application/pdf" },
      content: Buffer.from("file")
    }),
    deleteFile: async (id: string) => {
      deletedFileId = id;
      return { deleted: true };
    }
  };

  return {
    service: new EmailDraftAttachmentService(prisma as never, uploads as never),
    state: () => ({ attachments, draftStatus, uploaded, deletedFileId })
  };
}

function pdfFile(size = 4): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "specification.pdf",
    encoding: "7bit",
    mimetype: "application/pdf",
    size,
    buffer: Buffer.alloc(Math.min(size, 4)),
    destination: "",
    filename: "",
    path: "",
    stream: undefined as never
  };
}

async function main() {
  const created = buildHarness();
  await created.service.attach(user, "draft-1", pdfFile());
  assert.equal(created.state().uploaded, true);
  assert.equal(created.state().attachments[0]?.filename, "specification.pdf");
  assert.equal(created.state().draftStatus, "PENDING_REVIEW");

  const full = buildHarness({ attachmentCount: MAX_EMAIL_ATTACHMENT_COUNT });
  await assert.rejects(() => full.service.attach(user, "draft-1", pdfFile()), /at most 5 attachments/);
  assert.equal(full.state().uploaded, false);

  const oversized = buildHarness();
  await assert.rejects(
    () => oversized.service.attach(user, "draft-1", pdfFile(MAX_EMAIL_ATTACHMENTS_TOTAL_BYTES + 1)),
    /allowed size/
  );

  const unsupported = buildHarness();
  await assert.rejects(() => unsupported.service.attach(user, "draft-1", { ...pdfFile(), originalname: "payload.exe" }), /not allowed/);

  const sent = buildHarness({ status: "SENT" });
  await assert.rejects(() => sent.service.attach(user, "draft-1", pdfFile()), /cannot be changed/);

  const hidden = buildHarness({ visible: false });
  await assert.rejects(() => hidden.service.attach(user, "draft-1", pdfFile()), /not found/);
  assert.equal(hidden.state().uploaded, false);

  const removable = buildHarness({ attachmentCount: 1 });
  await removable.service.remove(user, "draft-1", "attachment-0");
  assert.equal(removable.state().attachments.length, 0);
  assert.equal(removable.state().deletedFileId, "file-0");
  assert.equal(removable.state().draftStatus, "PENDING_REVIEW");

  const approved = buildHarness({ status: "APPROVED", attachmentCount: 1 });
  const prepared = await approved.service.prepareForSend(user, "draft-1");
  assert.equal(prepared[0]?.fileAssetId, "file-0");
  assert.equal(prepared[0]?.content.toString(), "file");

  console.log("email-draft-attachment.service.spec.ts OK");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
