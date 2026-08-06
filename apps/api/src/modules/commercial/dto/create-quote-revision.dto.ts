import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateQuoteRevisionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
