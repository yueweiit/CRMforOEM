import { IsArray, IsObject, IsOptional, IsString } from "class-validator";

export class UpdateWebsiteAnalysisDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  opportunities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  risks?: string[];

  @IsOptional()
  @IsObject()
  aiInsights?: Record<string, unknown>;
}
