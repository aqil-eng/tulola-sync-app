# Shopify app development

This app is scaffolded from a Shopify app template (React Router + Prisma + `@shopify/shopify-app-react-router`), matching the structure of this user's other Shopify apps — `kirri-portal` and `soma-kurasi-shipping`, both siblings under `~/Desktop/repos/`. When in doubt about a convention (file layout, deploy setup, eslint config), check those two rather than guessing.

Use the [Shopify AI Toolkit](https://shopify.dev/docs/apps/build/ai-toolkit) for all Shopify API and platform work. If missing, install it in the agent host per that page (or `npx skills add Shopify/shopify-ai-toolkit --list` for skill-compatible hosts) — do not add tooling to this repo.

## Project context

This app is a bridge between Tulola's Shopify online store and a separate backend service, **`tulola-integration`** (sibling repo: `~/Desktop/repos/tulola-integration`). That service syncs Tulola's PRISM POS data (in-store + event sales) into Postgres and computes customer segmentation from it. Read its `CLAUDE.md`/`schema.prisma`/`src/service/segmentation/` before implementing anything here — this app's whole job is interfacing with that system, so guessing at its shape instead of reading it will produce a mismatched integration.

Nothing beyond this scaffold is implemented yet — no OAuth has been tested end-to-end, no Shopify Partner app is registered (`shopify.app.toml` has a blank `client_id`), and every route under `api.*`/`webhooks.orders.*` is a stub returning `501` or doing a naive passthrough. Treat this as day 0.

### The three requirements

1. **Push unregistered PRISM customers into Shopify.** Every customer already in `tulola-integration`'s `Customer` table (in-store/event buyers, synced from PRISM) that doesn't yet have a Shopify account should get one created. Stub: `app/routes/api.customers.sync.tsx` (tulola-integration calls in).
2. **Segments as Shopify tags.** `tulola-integration`'s `CustomerSegmentSnapshot` table computes four independent segment dimensions per customer per run — reflect the *latest* values as tags on the matching Shopify customer. Stub: `app/routes/api.customers.segments.tsx` (tulola-integration calls in).
3. **Online purchases flow back for segmentation.** Every Shopify order needs to reach `tulola-integration` so it counts toward that customer's stats. Stub: `app/routes/webhooks.orders.create.tsx` (Shopify calls in, forwards out via `app/lib/tulolaIntegrationClient.server.ts`).

Both directions use `x-access-token` header auth: `requireServiceToken.server.ts` here mirrors `tulola-integration/src/middleware/requireAccessToken.ts` there, so the two services share one auth convention for their server-to-server calls.

### What tulola-integration already has, that this app must integrate with

- **`Customer`** (`Customer.sid` BigInt id, `Customer.custid` = PRISM's customer id, unique): `email`, `phone`, `fullName` — the only plausible match keys against a Shopify customer today. No `shopifyCustomerId` column exists yet; requirement 1 will need to add one (or an equivalent lookup table) so requirement 2 doesn't re-resolve the match by email every run.
- **`CustomerSegmentSnapshot`** (append-only — new row every segmentation run, never overwritten, specifically so segment migration can be charted over time): four segment fields to mirror as tags —
  - `frequencySegment`: `high` | `medium` | `low` | `churn_risk`
  - `valueSegment`: `elite` | `premium` | `core` | `entry`
  - `lifecycleSegment`: `first_time_buyer` | `early_repeat` | `active_existing` | `lapsing_existing` | `inactive_churned`
  - `channelSegment`: `store_only_loyalist` | `store_main_shopper` | `hybrid_shopper` | `event_heavy_shopper` | `event_only_shopper` (nullable — older snapshots predate this dimension)
- **`CustomerLifetimeStats`**: tracks `storePurchaseCount` and `eventPurchaseCount` as *explicit, separately-stored* counters (deliberately not derived from each other) — specifically so adding an `onlinePurchaseCount` here later, once this app is real, is additive rather than a rewrite. `channelSegment` is computed from these via `classifyChannel()` in `tulola-integration/src/service/segmentation/classify.ts`.
- **`Transaction`/`TransactionItem`**: modeled after PRISM's document/line-item shape (`Transaction.btId` matches `Customer.custid`; `TransactionItem.itemDescription1` matches a separate `Product.itemCode` master-data table via a Postgres view, not a Prisma relation). Channel (`store` vs `event`) is currently inferred from `Transaction.storeName` matching `/event/i`. Whether Shopify orders reuse these same tables (with a synthetic `storeName` like `"Online"`, extending the channel classifier to a third branch) or get their own tables is an open question below.

## Open design questions (resolve before implementing, don't guess)

- **Customer matching/dedup**: email as primary key, but PRISM data quality is uneven — walk-in customers may have no email captured at POS. What's the fallback (phone? manual review queue?), and how are true duplicates (same person, two records) avoided?
- **Marketing consent**: creating a Shopify customer record for someone who's only ever bought in-store must not silently opt them into email/SMS marketing. Needs its own explicit handling, not a side effect of requirement 1.
- **Source of truth / conflict resolution**: once a customer exists in both systems, which side wins if both get edited? Not yet decided for any field.
- **Tag semantics**: `CustomerSegmentSnapshot` is history; Shopify tags are current-state only. Pushing tags must *replace* the previous value per dimension, not accumulate (e.g. namespace as `segment:frequency:*`, `segment:value:*`, `segment:lifecycle:*`, `segment:channel:*`, strip old before adding new).
- **Orders schema fit**: does a Shopify order become a `Transaction`/`TransactionItem` row (reusing all existing segmentation code, needs field-shape verification against Shopify's discount/refund/multi-currency model) or a parallel table unified at query time?
- **Webhook reliability**: Shopify webhook delivery isn't guaranteed. `orders/create` alone isn't enough long-term — needs a periodic reconciliation pull, same resilience pattern as tulola-integration's own PRISM sync-cursor jobs.
- **Refunds/cancellations**: PRISM's `Transaction` model doesn't represent these; Shopify orders can be edited/partially refunded/cancelled after the webhook fires. Not yet designed.
- **`orders/create` vs `orders/paid`**: `shopify.app.toml` currently subscribes to `orders/create` — unconfirmed as the right topic.
- **Single-shop assumption**: routes currently assume one Tulola shop, not a multi-tenant app. Confirm this holds before building the `unauthenticated.admin(shop)` calls the stubs reference.
