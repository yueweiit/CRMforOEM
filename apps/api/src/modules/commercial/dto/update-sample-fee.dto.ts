import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";

const SAMPLE_FEE_TYPES = ["SAMPLE_MAKING", "MOLD", "COURIER", "PACKAGING", "RETURN", "OTHER"] as const;
const COST_NATURES = ["ACTUAL_COST", "CUSTOMER_CHARGE"] as const;
const RESPONSIBILITIES = ["FACTORY", "CUSTOMER", "SUPPLIER", "NEGOTIATED"] as const;
const PAYMENT_STATUSES = ["NOT_APPLICABLE", "PENDING", "RECEIVED", "WAIVED", "REFUNDED"] as const;

export class UpdateSampleFeeDto {
  @IsOptional()
  @IsIn(SAMPLE_FEE_TYPES)
  feeType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsDateString()
  incurredAt?: string;

  @IsOptional() @IsString() sampleRoundId?: string;
  @IsOptional() @IsIn(COST_NATURES) costNature?: string;
  @IsOptional() @IsIn(RESPONSIBILITIES) responsibility?: string;
  @IsOptional() @IsIn(PAYMENT_STATUSES) paymentStatus?: string;
}
