CREATE DATABASE IF NOT EXISTS shopease
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE shopease;

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

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

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

-- Safe to re-run: product IDs are stable and duplicates are updated.
INSERT INTO products (id, name, category, price, description, image, stock) VALUES
(1, 'Wireless Headphones', 'electronics', 1499.00, 'Enjoy rich, clear sound with comfortable wireless headphones.', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80', 25),
(2, 'Classic Sneakers', 'fashion', 1999.00, 'Timeless low-top sneakers with comfortable insoles. Available in six colors for every style.', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80', 20),
(3, 'Smart Watch', 'electronics', 2499.00, 'Track your daily activity and stay connected with a stylish smart watch.', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80', 15),
(4, 'Travel Backpack', 'accessories', 999.00, '26L spacious backpack with a padded laptop sleeve. Perfect for college and travel.', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=600&q=80', 30),
(5, 'Casual T-Shirt', 'fashion', 599.00, '100% combed cotton. Pre-shrunk. A wardrobe staple that pairs with everything.', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=80', 40),
(6, 'Sunglasses', 'accessories', 799.00, 'UV400-protected polarised lenses in a lightweight frame.', 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=600&q=80', 18),
(7, 'Bluetooth Speaker', 'electronics', 1299.00, 'Portable Bluetooth speaker with clear sound and long battery life.', 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=600&q=80', 22),
(8, 'USB-C Hub', 'electronics', 899.00, 'Compact multiport USB-C hub for everyday laptop connectivity.', 'https://images.unsplash.com/photo-1625842268584-8f3296236761?auto=format&fit=crop&w=600&q=80', 35),
(9, 'Mechanical Keyboard', 'electronics', 2799.00, 'Responsive mechanical keyboard for work, study, and gaming.', 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=600&q=80', 12),
(10, 'Wireless Mouse', 'electronics', 699.00, 'Ergonomic wireless mouse with precise tracking.', 'https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=600&q=80', 30),
(11, 'Power Bank', 'electronics', 1199.00, 'High-capacity portable power bank for compatible devices.', 'https://images.unsplash.com/photo-1609592806596-b43bada3f8c7?auto=format&fit=crop&w=600&q=80', 25),
(12, 'Laptop Stand', 'accessories', 799.00, 'Adjustable laptop stand for a more comfortable desk setup.', 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=600&q=80', 18),
(13, 'Running Shoes', 'fashion', 2299.00, 'Lightweight running shoes with cushioned support.', 'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=600&q=80', 20),
(14, 'Denim Jacket', 'fashion', 1899.00, 'Classic denim jacket with a versatile everyday fit.', 'https://images.unsplash.com/photo-1543076447-215ad9ba6923?auto=format&fit=crop&w=600&q=80', 14),
(15, 'Hoodie', 'fashion', 1199.00, 'Soft fleece hoodie for relaxed everyday wear.', 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=600&q=80', 24),
(16, 'Formal Shirt', 'fashion', 999.00, 'Smart-casual button-down shirt for work and events.', 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=600&q=80', 28),
(17, 'Jeans', 'fashion', 1499.00, 'Everyday denim jeans with a comfortable regular fit.', 'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=600&q=80', 26),
(18, 'Sports Water Bottle', 'accessories', 399.00, 'Reusable leak-resistant bottle for gym, class, and travel.', 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=600&q=80', 50),
(19, 'Wallet', 'accessories', 499.00, 'Slim everyday wallet with practical card slots.', 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=600&q=80', 32),
(20, 'Wrist Watch', 'accessories', 1599.00, 'Minimal analog wrist watch with a clean modern dial.', 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=600&q=80', 16),
(21, 'Desk Lamp', 'home', 899.00, 'LED desk lamp with adjustable angle for focused study.', 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=600&q=80', 20),
(22, 'Coffee Mug', 'home', 299.00, 'Ceramic mug for coffee, tea, and study breaks.', 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=600&q=80', 45),
(23, 'Notebook Set', 'stationery', 249.00, 'Set of ruled notebooks for notes, planning, and journaling.', 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=600&q=80', 60),
(24, 'Backpack Rain Cover', 'accessories', 349.00, 'Lightweight rain cover to protect a backpack in wet weather.', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=600&q=80', 22),
(25, 'Fitness Band', 'electronics', 1799.00, 'Activity band for daily movement and workout tracking.', 'https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?auto=format&fit=crop&w=600&q=80', 17),
(26, 'Tablet Sleeve', 'accessories', 649.00, 'Padded sleeve to help protect a tablet while commuting.', 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=600&q=80', 19),
(27, 'Socks Pack', 'fashion', 299.00, 'Comfortable cotton-blend everyday socks in a multipack.', 'https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?auto=format&fit=crop&w=600&q=80', 42),
(28, 'Cap', 'fashion', 399.00, 'Adjustable casual cap for outdoor days.', 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=600&q=80', 25),
(29, 'Portable SSD', 'electronics', 3999.00, 'Compact solid-state storage for fast file transfers.', 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=600&q=80', 10),
(30, 'Phone Stand', 'accessories', 299.00, 'Foldable desktop phone stand for video calls and viewing.', 'https://images.unsplash.com/photo-1512499617640-c74ae3a79d37?auto=format&fit=crop&w=600&q=80', 34)
ON DUPLICATE KEY UPDATE
  name=VALUES(name), category=VALUES(category), price=VALUES(price),
  description=VALUES(description), image=VALUES(image);
