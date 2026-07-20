import { Type } from "class-transformer";
import { IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class QuoteMaterialItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsNumber()
  usage!: number;

  @IsNumber()
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  lossRate?: number;
}

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
  @IsString()
  @IsIn(["formula", "direct"])
  calcMode?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteMaterialItemDto)
  materialItems?: QuoteMaterialItemDto[];

  @IsOptional()
  @IsNumber()
  materialProfitRate?: number;

  @IsOptional()
  @IsNumber()
  processingTime?: number;

  @IsOptional()
  @IsNumber()
  processingHourlyRate?: number;

  @IsOptional()
  @IsNumber()
  processingProfitRate?: number;

  @IsOptional()
  @IsNumber()
  grossWeight?: number;

  @IsOptional()
  @IsNumber()
  packageLength?: number;

  @IsOptional()
  @IsNumber()
  packageWidth?: number;

  @IsOptional()
  @IsNumber()
  packageHeight?: number;

  @IsOptional()
  @IsNumber()
  volumeDivisor?: number;

  @IsOptional()
  @IsNumber()
  shippingUnitPrice?: number;

  @IsOptional()
  @IsNumber()
  vatRate?: number;

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
