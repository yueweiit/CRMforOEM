import { Transform } from "class-transformer";
import { IsArray, IsOptional, IsString, IsUrl } from "class-validator";
import { trimBlankToUndefined } from "../../../common/dto/transforms";

export class CreateCustomerDto {
  @IsString()
  name!: string;

  @IsOptional()
  @Transform(trimBlankToUndefined)
  @IsUrl({ require_protocol: false })
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  typeId?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

