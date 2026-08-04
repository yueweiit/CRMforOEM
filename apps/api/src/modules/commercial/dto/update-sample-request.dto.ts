import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

const SAMPLE_STATUSES = [
  "REQUESTED",
  "APPROVING",
  "REJECTED",
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
  @IsOptional() @IsString() specification?: string;
  @IsOptional() @IsString() material?: string;
  @IsOptional() @IsString() process?: string;
  @IsOptional() @IsInt() @Min(1) sampleQuantity?: number;
  @IsOptional() @IsIn(["CUSTOMER_TEST", "EXHIBITION", "APPEARANCE_CONFIRMATION"]) samplePurpose?: string;
  @IsOptional() @IsDateString() deliveryDeadline?: string;
  @IsOptional() @IsIn(SAMPLE_STATUSES) status?: string;
  @IsOptional() @IsString() quoteId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) fileAssetIds?: string[];
  @IsOptional() @IsString() carrier?: string;
  @IsOptional() @IsString() trackingNo?: string;
  @IsOptional() @IsDateString() shippedAt?: string;
  @IsOptional() @IsDateString() deliveredAt?: string;
  @IsOptional() @IsString() feedback?: string;
  @IsOptional() @IsString() comment?: string;
}
