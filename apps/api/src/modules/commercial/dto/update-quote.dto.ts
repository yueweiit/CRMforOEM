import { IsOptional, IsString, IsNumber, IsDateString, IsInt, Min, IsIn } from "class-validator";

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
  @IsOptional() @IsNumber() materialCost?: number;
  @IsOptional() @IsNumber() processingCost?: number;
  @IsOptional() @IsNumber() taxCost?: number;
  @IsOptional() @IsNumber() shippingCost?: number;
  @IsOptional() @IsNumber() discountAmount?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() @IsIn(QUOTE_STATUS_VALUES) status?: string;
}
