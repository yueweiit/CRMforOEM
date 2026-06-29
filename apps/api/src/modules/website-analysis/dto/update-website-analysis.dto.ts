import { IsArray, IsOptional, IsString } from "class-validator";

export class UpdateWebsiteAnalysisDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  opportunities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  risks?: string[];
}
