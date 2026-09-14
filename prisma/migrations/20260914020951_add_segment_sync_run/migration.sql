-- CreateTable
CREATE TABLE "SegmentSyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "error" TEXT
);

-- CreateTable
CREATE TABLE "SegmentSyncResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "custid" TEXT NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "skipReason" TEXT,
    "error" TEXT,
    CONSTRAINT "SegmentSyncResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SegmentSyncRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SegmentSyncResult_runId_idx" ON "SegmentSyncResult"("runId");
