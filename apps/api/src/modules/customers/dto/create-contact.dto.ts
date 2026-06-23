import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, IsUrl, Max, Min } from "class-validator";
import { trimBlankToUndefined } from "../../../common/dto/transforms";

export class CreateContactDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @Transform(trimBlankToUndefined)
  @IsUrl({ require_protocol: true })
  linkedinUrl?: string;

  @IsOptional()
  @Transform(trimBlankToUndefined)
  @IsUrl({ require_protocol: true })
  sourceUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  qualityScore?: number;

  @IsOptional()
  @IsBoolean()
  isDecisionMaker?: boolean;
}

