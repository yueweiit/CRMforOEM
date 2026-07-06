import { IsOptional, IsString, IsNumber, IsDateString, IsInt, Min } from "class-validator";

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
}
