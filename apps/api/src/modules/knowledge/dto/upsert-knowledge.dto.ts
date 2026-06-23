import { Transform, Type } from "class-transformer";
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUrl } from "class-validator";
import { trimBlankToUndefined } from "../../../common/dto/transforms";

export class UpsertKnowledgeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  positioning?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetMarkets?: string[];

  @IsOptional()
  @Transform(trimBlankToUndefined)
  @IsUrl({ require_protocol: true })
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  markets?: string[];

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceMax?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  moq?: string;

  @IsOptional()
  @IsString()
  leadTime?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedMarkets?: string[];

  @IsOptional()
  @IsString()
  issuer?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  market?: string;

  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @IsString()
  materialType?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  fileAssetId?: string;

  // ── CompanyProfile ──

  @IsOptional()
  @IsDateString()
  foundedAt?: string;

  @IsOptional()
  @IsString()
  factoryAddress?: string;

  @IsOptional()
  @IsString()
  productionScale?: string;

  // ── Brand ──

  @IsOptional()
  @IsString()
  competitiveAdvantage?: string;

  // ── Product ──

  @IsOptional()
  specifications?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  material?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageAssetIds?: string[];

  // ── OemCapability ──

  @IsOptional()
  @IsString()
  packagingCustomization?: string;

  // ── Certificate ──

  @IsOptional()
  @IsString()
  certType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileAssetIds?: string[];

  // ── CaseStudy ──

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsDateString()
  cooperationDate?: string;
}
