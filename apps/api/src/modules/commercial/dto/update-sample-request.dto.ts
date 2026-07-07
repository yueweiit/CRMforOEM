import { IsArray, IsOptional, IsString, IsDateString, IsIn } from "class-validator";

const SAMPLE_STATUSES = [
  "REQUESTED",
  "APPROVING",
  "PREPARING",
  "SHIPPED",
  "DELIVERED",
  "FEEDBACK_RECEIVED",
  "RETURNED",
  "STORED",
  "VOIDED",
  "CLOSED"
] as const;

export class UpdateSampleRequestDto {
  @IsOptional() @IsString() productSummary?: string;
  @IsOptional() @IsIn(SAMPLE_STATUSES) status?: string;
  @IsOptional() @IsString() quoteId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) fileAssetIds?: string[];
  @IsOptional() @IsString() carrier?: string;
  @IsOptional() @IsString() trackingNo?: string;
  @IsOptional() @IsDateString() shippedAt?: string;
  @IsOptional() @IsDateString() deliveredAt?: string;
  @IsOptional() @IsString() feedback?: string;
}
