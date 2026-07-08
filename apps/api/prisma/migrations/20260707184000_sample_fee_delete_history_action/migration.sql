DO $$
BEGIN
  ALTER TYPE "SampleHistoryAction" ADD VALUE IF NOT EXISTS 'FEE_DELETED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
