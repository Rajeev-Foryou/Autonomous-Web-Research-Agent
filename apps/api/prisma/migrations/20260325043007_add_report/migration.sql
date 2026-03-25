/*
  Warnings:

  - You are about to drop the column `summary` on the `ResearchReport` table. All the data in the column will be lost.
  - Added the required column `content` to the `ResearchReport` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ResearchReport" DROP COLUMN "summary",
ADD COLUMN     "content" TEXT NOT NULL;
