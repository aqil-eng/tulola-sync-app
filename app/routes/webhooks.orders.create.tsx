import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { forwardOrder } from "../lib/tulolaIntegrationClient.server";

// Requirement 3: every online purchase must be recorded and sent to
// tulola-integration for segmentation.
//
// TODO (see AGENTS.md):
// - orders/create vs orders/paid — which topic is actually right here.
// - Webhook delivery isn't guaranteed; needs a periodic reconciliation pull
//   as a safety net, same pattern as tulola-integration's own PRISM sync
//   (sync cursor + backfill), not just this webhook alone.
// - Customer resolution: the order's Shopify customer must resolve to the
//   same Customer.sid used throughout tulola-integration (depends on
//   requirement 1's matching being solid), or this order won't count
//   toward the right customer's segmentation.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await forwardOrder({
    shopifyOrderId: String((payload as { id?: unknown }).id ?? ""),
    shop,
    raw: payload,
  });

  return new Response();
};
