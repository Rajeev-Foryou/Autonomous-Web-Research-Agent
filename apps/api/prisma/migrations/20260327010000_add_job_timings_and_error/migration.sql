ALTER TABLE "ResearchJob"
ADD COLUMN "plannerMs" INTEGER,
ADD COLUMN "researchMs" INTEGER,
ADD COLUMN "scrapeMs" INTEGER,
ADD COLUMN "summarizeMs" INTEGER,
ADD COLUMN "errorMessage" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3);

ALTER TABLE "ResearchJob"
ALTER COLUMN "currentStage" SET DEFAULT 'planning';

UPDATE "ResearchJob"
SET "currentStage" = 'planning'
WHERE "currentStage" = 'pending';
