-- Query Builder Test Database
-- Creates 18 tables with ~1000 rows each, various relationships and indexes

SET FOREIGN_KEY_CHECKS = 0;

-- Drop existing tables
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS product_reviews;
DROP TABLE IF EXISTS product_categories;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS warehouses;
DROP TABLE IF EXISTS employee_departments;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS addresses;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS shipping;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS tags;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- 1. CUSTOMERS (Primary entity)
-- ============================================
CREATE TABLE customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    gender ENUM('M', 'F', 'Other') DEFAULT 'Other',
    is_active BOOLEAN DEFAULT TRUE,
    loyalty_points INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_name (last_name, first_name),
    INDEX idx_created (created_at),
    INDEX idx_active_loyalty (is_active, loyalty_points)
) ENGINE=InnoDB;

-- ============================================
-- 2. ADDRESSES (One-to-Many with Customers)
-- ============================================
CREATE TABLE addresses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    address_type ENUM('billing', 'shipping', 'both') DEFAULT 'both',
    street_address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'USA',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    INDEX idx_customer (customer_id),
    INDEX idx_city_state (city, state),
    INDEX idx_postal (postal_code)
) ENGINE=InnoDB;

-- ============================================
-- 3. CATEGORIES (Self-referencing for hierarchy)
-- ============================================
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_id INT DEFAULT NULL,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL,
    INDEX idx_parent (parent_id),
    INDEX idx_slug (slug),
    INDEX idx_active_sort (is_active, sort_order)
) ENGINE=InnoDB;

-- ============================================
-- 4. PRODUCTS
-- ============================================
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    cost DECIMAL(10, 2),
    weight DECIMAL(8, 2),
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    stock_quantity INT DEFAULT 0,
    low_stock_threshold INT DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sku (sku),
    INDEX idx_price (price),
    INDEX idx_active_featured (is_active, is_featured),
    INDEX idx_stock (stock_quantity),
    FULLTEXT INDEX ft_name_desc (name, description)
) ENGINE=InnoDB;

-- ============================================
-- 5. PRODUCT_CATEGORIES (Many-to-Many junction)
-- ============================================
CREATE TABLE product_categories (
    product_id INT NOT NULL,
    category_id INT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (product_id, category_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    INDEX idx_category (category_id),
    INDEX idx_primary (is_primary)
) ENGINE=InnoDB;

-- ============================================
-- 6. WAREHOUSES
-- ============================================
CREATE TABLE warehouses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    country VARCHAR(50) DEFAULT 'USA',
    capacity INT,
    is_active BOOLEAN DEFAULT TRUE,
    INDEX idx_code (code),
    INDEX idx_location (city, state)
) ENGINE=InnoDB;

-- ============================================
-- 7. INVENTORY (Many-to-Many Products/Warehouses)
-- ============================================
CREATE TABLE inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    warehouse_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    reserved_quantity INT DEFAULT 0,
    reorder_point INT DEFAULT 10,
    last_restocked TIMESTAMP NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    UNIQUE KEY uk_product_warehouse (product_id, warehouse_id),
    INDEX idx_quantity (quantity),
    INDEX idx_low_stock (quantity, reorder_point)
) ENGINE=InnoDB;

-- ============================================
-- 8. DEPARTMENTS
-- ============================================
CREATE TABLE departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(10) NOT NULL UNIQUE,
    budget DECIMAL(12, 2),
    manager_id INT DEFAULT NULL,
    parent_dept_id INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_code (code),
    INDEX idx_parent (parent_dept_id)
) ENGINE=InnoDB;

-- ============================================
-- 9. EMPLOYEES
-- ============================================
CREATE TABLE employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_number VARCHAR(20) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    hire_date DATE NOT NULL,
    salary DECIMAL(10, 2),
    commission_pct DECIMAL(4, 2),
    job_title VARCHAR(100),
    manager_id INT DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL,
    INDEX idx_employee_num (employee_number),
    INDEX idx_email (email),
    INDEX idx_name (last_name, first_name),
    INDEX idx_hire_date (hire_date),
    INDEX idx_salary (salary),
    INDEX idx_manager (manager_id)
) ENGINE=InnoDB;

-- Add manager FK to departments after employees exists
ALTER TABLE departments ADD FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL;

