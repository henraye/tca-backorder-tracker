const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const upload = multer({ storage: multer.memoryStorage() });

// Fetch all orders with their items and days_waiting
async function getOrdersWithItems(db, whereClause = '', params = []) {
  const orders = await db.all(`
    SELECT o.*,
      CAST((julianday('now') - julianday(COALESCE(o.ordered_date, o.created_at))) AS INTEGER) as days_waiting,
      COUNT(i.id) as item_count
    FROM backorder_orders o
    LEFT JOIN backorder_items i ON o.id = i.order_id
    ${whereClause}
    GROUP BY o.id
    ORDER BY o.created_at ASC
  `, params);

  for (const order of orders) {
    order.items = await db.all('SELECT * FROM backorder_items WHERE order_id = ?', order.id);
  }
  return orders;
}

router.get('/', async (req, res) => {
  const db = await getDb();
  const { status } = req.query;
  const where = status ? `WHERE o.status = ?` : `WHERE o.status = 'open'`;
  const params = status ? [status] : [];
  res.json(await getOrdersWithItems(db, where, params));
});

router.get('/all', async (req, res) => {
  const db = await getDb();
  res.json(await getOrdersWithItems(db, '', []));
});

router.get('/stats', async (req, res) => {
  const db = await getDb();
  const open = await db.get("SELECT COUNT(*) as count FROM backorder_orders WHERE status='open'");
  const resolved = await db.get("SELECT COUNT(*) as count FROM backorder_orders WHERE status='resolved'");
  const oldest = await db.get(
    `SELECT CAST((julianday('now') - julianday(MIN(COALESCE(ordered_date, created_at)))) AS INTEGER) as days FROM backorder_orders WHERE status='open'`
  );
  const totalItems = await db.get(
    `SELECT COUNT(*) as count FROM backorder_items i JOIN backorder_orders o ON i.order_id = o.id WHERE o.status='open'`
  );
  res.json({ open: open.count, resolved: resolved.count, oldest_days: oldest.days || 0, open_items: totalItems.count });
});

router.get('/:id', async (req, res) => {
  const db = await getDb();
  const order = await db.get('SELECT * FROM backorder_orders WHERE id = ?', req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  order.items = await db.all('SELECT * FROM backorder_items WHERE order_id = ?', req.params.id);
  res.json(order);
});

router.post('/', async (req, res) => {
  const db = await getDb();
  const { client, supplier, ordered_date, notes, items } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });
  if (!items.every(i => i.product_name)) return res.status(400).json({ error: 'Each item must have a product_name' });

  await db.run('BEGIN');
  try {
    const result = await db.run(
      `INSERT INTO backorder_orders (client, supplier, ordered_date, notes) VALUES (?,?,?,?)`,
      [client || null, supplier || null, ordered_date || null, notes || null]
    );
    const orderId = result.lastID;
    for (const item of items) {
      await db.run(
        `INSERT INTO backorder_items (order_id, product_name, sku, category, quantity_needed) VALUES (?,?,?,?,?)`,
        [orderId, item.product_name, item.sku || null, item.category || null, parseInt(item.quantity_needed) || 1]
      );
    }
    await db.run('COMMIT');
    const orders = await getOrdersWithItems(db, 'WHERE o.id = ?', [orderId]);
    res.status(201).json(orders[0]);
  } catch (e) {
    await db.run('ROLLBACK');
    throw e;
  }
});

