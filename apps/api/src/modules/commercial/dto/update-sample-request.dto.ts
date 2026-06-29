import { IsOptional, IsString, IsDateString, IsIn } from "class-validator";

const SAMPLE_STATUSES = ["REQUESTED", "PREPARING", "SHIPPED", "DELIVERED", "FEEDBACK_RECEIVED", "CLOSED"] as const;

export class UpdateSampleRequestDto {
  @IsOptional() @IsString() productSummary?: string;
  @IsOptional() @IsIn(SAMPLE_STATUSES) status?: string;
  @IsOptional() @IsString() carrier?: string;
  @IsOptional() @IsString() trackingNo?: string;
  @IsOptional() @IsDateString() shippedAt?: string;
  @IsOptional() @IsString() feedback?: string;
}
