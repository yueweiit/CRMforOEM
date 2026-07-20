-- AlterTable: 报价成本公式扩展，新增公式模式计算明细字段
-- calcMode 默认 "direct"（直接录入模式），向后兼容存量数据
-- 明细字段全部允许 NULL，仅在 calcMode="formula" 时使用

ALTER TABLE "quotes"
ADD COLUMN IF NOT EXISTS "calcMode" TEXT NOT NULL DEFAULT 'direct',
ADD COLUMN IF NOT EXISTS "materialItems" JSONB,
ADD COLUMN IF NOT EXISTS "materialProfitRate" DECIMAL(65,30),
ADD COLUMN IF NOT EXISTS "processingTime" DECIMAL(65,30),
ADD COLUMN IF NOT EXISTS "processingHourlyRate" DECIMAL(65,30),
ADD COLUMN IF NOT EXISTS "processingProfitRate" DECIMAL(65,30),
ADD COLUMN IF NOT EXISTS "grossWeight" DECIMAL(65,30),
ADD COLUMN IF NOT EXISTS "packageLength" DECIMAL(65,30),
ADD COLUMN IF NOT EXISTS "packageWidth" DECIMAL(65,30),
ADD COLUMN IF NOT EXISTS "packageHeight" DECIMAL(65,30),
ADD COLUMN IF NOT EXISTS "volumeDivisor" DECIMAL(65,30),
ADD COLUMN IF NOT EXISTS "shippingUnitPrice" DECIMAL(65,30),
ADD COLUMN IF NOT EXISTS "vatRate" DECIMAL(65,30);
