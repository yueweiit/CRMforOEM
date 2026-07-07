import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";

const SAMPLE_FEE_TYPES = ["SAMPLE_MAKING", "MOLD", "COURIER", "PACKAGING", "RETURN", "OTHER"] as const;

export class CreateSampleFeeDto {
  @IsIn(SAMPLE_FEE_TYPES)
  feeType!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  currency!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsDateString()
  incurredAt?: string;
}
