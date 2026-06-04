const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', async (req, res) => {
  const db = await getDb();
  const { search, category } = req.query;
  let query = 'SELECT * FROM products';
  const params = [];
  const conditions = [];
  if (search) {
    conditions.push("(name LIKE ? OR sku LIKE ? OR supplier LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category) { conditions.push("category = ?"); params.push(category); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY name';
  res.json(await db.all(query, params));
});

router.get('/categories', async (req, res) => {
  const db = await getDb();
  const rows = await db.all('SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category');
  res.json(rows.map(r => r.category));
});

router.get('/:id', async (req, res) => {
  const db = await getDb();
  const product = await db.get('SELECT * FROM products WHERE id = ?', req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

router.post('/', async (req, res) => {
  const db = await getDb();
  const { sku, name, category, price, stock, supplier, description } = req.body;
  if (!sku || !name || price == null) return res.status(400).json({ error: 'sku, name, and price are required' });
  try {
    const result = await db.run(
      'INSERT INTO products (sku, name, category, price, stock, supplier, description) VALUES (?,?,?,?,?,?,?)',
      [sku, name, category, price, stock || 0, supplier, description]
    );
    res.status(201).json(await db.get('SELECT * FROM products WHERE id = ?', result.lastID));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'SKU already exists' });
    throw e;
  }
});

router.put('/:id', async (req, res) => {
  const db = await getDb();
  const { sku, name, category, price, stock, supplier, description } = req.body;
  const existing = await db.get('SELECT * FROM products WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  try {
    await db.run(
      `UPDATE products SET sku=?, name=?, category=?, price=?, stock=?, supplier=?, description=?, updated_at=datetime('now') WHERE id=?`,
      [sku ?? existing.sku, name ?? existing.name, category ?? existing.category,
       price ?? existing.price, stock ?? existing.stock, supplier ?? existing.supplier,
       description ?? existing.description, req.params.id]
    );
    res.json(await db.get('SELECT * FROM products WHERE id = ?', req.params.id));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'SKU already exists' });
    throw e;
  }
});

router.delete('/:id', async (req, res) => {
  const db = await getDb();
  const result = await db.run('DELETE FROM products WHERE id = ?', req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Product not found' });
  res.json({ success: true });
});

router.post('/import/csv', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const db = await getDb();
  try {
    const records = parse(req.file.buffer.toString(), { columns: true, skip_empty_lines: true, trim: true });
    let imported = 0;
    for (const row of records) {
      const sku = row.sku || row.SKU;
      const name = row.name || row.Name || row.product_name;
      const price = parseFloat(row.price || row.Price || 0);
      if (!sku || !name) continue;
      await db.run(
        'INSERT OR REPLACE INTO products (sku, name, category, price, stock, supplier, description) VALUES (?,?,?,?,?,?,?)',
        [sku, name, row.category || row.Category || null, price,
         parseInt(row.stock || row.Stock || 0), row.supplier || row.Supplier || null,
         row.description || row.Description || null]
      );
      imported++;
    }
    res.json({ imported, total: records.length });
  } catch (e) {
    res.status(400).json({ error: 'Invalid CSV: ' + e.message });
  }
});

module.exports = router;
