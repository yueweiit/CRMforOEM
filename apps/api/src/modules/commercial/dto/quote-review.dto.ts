import { IsOptional, IsString } from "class-validator";

export class QuoteReviewDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