router.put('/:id', async (req, res) => {
  const db = await getDb();
  const { client, supplier, ordered_date, notes, status, items } = req.body;
  const existing = await db.get('SELECT * FROM backorder_orders WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const resolvedAt = status === 'open' ? 'NULL'
    : status === 'resolved' && existing.status !== 'resolved' ? "datetime('now')"
    : existing.resolved_at ? `'${existing.resolved_at}'` : 'NULL';

  await db.run('BEGIN');
  try {
    await db.run(
      `UPDATE backorder_orders SET client=?, supplier=?, ordered_date=?, notes=?, status=?, resolved_at=${resolvedAt}, updated_at=datetime('now') WHERE id=?`,
      [client ?? existing.client, supplier ?? existing.supplier, ordered_date ?? existing.ordered_date,
       notes ?? existing.notes, status ?? existing.status, req.params.id]
    );
    if (items) {
      await db.run('DELETE FROM backorder_items WHERE order_id = ?', req.params.id);
      for (const item of items) {
        await db.run(
          `INSERT INTO backorder_items (order_id, product_name, sku, category, quantity_needed) VALUES (?,?,?,?,?)`,
          [req.params.id, item.product_name, item.sku || null, item.category || null, parseInt(item.quantity_needed) || 1]
        );
      }
    }
    await db.run('COMMIT');
    const orders = await getOrdersWithItems(db, 'WHERE o.id = ?', [req.params.id]);
    res.json(orders[0]);
  } catch (e) {
    await db.run('ROLLBACK');
    throw e;
  }
});

// Update resolved_quantity on a single item
router.put('/:orderId/items/:itemId', async (req, res) => {
  const db = await getDb();
  const { resolved_quantity } = req.body;
  const item = await db.get('SELECT * FROM backorder_items WHERE id = ? AND order_id = ?', [req.params.itemId, req.params.orderId]);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const newResolved = Math.min(parseInt(resolved_quantity) || 0, item.quantity_needed);
  await db.run('UPDATE backorder_items SET resolved_quantity = ? WHERE id = ?', [newResolved, req.params.itemId]);

  // Auto-resolve the order if all items are fully received
  const items = await db.all('SELECT * FROM backorder_items WHERE order_id = ?', req.params.orderId);
  const allResolved = items.every(i => {
    const qty = i.id === parseInt(req.params.itemId) ? newResolved : i.resolved_quantity;
    return qty >= i.quantity_needed;
  });

  if (allResolved) {
    await db.run(`UPDATE backorder_orders SET status='resolved', resolved_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, req.params.orderId);
  } else {
    await db.run(`UPDATE backorder_orders SET status='open', resolved_at=NULL, updated_at=datetime('now') WHERE id=?`, req.params.orderId);
  }

  const orders = await getOrdersWithItems(db, 'WHERE o.id = ?', [req.params.orderId]);
  res.json(orders[0]);
});

router.delete('/:id', async (req, res) => {
  const db = await getDb();
  const result = await db.run('DELETE FROM backorder_orders WHERE id = ?', req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// CSV import: groups rows by client+ordered_date into orders
router.post('/import/csv', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const db = await getDb();
  try {
    const records = parse(req.file.buffer.toString(), { columns: true, skip_empty_lines: true, trim: true });
    // Group rows into orders by client + ordered_date (or each row = its own order if no grouping key)
    const groups = {};
    for (const row of records) {
      const product_name = row.product_name || row['Product Name'] || row.name;
      if (!product_name) continue;
      const key = `${row.client || row.Client || ''}_${row.ordered_date || row['Ordered Date'] || Date.now()}`;
      if (!groups[key]) {
        groups[key] = {
          client: row.client || row.Client || null,
          supplier: row.supplier || row.Supplier || null,
          ordered_date: row.ordered_date || row['Ordered Date'] || null,
          notes: row.notes || row.Notes || null,
          items: [],
        };
      }
      groups[key].items.push({
        product_name,
        sku: row.sku || row.SKU || null,
        category: row.category || row.Category || null,
        quantity_needed: parseInt(row.quantity_needed || row['Quantity Needed'] || 1) || 1,
      });
    }

    let imported = 0;
    for (const group of Object.values(groups)) {
      await db.run('BEGIN');
      const result = await db.run(
        `INSERT INTO backorder_orders (client, supplier, ordered_date, notes) VALUES (?,?,?,?)`,
        [group.client, group.supplier, group.ordered_date, group.notes]
      );
      for (const item of group.items) {
        await db.run(
          `INSERT INTO backorder_items (order_id, product_name, sku, category, quantity_needed) VALUES (?,?,?,?,?)`,
          [result.lastID, item.product_name, item.sku, item.category, item.quantity_needed]
        );
      }
      await db.run('COMMIT');
      imported++;
    }
    res.json({ imported, orders: Object.keys(groups).length });
  } catch (e) {
    await db.run('ROLLBACK').catch(() => {});
    res.status(400).json({ error: 'Invalid file: ' + e.message });
  }
});

module.exports = router;
