const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const server = fs.readFileSync(path.join(root, "backend", "server.js"), "utf8");
const schema = fs.readFileSync(path.join(root, "backend", "db", "schema.sql"), "utf8");
const frontend = fs.readFileSync(path.join(root, "frontend", "js", "app.js"), "utf8");

test("health endpoint remains present", () => {
  assert.match(server, /app\.get\("\/api\/health"/);
  assert.match(server, /ShopEase backend is running!/);
});
test("product API uses parameterized SQL filters", () => {
  assert.match(server, /app\.get\("\/api\/products"/);
  assert.match(server, /LOWER\(category\) = LOWER\(\?\)/);
  assert.match(server, /LOWER\(name\) LIKE LOWER\(\?\)/);
});
test("database schema defines required tables and keys", () => {
  for (const table of ["products", "users", "orders", "order_items"]) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(schema, /ON DUPLICATE KEY UPDATE/);
});
test("frontend calls the API and persists cart state", () => {
  assert.match(frontend, /\/api\/products/);
  assert.match(frontend, /localStorage\.setItem/);
  assert.match(frontend, /credentials: "include"/);
});
test("order placement uses a transaction and server-side price lookup", () => {
  assert.match(server, /beginTransaction/);
  assert.match(server, /SELECT id, name, price, stock FROM products/);
  assert.match(server, /commit\(\)/);
});


test("catalogue seed includes 30 stable product IDs", () => {
  const seed = schema.split("INSERT INTO products")[1] || "";
  const ids = [...seed.matchAll(/^\((\d+),/gm)].map(match => Number(match[1]));
  assert.equal(ids.length, 30);
  assert.deepEqual(ids, Array.from({ length: 30 }, (_, i) => i + 1));
});
test("homepage account navigation is not treated as category navigation", () => {
  const index = fs.readFileSync(path.join(root, "frontend", "index.html"), "utf8");
  assert.match(index, /href="login\.html"/);
  assert.match(index, /href="register\.html"/);
  assert.match(frontend, /querySelectorAll\("\.nav-link\[data-filter\]"\)/);
});
test("all five database categories are represented in homepage category controls", () => {
  const index = fs.readFileSync(path.join(root, "frontend", "index.html"), "utf8");
  const categories = ["electronics", "fashion", "accessories", "home", "stationery"];
  for (const category of categories) {
    assert.match(index, new RegExp(`data-filter="${category}"`));
    assert.match(index, new RegExp(`value="${category}"`));
  }
});
test("search supports synonyms, suggestions, Enter and Search button", () => {
  for (const term of ["footwear", "headset", "tshirt", "rucksack", "eyewear"]) assert.ok(frontend.includes(term));
  assert.match(frontend, /searchSuggestions/);
  assert.match(frontend, /event\.key === "Enter"/);
  assert.match(frontend, /searchButton\?\.addEventListener\("click", submitSearch\)/);
});
test("auth regenerates sessions and orders cap combined quantities", () => {
  assert.match(server, /req\.session\.regenerate/);
  assert.match(server, /combinedQuantity > 20/);
});
test("environment files are excluded from source control", () => {
  const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  assert.match(ignore, /backend\/\.env/);
  assert.ok(!ignore.includes(".env.example"));
  assert.ok(fs.existsSync(path.join(root, "backend", ".env.example")));
});

test('profile page exposes account details, cart, and order history', () => {
  const profile = fs.readFileSync(path.join(root, "frontend", "profile.html"), "utf8");
  const app = frontend;
  assert.match(profile, /profileName/);
  assert.match(profile, /profileEmail/);
  assert.match(profile, /profileCartCount/);
  assert.match(profile, /orderHistory/);
  assert.match(app, /credentials: "include"/);
  assert.match(app, /API_HOST = window\.location\.hostname/);
});

test('orders can be cancelled only by their owner while placed, with stock restored', () => {
  const server = fs.readFileSync(path.join(root, "backend", "server.js"), "utf8");
  assert.match(server, /\/api\/orders\/:id\/cancel/);
  assert.match(server, /WHERE id = \? AND user_id = \?/);
  assert.match(server, /Only orders that have just been placed can be cancelled/);
  assert.match(server, /UPDATE products SET stock = stock \+ \?/);
  assert.match(server, /UPDATE orders SET status = 'cancelled'/);
});

test("checkout flow validates authentication, empty cart, and cart item integrity", () => {
  const checkout = fs.readFileSync(path.join(root, "frontend", "checkout.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "frontend", "js", "app.js"), "utf8");
  assert.match(checkout, /id="checkoutEmptyState"/);
  assert.match(checkout, /href="index\.html#products"/);
  assert.match(app, /login\.html\?next=checkout/);
  assert.match(app, /getValidCartItems/);
  assert.match(app, /Number\.isSafeInteger\(id\) && id >= 1/);
  assert.match(app, /Number\.isSafeInteger\(qty\) && qty >= 1/);
  assert.match(app, /Your session has expired/);
});
