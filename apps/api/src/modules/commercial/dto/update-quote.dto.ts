import { IsOptional, IsString, IsNumber, IsDateString, IsIn } from "class-validator";

const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"] as const;

export class UpdateQuoteDto {
  @IsOptional() @IsString() quoteNo?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsIn(QUOTE_STATUSES) status?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() validUntil?: string;
}
