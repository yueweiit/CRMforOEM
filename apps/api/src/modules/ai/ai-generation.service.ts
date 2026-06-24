import { Injectable, NotFoundException } from "@nestjs/common";
import { AiContentVersionType, AiGenerationType } from "@oem-crm/shared";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AddAiContentVersionDto } from "./dto/add-ai-content-version.dto";

@Injectable()
export class AiGenerationService {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(input: {
    organizationId: string;
    customerId?: string;
    type: AiGenerationType;
    model: string;
    promptVersion: string;
    rawInput: unknown;
    createdById?: string;
  }) {
    return this.prisma.aiGenerationRun.create({
      data: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        type: input.type as never,
        model: input.model,
        promptVersion: input.promptVersion,
        rawInput: input.rawInput as never,
        createdById: input.createdById,
        status: "QUEUED"
      }
    });
  }

  async markSucceeded(runId: string, rawOutput: unknown, tokenUsage?: unknown, latencyMs?: number) {
    return this.prisma.aiGenerationRun.update({
      where: { id: runId },
      data: {
        status: "SUCCEEDED",
        rawOutput: rawOutput as never,
        tokenUsage: tokenUsage as never,
        latencyMs
      }
    });
  }

  async markFailed(runId: string, errorMessage: string) {
    return this.prisma.aiGenerationRun.update({
      where: { id: runId },
      data: { status: "FAILED", errorMessage }
    });
  }

  async addRawAiVersion(runId: string, content: string, contentJson?: unknown) {
    return this.prisma.aiContentVersion.create({
      data: {
        aiGenerationRunId: runId,
        versionType: AiContentVersionType.RawAi as never,
        content,
        contentJson: contentJson as never
      }
    });
  }

  async getRun(user: RequestUser, id: string) {
    const run = await this.prisma.aiGenerationRun.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { versions: { orderBy: { createdAt: "asc" } } }
    });
    if (!run) {
      throw new NotFoundException("AI generation run not found");
    }
    return run;
  }

  async listVersions(user: RequestUser, runId: string) {
    await this.getRun(user, runId);
    return this.prisma.aiContentVersion.findMany({
      where: { aiGenerationRunId: runId },
      orderBy: { createdAt: "asc" }
    });
  }

  async addVersion(user: RequestUser, runId: string, dto: AddAiContentVersionDto) {
    await this.getRun(user, runId);
    return this.prisma.aiContentVersion.create({
      data: {
        aiGenerationRunId: runId,
        versionType: (dto.versionType ?? AiContentVersionType.HumanEdit) as never,
        content: dto.content,
        contentJson: dto.contentJson as never,
        editedById: user.id,
        editReason: dto.editReason
      }
    });
  }

  async finalize(user: RequestUser, runId: string, dto: AddAiContentVersionDto) {
    await this.getRun(user, runId);
    return this.prisma.aiContentVersion.create({
      data: {
        aiGenerationRunId: runId,
        versionType: AiContentVersionType.Final as never,
        content: dto.content,
        contentJson: dto.contentJson as never,
        editedById: user.id,
        editReason: dto.editReason ?? "Final approved version"
      }
    });
  }
}
