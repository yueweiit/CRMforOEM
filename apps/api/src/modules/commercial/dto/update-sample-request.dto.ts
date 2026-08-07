import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

export class UpdateSampleRequestDto {
  @IsOptional() @IsString() productSummary?: string;
  @IsOptional() @IsString() specification?: string;
  @IsOptional() @IsString() material?: string;
  @IsOptional() @IsString() process?: string;
  @IsOptional() @IsInt() @Min(1) requestedQuantity?: number;
  @IsOptional() @IsIn(["CUSTOMER_TEST", "EXHIBITION", "APPEARANCE_CONFIRMATION"]) samplePurpose?: string;
  @IsOptional() @IsDateString() deliveryDeadline?: string;
  @IsOptional() @IsString() quoteId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) fileAssetIds?: string[];
}
