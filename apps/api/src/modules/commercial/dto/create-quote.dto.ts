import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateQuoteDto {
  @IsString()
  customerId!: string;

  @IsString()
  quoteNo!: string;

  @IsString()
  productName!: string;

  @IsOptional()
  @IsString()
  specification?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  moq?: number;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  currency!: string;

  @IsOptional()
  @IsNumber()
  materialCost?: number;

  @IsOptional()
  @IsNumber()
  processingCost?: number;

  @IsOptional()
  @IsNumber()
  taxCost?: number;

  @IsOptional()
  @IsNumber()
  shippingCost?: number;

  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  fileAssetId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

