import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";

export interface OrderLineInput {
  alu: string | null; // Shopify variant SKU
  itemCode: string | null; // Shopify variant barcode
  title: string;
  quantity: number;
  unitPrice: string; // already net of PRISM line-level discounts
}

export interface OrderInput {
  transactionSid: string;
  documentNumber: string | null;
  storeName: string | null;
  createdAt: string;
  shopifyCustomerId: string | null;
  channel: string;
  currency: string;
  total: string;
  tax: string;
  tenderName: string | null;
  lines: OrderLineInput[];
}

interface ProcessResult {
  transactionSid: string;
  status: "created" | "failed";
  shopifyOrderId?: string;
  unmatchedSkus?: string[];
  error?: string;
}

// tulola-integration's Shopify order webhook ingest skips any order carrying
// this tag — these sales are already counted there from PRISM. It's a tag
// rather than sourceName because sourceName only accepts attribution
// handles registered by a sales channel app, which this app isn't.
const PRISM_ORDER_TAG = "source:prism-pos";
const transactionTag = (sid: string) => `prism-sid:${sid}`;

const FIND_ORDER_BY_TAG = `#graphql
  query FindPrismOrder($query: String!) {
    orders(first: 1, query: $query) {
      edges {
        node {
          id
        }
      }
    }
  }
`;

const FIND_VARIANTS = `#graphql
  query FindVariants($query: String!) {
    productVariants(first: 2, query: $query) {
      edges {
        node {
          id
        }
      }
    }
  }
`;

