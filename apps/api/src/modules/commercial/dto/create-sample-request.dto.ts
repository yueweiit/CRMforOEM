import { IsDateString, IsOptional, IsString } from "class-validator";

export class CreateSampleRequestDto {
  @IsString()
  customerId!: string;

  @IsString()
  productSummary!: string;

  @IsOptional()
  @IsString()
  quoteId?: string;

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

