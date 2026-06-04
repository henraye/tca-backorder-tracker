const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');

let db;

async function getDb() {
  if (db) return db;
  db = await open({ filename: path.join(__dirname, '../tca.db'), driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS backorder_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client TEXT,
      supplier TEXT,
      ordered_date TEXT,
      status TEXT DEFAULT 'open',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS backorder_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      sku TEXT,
      category TEXT,
      quantity_needed INTEGER NOT NULL DEFAULT 1,
      resolved_quantity INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES backorder_orders(id) ON DELETE CASCADE
    );
  `);

  return db;
}

module.exports = { getDb };
