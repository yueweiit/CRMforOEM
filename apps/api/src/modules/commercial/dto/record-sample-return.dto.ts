import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

const SAMPLE_RETURN_TYPES = ["RETURNED", "STORED"] as const;

export class RecordSampleReturnDto {
  @IsIn(SAMPLE_RETURN_TYPES)
  returnType!: string;

  @IsOptional()
  @IsString()
  receiverName?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}
