import { BadRequestException, NotFoundException } from "@nestjs/common";
import { normalizeEmailDraftPurpose } from "@oem-crm/shared";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import type { EmailAccountService } from "../accounts/email-account.service";
import { sharedAccountWhere } from "../accounts/email-account.service";

export function sameEmailAddress(left?: string | null, right?: string | null) {
  return (left ?? "").trim().toLowerCase() === (right ?? "").trim().toLowerCase();
}

export function buildSubject(customerName: string) {
  return `OEM cooperation idea for ${customerName}`;
}

export function getDraftPurpose(rawInput: unknown) {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) return undefined;
  const purpose = (rawInput as { purpose?: unknown }).purpose;
  return typeof purpose === "string" ? normalizeEmailDraftPurpose(purpose) : undefined;
}

export function pickDefinedFields<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

export async function resolveSenderAccount(
  prisma: PrismaService,
  accountService: EmailAccountService,
  user: RequestUser,
  toEmail: string,
  emailAccountId?: string | null
) {
  if (emailAccountId) {
    const account = await accountService.findAccount(user, emailAccountId);
    if (!account.isActive) throw new BadRequestException("发件邮箱已停用，请选择其他发件邮箱。");
    if (sameEmailAddress(account.email, toEmail)) throw new BadRequestException("发件邮箱不能与收件人邮箱相同，请选择其他发件邮箱。");
    return account;
  }
  const accounts = await prisma.emailAccount.findMany({
    where: { isActive: true, OR: [{ userId: user.id }, sharedAccountWhere(user)] },
    orderBy: [{ scope: "asc" as never }, { createdAt: "asc" }]
  });
  const account = accounts.find((item) => !sameEmailAddress(item.email, toEmail));
  if (!account) throw new BadRequestException("没有可用发件邮箱，或可用发件邮箱与收件人邮箱相同。");
  return account;
}
