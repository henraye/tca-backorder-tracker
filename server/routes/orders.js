const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

router.get('/', async (req, res) => {
  const db = await getDb();
  const { status } = req.query;
  let query = `SELECT o.*, COUNT(oi.id) as item_count FROM orders o LEFT JOIN order_items oi ON o.id = oi.order_id`;
  const params = [];
  if (status) { query += ' WHERE o.status = ?'; params.push(status); }
  query += ' GROUP BY o.id ORDER BY o.created_at DESC';
  res.json(await db.all(query, params));
});

router.get('/:id', async (req, res) => {
  const db = await getDb();
  const order = await db.get('SELECT * FROM orders WHERE id = ?', req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = await db.all(
    'SELECT oi.*, p.name, p.sku FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?',
    req.params.id
  );
  res.json({ ...order, items });
});

router.post('/', async (req, res) => {
  const db = await getDb();
  const { customer, notes, items } = req.body;
  if (!customer) return res.status(400).json({ error: 'customer is required' });

  const orderNumber = 'ORD-' + Date.now();
  try {
    await db.run('BEGIN');
    const result = await db.run(
      "INSERT INTO orders (order_number, customer, notes, status) VALUES (?,?,?,'pending')",
      [orderNumber, customer, notes || null]
    );
    const orderId = result.lastID;
    let total = 0;
    if (items && items.length > 0) {
      for (const item of items) {
        const product = await db.get('SELECT price FROM products WHERE id = ?', item.product_id);
        if (!product) throw new Error(`Product ${item.product_id} not found`);
        const unitPrice = item.unit_price ?? product.price;
        await db.run(
          'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?,?,?,?)',
          [orderId, item.product_id, item.quantity, unitPrice]
        );
        total += unitPrice * item.quantity;
      }
    }
    await db.run('UPDATE orders SET total = ? WHERE id = ?', [total, orderId]);
    await db.run('COMMIT');
    res.status(201).json(await db.get('SELECT * FROM orders WHERE id = ?', orderId));
  } catch (e) {
    await db.run('ROLLBACK');
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  const db = await getDb();
  const { customer, status, notes } = req.body;
  const existing = await db.get('SELECT * FROM orders WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });
  await db.run(
    `UPDATE orders SET customer=?, status=?, notes=?, updated_at=datetime('now') WHERE id=?`,
    [customer ?? existing.customer, status ?? existing.status, notes ?? existing.notes, req.params.id]
  );
  res.json(await db.get('SELECT * FROM orders WHERE id = ?', req.params.id));
});

router.delete('/:id', async (req, res) => {
  const db = await getDb();
  const result = await db.run('DELETE FROM orders WHERE id = ?', req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Order not found' });
  res.json({ success: true });
});

module.exports = router;
