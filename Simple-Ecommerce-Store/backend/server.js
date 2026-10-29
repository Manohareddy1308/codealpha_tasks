require("dotenv").config();
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const allowedOrigins = (process.env.FRONTEND_ORIGINS || "http://127.0.0.1:5500,http://localhost:5500")
  .split(",").map(value => value.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  },
  credentials: true
}));
app.use(express.json({ limit: "100kb" }));
const INSECURE_DEFAULT_SECRET = "development-only-change-this-secret-before-deployment";
const isProduction = process.env.NODE_ENV === "production";
const configuredSecret = process.env.SESSION_SECRET ? String(process.env.SESSION_SECRET).trim() : "";

if (isProduction) {
  if (!configuredSecret || configuredSecret === INSECURE_DEFAULT_SECRET) {
    console.error("FATAL: In production, SESSION_SECRET must be explicitly set to a secure custom secret.");
    process.exit(1);
  }
} else if (!configuredSecret || configuredSecret === INSECURE_DEFAULT_SECRET) {
  console.warn("WARNING: Using insecure default SESSION_SECRET. Configure a random secret in .env for security.");
}

const sessionSecret = configuredSecret || INSECURE_DEFAULT_SECRET;

app.use(session({
  name: "shopease.sid",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 4
  }
}));

let pool;
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "shopease",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      decimalNumbers: true
    });
  }
  return pool;
}
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const publicProduct = row => ({
  id: Number(row.id), name: row.name, category: row.category,
  price: Number(row.price), description: row.description, image: row.image,
  stock: Number(row.stock)
});
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Please log in to continue." });
  next();
}
function validText(value, max) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

app.get("/api/health", (req, res) => {
  res.json({ message: "ShopEase backend is running!" });
});

app.get("/api/products", asyncRoute(async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const clauses = [];
  const values = [];
  if (category && category.toLowerCase() !== "all") {
    clauses.push("LOWER(category) = LOWER(?)");
    values.push(category);
  }
  if (search) {
    clauses.push("(LOWER(name) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))");
    values.push(`%${search}%`, `%${search}%`);
  }
  const sql = `SELECT id, name, category, price, description, image, stock FROM products ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""} ORDER BY id`;
  const [rows] = await getPool().execute(sql, values);
  res.json(rows.map(publicProduct));
}));

app.get("/api/products/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid product ID." });
  const [rows] = await getPool().execute(
    "SELECT id, name, category, price, description, image, stock FROM products WHERE id = ?", [id]
  );
  if (!rows.length) return res.status(404).json({ error: "Product not found." });
  res.json(publicProduct(rows[0]));
}));

app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!validText(name, 120) || !validText(email, 190) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" || password.length < 8 || password.length > 72) {
    return res.status(400).json({ error: "Enter a valid name, email, and password (8–72 characters)." });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const [existing] = await getPool().execute("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
  if (existing.length) return res.status(409).json({ error: "An account with this email already exists." });
  const passwordHash = await bcrypt.hash(password, 12);
  const [result] = await getPool().execute(
    "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
    [name.trim(), normalizedEmail, passwordHash]
  );
  const user = { id: result.insertId, name: name.trim(), email: normalizedEmail };
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start a secure session. Please try again." });
    req.session.user = user;
    req.session.save(saveErr => {
      if (saveErr) return res.status(500).json({ error: "Could not save your session. Please try again." });
      res.status(201).json({ user });
    });
  });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const [rows] = await getPool().execute(
    "SELECT id, name, email, password_hash FROM users WHERE email = ?", [email.trim().toLowerCase()]
  );
  if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  const user = { id: rows[0].id, name: rows[0].name, email: rows[0].email };
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start a secure session. Please try again." });
    req.session.user = user;
    req.session.save(saveErr => {
      if (saveErr) return res.status(500).json({ error: "Could not save your session. Please try again." });
      res.json({ user });
    });
  });
}));

app.get("/api/auth/me", (req, res) => res.json({ user: req.session.user || null }));
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: "Could not log out. Please try again." });
    res.clearCookie("shopease.sid", { httpOnly: true, sameSite: "lax" });
    res.json({ message: "Logged out successfully." });
  });
});

