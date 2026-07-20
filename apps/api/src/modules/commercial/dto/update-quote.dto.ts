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
  @IsOptional() @IsNumber() processingTime?: number;
  @IsOptional() @IsNumber() processingHourlyRate?: number;
  @IsOptional() @IsNumber() processingProfitRate?: number;
  @IsOptional() @IsNumber() grossWeight?: number;
  @IsOptional() @IsNumber() packageLength?: number;
  @IsOptional() @IsNumber() packageWidth?: number;
  @IsOptional() @IsNumber() packageHeight?: number;
  @IsOptional() @IsNumber() volumeDivisor?: number;
  @IsOptional() @IsNumber() shippingUnitPrice?: number;
  @IsOptional() @IsNumber() vatRate?: number;
  @IsOptional() @IsNumber() materialCost?: number;
  @IsOptional() @IsNumber() processingCost?: number;
  @IsOptional() @IsNumber() taxCost?: number;
  @IsOptional() @IsNumber() shippingCost?: number;
  @IsOptional() @IsNumber() discountAmount?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() @IsIn(QUOTE_STATUS_VALUES) status?: string;
}