-- ============================================
-- 10. EMPLOYEE_DEPARTMENTS (Many-to-Many with history)
-- ============================================
CREATE TABLE employee_departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    department_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE DEFAULT NULL,
    is_primary BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    INDEX idx_employee (employee_id),
    INDEX idx_department (department_id),
    INDEX idx_dates (start_date, end_date),
    INDEX idx_current (end_date, is_primary)
) ENGINE=InnoDB;

-- ============================================
-- 11. ORDERS
-- ============================================
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(20) NOT NULL UNIQUE,
    customer_id INT NOT NULL,
    employee_id INT DEFAULT NULL,
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    required_date DATE,
    shipped_date DATE,
    status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    shipping_amount DECIMAL(10, 2) DEFAULT 0,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    shipping_address_id INT,
    billing_address_id INT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
    FOREIGN KEY (shipping_address_id) REFERENCES addresses(id) ON DELETE SET NULL,
    FOREIGN KEY (billing_address_id) REFERENCES addresses(id) ON DELETE SET NULL,
    INDEX idx_order_number (order_number),
    INDEX idx_customer (customer_id),
    INDEX idx_employee (employee_id),
    INDEX idx_date (order_date),
    INDEX idx_status (status),
    INDEX idx_status_date (status, order_date),
    INDEX idx_total (total_amount)
) ENGINE=InnoDB;

-- ============================================
-- 12. ORDER_ITEMS
-- ============================================
CREATE TABLE order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    discount_pct DECIMAL(4, 2) DEFAULT 0,
    line_total DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    INDEX idx_order (order_id),
    INDEX idx_product (product_id),
    INDEX idx_order_product (order_id, product_id)
) ENGINE=InnoDB;

-- ============================================
-- 13. PAYMENTS
-- ============================================
CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('credit_card', 'debit_card', 'paypal', 'bank_transfer', 'cash') NOT NULL,
    transaction_id VARCHAR(100),
    status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    INDEX idx_order (order_id),
    INDEX idx_date (payment_date),
    INDEX idx_status (status),
    INDEX idx_method (payment_method),
    INDEX idx_transaction (transaction_id)
) ENGINE=InnoDB;

-- ============================================
-- 14. SHIPPING
-- ============================================
CREATE TABLE shipping (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    carrier VARCHAR(50),
    tracking_number VARCHAR(100),
    shipped_date TIMESTAMP NULL,
    estimated_delivery DATE,
    actual_delivery DATE,
    status ENUM('pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed') DEFAULT 'pending',
    weight DECIMAL(8, 2),
    shipping_cost DECIMAL(10, 2),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    INDEX idx_order (order_id),
    INDEX idx_tracking (tracking_number),
    INDEX idx_status (status),
    INDEX idx_dates (shipped_date, estimated_delivery)
) ENGINE=InnoDB;

-- ============================================
-- 15. PRODUCT_REVIEWS
-- ============================================
CREATE TABLE product_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    customer_id INT NOT NULL,
    rating TINYINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    review_text TEXT,
    is_verified_purchase BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT FALSE,
    helpful_votes INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    INDEX idx_product (product_id),
    INDEX idx_customer (customer_id),
    INDEX idx_rating (rating),
    INDEX idx_approved (is_approved),
    INDEX idx_product_rating (product_id, rating)
) ENGINE=InnoDB;

-- ============================================
-- 16. TAGS (for products)
-- ============================================
CREATE TABLE tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    tag_name VARCHAR(50) NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product (product_id),
    INDEX idx_tag (tag_name),
    UNIQUE KEY uk_product_tag (product_id, tag_name)
) ENGINE=InnoDB;

-- ============================================
-- 17. AUDIT_LOGS
-- ============================================
CREATE TABLE audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    record_id INT NOT NULL,
    action ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
    old_values JSON,
    new_values JSON,
    user_id INT,
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_table_record (table_name, record_id),
    INDEX idx_action (action),
    INDEX idx_user (user_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ============================================
-- 18. SETTINGS (Key-Value store)
-- ============================================
CREATE TABLE settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type ENUM('string', 'integer', 'boolean', 'json') DEFAULT 'string',
    description VARCHAR(255),
    is_public BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_key (setting_key),
    INDEX idx_public (is_public)
) ENGINE=InnoDB;

-- ============================================
-- SEED DATA
-- ============================================

