ALTER TABLE "ResearchJob"
ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'ResearchJob_idempotencyKey_key'
  ) THEN
    CREATE UNIQUE INDEX "ResearchJob_idempotencyKey_key" ON "ResearchJob"("idempotencyKey");
  END IF;
END
$$;

ALTER TABLE "ResearchJob"
ALTER COLUMN "currentStage" DROP NOT NULL,
ALTER COLUMN "currentStage" SET DEFAULT 'planning';

UPDATE "ResearchJob"
SET "currentStage" = 'planning'
WHERE "currentStage" IS NULL;
