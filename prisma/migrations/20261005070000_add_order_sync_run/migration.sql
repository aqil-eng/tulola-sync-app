-- CreateTable
CREATE TABLE "OrderSyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "error" TEXT
);

-- CreateTable
CREATE TABLE "OrderSyncResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "transactionSid" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "shopifyOrderId" TEXT,
    "unmatchedSkus" TEXT,
    "error" TEXT,
    CONSTRAINT "OrderSyncResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "OrderSyncRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "OrderSyncResult_runId_idx" ON "OrderSyncResult"("runId");

