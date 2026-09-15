# Tulola Shopify App

Shopify app installed into Tulola's online store. Bridges Shopify's customer/order data with [`tulola-integration`](../tulola-integration) (the PRISM POS sync + segmentation backend).

`AGENTS.md` has the original day-0 plan and open design questions — some of
it is now out of date (see "What changed since AGENTS.md" below); this
README describes what's actually implemented and how to run the app.

## Status

A registered Shopify Partner app (`shopify.app.toml` has a real `client_id`),
with two of the original three integration requirements implemented and
tested end-to-end:

1. **Push unregistered PRISM customers into Shopify** — `api.customers.sync`,
   backed by `customerSyncService.server.ts`. Implemented.
2. **Segments as Shopify tags** — `api.customers.segments`, backed by
   `segmentTagService.server.ts`. Implemented, including online-only
   customers (no PRISM `custid`) — see "What changed since AGENTS.md".
3. **Online purchases flow back for segmentation** — superseded, not
   implemented here. `webhooks.orders.create.tsx` and
   `tulolaIntegrationClient.server.ts` are still the original stub for this
   (unregistered — `shopify.app.toml` declares no webhook subscription for
   it, so Shopify never actually calls it). `tulola-integration` now
   receives Shopify order webhooks **directly** instead — see its own
   README's "Shopify order webhook ingestion" section. This app plays no
   role in that flow.

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

Both `POST` endpoints are fire-and-forget from the caller's perspective:
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
| `TULOLA_INTEGRATION_URL`/`TULOLA_INTEGRATION_ACCESS_TOKEN` | Only used by the unregistered `webhooks.orders.create.tsx` stub (see Status) — not needed for the implemented `api.*` routes |

## Commands

- `npm run dev` — local dev via Shopify CLI (tunnels, installs to a dev store)
- `npm run build` / `npm run start` — production build/serve
- `npm run typecheck` — `react-router typegen` + `tsc --noEmit`
- `npm run lint` — ESLint
- `npm run deploy` — `shopify app deploy` (pushes `shopify.app.toml` config, not the running app)
- `./deploy.sh` — builds and pushes the Docker image (see `docker-compose.prod.yml` for the VPS side)

## Stack

React Router 7 + `@shopify/shopify-app-react-router` + Prisma (SQLite for session storage, matching `kirri-portal`/`soma-kurasi-shipping`) + Polaris web components (`<s-page>`, `<s-section>`, etc.).
