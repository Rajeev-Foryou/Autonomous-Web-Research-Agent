ALTER TABLE "ResearchJob"
ADD CONSTRAINT "ResearchJob_status_check"
CHECK ("status" IN ('pending', 'running', 'completed', 'failed'));

ALTER TABLE "ResearchTask"
ADD CONSTRAINT "ResearchTask_status_check"
CHECK ("status" IN ('pending', 'running', 'completed', 'failed'));