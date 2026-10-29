# CodeAlpha Internship Tasks

This repository contains two full-stack web development projects completed for the **CodeAlpha Web Development Internship**:

1. **Project Management Tool** (`Project-Management-Tool/`)
2. **Simple E-Commerce Store — ShopEase** (`Simple-Ecommerce-Store/`)

---

## Repository Structure

```text
codealpha_tasks/
├── README.md
├── Project-Management-Tool/
│   ├── backend/
│   │   ├── server.js
│   │   ├── db.js
│   │   ├── package.json
│   │   ├── package-lock.json
│   │   └── .env.example
│   ├── database/
│   │   └── schema.sql
│   ├── frontend/
│   │   ├── index.html
│   │   ├── login.html
│   │   ├── register.html
│   │   ├── script.js
│   │   └── style.css
│   ├── Readme.md
│   └── .gitignore
└── Simple-Ecommerce-Store/
    ├── backend/
    │   ├── server.js
    │   ├── package.json
    │   ├── package-lock.json
    │   ├── .env.example
    │   ├── db/
    │   │   └── schema.sql
    │   └── test/
    │       ├── project.test.js
    │       ├── e2e.test.js
    │       └── setup-test-db.js
    ├── frontend/
    │   ├── index.html
    │   ├── cart.html
    │   ├── checkout.html
    │   ├── login.html
    │   ├── orders.html
    │   ├── product.html
    │   ├── profile.html
    │   ├── register.html
    │   ├── js/app.js
    │   └── style/style.css
    ├── README.md
    ├── TESTING.md
    └── .gitignore
```

---

## 1. Project Management Tool

### Overview & Tech Stack
A full-stack project tracking and task lifecycle management platform supporting project creation, task assignments, due dates, priority tracking, discussion comments, and team role-based access control (`admin`, `member`, `viewer`).

- **Frontend:** Vanilla JavaScript (ES6+), semantic HTML5, custom responsive CSS.
- **Backend:** Node.js, Express.js.
- **Database:** MySQL 8.x (relational schema with foreign keys and cascade rules via `mysql2/promise`).
- **Authentication:** Stateless JSON Web Tokens (`jsonwebtoken`) with `bcryptjs` password hashing (10 salt rounds).

### Setup Instructions

1. **Database Setup:**
   - Ensure MySQL is running locally.
   - Run the schema script `Project-Management-Tool/database/schema.sql` in MySQL Workbench or via the MySQL CLI:
     ```bash
     mysql -u root -p < "Project-Management-Tool/database/schema.sql"
     ```
   - This creates the `project_management` database and required tables (`users`, `projects`, `project_members`, `tasks`, `task_comments`).

2. **Backend Configuration:**
   - Navigate to the backend directory:
     ```bash
     cd Project-Management-Tool/backend
     ```
   - Copy the sanitized template to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Configure your MySQL credentials in `.env` (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`).

3. **Install Dependencies & Start Server:**
   ```bash
   npm install
   npm start
   ```
   - The backend runs on `http://127.0.0.1:5000` by default and statically serves the frontend from `http://127.0.0.1:5000/`.

---

## 2. Simple E-Commerce Store (ShopEase)

### Overview & Tech Stack
A full-stack e-commerce web application featuring a catalog storefront, category filters, live search with suggestions, persistent cart, session-based customer authentication, server-validated checkout with transactional stock deduction, order history tracking, and order cancellation.

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3 (served via static file server / Live Server).
- **Backend:** Node.js, Express.js REST API.
- **Database:** MySQL 8.x (`shopease` schema with transactional order placement and inventory tracking via `mysql2/promise`).
- **Authentication:** Server-side sessions via `express-session` with `bcryptjs` password hashing and production session-secret enforcement guards.

### Setup Instructions

1. **Database Setup:**
   - Execute the schema and seed script `Simple-Ecommerce-Store/backend/db/schema.sql` in MySQL:
     ```bash
     mysql -u root -p < "Simple-Ecommerce-Store/backend/db/schema.sql"
     ```
   - This creates the `shopease` database, tables (`users`, `products`, `orders`, `order_items`), and seeds 30 catalogue products.

2. **Backend Configuration:**
   - Navigate to the backend directory:
     ```bash
     cd Simple-Ecommerce-Store/backend
     ```
   - Copy the sanitized template to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Configure your local settings (`PORT=5000`, `FRONTEND_ORIGINS`, `DB_*`, `SESSION_SECRET`, `NODE_ENV`).
   - Generate a strong session secret using Node:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```

3. **Install Dependencies & Start Backend:**
   ```bash
   npm install
   npm start
   ```

4. **Run the Storefront Frontend:**
   - Serve the `Simple-Ecommerce-Store/frontend/` directory with VS Code Live Server or any static web server on port `5500` (e.g., `http://127.0.0.1:5500`).

---

## Environment & Security Notice

> [!IMPORTANT]
> **Never commit real `.env` files, production credentials, session secrets, or tokens.**
>
> All `.env` files are strictly excluded from source control via `.gitignore`. Always configure environment variables locally using the provided sanitized `.env.example` templates.

---

## Notes on Verification

- Contract test suites, routing rules, input boundaries, and API error states have been verified via automated unit/contract test suites (`npm test` in `Simple-Ecommerce-Store/backend`).
- Both projects default to port `5000` in local development and should be run sequentially when testing locally on the same host unless a process-level `PORT` override is supplied.
