DO $$
BEGIN
  ALTER TYPE "SampleHistoryAction" ADD VALUE IF NOT EXISTS 'FEE_UPDATED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
