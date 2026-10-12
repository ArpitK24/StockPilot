# StockPilot

Inventory and order management for small businesses. Separate **workspaces** (one per business) manage a product catalogue, record stock adjustments in an append-only ledger, take multi-line orders that reserve stock atomically, and watch it all on a dashboard.

- **Live app:** https://stockpilot-arpit.vercel.app _(see [Demo access](#demo-access))_
- **Health check:** `GET /api/health`
- **Stack:** Next.js 15 (App Router) · TypeScript · PostgreSQL (Neon) · Drizzle ORM · Zod · Vitest · Tailwind CSS

---

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Data model](#data-model)
4. [Run it locally](#run-it-locally)
5. [Environment variables](#environment-variables)
6. [Database: migrations and seed](#database-migrations-and-seed)
7. [Tests](#tests)
8. [Deployment and demo access](#deployment)
9. [Roles and permissions](#roles-and-permissions)
10. [Order lifecycle and stock strategy](#order-lifecycle-and-stock-strategy)
11. [Correctness under failure and concurrency](#correctness-under-failure-and-concurrency)
12. [Dashboard metrics](#dashboard-metrics)
13. [API reference](#api-reference)
14. [Known limitations and trade-offs](#known-limitations-and-trade-offs)
15. [AI use](#ai-use)

---

## Features

| Area | What's implemented |
| --- | --- |
| Auth | Email + password registration and login, bcrypt hashing, opaque session tokens (only their SHA-256 is stored), httpOnly `SameSite=Lax` cookie, logout |
| Workspaces | Multiple workspaces per user with a role in each; workspace switcher; owner adds registered users by email; owner removal guarded so a workspace always keeps an owner |
| Products | Create, edit, search (name/SKU), filter (active/inactive, low/out of stock), sort, paginate, deactivate/reactivate. SKU unique per workspace (case-insensitive: stored upper-case) |
| Inventory | Adjustments with reason (received, returned, correction, damaged, lost), actor, note, resulting quantity. Never negative. Per-product and workspace-wide history with product/reason/date filters |
| Orders | Multi-line orders, duplicate lines merged, server-computed totals, price/name/SKU snapshots, `pending → confirmed → completed`, cancellation from pending/confirmed, idempotent creation via `Idempotency-Key` |
| Dashboard | Active products, low-stock count, orders by status, booked and completed value over a selectable range, daily value chart, recent orders, recent movements, restock list |
| UX | Loading, empty, success and error states; confirmation dialogs for stock adjustments, cancellations, completions and deactivation; field-level validation messages; duplicate-submit protection; responsive down to 360px |

## Architecture

```
src/
  app/                       Next.js routes
    api/…/route.ts           REST handlers: thin, parse input → call a service → JSON envelope
    (auth)/, workspaces/, w/[workspaceId]/…   pages (server components read via services)
  server/
    authz.ts                 role → permission matrix + authorize(userId, workspaceId, permission)
    http/handler.ts          route wrappers: session lookup, membership check, error mapping, logging, same-origin guard
    services/                business rules (products, inventory, orders, dashboard, workspaces, auth)
    validation/              Zod schemas (all input is validated server-side)
    db/                      Drizzle schema, client, migrator, seed
    errors.ts, logger.ts
  lib/                       code shared by server and browser (money, order lifecycle table, time zones)
  components/                UI
drizzle/                     SQL migrations (generated, committed)
tests/                       unit + integration (real Postgres) + concurrency tests
```

Layering: **route handler / page → `authorize` → service → Drizzle**. Route handlers contain no business logic; services never trust anything from the request except the validated payload and the `Actor` (`{ userId, workspaceId, role }`) built from the session. Every service query is scoped by `actor.workspaceId`, and every service re-checks its permission (defence in depth in case a route forgets).

Pages are server components that call the same services as the API, using the same `authorize` check, so there is one code path for reads. Mutations go through the REST API from small client components.

## Data model

```mermaid
erDiagram
  users ||--o{ memberships : has
  workspaces ||--o{ memberships : has
  workspaces ||--o{ products : owns
  workspaces ||--o{ orders : owns
  orders ||--|{ order_items : contains
  products ||--o{ order_items : "referenced by (snapshot)"
  products ||--o{ stock_movements : "ledger of"
  orders ||--o{ stock_movements : "caused"
  users ||--o{ stock_movements : "actor"
  users ||--o{ sessions : has
```

| Table | Notes |
| --- | --- |
| `users` | unique index on `lower(email)` |
| `sessions` | `id` = SHA-256 of the cookie token, `expires_at` (30 days) |
| `workspaces` | `next_order_number` counter for human-readable order numbers (#1001…) |
| `memberships` | PK `(workspace_id, user_id)`, `role` enum `owner \| staff` |
| `products` | `UNIQUE(workspace_id, sku)`, `unit_price NUMERIC(12,2) CHECK >= 0`, `stock_quantity INT CHECK >= 0`, `low_stock_threshold INT CHECK >= 0`, `is_active` |
| `orders` | `UNIQUE(workspace_id, number)`, `UNIQUE(workspace_id, idempotency_key)`, `status` enum, `total NUMERIC(14,2)`, per-transition timestamps |
| `order_items` | snapshots: `product_name`, `product_sku`, `unit_price`; `quantity CHECK > 0`; `CHECK (line_total = unit_price * quantity)`; `UNIQUE(order_id, product_id)` |
| `stock_movements` | append-only ledger: `type`, `quantity_change CHECK <> 0`, `resulting_quantity CHECK >= 0`, `actor_id`, optional `order_id`, `note` |

**Workspace integrity is enforced by the database**, not just the code: `order_items` and `stock_movements` reference products and orders through composite foreign keys `(workspace_id, product_id) → products(workspace_id, id)`. An order item physically cannot point at another workspace's product.

A partial unique index `stock_movements(order_id, product_id, type) WHERE order_id IS NOT NULL` means each order line can be reserved once and released once, ever. This is a second, schema-level guard against double restoration.

## Run it locally

Requirements: Node 20+ and PostgreSQL 14+ (local, Docker or a free Neon database).

```bash
git clone https://github.com/ArpitK24/StockPilot.git && cd StockPilot
npm install
cp .env.example .env          # then fill in DATABASE_URL and TEST_DATABASE_URL
npm run db:migrate            # creates the schema
npm run db:seed               # optional: synthetic demo data + demo logins
npm run dev                   # http://localhost:3000
```

Quick local Postgres with Docker:

```bash
docker run -d --name stockpilot-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
docker exec stockpilot-pg psql -U postgres -c "create database stockpilot" -c "create database stockpilot_test"
```

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. On Neon use the **pooled** URL (`…-pooler…`, `sslmode=require`). |
| `TEST_DATABASE_URL` | for tests | A separate database. The test run **drops and recreates** its schema. |
| `DB_POOL_MAX` | no | Max connections per server instance (default 10). |

```bash
DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/stockpilot"
TEST_DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/stockpilot_test"
```

No secrets are committed; `.env*` files are git-ignored except `.env.example`.

## Database: migrations and seed

- Schema lives in `src/server/db/schema.ts`; SQL migrations are generated into `drizzle/` with `npm run db:generate` and committed.
- `npm run db:migrate` applies pending migrations (idempotent). Vercel runs it before every build (`vercel.json → buildCommand`).
- `npm run db:seed` creates **synthetic** demo data. It's re-runnable: it deletes only accounts ending in `@demo.stockpilot.app` and the workspaces they belong to. All stock changes in the seed go through the real services, so the ledger replays exactly to current stock.

## Tests

```bash
npm test          # vitest run: unit + integration + concurrency (needs TEST_DATABASE_URL)
npm run typecheck
npm run lint
```

The integration tests run against **real PostgreSQL** (the global setup drops the test schema and applies the real migrations), because the behaviour that matters (row locks, constraints, transactions) only exists there. Latest run: **43 tests, all passing**.

| Requirement | Where |
| --- | --- |
| SKU uniqueness (same workspace rejected, other workspace allowed) | `tests/integration/products-inventory.test.ts` |
| Stock boundaries, invalid adjustments, ledger replay | `products-inventory.test.ts` |
| Server-computed totals, client total ignored | `orders.test.ts`, `isolation-api.test.ts` (over HTTP) |
| Insufficient stock | `orders.test.ts` |
| Multi-item atomicity (no partial order/stock/ledger) | `orders.test.ts` |
| Cancellation restores once; repeated cancel rejected; DB refuses a 2nd release row | `orders.test.ts` |
| Invalid transitions | `orders.test.ts`, `unit/business-rules.test.ts` |
| Price snapshots | `orders.test.ts` |
| Workspace isolation (services and HTTP: 401/403/404, ID swapping) | `isolation-api.test.ts` |
| Concurrency: 12 parallel orders vs 5 units → exactly 5 succeed; racing multi-line orders without deadlock; 8 parallel cancels → 1 restore; parallel adjustments; parallel idempotent retries → 1 order | `concurrency.test.ts` |
| Time-zone day bounds incl. DST and legacy aliases | `unit/business-rules.test.ts` |

## Deployment

- **App:** Vercel (`sin1` region), Next.js serverless functions. **DB:** Neon Postgres (free tier, Singapore).
- Migrations run on each deploy before `next build`.
- **Cold starts:** Neon's free tier suspends compute after ~5 minutes idle. The first request after a pause can take 1–3 s; later ones are fast.
- Cookies are `Secure` in production, `httpOnly`, `SameSite=Lax`. Frontend and API share one origin, so no CORS configuration is needed; state-changing requests with a foreign `Origin` header are rejected (403).

### Demo access

| Role | Email | Password |
| --- | --- | --- |
| Owner of *Northside Coffee Supply* (and staff in *Harbor Ceramics*) | `owner@demo.stockpilot.app` | `pilot-demo-2026` |
| Staff in *Northside Coffee Supply* | `staff@demo.stockpilot.app` | `pilot-demo-2026` |

The login page has one-click "Fill" buttons for both. You can also register: registration creates your own workspace with you as owner. To try staff membership, register a second account, then add it from **Team** in a workspace you own.

Try: sign in as staff and open a product (you can adjust stock, not edit details); try `/w/<a workspace you're not in>` (404); build an order that asks for more than is in stock (rejected, nothing written).

## Roles and permissions

Defined once in `src/server/authz.ts` and enforced on every API request and page load. The UI only hides controls as a convenience.

| Permission | Owner | Staff |
| --- | :-: | :-: |
| View products, orders, stock history, dashboard, team | ✓ | ✓ |
| Create / edit / change price / deactivate products | ✓ | – |
| Record stock adjustments | ✓ | ✓ |
| Create orders | ✓ | ✓ |
| Confirm / complete / cancel orders | ✓ | ✓ |
| Add / remove members | ✓ | – |

- Identity comes only from the session cookie, never from a user ID in the request.
- A workspace you're not a member of returns **404** (not 403), so its existence isn't disclosed. Product and order IDs from another workspace also return 404, because every query filters by the authorized workspace.
- A member without the permission gets **403**.

## Order lifecycle and stock strategy

**Strategy: reserve stock at order creation.**

| Action | From | To | Stock effect |
| --- | --- | --- | --- |
| create | — | `pending` | Each line's quantity is subtracted (ledger: `order_reserved`) |
| confirm | `pending` | `confirmed` | none |
| complete | `confirmed` | `completed` | none (the reservation becomes final) |
| cancel | `pending`, `confirmed` | `cancelled` | Each line's quantity is restored exactly once (ledger: `order_released`) |

Anything else (complete a pending order, cancel a completed or cancelled order, confirm twice…) returns `409 INVALID_TRANSITION`. Inactive products can't be added to new orders, but cancelling an order that contains one still restores its stock.

Why reserve at creation: a pending order is a promise to a customer. Reserving immediately means "available" on the products page is what can actually be sold, and a confirm step can never fail for lack of stock.

## Correctness under failure and concurrency

- **Atomic stock updates.** The only way stock changes is `applyStockChange` (`src/server/services/inventory.ts`): a single conditional `UPDATE products SET stock = stock + Δ WHERE id = … AND workspace_id = … AND stock + Δ >= 0 [AND is_active] RETURNING …`. Postgres row-locks the product; a concurrent transaction waits, then re-checks the condition against the committed value. There is no read-then-write window, so two orders can't both take the last unit. `CHECK (stock_quantity >= 0)` backs this up.
- **All-or-nothing orders.** Creating an order is one transaction: bump the workspace order number, insert the order, then for each line reserve stock, snapshot name/SKU/price from the row that was just locked, and insert the item; finally write the total. Any failure (unknown product, other workspace, inactive, insufficient stock) throws and rolls back everything: no order, no items, no stock change, no ledger rows.
- **No deadlocks.** Lines are merged by product and processed in product-ID order, so concurrent multi-line orders always lock rows in the same order.
- **Cancellation at most once.** The status flip is a conditional `UPDATE orders SET status='cancelled' WHERE id=… AND status IN ('pending','confirmed') RETURNING`. Only the transaction that actually flips it restores stock; repeats and races get 0 rows → 409. The partial unique index on `stock_movements` makes a second release impossible at the schema level too.
- **Trusted totals.** Zod strips unknown fields (a client `total` is discarded). Line totals and the order total are computed with `decimal.js` from the locked product rows; a `CHECK` ensures `line_total = unit_price * quantity`.
- **Idempotent retries.** The order builder sends an `Idempotency-Key` per draft. A retry returns the original order (`200`, `Idempotent-Replayed: true`) instead of creating a second one; concurrent retries are resolved by `UNIQUE(workspace_id, idempotency_key)`.
- **Ledger never contradicts stock.** Every stock change and its ledger row (with the resulting quantity) are written in the same transaction. Product edits can't change stock; there is no "set stock" endpoint.

## Dashboard metrics

The definitions are in `src/server/services/dashboard.ts`, shared by the API and UI, and explained in the app.

| Metric | Definition |
| --- | --- |
| Booked value | Sum of `total` for orders **created in the range** with status `pending`, `confirmed` or `completed`. **Cancelled orders are excluded.** |
| Completed value | Same, `completed` orders only |
| Orders by status | Count of orders created in the range, grouped by their current status |
| Active products | Products with `is_active = true` (live count, ignores range) |
| At or below threshold | Active products with `stock_quantity <= low_stock_threshold`, out-of-stock included (live) |
| Daily chart | Booked value per calendar day in the range |

**Range and time zones.** Ranges are calendar days, both ends inclusive, in the viewer's time zone (sent by the browser as an IANA zone, stored in a cookie, `UTC` by default). Default range: the last 30 days including today. All timestamps are stored as UTC `timestamptz`; day bounds are converted to UTC instants in application code with `Intl` (DST-safe). The same convention applies to the `from`/`to` filters on orders and stock history.

## API reference

All endpoints return `{ "data": … }` on success or `{ "error": { "code", "message", "fields?", "details?" } }` on failure.
Codes: `422 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT | INSUFFICIENT_STOCK | INVALID_TRANSITION`, `500 INTERNAL` (generic message plus `requestId`; details only in server logs).
List endpoints accept `page` (≥1) and `pageSize` (1–100, default 20) and return `{ items, page, pageSize, total, pageCount }`.

| Method & path | Permission | Notes |
| --- | --- | --- |
| `POST /api/auth/register` | public | `{ name, email, password, workspaceName }` → sets session cookie |
| `POST /api/auth/login` | public | `{ email, password }` |
| `POST /api/auth/logout` | public | clears the session |
| `GET /api/auth/me` | session | user + workspaces |
| `GET /api/health` | public | DB connectivity |
| `GET, POST /api/workspaces` | session | list mine / create (creator becomes owner) |
| `GET /api/workspaces/:ws` | workspace:read | |
| `GET, POST /api/workspaces/:ws/members` | member:read / member:manage | add `{ email, role }` |
| `DELETE /api/workspaces/:ws/members/:userId` | member:manage | keeps ≥1 owner |
| `GET /api/workspaces/:ws/products` | product:read | `q, status=active\|inactive\|all, stock=all\|low\|out, sort=name\|sku\|stock\|price\|updated, dir` |
| `POST /api/workspaces/:ws/products` | product:write | `{ name, sku, description?, unitPrice, stockQuantity?, lowStockThreshold? }` |
| `GET, PATCH /api/workspaces/:ws/products/:id` | product:read / product:write | PATCH any of `name, sku, description, unitPrice, lowStockThreshold, isActive` (stock isn't editable) |
| `POST /api/workspaces/:ws/products/:id/adjustments` | inventory:adjust | `{ type, quantityChange, note? }` |
| `GET /api/workspaces/:ws/stock-movements` | inventory:read | `productId, type, from, to, tz` |
| `GET /api/workspaces/:ws/orderable-products` | order:create | active products for the order builder, `q` |
| `GET /api/workspaces/:ws/orders` | order:read | `status, q (order number), from, to, tz` |
| `POST /api/workspaces/:ws/orders` | order:create | `{ items: [{ productId, quantity }], note? }`, optional `Idempotency-Key` header |
| `GET /api/workspaces/:ws/orders/:id` | order:read | items, snapshots, ledger effects |
| `POST /api/workspaces/:ws/orders/:id/transitions` | order:transition | `{ action: "confirm" \| "complete" \| "cancel" }` |
| `GET /api/workspaces/:ws/dashboard` | dashboard:read | `from, to, tz` |

Example:

```bash
curl -X POST https://<host>/api/workspaces/$WS/orders \
  -H 'content-type: application/json' -H "Idempotency-Key: $(uuidgen)" \
  -b "sp_session=$TOKEN" \
  -d '{"items":[{"productId":"…","quantity":2},{"productId":"…","quantity":1}],"total":"0.01"}'
# → 201 { "data": { "number": 1029, "status": "pending", "total": "52.00", "items": [...] } }
#   ("total" in the request is ignored)

curl -X POST https://<host>/api/workspaces/$WS/orders/$ID/transitions \
  -H 'content-type: application/json' -b "sp_session=$TOKEN" -d '{"action":"cancel"}'
# second call → 409 { "error": { "code": "INVALID_TRANSITION", "message": "Order #1029 is cancelled; it cannot be cancelled" } }
```

## Known limitations and trade-offs

- **Invitations** are simplified: an owner adds an **existing** account by email (no emailed invite links).
- **No login rate limiting or password reset**; sessions can't be listed or revoked from the UI (logout deletes the current one).
- **Offset pagination**: fine at this scale; keyset pagination would be better for very large tables.
- **Single currency** (USD formatting); prices are stored as plain decimals.
- **Order numbers** come from a per-workspace counter row, which serialises order creation *within* one workspace. That's negligible for a small business and keeps numbers gap-free.
- **Migrations run on every Vercel build**, including preview deployments, against the configured database.
- **Neon free tier** may cold-start after idle periods (see Deployment).
- Orders can't be edited after creation; the flow is cancel and re-create.

## AI use

- **Tools:** Hark (an AI agent) wrote most of the code, under my direction and review.
- **Used for:** turning the brief into rules (permissions, transitions, stock strategy), schema and migration design, service and route scaffolding, the test suite, UI implementation, and this README.
- **Reviewed and changed:** the transaction boundaries and conditional updates in `inventory.ts` / `orders.ts`; composite foreign keys for cross-workspace integrity; the idempotency path; the permission matrix; every test was run against real Postgres, not mocked.
- **Bugs found and fixed during development:**
  - Date filters used SQL `AT TIME ZONE` with the browser's zone. Chrome reports `Asia/Calcutta`, which the local Postgres build didn't recognise, and the dashboard crashed. Fixed by converting days to UTC instants in JS (`src/lib/timezone.ts`), with a DST test.
  - Passing JS arrays into a raw SQL fragment expanded into a record instead of an array; the daily series now sends one JSON parameter (`jsonb_to_recordset`).
  - A form helper let a per-input `className` override the base field class, which dropped borders on some inputs. Caught in a screenshot review and fixed.
  - The first seed fixed stock with after-the-fact "stocktake" corrections, which flooded the ledger; it now sizes opening stock from a planned order set, so history reads naturally.
