import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";

export interface SegmentSnapshot {
  // Null for online-only customers (created from a Shopify order, no PRISM
  // record) — shopifyCustomerId is what's actually used to address the
  // customer below; custid is carried through purely for audit/correlation.
  custid: string | null;
  shopifyCustomerId: string;
  frequencySegment: string;
  valueSegment: string;
  lifecycleSegment: string;
  channelSegment?: string | null;
}

interface ProcessResult {
  custid: string | null;
  shopifyCustomerId: string;
  status: "updated" | "skipped" | "failed";
  skipReason?: string;
  error?: string;
}

const SEGMENT_PREFIXES = [
  "segment:frequency:",
  "segment:value:",
  "segment:lifecycle:",
  "segment:channel:",
];

const GET_CUSTOMER_TAGS = `#graphql
  query GetCustomerTags($id: ID!) {
    customer(id: $id) {
      id
      tags
    }
  }
`;

const CUSTOMER_UPDATE = `#graphql
  mutation CustomerUpdate($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer {
        id
        tags
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function buildNewTags(currentTags: string[], snapshot: SegmentSnapshot): string[] {
  const filtered = currentTags.filter(
    (tag) => !SEGMENT_PREFIXES.some((prefix) => tag.startsWith(prefix)),
  );
  filtered.push(`segment:frequency:${snapshot.frequencySegment}`);
  filtered.push(`segment:value:${snapshot.valueSegment}`);
  filtered.push(`segment:lifecycle:${snapshot.lifecycleSegment}`);
  if (snapshot.channelSegment) {
    filtered.push(`segment:channel:${snapshot.channelSegment}`);
  }
  return filtered;
}

async function processOne(admin: AdminApiContext, snapshot: SegmentSnapshot): Promise<ProcessResult> {
  const { custid, shopifyCustomerId } = snapshot;

  try {
    const tagsRes = await admin.graphql(GET_CUSTOMER_TAGS, {
      variables: { id: shopifyCustomerId },
    });
    const tagsData = (await tagsRes.json()) as {
      data?: { customer?: { tags?: string[] } | null };
    };

    if (!tagsData.data?.customer) {
      return { custid, shopifyCustomerId, status: "skipped", skipReason: "customer not found in Shopify" };
    }

    const currentTags = tagsData.data.customer.tags ?? [];
    const newTags = buildNewTags(currentTags, snapshot);

    const updateRes = await admin.graphql(CUSTOMER_UPDATE, {
      variables: { input: { id: shopifyCustomerId, tags: newTags } },
    });
    const updateData = (await updateRes.json()) as {
      data?: {
        customerUpdate?: {
          customer?: { id?: string };
          userErrors?: { field: string[]; message: string }[];
        };
      };
    };

    const userErrors = updateData.data?.customerUpdate?.userErrors ?? [];
    if (userErrors.length > 0) {
      return { custid, shopifyCustomerId, status: "failed", error: userErrors.map((e) => e.message).join("; ") };
    }

    return { custid, shopifyCustomerId, status: "updated" };
  } catch (err) {
    return {
      custid,
      shopifyCustomerId,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runSegmentTagBatch(runId: string, snapshots: SegmentSnapshot[]): Promise<void> {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  if (!shop) {
    await db.segmentSyncRun.update({
      where: { id: runId },
      data: { status: "failed", error: "SHOPIFY_SHOP_DOMAIN not configured", finishedAt: new Date() },
    });
    return;
  }

  const { admin } = await unauthenticated.admin(shop);

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const snapshot of snapshots) {
    const result = await processOne(admin, snapshot);

    if (result.status === "updated") succeeded++;
    else if (result.status === "skipped") skipped++;
    else failed++;

    await db.segmentSyncResult.create({
      data: {
        runId,
        custid: result.custid,
        shopifyCustomerId: result.shopifyCustomerId,
        status: result.status,
        skipReason: result.skipReason ?? null,
        error: result.error ?? null,
      },
    });

    await db.segmentSyncRun.update({
      where: { id: runId },
      data: { processed: { increment: 1 }, succeeded, failed, skipped },
    });
  }

  await db.segmentSyncRun.update({
    where: { id: runId },
    data: { status: "completed", finishedAt: new Date() },
  });
}
