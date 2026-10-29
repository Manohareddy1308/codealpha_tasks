require("dotenv").config();
const mysql = require("mysql2/promise");

async function setupTestDb() {
  console.log("[Setup] Connecting to MySQL server to provision shopease_test...");
  const adminConn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || ""
  });

  try {
    await adminConn.execute(
      "CREATE DATABASE IF NOT EXISTS shopease_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    );
  } finally {
    await adminConn.end();
  }

  // Connect strictly to shopease_test
  const testConn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: "shopease_test"
  });

  try {
    // Hard fail-safe check
    const [dbRows] = await testConn.execute("SELECT DATABASE() as db;");
    if (dbRows[0].db !== "shopease_test") {
      throw new Error(`CRITICAL ABORT: Expected database 'shopease_test' but got '${dbRows[0].db}'!`);
    }
    console.log(`[Setup] Verified active database: ${dbRows[0].db}`);

    // Create tables in shopease_test
    await testConn.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(160) NOT NULL,
        category VARCHAR(60) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        description TEXT NOT NULL,
        image VARCHAR(1000) NOT NULL,
        stock INT UNSIGNED NOT NULL DEFAULT 100,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_products_category (category),
        CONSTRAINT chk_products_price CHECK (price >= 0)
      ) ENGINE=InnoDB;
    `);

    await testConn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(190) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email (email)
      ) ENGINE=InnoDB;
    `);

    await testConn.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        status ENUM('placed','processing','shipped','delivered','cancelled') NOT NULL DEFAULT 'placed',
        total DECIMAL(10,2) NOT NULL,
        shipping_name VARCHAR(120) NOT NULL,
        shipping_phone VARCHAR(30) NOT NULL,
        shipping_address VARCHAR(500) NOT NULL,
        shipping_city VARCHAR(100) NOT NULL,
        shipping_postal_code VARCHAR(20) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_orders_user_created (user_id, created_at),
        CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)
      ) ENGINE=InnoDB;
    `);

    await testConn.execute(`
      CREATE TABLE IF NOT EXISTS order_items (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_id BIGINT UNSIGNED NOT NULL,
        product_id INT UNSIGNED NULL,
        product_name VARCHAR(160) NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        quantity INT UNSIGNED NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_order_items_order (order_id),
        CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    // Insert 5 disposable seed products with ON DUPLICATE KEY UPDATE
    await testConn.execute(`
      INSERT INTO products (id, name, category, price, description, image, stock) VALUES
      (1, 'Test Wireless Headphones', 'electronics', 1499.00, 'Test headphones description', 'https://example.com/img1.jpg', 25),
      (2, 'Test Classic Sneakers', 'fashion', 1999.00, 'Test sneakers description', 'https://example.com/img2.jpg', 10),
      (3, 'Test Smart Watch', 'electronics', 2499.00, 'Test watch description', 'https://example.com/img3.jpg', 5),
      (4, 'Test Travel Backpack', 'accessories', 999.00, 'Test backpack description', 'https://example.com/img4.jpg', 15),
      (5, 'Test Casual T-Shirt', 'fashion', 599.00, 'Test shirt description', 'https://example.com/img5.jpg', 20)
      ON DUPLICATE KEY UPDATE
        name=VALUES(name), category=VALUES(category), price=VALUES(price),
        description=VALUES(description), image=VALUES(image);
    `);

    const [prodCount] = await testConn.execute("SELECT COUNT(*) as c FROM products;");
    console.log(`[Setup] shopease_test ready with ${prodCount[0].c} test products.`);
  } finally {
    await testConn.end();
  }
}

if (require.main === module) {
  setupTestDb().catch(err => {
    console.error("[Setup Failed]:", err.message);
    process.exit(1);
  });
}

module.exports = { setupTestDb };
