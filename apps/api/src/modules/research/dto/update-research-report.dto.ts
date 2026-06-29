import { IsOptional, IsString } from "class-validator";

export class UpdateResearchReportDto {
  @IsOptional()
  @IsString()
  title?: string;
}
