import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleCodes?: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleCodes?: string[];
}

export class CreateBlacklistRuleDto {
  @IsIn(["COMPANY_NAME", "DOMAIN", "EMAIL", "COUNTRY", "KEYWORD"])
  type!: "COMPANY_NAME" | "DOMAIN" | "EMAIL" | "COUNTRY" | "KEYWORD";

  @IsString()
  value!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateBlacklistRuleDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateCustomerDictionaryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCustomerDictionaryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateEmailPromptConfigDto {
  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mustInclude?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mustAvoid?: string[];

  @IsOptional()
  @IsString()
  structure?: string;

  @IsOptional()
  @IsString()
  customInstruction?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissionCodes!: string[];
}

export class UpdateOemScoringWeightsDto {
  @IsInt()
  @Min(0)
  @Max(100)
  productLineFit!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  marketFit!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  priceBandFit!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  brandMaturity!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  websiteCompleteness!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  contactQuality!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  cooperationOpportunity!: number;

  @IsInt()
  @Min(0)
  @Max(10)
  riskPenaltyMax!: number;
}
