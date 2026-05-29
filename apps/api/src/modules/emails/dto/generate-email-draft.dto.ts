import { IsArray, IsEmail, IsOptional, IsString } from "class-validator";

export class GenerateEmailDraftDto {
  @IsOptional()
  @IsString()
  purpose?: "FIRST_OUTREACH" | "SECOND_FOLLOW_UP" | "THIRD_FOLLOW_UP" | "REQUIREMENT_CONFIRMATION" | "QUOTE_FOLLOW_UP" | "SAMPLE_FOLLOW_UP";

  @IsOptional()
  @IsString()
  emailAccountId?: string;

  @IsOptional()
  @IsEmail()
  toEmail?: string;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  ccEmails?: string[];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bccEmails?: string[];

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  userInstructions?: string;
}

