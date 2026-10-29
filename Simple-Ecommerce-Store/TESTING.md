# ShopEase verification notes

## Automated checks run for this package

- `node --check backend/server.js` — passed (clean syntax).
- `node --check frontend/js/app.js` — passed (clean syntax).
- `cd backend && npm test` — **14/14 contract tests passed** (fast in-memory contract and syntax validation).
- `cd backend && npm run test:e2e` — **8/8 isolated end-to-end integration tests passed** (live HTTP testing on port 5001 against `shopease_test`).
- Seed-data structure check — 30 stable product IDs (1–30) detected across 5 categories (`electronics`, `fashion`, `accessories`, `home`, `stationery`).
- Source packaging check — no local `.env` file or `node_modules` committed.

## Isolated End-to-End Testing (`npm run test:e2e`)

Mutating tests (creating accounts, placing real orders, deducting inventory, and testing cancellations) require an isolated test environment. **Never run mutating tests against the live `shopease` demo database.**

The project includes an automated, isolated test workflow:
- **Test Database:** `shopease_test` is provisioned automatically by `backend/test/setup-test-db.js` on the same MySQL server. It applies the identical table schema and seeds 5 disposable test products.
- **Fail-Safe Assertion:** Before writing any data, the test suite executes `SELECT DATABASE()` and immediately aborts if the active database is anything other than `shopease_test`.
- **Port Isolation:** The test suite spawns an isolated Express instance on **port 5001** with `DB_NAME=shopease_test`, keeping the primary demo backend on port 5000 completely unaffected.
- **Repeatability:** Test users use timestamped emails (`buyer1_${Date.now()}@test.local`), allowing the suite to run repeatedly without unique constraint collisions.
- **Cleanup Policy:** Database teardown is kept manual to protect against accidental deletion. No automated `DROP DATABASE` is executed.

## Manual integration checks to run on the target Windows setup

These checks require your MySQL service and browser; they are not claimed as completed by the package's automated tests:

1. Run `backend/db/schema.sql` in MySQL Workbench, phpMyAdmin, or MySQL CLI and verify `SELECT COUNT(*) FROM shopease.products;` returns 30.
2. Start backend (`npm run dev`) on port 5000 and verify health, product listing, and category endpoints.
3. Open `frontend/index.html` with VS Code Live Server (port 5500). Verify homepage category navigation and dropdown filtering across all 5 categories.
4. Verify registration, duplicate email rejection (409), login failure (401), successful login, `/api/auth/me`, logout, and return-path redirect (`login.html?next=checkout`).
5. Verify live search suggestions, keyboard navigation (Arrow Up/Down, Enter, Esc), and search synonyms.
6. Verify cart changes, quantity boundaries (1–20), item removal, and `localStorage` persistence across refreshes.
7. Verify checkout flow: unauthenticated users are redirected to login with `?next=checkout`, empty carts display the empty-state guard, and server-side pricing and stock validation enforce integrity.
8. Verify order placement reduces stock, stores order items, and appears in My Profile order history.
9. Verify order cancellation: orders in `placed` status can be cancelled by their owner, which restores inventory in a database transaction.
10. Verify security boundaries: SQL injection strings, XSS payloads, disallowed CORS origins (403), and payload sizes > 100 KB (413) are safely rejected.

## Known demo limitation

Express's default in-memory session store is for local development only. Use a persistent session store, HTTPS, rate limiting, CSRF protections appropriate to the deployment, and a production-reviewed secret/configuration before any public deployment. No payment gateway is integrated.