-- Helper variables
SET @row_count = 0;

-- Seed Customers (~1000)
INSERT INTO customers (email, first_name, last_name, phone, date_of_birth, gender, is_active, loyalty_points)
SELECT
    CONCAT('customer', n, '@example.com'),
    ELT(1 + FLOOR(RAND() * 20), 'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen'),
    ELT(1 + FLOOR(RAND() * 20), 'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'),
    CONCAT('555-', LPAD(FLOOR(RAND() * 10000), 4, '0')),
    DATE_SUB(CURDATE(), INTERVAL (18 + FLOOR(RAND() * 50)) YEAR),
    ELT(1 + FLOOR(RAND() * 3), 'M', 'F', 'Other'),
    RAND() > 0.1,
    FLOOR(RAND() * 5000)
FROM (
    SELECT a.N + b.N * 10 + c.N * 100 + 1 AS n
    FROM (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
         (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b,
         (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) c
) numbers
WHERE n <= 1000;

-- Seed Addresses (~2000, ~2 per customer)
INSERT INTO addresses (customer_id, address_type, street_address, city, state, postal_code, country, is_default)
SELECT
    c.id,
    ELT(1 + FLOOR(RAND() * 3), 'billing', 'shipping', 'both'),
    CONCAT(FLOOR(RAND() * 9999) + 1, ' ', ELT(1 + FLOOR(RAND() * 10), 'Main', 'Oak', 'Maple', 'Cedar', 'Pine', 'Elm', 'Park', 'Lake', 'Hill', 'River'), ' ', ELT(1 + FLOOR(RAND() * 4), 'St', 'Ave', 'Blvd', 'Dr')),
    ELT(1 + FLOOR(RAND() * 15), 'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Seattle', 'Denver', 'Boston', 'Miami'),
    ELT(1 + FLOOR(RAND() * 15), 'NY', 'CA', 'IL', 'TX', 'AZ', 'PA', 'TX', 'CA', 'TX', 'CA', 'TX', 'WA', 'CO', 'MA', 'FL'),
    LPAD(FLOOR(RAND() * 100000), 5, '0'),
    'USA',
    RAND() > 0.5
FROM customers c
CROSS JOIN (SELECT 1 AS n UNION SELECT 2) x;

-- Seed Categories (~50 with hierarchy)
INSERT INTO categories (parent_id, name, slug, description, is_active, sort_order) VALUES
(NULL, 'Electronics', 'electronics', 'Electronic devices and accessories', TRUE, 1),
(NULL, 'Clothing', 'clothing', 'Apparel and fashion items', TRUE, 2),
(NULL, 'Home & Garden', 'home-garden', 'Home improvement and garden supplies', TRUE, 3),
(NULL, 'Sports', 'sports', 'Sports equipment and gear', TRUE, 4),
(NULL, 'Books', 'books', 'Books and publications', TRUE, 5),
(NULL, 'Toys', 'toys', 'Toys and games', TRUE, 6),
(NULL, 'Health', 'health', 'Health and personal care', TRUE, 7),
(NULL, 'Automotive', 'automotive', 'Automotive parts and accessories', TRUE, 8);

INSERT INTO categories (parent_id, name, slug, description, is_active, sort_order) VALUES
(1, 'Smartphones', 'smartphones', 'Mobile phones', TRUE, 1),
(1, 'Laptops', 'laptops', 'Portable computers', TRUE, 2),
(1, 'Tablets', 'tablets', 'Tablet devices', TRUE, 3),
(1, 'Audio', 'audio', 'Audio equipment', TRUE, 4),
(1, 'Cameras', 'cameras', 'Digital cameras', TRUE, 5),
(2, 'Men', 'men', 'Men clothing', TRUE, 1),
(2, 'Women', 'women', 'Women clothing', TRUE, 2),
(2, 'Kids', 'kids', 'Kids clothing', TRUE, 3),
(3, 'Furniture', 'furniture', 'Home furniture', TRUE, 1),
(3, 'Kitchen', 'kitchen', 'Kitchen supplies', TRUE, 2),
(3, 'Garden', 'garden', 'Garden tools', TRUE, 3),
(4, 'Fitness', 'fitness', 'Fitness equipment', TRUE, 1),
(4, 'Outdoor', 'outdoor', 'Outdoor sports', TRUE, 2),
(4, 'Team Sports', 'team-sports', 'Team sports gear', TRUE, 3);

-- More subcategories
INSERT INTO categories (parent_id, name, slug, description, is_active, sort_order) VALUES
(9, 'Android Phones', 'android-phones', 'Android smartphones', TRUE, 1),
(9, 'iPhones', 'iphones', 'Apple iPhones', TRUE, 2),
(10, 'Gaming Laptops', 'gaming-laptops', 'Laptops for gaming', TRUE, 1),
(10, 'Business Laptops', 'business-laptops', 'Laptops for business', TRUE, 2),
(12, 'Headphones', 'headphones', 'Over-ear and on-ear', TRUE, 1),
(12, 'Earbuds', 'earbuds', 'Wireless earbuds', TRUE, 2),
(12, 'Speakers', 'speakers', 'Bluetooth speakers', TRUE, 3),
(14, 'T-Shirts', 't-shirts-men', 'Men t-shirts', TRUE, 1),
(14, 'Jeans', 'jeans-men', 'Men jeans', TRUE, 2),
(15, 'Dresses', 'dresses', 'Women dresses', TRUE, 1),
(15, 'Tops', 'tops-women', 'Women tops', TRUE, 2),
(17, 'Sofas', 'sofas', 'Living room sofas', TRUE, 1),
(17, 'Beds', 'beds', 'Bedroom beds', TRUE, 2),
(17, 'Tables', 'tables', 'Dining and coffee tables', TRUE, 3);

-- Seed Products (~1000)
INSERT INTO products (sku, name, description, price, cost, weight, is_active, is_featured, stock_quantity, low_stock_threshold)
SELECT
    CONCAT('SKU-', LPAD(n, 5, '0')),
    CONCAT(
        ELT(1 + FLOOR(RAND() * 10), 'Premium', 'Classic', 'Modern', 'Vintage', 'Ultra', 'Pro', 'Elite', 'Basic', 'Deluxe', 'Standard'),
        ' ',
        ELT(1 + FLOOR(RAND() * 20), 'Widget', 'Gadget', 'Device', 'Tool', 'Item', 'Product', 'Accessory', 'Kit', 'Set', 'Bundle', 'Pack', 'System', 'Unit', 'Module', 'Component', 'Gear', 'Equipment', 'Supply', 'Material', 'Part'),
        ' ',
        ELT(1 + FLOOR(RAND() * 5), 'X', 'Pro', 'Plus', 'Max', 'Mini')
    ),
    CONCAT('High quality ', ELT(1 + FLOOR(RAND() * 5), 'product', 'item', 'merchandise', 'goods', 'article'), ' with excellent features and durability.'),
    ROUND(10 + RAND() * 990, 2),
    ROUND(5 + RAND() * 400, 2),
    ROUND(0.1 + RAND() * 50, 2),
    RAND() > 0.1,
    RAND() > 0.85,
    FLOOR(RAND() * 500),
    FLOOR(5 + RAND() * 20)
FROM (
    SELECT a.N + b.N * 10 + c.N * 100 + 1 AS n
    FROM (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
         (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b,
         (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) c
) numbers
WHERE n <= 1000;

-- Seed Product Categories (~2000 assignments)
INSERT IGNORE INTO product_categories (product_id, category_id, is_primary)
SELECT
    p.id,
    c.id,
    ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY RAND()) = 1
FROM products p
CROSS JOIN categories c
WHERE RAND() < 0.06
LIMIT 2000;

-- Seed Warehouses (~10)
INSERT INTO warehouses (code, name, address, city, state, country, capacity, is_active) VALUES
('WH-EAST', 'East Coast Distribution', '100 Industrial Way', 'Newark', 'NJ', 'USA', 50000, TRUE),
('WH-WEST', 'West Coast Hub', '200 Commerce Blvd', 'Los Angeles', 'CA', 'USA', 75000, TRUE),
('WH-CENT', 'Central Warehouse', '300 Logistics Dr', 'Dallas', 'TX', 'USA', 60000, TRUE),
('WH-NORTH', 'Northern Facility', '400 Supply Lane', 'Chicago', 'IL', 'USA', 45000, TRUE),
('WH-SOUTH', 'Southern Center', '500 Distribution Ave', 'Atlanta', 'GA', 'USA', 55000, TRUE),
('WH-PAC', 'Pacific Northwest', '600 Shipping Rd', 'Seattle', 'WA', 'USA', 40000, TRUE),
('WH-MTN', 'Mountain Region', '700 Freight St', 'Denver', 'CO', 'USA', 35000, TRUE),
('WH-FL', 'Florida Hub', '800 Commerce Park', 'Miami', 'FL', 'USA', 50000, TRUE),
('WH-AZ', 'Arizona Center', '900 Desert Industrial', 'Phoenix', 'AZ', 'USA', 45000, TRUE),
('WH-MA', 'New England Depot', '1000 Harbor Way', 'Boston', 'MA', 'USA', 30000, TRUE);

-- Seed Inventory (~3000 records)
INSERT IGNORE INTO inventory (product_id, warehouse_id, quantity, reserved_quantity, reorder_point, last_restocked)
SELECT
    p.id,
    w.id,
    FLOOR(RAND() * 200),
    FLOOR(RAND() * 20),
    FLOOR(10 + RAND() * 30),
    DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 90) DAY)
FROM products p
CROSS JOIN warehouses w
WHERE RAND() < 0.3;

-- Seed Departments (~15)
INSERT INTO departments (name, code, budget, parent_dept_id) VALUES
('Executive', 'EXEC', 5000000.00, NULL),
('Sales', 'SALES', 2000000.00, NULL),
('Marketing', 'MKT', 1500000.00, NULL),
('Engineering', 'ENG', 3000000.00, NULL),
('Human Resources', 'HR', 800000.00, NULL),
('Finance', 'FIN', 1200000.00, NULL),
('Operations', 'OPS', 2500000.00, NULL),
('Customer Support', 'SUP', 1000000.00, NULL),
('Research', 'RND', 2000000.00, NULL),
('Legal', 'LEG', 600000.00, NULL);

INSERT INTO departments (name, code, budget, parent_dept_id) VALUES
('Inside Sales', 'ISALES', 800000.00, 2),
('Field Sales', 'FSALES', 1200000.00, 2),
('Digital Marketing', 'DMKT', 600000.00, 3),
('Product Engineering', 'PENG', 1500000.00, 4),
('QA Engineering', 'QA', 800000.00, 4);

-- Seed Employees (~200)
INSERT INTO employees (employee_number, first_name, last_name, email, phone, hire_date, salary, commission_pct, job_title, is_active)
SELECT
    CONCAT('EMP', LPAD(n, 5, '0')),
    ELT(1 + FLOOR(RAND() * 20), 'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen'),
    ELT(1 + FLOOR(RAND() * 20), 'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'),
    CONCAT('employee', n, '@company.com'),
    CONCAT('555-', LPAD(FLOOR(RAND() * 10000), 4, '0')),
    DATE_SUB(CURDATE(), INTERVAL FLOOR(RAND() * 3650) DAY),
    ROUND(35000 + RAND() * 165000, 2),
    CASE WHEN RAND() > 0.7 THEN ROUND(RAND() * 0.15, 2) ELSE NULL END,
    ELT(1 + FLOOR(RAND() * 15), 'Software Engineer', 'Sales Rep', 'Marketing Specialist', 'HR Coordinator', 'Financial Analyst', 'Operations Manager', 'Support Agent', 'Product Manager', 'Designer', 'Data Analyst', 'Account Executive', 'DevOps Engineer', 'QA Engineer', 'Business Analyst', 'Project Manager'),
    RAND() > 0.05
FROM (
    SELECT a.N + b.N * 10 + c.N * 100 + 1 AS n
    FROM (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
         (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b,
         (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) c
) numbers
WHERE n <= 200;

-- Set some managers (hierarchical)
UPDATE employees SET manager_id = 1 WHERE id BETWEEN 2 AND 10;
UPDATE employees SET manager_id = FLOOR(2 + RAND() * 9) WHERE id > 10;

-- Update department managers
UPDATE departments SET manager_id = id WHERE id <= 10;

-- Seed Employee Departments
INSERT INTO employee_departments (employee_id, department_id, start_date, end_date, is_primary)
SELECT
    e.id,
    d.id,
    DATE_SUB(e.hire_date, INTERVAL FLOOR(RAND() * 30) DAY),
    NULL,
    TRUE
FROM employees e
JOIN departments d ON d.id = 1 + FLOOR(RAND() * 15)
WHERE e.id <= 200;

-- Seed Orders (~1500)
INSERT INTO orders (order_number, customer_id, employee_id, order_date, required_date, shipped_date, status, subtotal, tax_amount, shipping_amount, discount_amount, total_amount, shipping_address_id, billing_address_id)
SELECT
    CONCAT('ORD-', DATE_FORMAT(NOW(), '%Y'), '-', LPAD(n, 6, '0')),
    1 + FLOOR(RAND() * 1000),
    CASE WHEN RAND() > 0.3 THEN 1 + FLOOR(RAND() * 200) ELSE NULL END,
    DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 365) DAY),
    DATE_ADD(DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 365) DAY), INTERVAL 7 DAY),
    CASE WHEN RAND() > 0.3 THEN DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 300) DAY) ELSE NULL END,
    ELT(1 + FLOOR(RAND() * 6), 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'),
    0, 0, ROUND(RAND() * 20, 2), ROUND(RAND() * 50, 2), 0,
    1 + FLOOR(RAND() * 2000),
    1 + FLOOR(RAND() * 2000)
FROM (
    SELECT a.N + b.N * 10 + c.N * 100 + d.N * 1000 + 1 AS n
    FROM (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
         (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b,
         (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) c,
         (SELECT 0 AS N UNION SELECT 1) d
) numbers
WHERE n <= 1500;

-- Seed Order Items (~5000)
INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount_pct, line_total)
SELECT
    o.id,
    p.id,
    1 + FLOOR(RAND() * 5),
    p.price,
    CASE WHEN RAND() > 0.8 THEN ROUND(RAND() * 0.2, 2) ELSE 0 END,
    ROUND(p.price * (1 + FLOOR(RAND() * 5)) * (1 - CASE WHEN RAND() > 0.8 THEN RAND() * 0.2 ELSE 0 END), 2)
FROM orders o
CROSS JOIN products p
WHERE RAND() < 0.0035
LIMIT 5000;

-- Update order totals
UPDATE orders o
SET subtotal = (SELECT COALESCE(SUM(line_total), 0) FROM order_items WHERE order_id = o.id),
    tax_amount = (SELECT COALESCE(SUM(line_total), 0) * 0.08 FROM order_items WHERE order_id = o.id),
    total_amount = (SELECT COALESCE(SUM(line_total), 0) FROM order_items WHERE order_id = o.id) * 1.08 + o.shipping_amount - o.discount_amount;

-- Seed Payments (~1200)
INSERT INTO payments (order_id, payment_date, amount, payment_method, transaction_id, status)
SELECT
    o.id,
    DATE_ADD(o.order_date, INTERVAL FLOOR(RAND() * 3) DAY),
    o.total_amount,
    ELT(1 + FLOOR(RAND() * 5), 'credit_card', 'debit_card', 'paypal', 'bank_transfer', 'cash'),
    CONCAT('TXN-', UUID()),
    CASE
        WHEN o.status IN ('delivered', 'shipped') THEN 'completed'
        WHEN o.status = 'cancelled' THEN 'refunded'
        WHEN RAND() > 0.95 THEN 'failed'
        ELSE 'completed'
    END
FROM orders o
WHERE o.status != 'pending' OR RAND() > 0.3;

-- Seed Shipping (~1000)
INSERT INTO shipping (order_id, carrier, tracking_number, shipped_date, estimated_delivery, actual_delivery, status, weight, shipping_cost)
SELECT
    o.id,
    ELT(1 + FLOOR(RAND() * 5), 'FedEx', 'UPS', 'USPS', 'DHL', 'Amazon'),
    CONCAT(ELT(1 + FLOOR(RAND() * 5), 'FX', 'UP', 'US', 'DH', 'AM'), LPAD(FLOOR(RAND() * 10000000000), 10, '0')),
    o.shipped_date,
    DATE_ADD(o.shipped_date, INTERVAL 3 + FLOOR(RAND() * 7) DAY),
    CASE WHEN o.status = 'delivered' THEN DATE_ADD(o.shipped_date, INTERVAL 3 + FLOOR(RAND() * 5) DAY) ELSE NULL END,
    CASE
        WHEN o.status = 'delivered' THEN 'delivered'
        WHEN o.status = 'shipped' THEN ELT(1 + FLOOR(RAND() * 3), 'in_transit', 'out_for_delivery', 'picked_up')
        ELSE 'pending'
    END,
    ROUND(0.5 + RAND() * 30, 2),
    o.shipping_amount
FROM orders o
WHERE o.shipped_date IS NOT NULL;

-- Seed Product Reviews (~2000)
INSERT INTO product_reviews (product_id, customer_id, rating, title, review_text, is_verified_purchase, is_approved, helpful_votes)
SELECT
    p.id,
    1 + FLOOR(RAND() * 1000),
    1 + FLOOR(RAND() * 5),
    CONCAT(ELT(1 + FLOOR(RAND() * 5), 'Great', 'Good', 'Average', 'Decent', 'Amazing'), ' ', ELT(1 + FLOOR(RAND() * 3), 'product', 'purchase', 'buy')),
    CONCAT('This product is ', ELT(1 + FLOOR(RAND() * 5), 'excellent', 'good', 'okay', 'decent', 'fantastic'), '. ', ELT(1 + FLOOR(RAND() * 3), 'Highly recommend!', 'Would buy again.', 'Meets expectations.')),
    RAND() > 0.3,
    RAND() > 0.1,
    FLOOR(RAND() * 50)
FROM products p
CROSS JOIN (SELECT 1 AS n UNION SELECT 2) x
WHERE RAND() < 0.5
LIMIT 2000;

-- Seed Tags (~3000)
INSERT IGNORE INTO tags (product_id, tag_name)
SELECT
    p.id,
    ELT(1 + FLOOR(RAND() * 20), 'bestseller', 'new', 'sale', 'popular', 'trending', 'eco-friendly', 'premium', 'budget', 'limited', 'exclusive', 'featured', 'clearance', 'hot', 'recommended', 'top-rated', 'value', 'quality', 'durable', 'lightweight', 'compact')
FROM products p
CROSS JOIN (SELECT 1 AS n UNION SELECT 2 UNION SELECT 3) x
WHERE RAND() < 0.5
LIMIT 3000;

-- Seed Audit Logs (~1000)
INSERT INTO audit_logs (table_name, record_id, action, old_values, new_values, user_id, ip_address, created_at)
SELECT
    ELT(1 + FLOOR(RAND() * 5), 'orders', 'products', 'customers', 'inventory', 'employees'),
    1 + FLOOR(RAND() * 1000),
    ELT(1 + FLOOR(RAND() * 3), 'INSERT', 'UPDATE', 'DELETE'),
    CASE WHEN RAND() > 0.3 THEN JSON_OBJECT('field', 'old_value') ELSE NULL END,
    JSON_OBJECT('field', 'new_value'),
    CASE WHEN RAND() > 0.2 THEN 1 + FLOOR(RAND() * 200) ELSE NULL END,
    CONCAT(FLOOR(RAND() * 256), '.', FLOOR(RAND() * 256), '.', FLOOR(RAND() * 256), '.', FLOOR(RAND() * 256)),
    DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 90) DAY)
FROM (
    SELECT a.N + b.N * 10 + c.N * 100 + 1 AS n
    FROM (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
         (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b,
         (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) c
) numbers
WHERE n <= 1000;

-- Seed Settings
INSERT INTO settings (setting_key, setting_value, setting_type, description, is_public) VALUES
('site_name', 'Query Builder Demo', 'string', 'Website name', TRUE),
('items_per_page', '25', 'integer', 'Default pagination size', FALSE),
('enable_reviews', 'true', 'boolean', 'Enable product reviews', FALSE),
('tax_rate', '0.08', 'string', 'Default tax rate', FALSE),
('currency', 'USD', 'string', 'Default currency', TRUE),
('shipping_threshold', '50', 'integer', 'Free shipping threshold', TRUE),
('max_cart_items', '100', 'integer', 'Maximum items in cart', FALSE),
('enable_wishlist', 'true', 'boolean', 'Enable wishlist feature', FALSE),
('contact_email', 'support@example.com', 'string', 'Contact email', TRUE),
('maintenance_mode', 'false', 'boolean', 'Maintenance mode flag', FALSE);

-- Final statistics
SELECT 'Database seeded successfully!' AS status;
SELECT TABLE_NAME, TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_ROWS DESC;
