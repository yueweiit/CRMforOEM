import { Type } from "class-transformer";
import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { CreateSampleFeeDto } from "./create-sample-fee.dto";

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSampleFeeDto)
  initialFees?: CreateSampleFeeDto[];
}

