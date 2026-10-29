const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const TEST_PORT = 5001;
const BASE_URL = `http://localhost:${TEST_PORT}`;
let testServerProcess;

test.before(async () => {
  // 1. Critical fail-safe isolation verification
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: "shopease_test"
  });

  try {
    const [rows] = await conn.execute("SELECT DATABASE() as db;");
    assert.equal(rows[0].db, "shopease_test", "CRITICAL ABORT: Active database is NOT shopease_test!");
  } finally {
    await conn.end();
  }

  // 2. Start isolated test server on port 5001 with DB_NAME=shopease_test
  testServerProcess = spawn("node", ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      DB_NAME: "shopease_test",
      PORT: String(TEST_PORT),
      FRONTEND_ORIGINS: `http://localhost:${TEST_PORT},http://127.0.0.1:5500`
    },
    stdio: "pipe"
  });

  // Wait for test server to become ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  assert.ok(ready, "Isolated test server on port 5001 failed to start.");
});

test.after(async () => {
  // Gracefully stop the test server process (without dropping any database)
  if (testServerProcess) {
    testServerProcess.kill();
  }
});

let user1Cookie = "";
let user2Cookie = "";
let user1OrderId = null;

test("E2E 1: User 1 registration and duplicate email rejection", async () => {
  const email = `buyer1_${Date.now()}@test.local`;
  const password = "Password123!";

  // 1. Successful registration
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Buyer One", email, password })
  });
  assert.equal(res.status, 201, "Registration should return 201 Created");
  const data = await res.json();
  assert.equal(data.user.email, email);

  // Capture session cookie
  user1Cookie = res.headers.get("set-cookie");
  assert.ok(user1Cookie && user1Cookie.includes("shopease.sid"), "Session cookie shopease.sid must be present");

  // 2. Duplicate registration attempt with same email
  const dupRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Buyer Duplicate", email, password })
  });
  assert.equal(dupRes.status, 409, "Duplicate registration must return 409 Conflict");
  const dupData = await dupRes.json();
  assert.match(dupData.error, /already exists/);
});

test("E2E 2: User 1 authentication lifecycle (me, invalid login, logout)", async () => {
  // 1. Check current authenticated user via session cookie
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: user1Cookie }
  });
  assert.equal(meRes.status, 200);
  const meData = await meRes.json();
  assert.ok(meData.user && meData.user.name === "Buyer One");

  // 2. Reject login with wrong password
  const badLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: meData.user.email, password: "WrongPassword999" })
  });
  assert.equal(badLogin.status, 401, "Invalid password must return 401");

  // 3. Logout
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: user1Cookie }
  });
  assert.equal(logoutRes.status, 200);

  // 4. Verify logged-out state
  const loggedOutMe = await fetch(`${BASE_URL}/api/auth/me`);
  const loggedOutData = await loggedOutMe.json();
  assert.equal(loggedOutData.user, null);

  // 5. Log back in with valid credentials
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: meData.user.email, password: "Password123!" })
  });
  assert.equal(loginRes.status, 200);
  user1Cookie = loginRes.headers.get("set-cookie");
  assert.ok(user1Cookie && user1Cookie.includes("shopease.sid"));
});

test("E2E 3: Unauthenticated access rejected on protected routes", async () => {
  const getOrders = await fetch(`${BASE_URL}/api/orders`);
  assert.equal(getOrders.status, 401, "Unauthenticated GET /api/orders must return 401");

  const postOrder = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ productId: 2, quantity: 1 }], shipping: {} })
  });
  assert.equal(postOrder.status, 401, "Unauthenticated POST /api/orders must return 401");
});

test("E2E 4: Product detail retrieval and baseline stock", async () => {
  const res = await fetch(`${BASE_URL}/api/products/2`);
  assert.equal(res.status, 200);
  const p = await res.json();
  assert.equal(p.id, 2);
  assert.equal(p.price, 1999);
  assert.equal(p.stock, 10, "Baseline stock for Product 2 in test DB should be 10");
});

