# Tulola Shopify App

Shopify app installed into Tulola's online store. Bridges Shopify's customer/order data with [`tulola-integration`](../tulola-integration) (the PRISM POS sync + segmentation backend), bidirectionally.

Start with [`AGENTS.md`](./AGENTS.md) — it has the actual plan, what's built vs. stubbed, and the open design questions. This README only covers running the app.

## Status

Scaffold only. No Shopify Partner app registered yet (`shopify.app.toml` has a blank `client_id`), OAuth hasn't been tested, and the bridge routes (`api.customers.sync`, `api.customers.segments`, `webhooks.orders.create`) are stubs.

## Setup

```
npm install
cp .env.example .env
npm run config:link   # link to a Shopify Partner app once one exists
npm run setup          # prisma generate + migrate deploy
npm run dev             # shopify app dev — starts a tunnel + dev store install
```

## Commands

- `npm run dev` — local dev via Shopify CLI (tunnels, installs to a dev store)
- `npm run build` / `npm run start` — production build/serve
- `npm run typecheck` — `react-router typegen` + `tsc --noEmit`
- `npm run lint` — ESLint
- `npm run deploy` — `shopify app deploy` (pushes `shopify.app.toml` config, not the running app)
- `./deploy.sh` — builds and pushes the Docker image (see `docker-compose.prod.yml` for the VPS side)

## Stack

React Router 7 + `@shopify/shopify-app-react-router` + Prisma (SQLite for session storage, matching `kirri-portal`/`soma-kurasi-shipping`) + Polaris web components (`<s-page>`, `<s-section>`, etc.).
