import { IsInt, IsObject, IsOptional, IsString, Max, Min } from "class-validator";

export class UpdateOemScoreDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  manualScore?: number;

  @IsOptional()
  @IsString()
  manualGrade?: string;

  @IsOptional()
  @IsObject()
  manualBreakdown?: Record<string, number>;

  @IsOptional()
  @IsString()
  manualNotes?: string;
}
