import { IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

export class EditSampleRoundDto {
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

export class SampleReviewDto { @IsOptional() @IsString() comment?: string; }

export class RetainSampleRoundDto {
  @IsInt() @Min(1) producedQuantity!: number;
  @IsInt() @Min(1) retainedQuantity!: number;
  @IsString() @IsNotEmpty() retainedLocation!: string;
  @IsOptional() @IsDateString() retainedAt?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) fileAssetIds?: string[];
}

export class ShipSampleRoundDto {
  @IsString() @IsNotEmpty() carrier!: string;
  @IsString() @IsNotEmpty() trackingNo!: string;
  @IsInt() @Min(1) shippedQuantity!: number;
  @IsOptional() @IsDateString() shippedAt?: string;
}

export class DeliverSampleRoundDto { @IsOptional() @IsDateString() deliveredAt?: string; }

export class RecordSampleFeedbackDto {
  @IsIn(["ACCEPTED", "RESAMPLE_REQUIRED", "CUSTOMER_REJECTED"]) feedbackResult!: string;
  @IsString() feedback!: string;
  @IsIn(["PENDING", "RETURNED", "CUSTOMER_KEPT", "DISPOSED"]) dispositionStatus!: string;
}

export class RecordSampleDispositionDto {
  @IsOptional() @IsString() receiverName?: string;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsDateString() recordedAt?: string;
}

export class CreateResampleDraftDto {
  @IsString() @IsNotEmpty() reason!: string;
  @IsOptional() @IsString() changeSummary?: string;
}

export class TerminateSampleRequestDto { @IsString() @IsNotEmpty() reason!: string; }
