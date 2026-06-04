import { EMAIL_DRAFT_ALLOWED_PURPOSES } from "@oem-crm/shared";
import { IsArray, IsEmail, IsIn, IsOptional, IsString } from "class-validator";

export class UpdateEmailDraftDto {
  @IsOptional()
  @IsIn(EMAIL_DRAFT_ALLOWED_PURPOSES)
  purpose?: string;

  @IsOptional()
  @IsString()
  emailAccountId?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

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
}