test("E2E 5: Order placement, server-side pricing, and stock deduction", async () => {
  const shipping = {
    name: "Buyer One",
    phone: "9876543210",
    address: "123 Test St",
    city: "Testville",
    postalCode: "12345"
  };

  // Place order for Product 2 (Qty: 2). Seed price is 1999.00 -> expected total = 3998.00
  const orderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: user1Cookie
    },
    body: JSON.stringify({
      items: [{ productId: 2, quantity: 2 }],
      shipping
    })
  });

  assert.equal(orderRes.status, 201, "Order placement should return 201 Created");
  const orderData = await orderRes.json();
  assert.ok(orderData.order && orderData.order.id);
  user1OrderId = orderData.order.id;
  assert.equal(orderData.order.status, "placed");
  assert.equal(orderData.order.total, 3998.00, "Server-side price calculation must be exact");

  // Verify stock decremented by exactly 2 (from 10 to 8)
  const productRes = await fetch(`${BASE_URL}/api/products/2`);
  const updatedProduct = await productRes.json();
  assert.equal(updatedProduct.stock, 8, "Stock for Product 2 must decrement from 10 to 8");
});

test("E2E 6: Quantity limits and insufficient stock enforcement", async () => {
  const shipping = {
    name: "Buyer One",
    phone: "9876543210",
    address: "123 Test St",
    city: "Testville",
    postalCode: "12345"
  };

  // 1. Order exceeding stock (Product 3 has stock 5; request 6)
  const stockRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: user1Cookie },
    body: JSON.stringify({ items: [{ productId: 3, quantity: 6 }], shipping })
  });
  assert.equal(stockRes.status, 409, "Insufficient stock must return 409 Conflict");
  const stockData = await stockRes.json();
  assert.match(stockData.error, /Insufficient stock/);

  // 2. Quantity cap > 20
  const capRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: user1Cookie },
    body: JSON.stringify({ items: [{ productId: 1, quantity: 25 }], shipping })
  });
  assert.equal(capRes.status, 400, "Quantity > 20 must return 400 Bad Request");

  // 3. Empty cart
  const emptyRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: user1Cookie },
    body: JSON.stringify({ items: [], shipping })
  });
  assert.equal(emptyRes.status, 400, "Empty items array must return 400 Bad Request");
});

test("E2E 7: Multi-user order history isolation and IDOR protection", async () => {
  // Register User 2
  const email2 = `buyer2_${Date.now()}@test.local`;
  const reg2 = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Buyer Two", email: email2, password: "Password123!" })
  });
  assert.equal(reg2.status, 201);
  user2Cookie = reg2.headers.get("set-cookie");

  // User 2 fetches their order history -> must be empty (cannot see User 1's order)
  const u2OrdersRes = await fetch(`${BASE_URL}/api/orders`, {
    headers: { Cookie: user2Cookie }
  });
  assert.equal(u2OrdersRes.status, 200);
  const u2Orders = await u2OrdersRes.json();
  assert.equal(u2Orders.length, 0, "User 2 must not see User 1's order");

  // User 2 attempts to cancel User 1's order -> must return 404 (IDOR check)
  const u2CancelRes = await fetch(`${BASE_URL}/api/orders/${user1OrderId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: user2Cookie }
  });
  assert.equal(u2CancelRes.status, 404, "User 2 cancelling User 1's order must return 404 Order not found");
});

test("E2E 8: Order cancellation and stock restoration", async () => {
  // User 1 cancels their own placed order
  const cancelRes = await fetch(`${BASE_URL}/api/orders/${user1OrderId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: user1Cookie }
  });
  assert.equal(cancelRes.status, 200, "Owner cancelling placed order must return 200 OK");
  const cancelData = await cancelRes.json();
  assert.match(cancelData.message, /cancelled successfully/);

  // Stock for Product 2 must be restored from 8 back to 10
  const productRes = await fetch(`${BASE_URL}/api/products/2`);
  const restoredProduct = await productRes.json();
  assert.equal(restoredProduct.stock, 10, "Stock for Product 2 must be restored to 10");

  // Attempting to cancel an already cancelled order -> must return 409
  const reCancelRes = await fetch(`${BASE_URL}/api/orders/${user1OrderId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: user1Cookie }
  });
  assert.equal(reCancelRes.status, 409, "Cancelling an already-cancelled order must return 409 Conflict");
});
