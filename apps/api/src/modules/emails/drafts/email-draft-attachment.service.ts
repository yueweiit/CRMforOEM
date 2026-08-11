import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException
} from "@nestjs/common";
import { EmailDraftStatus } from "@oem-crm/shared";
import { Prisma } from "@prisma/client";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../../common/query/data-scope";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { UploadService } from "../../upload/upload.service";

export const MAX_EMAIL_ATTACHMENT_COUNT = 5;
export const MAX_EMAIL_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_EMAIL_ATTACHMENTS_TOTAL_BYTES = 15 * 1024 * 1024;

const ALLOWED_EMAIL_ATTACHMENT_EXTENSIONS = new Set([
  ".csv", ".doc", ".docx", ".gif", ".jpeg", ".jpg", ".pdf", ".png",
  ".ppt", ".pptx", ".txt", ".webp", ".xls", ".xlsx", ".zip"
]);

export type PreparedEmailAttachment = {
  fileAssetId: string;
  filename: string;
  contentType?: string;
  sizeBytes: number;
  content: Buffer;
};

@Injectable()
export class EmailDraftAttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadService
  ) {}

  async attach(user: RequestUser, draftId: string, file: Express.Multer.File, clientFileName?: string) {
    if (!file) throw new BadRequestException("Attachment file is required");
    const draft = await this.getEditableDraft(user, draftId);
    if (draft.attachments.length >= MAX_EMAIL_ATTACHMENT_COUNT) {
      throw new BadRequestException(`A draft can contain at most ${MAX_EMAIL_ATTACHMENT_COUNT} attachments`);
    }
    const currentBytes = draft.attachments.reduce((total, item) => total + (item.sizeBytes ?? 0), 0);
    if (file.size > MAX_EMAIL_ATTACHMENT_BYTES || currentBytes + file.size > MAX_EMAIL_ATTACHMENTS_TOTAL_BYTES) {
      throw new PayloadTooLargeException("Email attachments exceed the allowed size");
    }
    this.assertAllowedFile(clientFileName?.trim() || file.originalname);

    const asset = await this.uploads.uploadFile(
      file,
      user.organizationId,
      user.id,
      "email_draft",
      draft.id,
      clientFileName
    );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const attachment = await tx.emailDraftAttachment.create({
          data: {
            emailDraftId: draft.id,
            fileAssetId: asset.id,
            filename: asset.originalName,
            mimeType: asset.mimeType,
            sizeBytes: asset.sizeBytes,
            sortOrder: draft.attachments.length,
            createdById: user.id
          }
        });
        await this.markPendingReview(tx, draft.id);
        return attachment;
      });
    } catch (error) {
      await this.uploads.deleteFile(asset.id, user.organizationId).catch(() => undefined);
      throw error;
    }
  }

  async remove(user: RequestUser, draftId: string, attachmentId: string) {
    const draft = await this.getEditableDraft(user, draftId);
    const attachment = draft.attachments.find((item) => item.id === attachmentId);
    if (!attachment) throw new NotFoundException("Email attachment not found");

    await this.prisma.$transaction(async (tx) => {
      await tx.emailDraftAttachment.delete({ where: { id: attachment.id } });
      await this.markPendingReview(tx, draft.id);
    });
    await this.uploads.deleteFile(attachment.fileAssetId, user.organizationId);
    return { deleted: true };
  }

  async prepareForSend(user: RequestUser, draftId: string): Promise<PreparedEmailAttachment[]> {
    const draft = await this.prisma.emailDraft.findFirst({
      where: { id: draftId, customer: buildCustomerDataScopeWhere(user) },
      select: {
        status: true,
        attachments: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }
      }
    });
    if (!draft) throw new NotFoundException("Email draft not found");
    if (draft.status !== "APPROVED") throw new BadRequestException("Only approved email can be sent");
    if (draft.attachments.length > MAX_EMAIL_ATTACHMENT_COUNT) {
      throw new BadRequestException("Email attachment count exceeds the allowed limit");
    }

    const prepared: PreparedEmailAttachment[] = [];
    let totalBytes = 0;
    for (const attachment of draft.attachments) {
      const remainingBytes = MAX_EMAIL_ATTACHMENTS_TOTAL_BYTES - totalBytes;
      if (remainingBytes <= 0) throw new PayloadTooLargeException("Email attachments exceed the allowed size");
      const { record, content } = await this.uploads.readFile(
        attachment.fileAssetId,
        user.organizationId,
        Math.min(MAX_EMAIL_ATTACHMENT_BYTES, remainingBytes)
      );
      totalBytes += content.byteLength;
      prepared.push({
        fileAssetId: attachment.fileAssetId,
        filename: attachment.filename,
        contentType: attachment.mimeType ?? record.mimeType ?? undefined,
        sizeBytes: content.byteLength,
        content
      });
    }
    return prepared;
  }

  private async getEditableDraft(user: RequestUser, draftId: string) {
    const draft = await this.prisma.emailDraft.findFirst({
      where: { id: draftId, customer: buildCustomerDataScopeWhere(user) },
      select: { id: true, status: true, attachments: { orderBy: { sortOrder: "asc" } } }
    });
    if (!draft) throw new NotFoundException("Email draft not found");
    if (draft.status === "SENT") throw new BadRequestException("Sent draft attachments cannot be changed");
    return draft;
  }

  private async markPendingReview(tx: Prisma.TransactionClient, draftId: string) {
    await tx.emailDraft.update({
      where: { id: draftId },
      data: {
        status: EmailDraftStatus.PendingReview as never,
        reviewedById: null,
        reviewedAt: null,
        reviewComment: null
      }
    });
  }

  private assertAllowedFile(filename: string) {
    const extension = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : "";
    if (!ALLOWED_EMAIL_ATTACHMENT_EXTENSIONS.has(extension)) {
      throw new UnsupportedMediaTypeException("This file type is not allowed as an email attachment");
    }
  }
}
