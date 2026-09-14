import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { type SegmentSnapshot, runSegmentTagBatch } from "../lib/segmentTagService.server";
import { requireServiceToken } from "../lib/requireServiceToken.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  requireServiceToken(request);

  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  let snapshots: SegmentSnapshot[];
  try {
    const body = await request.json();
    if (!Array.isArray(body?.snapshots)) {
      return Response.json({ error: "body must be { snapshots: [...] }" }, { status: 400 });
    }
    snapshots = body.snapshots as SegmentSnapshot[];
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (snapshots.length === 0) {
    return Response.json({ error: "snapshots array is empty" }, { status: 400 });
  }

  const run = await db.segmentSyncRun.create({
    data: { status: "running", total: snapshots.length },
  });

  // Fire-and-forget — runs in background while this response is already sent
  runSegmentTagBatch(run.id, snapshots).catch(async (err) => {
    await db.segmentSyncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
      },
    });
  });

  return Response.json(
    { status: "accepted", entity: "segment-sync", runId: run.id },
    { status: 202 },
  );
};
