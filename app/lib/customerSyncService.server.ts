import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";

export interface CustomerInput {
  custid: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
}

interface ProcessResult {
  custid: string;
  status: "created" | "linked" | "skipped" | "failed";
  shopifyCustomerId?: string;
  skipReason?: string;
  error?: string;
}

const CUSTOMER_SEARCH = `#graphql
  query CustomerSearch($query: String!) {
    customers(first: 1, query: $query) {
      edges {
        node {
          id
        }
      }
    }
  }
`;

const CUSTOMER_CREATE = `#graphql
  mutation CustomerCreate($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function searchCustomer(
  admin: AdminApiContext,
  query: string,
): Promise<string | null> {
  const res = await admin.graphql(CUSTOMER_SEARCH, { variables: { query } });
  const data = (await res.json()) as {
    data?: { customers?: { edges?: { node?: { id?: string } }[] } };
  };
  return data.data?.customers?.edges?.[0]?.node?.id ?? null;
}

// Resolves the best available first/last name from the customer record.
// Priority: explicit fields first, then fullName as fallback.
// lastName is optional — Shopify allows a customer with only a first name.
function resolveName(customer: CustomerInput): { firstName: string; lastName?: string } | null {
  const fn = customer.firstName?.trim();
  const ln = customer.lastName?.trim();
  const full = customer.fullName?.trim();

  if (fn && ln) return { firstName: fn, lastName: ln };

  if (fn) {
    // lastName missing — try to extract it from the tail of fullName
    if (full && full.toLowerCase().startsWith(fn.toLowerCase())) {
      const tail = full.slice(fn.length).trim();
      if (tail) return { firstName: fn, lastName: tail };
    }
    // No useful fullName — create with firstName only
    return { firstName: fn };
  }

  if (full) {
    const spaceIdx = full.indexOf(" ");
    if (spaceIdx > 0) {
      return { firstName: full.slice(0, spaceIdx), lastName: full.slice(spaceIdx + 1).trim() };
    }
    return { firstName: full };
  }

  return null;
}

async function processOne(
  admin: AdminApiContext,
  customer: CustomerInput,
): Promise<ProcessResult> {
  const { custid, email, phone } = customer;

  const name = resolveName(customer);
  if (!name) {
    return { custid, status: "skipped", skipReason: "no name information available" };
  }

  try {
    // 1. Match by email
    if (email?.trim()) {
      const id = await searchCustomer(admin, `email:"${email.trim()}"`);
      if (id) return { custid, status: "linked", shopifyCustomerId: id };
    }

    // 2. Match by phone
    if (phone?.trim()) {
      const id = await searchCustomer(admin, `phone:"${phone.trim()}"`);
      if (id) return { custid, status: "linked", shopifyCustomerId: id };
    }

    // 3. Create — never opt into marketing
    const res = await admin.graphql(CUSTOMER_CREATE, {
      variables: {
        input: {
          firstName: name.firstName,
          ...(name.lastName ? { lastName: name.lastName } : {}),
          ...(email?.trim() ? { email: email.trim() } : {}),
          ...(phone?.trim() ? { phone: phone.trim() } : {}),
          // consent fields require the corresponding contact field to be present
          ...(email?.trim() ? { emailMarketingConsent: { marketingState: "NOT_SUBSCRIBED" } } : {}),
          ...(phone?.trim() ? { smsMarketingConsent: { marketingState: "NOT_SUBSCRIBED" } } : {}),
        },
      },
    });

    const data = (await res.json()) as {
      data?: {
        customerCreate?: {
          customer?: { id?: string };
          userErrors?: { field: string[]; message: string }[];
        };
      };
    };

    const userErrors = data.data?.customerCreate?.userErrors ?? [];
    if (userErrors.length > 0) {
      return { custid, status: "failed", error: userErrors.map((e) => e.message).join("; ") };
    }

    const shopifyCustomerId = data.data?.customerCreate?.customer?.id;
    if (!shopifyCustomerId) {
      return { custid, status: "failed", error: "customerCreate returned no id" };
    }

    return { custid, status: "created", shopifyCustomerId };
  } catch (err) {
    return {
      custid,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runCustomerSyncBatch(runId: string, customers: CustomerInput[]): Promise<void> {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  if (!shop) {
    await db.customerSyncRun.update({
      where: { id: runId },
      data: { status: "failed", error: "SHOPIFY_SHOP_DOMAIN not configured", finishedAt: new Date() },
    });
    return;
  }

  const { admin } = await unauthenticated.admin(shop);

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const customer of customers) {
    const result = await processOne(admin, customer);

    if (result.status === "created" || result.status === "linked") succeeded++;
    else if (result.status === "skipped") skipped++;
    else failed++;

    await db.customerSyncResult.create({
      data: {
        runId,
        custid: result.custid,
        status: result.status,
        shopifyCustomerId: result.shopifyCustomerId ?? null,
        skipReason: result.skipReason ?? null,
        error: result.error ?? null,
      },
    });

    await db.customerSyncRun.update({
      where: { id: runId },
      data: {
        processed: { increment: 1 },
        succeeded,
        failed,
        skipped,
      },
    });
  }

  await db.customerSyncRun.update({
    where: { id: runId },
    data: { status: "completed", finishedAt: new Date() },
  });
}