const ORDER_CREATE = `#graphql
  mutation PrismOrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Order creation is rate-limited separately from the usual query cost
// budget (and much harder on development stores), so back off and retry
// instead of failing the whole order.
const MAX_ATTEMPTS = 5;
const THROTTLE_BACKOFF_MS = 20_000;
const isThrottle = (message: string) => /throttl|too many|rate limit|429/i.test(message);

async function graphqlWithRetry<T>(admin: AdminApiContext, query: string, variables: Record<string, unknown>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await admin.graphql(query, { variables });
      return (await res.json()) as T;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt >= MAX_ATTEMPTS || !isThrottle(message)) throw err;
      await new Promise((resolve) => setTimeout(resolve, THROTTLE_BACKOFF_MS * attempt));
    }
  }
}

const quote = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;

async function findOne(admin: AdminApiContext, query: string, search: string): Promise<string | null> {
  const data = await graphqlWithRetry<{
    data?: Record<string, { edges?: { node?: { id?: string } }[] } | undefined>;
  }>(admin, query, { query: search });
  const edges = Object.values(data.data ?? {})[0]?.edges ?? [];
  // Exactly one match only — an ambiguous SKU/barcode is treated as no match.
  return edges.length === 1 ? (edges[0].node?.id ?? null) : null;
}

// Shopify SKU = PRISM alu and Shopify barcode = PRISM itemCode (the two are
// swapped relative to PRISM's naming). Cached per run — the same products
// recur across receipts, and lookups count against the API rate limit.
function variantResolver(admin: AdminApiContext) {
  const cache = new Map<string, Promise<string | null>>();
  const lookup = (field: "sku" | "barcode", value: string) => {
    const key = `${field}:${value}`;
    let hit = cache.get(key);
    if (!hit) {
      hit = findOne(admin, FIND_VARIANTS, `${field}:${quote(value)}`);
      cache.set(key, hit);
    }
    return hit;
  };

  return async (line: OrderLineInput): Promise<string | null> => {
    if (line.alu) {
      const id = await lookup("sku", line.alu);
      if (id) return id;
    }
    if (line.itemCode) return lookup("barcode", line.itemCode);
    return null;
  };
}

const toCents = (amount: string | number) => Math.round(Number(amount) * 100);
const fromCents = (cents: number) => (cents / 100).toFixed(2);
const money = (cents: number, currencyCode: string) => ({
  shopMoney: { amount: fromCents(cents), currencyCode },
});

async function processOne(
  admin: AdminApiContext,
  resolveVariant: (line: OrderLineInput) => Promise<string | null>,
  order: OrderInput,
): Promise<ProcessResult> {
  const { transactionSid, currency } = order;

  try {
    // Guards against a retried batch (e.g. tulola-integration crashed
    // before recording this run's results) creating the same order twice.
    const existing = await findOne(admin, FIND_ORDER_BY_TAG, `tag:${quote(transactionTag(transactionSid))}`);
    if (existing) return { transactionSid, status: "created", shopifyOrderId: existing };

    const unmatchedSkus: string[] = [];
    let linesCents = 0;
    const lineItems = [];
    for (const line of order.lines) {
      const priceCents = toCents(line.unitPrice);
      linesCents += priceCents * line.quantity;

      const variantId = await resolveVariant(line);
      if (!variantId) unmatchedSkus.push(line.alu ?? line.itemCode ?? line.title);

      lineItems.push({
        ...(variantId ? { variantId } : { title: line.title }),
        ...(line.alu ? { sku: line.alu } : {}),
        quantity: line.quantity,
        priceSet: money(priceCents, currency),
        requiresShipping: false,
      });
    }

    // The PRISM total is authoritative: whatever separates the line sum from
    // it (a receipt-level discount, or a gift/replacement rung up at 0)
    // becomes one order discount, so the Shopify total matches the receipt.
    const totalCents = toCents(order.total);
    const discountCents = linesCents - totalCents;
    if (discountCents < 0) {
      return { transactionSid, status: "failed", error: "receipt total exceeds the sum of its line items" };
    }

    const taxCents = toCents(order.tax);
    const preTaxCents = totalCents - taxCents;
    const createdAt = order.createdAt;

    const input = {
      currency,
      processedAt: createdAt,
      sourceIdentifier: transactionSid,
      tags: [PRISM_ORDER_TAG, transactionTag(transactionSid), `channel:${order.channel}`],
      note: `PRISM receipt ${order.documentNumber ?? "-"} at ${order.storeName ?? "unknown store"}`,
      ...(order.shopifyCustomerId ? { customer: { toAssociate: { id: order.shopifyCustomerId } } } : {}),
      lineItems,
      // Paid and handed over at the counter — nothing left to fulfil.
      financialStatus: "PAID",
      fulfillmentStatus: "FULFILLED",
      taxesIncluded: true,
      ...(taxCents > 0 && preTaxCents > 0
        ? { taxLines: [{ title: "Tax", rate: (taxCents / preTaxCents).toFixed(4), priceSet: money(taxCents, currency) }] }
        : {}),
      ...(discountCents > 0
        ? { discountCode: { itemFixedDiscountCode: { code: "PRISM-DISCOUNT", amountSet: money(discountCents, currency) } } }
        : {}),
      ...(totalCents > 0
        ? {
            transactions: [
              {
                kind: "SALE",
                status: "SUCCESS",
                gateway: order.tenderName || "PRISM POS",
                amountSet: money(totalCents, currency),
                processedAt: createdAt,
              },
            ],
          }
        : {}),
    };

    const data = await graphqlWithRetry<{
      data?: {
        orderCreate?: {
          order?: { id?: string } | null;
          userErrors?: { field: string[] | null; message: string }[];
        };
      };
    }>(admin, ORDER_CREATE, {
      order: input,
      // Stock was already taken by PRISM, and the customer got their
      // receipt at the counter.
      options: { inventoryBehaviour: "BYPASS", sendReceipt: false, sendFulfillmentReceipt: false },
    });

    const userErrors = data.data?.orderCreate?.userErrors ?? [];
    if (userErrors.length > 0) {
      return { transactionSid, status: "failed", error: userErrors.map((e) => e.message).join("; ") };
    }

    const shopifyOrderId = data.data?.orderCreate?.order?.id;
    if (!shopifyOrderId) {
      return { transactionSid, status: "failed", error: "orderCreate returned no id" };
    }

    return { transactionSid, status: "created", shopifyOrderId, unmatchedSkus };
  } catch (err) {
    return {
      transactionSid,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runOrderSyncBatch(runId: string, orders: OrderInput[]): Promise<void> {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  if (!shop) {
    await db.orderSyncRun.update({
      where: { id: runId },
      data: { status: "failed", error: "SHOPIFY_SHOP_DOMAIN not configured", finishedAt: new Date() },
    });
    return;
  }

  const { admin } = await unauthenticated.admin(shop);
  const resolveVariant = variantResolver(admin);

  let succeeded = 0;
  let failed = 0;

  for (const order of orders) {
    const result = await processOne(admin, resolveVariant, order);

    if (result.status === "created") succeeded++;
    else failed++;

    await db.orderSyncResult.create({
      data: {
        runId,
        transactionSid: result.transactionSid,
        status: result.status,
        shopifyOrderId: result.shopifyOrderId ?? null,
        unmatchedSkus: result.unmatchedSkus?.length ? JSON.stringify(result.unmatchedSkus) : null,
        error: result.error ?? null,
      },
    });

    await db.orderSyncRun.update({
      where: { id: runId },
      data: { processed: { increment: 1 }, succeeded, failed },
    });
  }

  await db.orderSyncRun.update({
    where: { id: runId },
    data: { status: "completed", finishedAt: new Date() },
  });
}
