import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsOptional } from "class-validator";
import { CreateEmailAccountDto } from "./create-email-account.dto";

export class UpdateEmailAccountDto extends PartialType(CreateEmailAccountDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
