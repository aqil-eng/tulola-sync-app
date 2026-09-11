import { timingSafeEqual } from "node:crypto";

// Guards the api.* routes tulola-integration calls into (as opposed to
// Shopify's own webhook/admin auth, which the webhooks.*/app.* routes use).
// Mirrors tulola-integration's own requireAccessToken.ts middleware —
// x-access-token header, constant-time compare — so the two codebases share
// one auth convention for their server-to-server calls.
export function requireServiceToken(request: Request): void {
  const expected = process.env.BRIDGE_SERVICE_TOKEN;
  if (!expected) {
    throw new Response("BRIDGE_SERVICE_TOKEN not configured", { status: 500 });
  }

  const provided = request.headers.get("x-access-token");
  if (!provided) {
    throw new Response("missing x-access-token", { status: 401 });
  }

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  const valid =
    expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);

  if (!valid) {
    throw new Response("invalid x-access-token", { status: 401 });
  }
}
