-- CreateTable
CREATE TABLE "CustomerSyncRun" (
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
CREATE TABLE "CustomerSyncResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "custid" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "shopifyCustomerId" TEXT,
    "skipReason" TEXT,
    "error" TEXT,
    CONSTRAINT "CustomerSyncResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CustomerSyncRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CustomerSyncResult_runId_idx" ON "CustomerSyncResult"("runId");
