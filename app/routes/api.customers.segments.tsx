import type { ActionFunctionArgs } from "react-router";
import { requireServiceToken } from "../lib/requireServiceToken.server";

// Requirement 2: tulola-integration calls this after computing segments
// (CustomerSegmentSnapshot's frequencySegment/valueSegment/lifecycleSegment/
// channelSegment) to reflect the latest values as tags on the matching
// Shopify customer.
//
// TODO (see AGENTS.md — none of this is decided yet):
// - Depends on requirement 1 already having resolved a shopifyCustomerId
//   for this PRISM customer.
// - Must REPLACE old segment tags, not append (CustomerSegmentSnapshot is
//   append-only history; Shopify tags are current-state only) — namespace
//   tags per dimension (segment:frequency:*, segment:value:*,
//   segment:lifecycle:*, segment:channel:*) so old values in that namespace
//   can be identified and stripped before adding the new one.
// - Use unauthenticated.admin(shop) from shopify.server.ts for the
//   tagsAdd/tagsRemove Admin API mutations once implemented.
export const action = async ({ request }: ActionFunctionArgs) => {
  requireServiceToken(request);

  return Response.json({ error: "not implemented" }, { status: 501 });
};
