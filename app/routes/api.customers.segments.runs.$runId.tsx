import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { requireServiceToken } from "../lib/requireServiceToken.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  requireServiceToken(request);

  const run = await db.segmentSyncRun.findUnique({
    where: { id: params.runId },
    include: { results: true },
  });

  if (!run) {
    return Response.json({ error: "run not found" }, { status: 404 });
  }

  return Response.json({
    id: run.id,
    status: run.status,
    total: run.total,
    processed: run.processed,
    succeeded: run.succeeded,
    failed: run.failed,
    skipped: run.skipped,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    error: run.error,
    results: run.results.map((r) => ({
      custid: r.custid,
      shopifyCustomerId: r.shopifyCustomerId,
      status: r.status,
      skipReason: r.skipReason,
      error: r.error,
    })),
  });
};
