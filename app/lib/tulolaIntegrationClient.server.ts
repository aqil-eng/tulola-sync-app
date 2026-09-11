// Outbound calls FROM this app TO tulola-integration — used to forward
// Shopify order webhooks back for segmentation (requirement 3). The reverse
// direction (tulola-integration calling INTO this app to push customers /
// segment tags — requirements 1 and 2) lives in the api.* routes instead,
// guarded by requireServiceToken.server.ts.
//
// TODO: tulola-integration's Transaction/TransactionItem tables are shaped
// around PRISM's document/line-item model. Whether Shopify orders map onto
// those same tables (with a synthetic storeName like "Online") or get their
// own tables is still undecided — see AGENTS.md. The payload shape below is
// a placeholder, not a settled contract.

interface ForwardOrderPayload {
  shopifyOrderId: string;
  shop: string;
  raw: unknown;
}

function baseUrl(): string {
  const url = process.env.TULOLA_INTEGRATION_URL;
  if (!url) throw new Error("TULOLA_INTEGRATION_URL not configured");
  return url.replace(/\/$/, "");
}

function accessToken(): string {
  const token = process.env.TULOLA_INTEGRATION_ACCESS_TOKEN;
  if (!token) throw new Error("TULOLA_INTEGRATION_ACCESS_TOKEN not configured");
  return token;
}

// TODO: no matching endpoint exists on tulola-integration yet. This is a
// placeholder for whatever route eventually accepts forwarded Shopify orders.
export async function forwardOrder(payload: ForwardOrderPayload): Promise<void> {
  const res = await fetch(`${baseUrl()}/shopify/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-access-token": accessToken(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`forwardOrder failed: ${res.status} ${res.statusText}`);
  }
}
