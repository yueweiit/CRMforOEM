import { BadRequestException, Injectable } from "@nestjs/common";
import { normalizeEmailDraftPurpose } from "@oem-crm/shared";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { EmailContextBuilder } from "./email-context-builder";
import { EmailDraftCreationService } from "./email-draft-creation.service";
import { EmailDraftSubmissionService } from "./email-draft-submission.service";
import type { GenerateEmailDraftDto } from "../dto/generate-email-draft.dto";

@Injectable()
export class EmailDraftGenerationService {
  constructor(
    private readonly contextBuilder: EmailContextBuilder,
    private readonly submission: EmailDraftSubmissionService,
    private readonly creation: EmailDraftCreationService
  ) {}

  async generate(user: RequestUser, customerId: string, dto: GenerateEmailDraftDto) {
    const context = await this.contextBuilder.build(user, customerId, dto);
    const purpose = normalizeEmailDraftPurpose(dto.purpose);
    const toEmail = dto.toEmail ?? context.bestContact?.email;
    if (!toEmail) throw new BadRequestException("No recipient email available");

    const result = await this.submission.checkAndLock({
      customerId,
      organizationId: user.organizationId,
      purpose,
      toEmail,
      userId: user.id
    });
    if (!result.accepted) return result;

    try {
      return await this.creation.createDraftAndEnqueue(user, customerId, context, toEmail, dto);
    } finally {
      await this.submission.release(result.lockKey);
    }
  }
}
