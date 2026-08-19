-- demo_sales 样例数据（试点报表场景）
CREATE SCHEMA IF NOT EXISTS demo_sales;
CREATE TABLE IF NOT EXISTS demo_sales.regions (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE IF NOT EXISTS demo_sales.products (id int PRIMARY KEY, name text NOT NULL, category text NOT NULL);
CREATE TABLE IF NOT EXISTS demo_sales.orders (
  id int PRIMARY KEY, region_id int NOT NULL REFERENCES demo_sales.regions(id),
  product_id int NOT NULL REFERENCES demo_sales.products(id),
  qty int NOT NULL, amount numeric(12,2) NOT NULL, order_date date NOT NULL
);
INSERT INTO demo_sales.regions VALUES (1,'华东'),(2,'华北'),(3,'华南'),(4,'西南') ON CONFLICT DO NOTHING;
INSERT INTO demo_sales.products VALUES
 (1,'企业版订阅','软件'),(2,'专业版订阅','软件'),(3,'实施服务','服务'),(4,'培训服务','服务'),
 (5,'云主机','基础设施'),(6,'对象存储','基础设施'),(7,'安全审计包','安全'),(8,'技术支持包','服务')
 ON CONFLICT DO NOTHING;
TRUNCATE demo_sales.orders;
INSERT INTO demo_sales.orders (id, region_id, product_id, qty, amount, order_date)
SELECT g, (g % 4) + 1, (g % 8) + 1, 10 + (g % 20) * 5, (10 + (g % 20) * 5) * (150 + (g * 13) % 850), DATE '2026-04-01' + (g % 89)
FROM generate_series(1, 80) g;
