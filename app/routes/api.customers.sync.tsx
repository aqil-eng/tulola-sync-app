import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { type CustomerInput, runCustomerSyncBatch } from "../lib/customerSyncService.server";
import { requireServiceToken } from "../lib/requireServiceToken.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  requireServiceToken(request);

  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  let customers: CustomerInput[];
  try {
    const body = await request.json();
    if (!Array.isArray(body?.customers)) {
      return Response.json({ error: "body must be { customers: [...] }" }, { status: 400 });
    }
    customers = body.customers as CustomerInput[];
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (customers.length === 0) {
    return Response.json({ error: "customers array is empty" }, { status: 400 });
  }

  const run = await db.customerSyncRun.create({
    data: { status: "running", total: customers.length },
  });

  // Fire-and-forget — runs in background while this response is already sent
  runCustomerSyncBatch(run.id, customers).catch(async (err) => {
    await db.customerSyncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
      },
    });
  });

  return Response.json(
    { status: "accepted", entity: "customer-sync", runId: run.id },
    { status: 202 },
  );
};
