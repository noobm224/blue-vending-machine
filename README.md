# Blue Vending Machine

A full-stack vending machine application built for Blue Vending's SME product line.
It demonstrates production-quality Rust backend development, a responsive Next.js frontend,
PostgreSQL persistence, Docker orchestration, and GitHub Actions CI/CD.

> CI status note: Backend CI validates both the default Rust test suite and the
> Postgres-backed ignored integration suite before deploying.

---

## Table of Contents

- [Blue Vending Machine](#blue-vending-machine)
  - [Table of Contents](#table-of-contents)
  - [Stack](#stack)
  - [Project Layout](#project-layout)
  - [Design \& Architecture](#design--architecture)
    - [Backend Design](#backend-design)
    - [The Change-Making Algorithm](#the-change-making-algorithm)
    - [Purchase Transaction Flow](#purchase-transaction-flow)
    - [Error Handling](#error-handling)
    - [Frontend Design](#frontend-design)
  - [Running with Docker (recommended)](#running-with-docker-recommended)
    - [Prerequisites](#prerequisites)
    - [Steps](#steps)
    - [Useful Docker commands](#useful-docker-commands)
  - [Running the Backend Locally](#running-the-backend-locally)
    - [Prerequisites](#prerequisites-1)
    - [Start PostgreSQL (if needed)](#start-postgresql-if-needed)
    - [Configure environment](#configure-environment)
    - [Install sqlx-cli (first time only)](#install-sqlx-cli-first-time-only)
    - [Run the backend](#run-the-backend)
    - [Build for production](#build-for-production)
  - [Running the Frontend Locally](#running-the-frontend-locally)
    - [Prerequisites](#prerequisites-2)
    - [Configure environment](#configure-environment-1)
    - [Install dependencies and run](#install-dependencies-and-run)
    - [Build for production](#build-for-production-1)
    - [Type-check without running](#type-check-without-running)
  - [Running Tests](#running-tests)
    - [Backend tests](#backend-tests)
    - [Frontend tests](#frontend-tests)

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Vitest |
| Backend | Rust, Axum 0.7, sqlx, Tokio async runtime |
| Database | PostgreSQL 16 |
| Containerisation | Docker + Docker Compose (3 services) |
| Frontend deploy | Vercel (Git integration) |
| Backend deploy | Google Cloud Run via Cloud Build (OIDC, no long-lived keys) |

---

## Project Layout

```
blue-vending-machine/
├── docker-compose.yml                  # 3-service orchestration (db, backend, frontend)
├── .github/
│   └── workflows/
│       ├── backend-ci-cloudrun.yml     # Rust CI + GCP Cloud Run deploy
│       └── frontend-ci-vercel.yml      # Next.js type-check / test / build
├── backend/
│   ├── Cargo.toml                      # axum, sqlx, tokio, thiserror, serde, …
│   ├── Dockerfile                      # multi-stage: rust builder → debian runtime
│   ├── .env.example
│   ├── migrations/
│   │   └── 0001_init.sql               # schema DDL + seed data (run automatically)
│   ├── src/
│   │   ├── main.rs                     # entrypoint: config, run migrations, bind
│   │   ├── lib.rs                      # module re-exports
│   │   ├── router.rs                   # axum Router with CORS + TraceLayer
│   │   ├── state.rs                    # AppState (PgPool)
│   │   ├── error.rs                    # typed AppError → HTTP responses
│   │   ├── models.rs                   # request / response / DB row types
│   │   ├── domain/
│   │   │   └── money.rs                # pure change-making algorithm (unit tested)
│   │   ├── repositories/
│   │   │   ├── products.rs             # CRUD on products table
│   │   │   ├── cash.rs                 # read/write cash_inventory table
│   │   │   └── transactions.rs         # paginated transaction log reads
│   │   └── handlers/
│   │       ├── products.rs             # HTTP handlers: list, create, get, update, delete
│   │       ├── cash.rs                 # HTTP handlers: list cash, set denomination
│   │       ├── purchase.rs             # HTTP handler: purchase (atomic transaction)
│   │       └── transactions.rs         # HTTP handler: paginated logs
│   └── tests/
│       ├── money_integration.rs        # extra integration tests for Bag maths
│       ├── api_validation_integration.rs  # request validation (no DB required)
│       └── api_db_integration.rs       # full DB-backed tests (opt-in via --ignored)
└── frontend/
    ├── Dockerfile                      # multi-stage: node builder → node runner
    ├── .env.example
    ├── package.json                    # React 19, next 15, vitest, tailwindcss, …
    ├── app/
    │   ├── layout.tsx                  # root layout with sticky nav
    │   ├── page.tsx                    # customer machine UI (/)
    │   └── admin/page.tsx              # admin console (/admin)
    ├── components/
    │   ├── VendingMachine.tsx           # full customer interaction component
    │   ├── AdminPanel.tsx              # full admin management component
    │   ├── ProductGrid.tsx             # responsive, scrollable product grid
    │   └── ProductImage.tsx            # image with automatic placeholder fallback
    ├── lib/
    │   ├── types.ts                    # Product, CashSlot, PurchaseRequest, … types
    │   ├── api.ts                      # typed API client (fetch-based)
    │   └── format.ts                   # THB formatter, coin-sum helper
    └── __tests__/
        ├── setup.ts
        ├── format.test.ts
        ├── ProductImage.test.tsx
        ├── ProductGrid.test.tsx
        ├── VendingMachine.test.tsx
        └── AdminPanel.test.tsx
```

---

## Design & Architecture

### Backend Design

The backend follows a layered architecture with clear separation of concerns:

```
HTTP request
    │
    ▼
router.rs          — maps paths/verbs to handler functions; adds CORS + trace middleware
    │
    ▼
handlers/          — validate HTTP input, orchestrate domain + repo calls, return JSON
    │
    ├── domain/    — pure business logic (no I/O), fully unit-tested
    │
    └── repositories/ — all SQL lives here; handlers never write raw queries
```

**Key technology choices:**

- **Axum + Tokio**: non-blocking async I/O with zero-cost abstractions. Ideal for a
  vending controller where many concurrent sessions compete for shared inventory.
- **sqlx with compile-time query macros**: SQL is validated against the live DB schema
  at compile time, catching column typos and type mismatches before the binary ships.
- **Automatic migrations**: `sqlx::migrate!()` runs `migrations/0001_init.sql` on
  every startup. The `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` guards make this
  idempotent, so restarting a container never corrupts data.
- **`thiserror`-powered error enum**: `AppError` maps every failure mode to the right
  HTTP status code without spreading `match` statements across handlers.

**Database schema (`migrations/0001_init.sql`):**

```sql
-- products: name must be unique; price and stock have DB-level constraints
CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    price       INTEGER NOT NULL CHECK (price > 0),
    stock       INTEGER NOT NULL CHECK (stock >= 0),
    image_url   TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- cash_inventory: denomination is the PK; count cannot go below zero
CREATE TABLE IF NOT EXISTS cash_inventory (
    denomination INTEGER PRIMARY KEY,
    count        INTEGER NOT NULL CHECK (count >= 0)
);

-- transactions: immutable log; stores product_name snapshot (tolerates product deletion)
CREATE TABLE IF NOT EXISTS transactions (
    id            SERIAL PRIMARY KEY,
    product_id    INTEGER NOT NULL REFERENCES products(id),
    product_name  TEXT NOT NULL,
    price         INTEGER NOT NULL,
    paid          INTEGER NOT NULL,
    change_amount INTEGER NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The seed data pre-loads 8 cash denominations (1, 5, 10, 20, 50, 100, 500, 1000 THB)
and 20 sample products.

**Data models (`src/models.rs`):**

All request/response types live in one file so it is easy to see the full API contract.
`Product` derives `sqlx::FromRow` for zero-boilerplate DB mapping. Fields use `camelCase`
JSON names (`imageUrl`) for frontend ergonomics while the DB column is `image_url`.

```rust
pub struct PurchaseRequest {
    pub product_id: i32,
    pub inserted: Vec<InsertedCoin>,  // [{denomination: 100, count: 2}, …]
}

pub struct PurchaseResponse {
    pub product_id: i32,
    pub product_name: String,
    pub price: i32,
    pub paid: i32,
    pub change_amount: i32,
    pub change: Vec<CashSlot>,        // [{denomination: 50, count: 1}, …]
    pub remaining_stock: i32,
}
```

---

### The Change-Making Algorithm

> **File**: [`backend/src/domain/money.rs`](backend/src/domain/money.rs)

**The implementation** uses **descending backtracking**:

```rust
pub const DENOMINATIONS: [i32; 8] = [1000, 500, 100, 50, 20, 10, 5, 1];

pub fn make_change(amount: i32, inventory: &Bag) -> Option<Bag> {
    if amount == 0 { return Some(Bag::new()); }
    let mut plan = Bag::new();
    if backtrack(amount, 0, inventory, &mut plan) {
        plan.retain(|_, c| *c > 0);
        Some(plan)
    } else {
        None
    }
}

fn backtrack(remaining: i32, idx: usize, inv: &Bag, plan: &mut Bag) -> bool {
    if remaining == 0 { return true; }
    if idx >= DENOMINATIONS.len() { return false; }
    let denom = DENOMINATIONS[idx];
    let available = *inv.get(&denom).unwrap_or(&0);
    let max_take = std::cmp::min(available, remaining / denom);
    let mut take = max_take;  // start at maximum (fewest-notes preference)
    while take >= 0 {
        plan.insert(denom, take);
        if backtrack(remaining - denom * take, idx + 1, inv, plan) {
            return true;
        }
        take -= 1;  // backtrack: try one fewer of this denomination
    }
    plan.remove(&denom);
    false
}
```

**Properties:**
- Always starts with `max_take` → prefers fewest notes.
- Returns `None` only when no valid combination exists for the given inventory — it is
  not a "give up" heuristic.
- The function is pure (no I/O, no global state) which allows exhaustive unit testing
  without a database or HTTP stack.
- 11 unit tests cover: simple greedy, constrained inventory, impossible amounts,
  edge cases (0 change, large amounts, specific denomination preferences).

**`Bag` type** is `BTreeMap<i32, i32>` (denomination → count). The helper functions
`bag_add`, `bag_sub`, and `bag_total` handle inventory arithmetic.

---

### Purchase Transaction Flow

> **File**: [`backend/src/handlers/purchase.rs`](backend/src/handlers/purchase.rs)

Everything happens inside a **single Postgres transaction** to guarantee atomicity:

```
POST /api/purchase
  │
  ├─ 1. Validate inserted cash (denomination whitelist + positive count)
  ├─ 2. BEGIN transaction
  ├─ 3. Fetch product row (implicitly locked by the transaction)
  ├─ 4. Check stock > 0; check paid >= price
  ├─ 5. Load cash_inventory as Bag; merge inserted coins into effective inventory
  ├─ 6. make_change(paid − price, effective_inventory)
  │       └─ None → ROLLBACK → 409 "cannot provide exact change"
  ├─ 7. Apply deltas: +inserted, −change_plan (per denomination)
  ├─ 8. decrement_stock (returns false if stock already 0 → race condition guard)
  ├─ 9. INSERT into transactions log
  └─ 10. COMMIT → return PurchaseResponse
```

Key safety properties:

- **Atomicity**: if any step fails, the transaction rolls back. The customer's inserted
  coins are not consumed and machine state is unchanged.
- **Concurrency safety**: two simultaneous buyers on the last item race on
  `decrement_stock`, which uses `UPDATE … WHERE stock > 0 RETURNING id`. The loser gets
  a `409 Conflict`. Postgres serialisation errors (codes `40001`, `40P01`, `55P03`)
  are mapped to a user-friendly retry message.
- **Change uses the enriched inventory**: inserted coins are added to the effective
  inventory *before* computing change. This means the machine can give back part of
  the customer's own coins as change (e.g. customer inserts three 20s to buy a
  25-THB item; change of 35 can use one of the inserted 20s + a 10 + a 5).

---

### Error Handling

> **File**: [`backend/src/error.rs`](backend/src/error.rs)

A single `AppError` enum covers all failure modes:

```rust
pub enum AppError {
    BadRequest(String),   // 400 — invalid input
    NotFound(String),     // 404 — unknown product id
    Conflict(String),     // 409 — out of stock, no change possible, race condition
    Internal(anyhow::Error),  // 500
    Database(sqlx::Error),    // 500
}
```

Every variant implements `IntoResponse`, which serialises to:

```json
{ "error": "conflict", "message": "human-readable description" }
```

Database errors at 500 are logged server-side (with `tracing::error!`) but the message
returned to the client is generic to avoid leaking schema details.

---

### Frontend Design

The frontend is a Next.js 15 App Router application with two routes:

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `VendingMachine.tsx` | Customer-facing purchase flow |
| `/admin` | `AdminPanel.tsx` | Operator stock/cash/log management |

**`VendingMachine.tsx`**

The customer interface models the physical flow of a real vending machine:

1. Browse products (`ProductGrid`) — shows price, stock status, and whether the
   currently inserted amount covers the price.
2. Select a product.
3. Open the transaction modal — insert coins/notes using denomination buttons.
4. Confirm purchase — `POST /api/purchase` is called.
5. Receipt modal — shows change breakdown by denomination.
6. Refund — inserted coins are returned (client state reset; no backend call needed).

A client-side change preview (same backtracking logic mirrored in TypeScript) shows
expected change before the user confirms. This is a UX convenience only — the backend
is the single source of truth.

**`AdminPanel.tsx`**

The admin console provides two modes via a tab toggle:

- **View mode**: read-only tables of products, cash inventory, and transaction logs.
- **Manage mode**: inline product editing with dirty-check (Save/Reset per row), a
  create-product modal with image preview, delete confirmation modal, and per-denomination
  cash count inputs.

Additional admin features:
- Search products by name.
- Filter by stock status (all / in-stock / low-stock / out-of-stock).
- Sort by id, name, price, or stock (ascending/descending toggle).
- Transaction log pagination with configurable page sizes (5, 10, 20, 50).
- Dashboard metrics: total products, total stock units, inventory value, out-of-stock count.

**`lib/api.ts`** — typed fetch wrapper. Base URL comes from `NEXT_PUBLIC_API_URL`.
All methods parse JSON error bodies and surface them as typed `ApiError` objects.

**`lib/format.ts`** — `thb(n)` formats integers as `"฿1,234 THB"` using
`Intl.NumberFormat`. `sumInserted(coins)` totals denomination × count.

**`lib/types.ts`** — shared TypeScript interfaces (`Product`, `CashSlot`,
`PurchaseRequest`, `PurchaseResponse`, `TransactionLog`, `PaginatedTransactionLogs`).
`DENOMINATIONS` constant and `isCoin(d)` helper live here.

---

## Running with Docker (recommended)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Compose v2)

### Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd blue-vending-machine

# 2. Start all three services (database, backend, frontend)
docker compose up --build
```

Docker Compose starts:

| Service | Exposed port | Internal port |
|---------|-------------|---------------|
| `db` (PostgreSQL 16) | `5432` | `5432` |
| `backend` (Rust/Axum) | `8080` | `8080` |
| `frontend` (Next.js) | `3001` | `3000` |

> **Note:** the frontend is available on **port 3001** (not 3000) when running via
> Docker Compose, because `3000` is often occupied locally. The backend is at `8080`.

Once all containers are healthy, open:

- **Customer UI** → [http://localhost:3001](http://localhost:3001)
- **Admin UI** → [http://localhost:3001/admin](http://localhost:3001/admin)
- **Backend health check** → [http://localhost:8080/health](http://localhost:8080/health)

The database is automatically migrated and seeded on first boot. Data persists in the
`db_data` Docker volume across `docker compose down` / `up` cycles.

### Useful Docker commands

```bash
# Run in the background
docker compose up --build -d

# View logs for a specific service
docker compose logs -f backend
docker compose logs -f frontend

# Stop all services (data volume preserved)
docker compose down

# Stop and delete the data volume (full reset)
docker compose down -v

# Rebuild a single service after code changes
docker compose up --build backend
```

---

## Running the Backend Locally

### Prerequisites

- Rust toolchain (stable, ≥ 1.75): [rustup.rs](https://rustup.rs)
- PostgreSQL 16 running locally (or via Docker)

### Start PostgreSQL (if needed)

```bash
docker run --rm -d \
  --name vending-db \
  -e POSTGRES_USER=vending \
  -e POSTGRES_PASSWORD=vending \
  -e POSTGRES_DB=vending \
  -p 5432:5432 \
  postgres:16-alpine
```

### Configure environment

```bash
cd backend
cp .env.example .env
# Edit .env if your Postgres credentials differ from the defaults:
#   DATABASE_URL=postgres://vending:vending@localhost:5432/vending
#   BIND_ADDR=0.0.0.0:8080
#   RUST_LOG=info
```

### Install sqlx-cli (first time only)

```bash
cargo install sqlx-cli --no-default-features --features postgres
```

> **Note:** `sqlx-cli` is only needed if you want to add new migrations or use
> `sqlx prepare` to update the offline query cache. The app runs migrations
> automatically at startup without it.

### Run the backend

```bash
cd backend
cargo run
```

The server starts on `http://localhost:8080`. Migrations run automatically on first boot.

### Build for production

```bash
cd backend
cargo build --release
# Binary at: target/release/vending-backend
./target/release/vending-backend
```

---

## Running the Frontend Locally

### Prerequisites

- Node.js ≥ 20 and npm ≥ 10: [nodejs.org](https://nodejs.org)
- The backend must be running (either locally on `:8080` or via Docker)

### Configure environment

```bash
cd frontend
cp .env.example .env.local
# .env.local contents:
#   NEXT_PUBLIC_API_URL=http://localhost:8080
#   NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Install dependencies and run

```bash
cd frontend
npm install
npm run dev
```

The frontend starts on [http://localhost:3000](http://localhost:3000).

### Build for production

```bash
cd frontend
npm run build
npm start          # serves the production build on port 3000
```

### Type-check without running

```bash
cd frontend
npx tsc --noEmit
```

---

## Running Tests

### Backend tests

**Unit + validation tests (no database required):**

```bash
cd backend
cargo test
```

This runs:
- `domain/money.rs` — 11 unit tests for the change-making algorithm (greedy,
  constrained inventory, impossible cases, Bag arithmetic).
- `tests/api_validation_integration.rs` — 30+ request-validation tests using an
  in-process Axum test server with no real database. Covers bad denominations,
  missing fields, price/stock constraint violations, pagination bounds, etc.

**Full DB integration tests (requires PostgreSQL):**

```bash
cd backend
TEST_DATABASE_URL=postgres://vending:vending@localhost:5432/vending \
  cargo test --test api_db_integration -- --ignored
```

These tests are marked `#[ignore]` so they are skipped by default. They cover:
- Complete product CRUD lifecycle.
- Cash inventory read and update.
- Full purchase flow including change calculation.
- Concurrent purchase race conditions (both "one winner" and "both succeed" scenarios).
- Transaction rollback verification on failure paths.

> A mutex guards test cases that share DB state so they do not interfere when run in parallel.

### Frontend tests

```bash
cd frontend
npm test            # runs once and exits (CI mode)
npm run test:watch  # watch mode for development
```

**30+ tests across 6 files:**

| File | What it tests |
|------|--------------|
| `format.test.ts` | `thb()` formatting edge cases, `sumInserted()` arithmetic |
| `ProductImage.test.tsx` | Empty src → placeholder, broken URL → placeholder fallback |
| `ProductGrid.test.tsx` | Out-of-stock item is unselectable, click selects a product |
| `VendingMachine.test.tsx` | Load states, modal open/close, coin insertion, full purchase flow, error handling, concurrent scenario |
| `AdminPanel.test.tsx` | Sort/filter controls, create/edit/delete modals, CRUD operations, cash management, validation |

---
