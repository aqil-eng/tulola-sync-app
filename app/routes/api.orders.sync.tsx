import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { type OrderInput, runOrderSyncBatch } from "../lib/orderSyncService.server";
import { requireServiceToken } from "../lib/requireServiceToken.server";

// tulola-integration pushes new PRISM transactions here to be created as
// Shopify orders, so the customer's Shopify history includes in-store and
// event purchases.
export const action = async ({ request }: ActionFunctionArgs) => {
  requireServiceToken(request);

  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  let orders: OrderInput[];
  try {
    const body = await request.json();
    if (!Array.isArray(body?.orders)) {
      return Response.json({ error: "body must be { orders: [...] }" }, { status: 400 });
    }
    orders = body.orders as OrderInput[];
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (orders.length === 0) {
    return Response.json({ error: "orders array is empty" }, { status: 400 });
  }

  const run = await db.orderSyncRun.create({
    data: { status: "running", total: orders.length },
  });

  // Fire-and-forget — runs in background while this response is already sent
  runOrderSyncBatch(run.id, orders).catch(async (err) => {
    await db.orderSyncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
      },
    });
  });

  return Response.json(
    { status: "accepted", entity: "order-sync", runId: run.id },
    { status: 202 },
  );
};
