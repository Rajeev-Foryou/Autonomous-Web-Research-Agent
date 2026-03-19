-- DropForeignKey
ALTER TABLE "ResearchReport" DROP CONSTRAINT "ResearchReport_jobId_fkey";

-- DropForeignKey
ALTER TABLE "ResearchSource" DROP CONSTRAINT "ResearchSource_jobId_fkey";

-- DropForeignKey
ALTER TABLE "ResearchTask" DROP CONSTRAINT "ResearchTask_jobId_fkey";

-- CreateIndex
CREATE INDEX "ResearchSource_jobId_idx" ON "ResearchSource"("jobId");

-- CreateIndex
CREATE INDEX "ResearchTask_jobId_idx" ON "ResearchTask"("jobId");

-- AddForeignKey
ALTER TABLE "ResearchTask" ADD CONSTRAINT "ResearchTask_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchReport" ADD CONSTRAINT "ResearchReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
