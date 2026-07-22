import { Type } from "class-transformer";
import { IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class QuoteMaterialItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsNumber()
  @Min(0)
  usage!: number;

  @IsNumber()
  @Min(0)
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
  @Min(0)
  processingTime?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  processingHourlyRate?: number;

  @IsOptional()
  @IsNumber()
  processingProfitRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  grossWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packageLength?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packageWidth?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packageHeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  volumeDivisor?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingUnitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vatRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  materialCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  processingCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
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
