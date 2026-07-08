import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

const SAMPLE_PURPOSES = ["CUSTOMER_TEST", "EXHIBITION", "APPEARANCE_CONFIRMATION"] as const;

export class CreateSampleRequestDto {
  @IsString()
  customerId!: string;

  @IsString()
  productSummary!: string;

  @IsString()
  specification!: string;

  @IsString()
  material!: string;

  @IsString()
  process!: string;

  @IsInt()
  @Min(1)
  sampleQuantity!: number;

  @IsIn(SAMPLE_PURPOSES)
  samplePurpose!: string;

  @IsOptional()
  @IsDateString()
  deliveryDeadline?: string;

  @IsOptional()
  @IsString()
  quoteId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileAssetIds?: string[];

  @IsOptional()
  @IsString()
  carrier?: string;

  @IsOptional()
  @IsString()
  trackingNo?: string;

  @IsOptional()
  @IsDateString()
  shippedAt?: string;

  @IsArray()
  @ArrayMinSize(1)
  initialFees!: Array<{
    feeType: string;
    amount: number;
    currency: string;
    note?: string;
    incurredAt?: string;
  }>;
}

