import { IsIn } from "class-validator";

export class ResolveQuoteReplyAssessmentDto {
  @IsIn(["ACCEPTED", "CUSTOMER_REJECTED"])
  outcome!: "ACCEPTED" | "CUSTOMER_REJECTED";
}
