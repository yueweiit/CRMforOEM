import { IsArray, IsDateString, IsOptional, IsString } from "class-validator";

export class CreateSampleRequestDto {
  @IsString()
  customerId!: string;

  @IsString()
  productSummary!: string;

  @IsOptional()
  @IsString()
  quoteId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileAssetIds?: string[];

  @IsOptional()
  @IsString()
  carrier?: string;

  @IsOptional()
  @IsString()
  trackingNo?: string;

  @IsOptional()
  @IsDateString()
  shippedAt?: string;
}

