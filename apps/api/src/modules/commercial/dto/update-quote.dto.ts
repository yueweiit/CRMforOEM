import { Type } from "class-transformer";
import { IsOptional, IsString, IsNumber, IsDateString, IsInt, Min, IsIn, IsArray, ValidateNested } from "class-validator";
import { QuoteMaterialItemDto } from "./create-quote.dto";

const QUOTE_STATUS_VALUES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "CUSTOMER_REJECTED",
  "SENT",
  "ACCEPTED",
  "EXPIRED",
  "VOIDED"
] as const;

export class UpdateQuoteDto {
  @IsOptional() @IsString() quoteNo?: string;
  @IsOptional() @IsString() productName?: string;
  @IsOptional() @IsString() specification?: string;
  @IsOptional() @IsInt() @Min(1) moq?: number;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() @IsIn(["formula", "direct"]) calcMode?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => QuoteMaterialItemDto) materialItems?: QuoteMaterialItemDto[];
  @IsOptional() @IsNumber() materialProfitRate?: number;
  @IsOptional() @IsNumber() @Min(0) processingTime?: number;
  @IsOptional() @IsNumber() @Min(0) processingHourlyRate?: number;
  @IsOptional() @IsNumber() processingProfitRate?: number;
  @IsOptional() @IsNumber() @Min(0) grossWeight?: number;
  @IsOptional() @IsNumber() @Min(0) packageLength?: number;
  @IsOptional() @IsNumber() @Min(0) packageWidth?: number;
  @IsOptional() @IsNumber() @Min(0) packageHeight?: number;
  @IsOptional() @IsNumber() @Min(0) volumeDivisor?: number;
  @IsOptional() @IsNumber() @Min(0) shippingUnitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) vatRate?: number;
  @IsOptional() @IsNumber() @Min(0) materialCost?: number;
  @IsOptional() @IsNumber() @Min(0) processingCost?: number;
  @IsOptional() @IsNumber() @Min(0) taxCost?: number;
  @IsOptional() @IsNumber() @Min(0) shippingCost?: number;
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() @IsIn(QUOTE_STATUS_VALUES) status?: string;
}
