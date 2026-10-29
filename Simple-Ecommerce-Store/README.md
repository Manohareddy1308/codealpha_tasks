# ShopEase — CodeAlpha Full Stack Development Internship

ShopEase is a student full-stack e-commerce demonstration built with HTML, CSS, vanilla JavaScript, Node.js, Express, and MySQL.

## Features

- Responsive product storefront, category filtering, live product suggestions, keyboard navigation, synonym-aware search, and direct product navigation
- Product data served by a REST API and stored in MySQL
- Product detail page
- Cart with quantity controls and localStorage persistence
- Account registration/login with bcrypt password hashing and server-side sessions
- Checkout with server-side product/stock/price validation
- Transactional order creation and order history
- Parameterized SQL queries and CORS allowlist
- Helpful API error responses and health endpoint

**Demo limitations:** No real payment gateway is integrated. Express's default in-memory session store is suitable only for local development, not production. Before public deployment, use HTTPS, a persistent session store, rate limiting, CSRF protections appropriate to the deployment, secure secrets, and a reviewed production configuration. Product images and Inter font use external URLs and need an internet connection.

## Project structure

```text
CodeAlpha_SimpleEcommerce/
├── frontend/
│   ├── index.html
│   ├── product.html
│   ├── cart.html
│   ├── login.html
│   ├── register.html
│   ├── checkout.html
│   ├── orders.html
│   ├── profile.html
│   ├── js/app.js
│   └── style/style.css
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   ├── db/
│   │   └── schema.sql
│   └── test/
│       ├── project.test.js
│       ├── setup-test-db.js
│       └── e2e.test.js
├── .gitignore
├── TESTING.md
└── README.md
```

## Requirements

- Node.js LTS (Node 20+ recommended)
- MySQL 8.x or compatible MariaDB
- VS Code and Live Server extension (or another static frontend server)

## Setup

### 1. Configure MySQL

Start your MySQL service and open MySQL Workbench, phpMyAdmin, or a MySQL terminal. Execute `backend/db/schema.sql`. This creates the `shopease` database, tables, and 30 sample products. The 30 sample product inserts use stable IDs and `ON DUPLICATE KEY UPDATE`, so rerunning the script refreshes catalogue details without resetting user accounts, orders, or current stock.

If your MySQL server uses a port other than 3306, use the actual port in the environment file.

### 2. Configure backend environment

Open a terminal in `backend`:

```powershell
Copy-Item .env.example .env
```

Edit `backend/.env` and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and a long random `SESSION_SECRET`. Never commit `.env`.

### 3. Install and start backend

```powershell
cd backend
npm install
npm run dev
```

The API listens on `http://localhost:5000`.

### 4. Start frontend

Use VS Code Live Server to open `frontend/index.html`. The default `http://127.0.0.1:5500` and `http://localhost:5500` origins are allowed. The backend connects to MySQL on port `3306` by default for standalone MySQL, or port `3307` for typical WAMP installations; set `DB_PORT` in `backend/.env` to match your local database service. If Live Server uses another port, add that exact origin to `FRONTEND_ORIGINS` in `backend/.env` and restart the backend.

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/products` | List products; optional `category` and `search` |
| GET | `/api/products/:id` | Product details |
| POST | `/api/auth/register` | Register and log in |
| POST | `/api/auth/login` | Log in |
| GET | `/api/auth/me` | Current session user |
| POST | `/api/auth/logout` | Log out |
| POST | `/api/orders` | Place an order (login required) |
| GET | `/api/orders` | Current user's order history (login required) |
| POST | `/api/orders/:id/cancel` | Cancel an order (login required; restricted to order owner while in `placed` status; restores inventory) |

Authentication uses an HTTP-only session cookie. API calls that require a session include credentials from the frontend.

## Test checklist

Automated test suites can be executed from the `backend` directory:

- **Contract Tests (14 in-memory unit/contract checks):**
  ```powershell
  cd backend
  npm test
  ```
- **Isolated End-to-End Tests (8 live integration tests):**
  ```powershell
  cd backend
  npm run test:e2e
  ```
  *Note:* E2E tests automatically provision and target `shopease_test` on a dedicated test server port (5001). Never run mutating tests against the live `shopease` demo database.

Also perform the browser/database checks below after starting MySQL and the backend:

1. `GET http://localhost:5000/api/health` returns a healthy response.
2. `GET http://localhost:5000/api/products` returns 30 distinct products; category filtering works.
3. Search `shoes`, `footwear`, `watch`, `headset`, `tee`, `bag`, and `eyewear`; suggestions should be live, selectable, and open product detail pages. Enter and the Search button should work.
4. Homepage Login and Sign Up navigate to the correct pages; login and registration pages link to each other.
5. Register a valid account, try the same email again, log out, log in with correct and incorrect passwords, and check `/api/auth/me`.
6. Add/remove items, change quantities, reload the page, and confirm cart persistence. Check empty cart and quantity boundaries.
7. Try checkout while logged out, with missing shipping details, nonexistent products, excessive quantities, manipulated prices, and insufficient stock. Server-side validation must reject invalid orders.
8. Place a valid order and verify the total uses database prices, stock decreases, order history contains the order, and data persists after restarting the backend.
9. Try HTML/script-like search text and SQL-injection-shaped inputs; they must not execute or alter queries. Check requests from a disallowed origin and unauthorized order/history requests.
10. Stop the backend and confirm the frontend shows a helpful error instead of silently pretending products loaded.

**Test scope note:** see [`TESTING.md`](TESTING.md) for the automated checks completed and the target-machine integration checklist. Automated/static tests do not replace an end-to-end run against your own WAMP/MySQL instance. The in-memory Express session store is only for local development; it is not production-ready.

## GitHub submission

From the project root:

```powershell
git init
git add .
git commit -m "Build ShopEase full-stack e-commerce project"
```

Create a GitHub repository named `CodeAlpha_SimpleEcommerce`, then add its remote URL and push. Verify `backend/.env` is not staged or committed.

## Internship note

This is a learning/demo project. Review and test it locally before submission. Do not claim real payment processing, production-grade deployment, or full production security unless those features are separately implemented and verified.


## Account, sessions, and orders
- Open the frontend consistently using either `http://127.0.0.1:5500` or `http://localhost:5500`. The frontend now selects the matching API hostname so the browser session cookie is sent consistently.
- Registration and login verify the saved session before redirecting to `profile.html`.
- My Profile displays account details, the local cart count, order history, and cancelled orders. Orders can be cancelled while their status is `placed`; cancellation restores stock in a database transaction.
- Cart contents are stored in that browser's local storage; order history is stored in MySQL and tied to the signed-in account.
