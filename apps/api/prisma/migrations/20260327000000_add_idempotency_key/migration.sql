-- AlterTable
ALTER TABLE "ResearchJob" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ResearchJob_idempotencyKey_key" ON "ResearchJob"("idempotencyKey");
