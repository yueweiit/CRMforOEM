import { IsObject, IsOptional, IsString } from "class-validator";

export class UpdateResearchReportDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsObject()
  reportJson?: Record<string, unknown>;
}
