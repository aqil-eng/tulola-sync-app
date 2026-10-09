# Tulola Shopify App

Shopify app installed into Tulola's online store. Bridges Shopify's customer/order data with [`tulola-integration`](../tulola-integration) (the PRISM POS sync + segmentation backend).

`AGENTS.md` has the original day-0 plan and open design questions — some of
it is now out of date (see "What changed since AGENTS.md" below); this
README describes what's actually implemented and how to run the app.

## Status

A registered Shopify Partner app (`shopify.app.toml` has a real `client_id`),
with two of the original three integration requirements implemented and
tested end-to-end, plus a fourth added later:

1. **Push unregistered PRISM customers into Shopify** — `api.customers.sync`,
   backed by `customerSyncService.server.ts`. Implemented.
2. **Segments as Shopify tags** — `api.customers.segments`, backed by
   `segmentTagService.server.ts`. Implemented, including online-only
   customers (no PRISM `custid`) — see "What changed since AGENTS.md".
3. **Online purchases flow back for segmentation** — superseded, not
   implemented here. `tulola-integration` receives Shopify order webhooks
   **directly** — see its own README's "Shopify order webhook ingestion"
   section. This app plays no role in that flow (the original
   `webhooks.orders.create.tsx` stub was never registered and has been
   removed).
4. **PRISM transactions as Shopify orders** — `api.orders.sync`, backed by
   `orderSyncService.server.ts`. New in-store/event sales (from
   tulola-integration's `SHOPIFY_ORDER_PUSH_FROM` onward — no backfill) are
   created as paid, fulfilled Shopify orders on the linked customer, so
   Shopify's customer view shows the full purchase history. Not yet tested
   end-to-end. See "PRISM order push" below.

## PRISM order push

- **No double counting.** Every order created here is tagged
  `source:prism-pos`; tulola-integration's order webhook ingest skips those
  (the sale is already counted from PRISM). That tag is the marker that
  matters — `sourceName` can't be used, since Shopify only accepts
  attribution handles registered by a sales channel app there.
- **Website orders rung up on the POS** are detected and not pushed, by
  tulola-integration (`shopifyOrderPushService.ts`): a MIdTrans-paid
  receipt whose priced SKUs match an already-ingested Shopify order placed
  up to 7 days earlier.
- **Product matching**: Shopify variant SKU = PRISM `alu`, Shopify variant
  barcode = PRISM `itemCode`, tried in that order; exactly one match only.
  Anything unmatched becomes a custom line item (title + price) and is
  reported back as `unmatchedSkus`.
- **Totals**: line prices are PRISM's (already net of line discounts); the
  gap between their sum and the PRISM receipt total becomes one
  `PRISM-DISCOUNT` order discount, so the Shopify total always equals the
  receipt. Taxes are included in prices, as in PRISM.
- **Side effects off**: `inventoryBehaviour: BYPASS` (PRISM already moved
  the stock), no order or fulfillment emails.
- **Idempotency**: tulola-integration records each transaction in
  `ShopifyOrderPush`; as a second guard, each order carries a
  `prism-sid:<Transaction.sid>` tag that this app checks before creating.
- Tags on each order: `source:prism-pos`, `prism-sid:<sid>`,
  `channel:<store|event|…>`. Channels like WhatsApp/marketplace only show
  when an uploaded sales report covers the receipt; otherwise PRISM data
  only distinguishes store vs event.

## What changed since AGENTS.md

- `tulola-integration`'s `Customer.shopifyCustomerId` column (requirement 1
  assumed it didn't exist yet) is in place and used by both `api.*` routes.
- Requirement 3 ("online purchases flow back") went a different direction
  than AGENTS.md's plan: instead of Shopify webhooks landing here and being
  forwarded to `tulola-integration`, they're registered directly against
  `tulola-integration`'s own `/webhooks/shopify/orders/{paid,cancelled}`
  endpoints, verified with its own `SHOPIFY_WEBHOOK_SECRET` (not this app's
  Shopify API credentials). This app is uninvolved in that path.
- `api.customers.segments`'s `SegmentSnapshot.custid` is nullable
  (`SegmentSyncResult.custid` too) — `tulola-integration` sends `null` for
  online-only customers created from a Shopify order (no PRISM record).
  Matching/updating the Shopify customer always used `shopifyCustomerId`
  anyway; `custid` is only ever a pass-through label for
  `SegmentSyncResult`, so this needed no logic changes, just the type/schema
  loosened.

## Setup

```
npm install
cp .env.example .env
npm run setup          # prisma generate + migrate deploy
npm run dev             # shopify app dev — starts a tunnel + dev store install
```

## API endpoints

All require an `x-access-token` header matching `BRIDGE_SERVICE_TOKEN`
(`requireServiceToken.server.ts` — mirrors `tulola-integration`'s own
`requireAccessToken.ts` convention).

| Method | Path                                  | Description                                        |
| ------ | -------------------------------------- | --------------------------------------------------- |
| POST   | `/api/customers/sync`                 | Accepts `{ customers: [...] }`, creates/links each as a Shopify customer |
| GET    | `/api/customers/sync/runs/:runId`     | Status/results of a customer-sync batch              |
| POST   | `/api/customers/segments`             | Accepts `{ snapshots: [...] }`, tags each Shopify customer with `segment:frequency:*`/`segment:value:*`/`segment:lifecycle:*`/`segment:channel:*` (replacing prior values in each namespace, not appending) |
| GET    | `/api/customers/segments/runs/:runId` | Status/results of a segment-tagging batch             |
| POST   | `/api/orders/sync`                    | Accepts `{ orders: [...] }`, creates each PRISM transaction as a Shopify order |
| GET    | `/api/orders/sync/runs/:runId`        | Status/results of an order-sync batch                 |

All `POST` endpoints are fire-and-forget from the caller's perspective:
they respond `202` with a `runId` immediately, run the actual Shopify Admin
API calls in the background, and record per-customer results (`updated` /
`skipped` / `failed`) queryable via the matching `runs/:runId` endpoint —
same async pattern `tulola-integration` uses for its own sync runs.

## Environment variables

See [`.env.example`](.env.example) for the full list with comments. Key ones:

| Variable                     | Purpose                                                     |
| ----------------------------- | ------------------------------------------------------------ |
| `SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET`/`SCOPES`/`SHOPIFY_APP_URL` | Injected by `shopify app dev`/`deploy`; only need setting by hand for production hosting |
| `SHOPIFY_SHOP_DOMAIN`         | The single Tulola shop this app talks to via `unauthenticated.admin()` |
| `DATABASE_URL`                | SQLite file for session storage + sync-run history            |
| `BRIDGE_SERVICE_TOKEN`        | Shared secret `tulola-integration` sends as `x-access-token` on every `api.*` call |

## Commands

- `npm run dev` — local dev via Shopify CLI (tunnels, installs to a dev store)
- `npm run build` / `npm run start` — production build/serve
- `npm run typecheck` — `react-router typegen` + `tsc --noEmit`
- `npm run lint` — ESLint
- `npm run deploy` — `shopify app deploy` (pushes `shopify.app.toml` config, not the running app)
- `./deploy.sh <version>` — builds and pushes the Docker image. The VPS side is the `docker-compose.yml` in the `tulola-integration` repo, which runs this app alongside the integration service and Lightdash

## Stack

React Router 7 + `@shopify/shopify-app-react-router` + Prisma (SQLite for session storage, matching `kirri-portal`/`soma-kurasi-shipping`) + Polaris web components (`<s-page>`, `<s-section>`, etc.).