app.post("/api/orders", requireAuth, asyncRoute(async (req, res) => {
  const { items, shipping } = req.body || {};
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    return res.status(400).json({ error: "Your cart must contain between 1 and 50 items." });
  }
  if (!shipping || !validText(shipping.name, 120) || !validText(shipping.phone, 30) ||
      !validText(shipping.address, 500) || !validText(shipping.city, 100) ||
      !validText(shipping.postalCode, 20)) {
    return res.status(400).json({ error: "Please provide complete shipping details." });
  }
  const normalized = new Map();
  for (const item of items) {
    const id = Number(item && item.productId);
    const quantity = Number(item && item.quantity);
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) {
      return res.status(400).json({ error: "Each cart item needs a valid product ID and quantity (1–20)." });
    }
    const combinedQuantity = (normalized.get(id) || 0) + quantity;
    if (combinedQuantity > 20) return res.status(400).json({ error: "A product quantity cannot exceed 20 per order." });
    normalized.set(id, combinedQuantity);
  }
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const ids = [...normalized.keys()];
    const placeholders = ids.map(() => "?").join(",");
    const [products] = await connection.query(
      `SELECT id, name, price, stock FROM products WHERE id IN (${placeholders}) FOR UPDATE`, ids
    );
    if (products.length !== ids.length) {
      await connection.rollback();
      return res.status(400).json({ error: "One or more products no longer exist." });
    }
    const byId = new Map(products.map(p => [Number(p.id), p]));
    let total = 0;
    const lineItems = [];
    for (const [id, quantity] of normalized) {
      const product = byId.get(id);
      if (quantity > Number(product.stock)) {
        await connection.rollback();
        return res.status(409).json({ error: `Insufficient stock for ${product.name}.` });
      }
      const price = Number(product.price);
      const subtotal = Math.round(price * quantity * 100) / 100;
      total += subtotal;
      lineItems.push({ id, name: product.name, price, quantity, subtotal });
    }
    total = Math.round(total * 100) / 100;
    const [orderResult] = await connection.execute(
      `INSERT INTO orders (user_id, total, shipping_name, shipping_phone, shipping_address, shipping_city, shipping_postal_code)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.session.user.id, total, shipping.name.trim(), shipping.phone.trim(), shipping.address.trim(), shipping.city.trim(), shipping.postalCode.trim()]
    );
    for (const line of lineItems) {
      await connection.execute(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderResult.insertId, line.id, line.name, line.price, line.quantity, line.subtotal]
      );
      await connection.execute("UPDATE products SET stock = stock - ? WHERE id = ?", [line.quantity, line.id]);
    }
    await connection.commit();
    res.status(201).json({ order: { id: orderResult.insertId, total, status: "placed", items: lineItems } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.post("/api/orders/:id/cancel", requireAuth, asyncRoute(async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isSafeInteger(orderId) || orderId < 1) return res.status(400).json({ error: "Invalid order ID." });
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [orders] = await connection.execute(
      "SELECT id, status FROM orders WHERE id = ? AND user_id = ? FOR UPDATE",
      [orderId, req.session.user.id]
    );
    if (!orders.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Order not found in your account." });
    }
    if (orders[0].status !== "placed") {
      await connection.rollback();
      return res.status(409).json({ error: "Only orders that have just been placed can be cancelled." });
    }
    const [items] = await connection.execute(
      "SELECT product_id, quantity FROM order_items WHERE order_id = ? FOR UPDATE", [orderId]
    );
    for (const item of items) {
      if (item.product_id !== null) {
        await connection.execute("UPDATE products SET stock = stock + ? WHERE id = ?", [item.quantity, item.product_id]);
      }
    }
    await connection.execute("UPDATE orders SET status = 'cancelled' WHERE id = ?", [orderId]);
    await connection.commit();
    res.json({ message: "Order cancelled successfully.", orderId });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.get("/api/orders", requireAuth, asyncRoute(async (req, res) => {
  const [orders] = await getPool().execute(
    `SELECT id, status, total, shipping_name, shipping_phone, shipping_address, shipping_city, shipping_postal_code, created_at
     FROM orders WHERE user_id = ? ORDER BY created_at DESC`, [req.session.user.id]
  );
  for (const order of orders) {
    const [items] = await getPool().execute(
      "SELECT product_id, product_name, unit_price, quantity, subtotal FROM order_items WHERE order_id = ? ORDER BY id",
      [order.id]
    );
    order.items = items;
    order.total = Number(order.total);
  }
  res.json(orders);
}));

app.use((req, res) => res.status(404).json({ error: "Endpoint not found." }));
app.use((err, req, res, next) => {
  console.error("API error:", err.message);
  if (err.message && err.message.startsWith("Origin is not allowed")) {
    return res.status(403).json({ error: "This origin is not allowed." });
  }
  if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "This record already exists." });
  if (err.code === "ECONNREFUSED" || err.code === "PROTOCOL_CONNECTION_LOST" || err.code === "ER_BAD_DB_ERROR") {
    return res.status(503).json({ error: "The database is unavailable. Check MySQL and your environment settings." });
  }
  if (err.status === 413 || err.statusCode === 413 || err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request payload is too large. Please limit submissions to 100kb." });
  }
  const statusCode = err.status || err.statusCode;
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return res.status(statusCode).json({ error: statusCode === 400 ? "Malformed request payload." : "Invalid request." });
  }
  res.status(500).json({ error: "An unexpected server error occurred." });
});

const server = app.listen(PORT, () => {
  console.log(`ShopEase backend running at http://localhost:${PORT}`);
  console.log(`Allowed frontend origins: ${allowedOrigins.join(", ")}`);
});
async function shutdown() {
  server.close();
  if (pool) await pool.end().catch(() => {});
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
