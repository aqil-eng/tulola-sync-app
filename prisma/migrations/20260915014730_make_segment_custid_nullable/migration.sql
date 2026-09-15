-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SegmentSyncResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "custid" TEXT,
    "shopifyCustomerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "skipReason" TEXT,
    "error" TEXT,
    CONSTRAINT "SegmentSyncResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SegmentSyncRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SegmentSyncResult" ("custid", "error", "id", "runId", "shopifyCustomerId", "skipReason", "status") SELECT "custid", "error", "id", "runId", "shopifyCustomerId", "skipReason", "status" FROM "SegmentSyncResult";
DROP TABLE "SegmentSyncResult";
ALTER TABLE "new_SegmentSyncResult" RENAME TO "SegmentSyncResult";
CREATE INDEX "SegmentSyncResult_runId_idx" ON "SegmentSyncResult"("runId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
