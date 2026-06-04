const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { getDb } = require('../db');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function parseJSON(text) {
  // Strip markdown code blocks
  let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  // Find the first { and last } to extract JSON
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (e) {
      // fall through
    }
  }
  // Last resort — return summary as plain text
  return { health_score: 0, summary: text, critical_issues: [], warnings: [], recommendations: [], priority_skus: [], suggestions: [] };
}

router.post('/validate-product', async (req, res) => {
  const { product } = req.body;
  if (!product) return res.status(400).json({ error: 'product is required' });

  const db = await getDb();
  const categoryProducts = await db.all(
    'SELECT price, name FROM products WHERE category = ? AND id != ? LIMIT 20',
    [product.category || '', product.id || 0]
  );

  const prompt = `You are a dental supply catalog validation assistant. Analyze this product listing and identify any issues.

Product:
- SKU: ${product.sku}
- Name: ${product.name}
- Category: ${product.category || 'not set'}
- Price: $${product.price}
- Stock: ${product.stock}
- Supplier: ${product.supplier || 'not set'}
- Description: ${product.description || 'not set'}

${categoryProducts.length > 0 ? `Other products in the same category:\n${categoryProducts.map(p => `- ${p.name}: $${p.price}`).join('\n')}` : ''}

Check for: pricing anomalies, missing critical fields, SKU format issues, name clarity, stock level concerns.

Respond with JSON only:
{"status":"ok"|"warning"|"error","issues":[{"field":"...","severity":"low|medium|high","message":"..."}],"suggestions":["..."],"summary":"one sentence"}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content[0].text;
    res.json(parseJSON(text));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/audit-backorders', async (req, res) => {
  const db = await getDb();
  const orders = await db.all(`
    SELECT o.*, CAST((julianday('now') - julianday(COALESCE(o.ordered_date, o.created_at))) AS INTEGER) as days_waiting
    FROM backorder_orders o WHERE o.status='open' ORDER BY o.created_at ASC
  `);
  for (const o of orders) {
    o.items = await db.all('SELECT * FROM backorder_items WHERE order_id = ?', o.id);
  }
  const backorders = orders.map(o => ({
    ...o,
    items_summary: o.items.map(i => `${i.product_name} (qty: ${i.quantity_needed})`).join(', ')
  }));

  if (backorders.length === 0) {
    return res.json({
      health_score: 100,
      summary: 'No open backorders. Fulfillment is fully up to date.',
      critical_issues: [],
      warnings: [],
      recommendations: ['Continue monitoring stock levels to prevent future backorders.'],
      priority_skus: [],
    });
  }

  const prompt = `You are a dental supply fulfillment analyst. Audit these open backorders briefly and concisely.

Open Backorders (${backorders.length} orders):
${backorders.map(b =>
  `${b.client || 'No client'} | ${b.days_waiting}d | ${b.items_summary}`
).join('\n')}

Return JSON only. Keep every string under 120 characters. Max 5 items per array:
{"health_score":0-100,"summary":"one sentence max","critical_issues":["..."],"warnings":["..."],"recommendations":["..."],"priority_skus":["..."]}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content[0].text;
    res.json(parseJSON(text));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/restock-suggestions', async (req, res) => {
  const db = await getDb();
  const { category } = req.body;

  const orders = await db.all(`
    SELECT o.id, o.client, o.supplier, o.status,
      CAST((julianday('now') - julianday(COALESCE(o.ordered_date, o.created_at))) AS INTEGER) as days_waiting
    FROM backorder_orders o ORDER BY o.created_at DESC
  `);
  for (const o of orders) {
    o.items = await db.all('SELECT * FROM backorder_items WHERE order_id = ?', o.id);
  }

  let allItems = orders.flatMap(o => o.items.map(i => ({ ...i, status: o.status, days_waiting: o.days_waiting })));

  if (category) {
    allItems = allItems.filter(i => i.category?.toLowerCase().includes(category.toLowerCase()));
  }

  if (allItems.length === 0) return res.json({ suggestions: [], summary: category ? `No backorder history found for category: ${category}` : 'No backorder history to analyze yet.' });

  const prompt = `You are a dental supply procurement analyst. Based on this backorder history${category ? ` for the "${category}" category` : ''}, recommend what items to proactively restock and how much to order.

Backorder History:
${allItems.map(i => `${i.product_name}${i.sku ? ` [${i.sku}]` : ''} | Category: ${i.category || 'N/A'} | Qty: ${i.quantity_needed} | Status: ${i.status} | Days waited: ${i.days_waiting}`).join('\n')}
${category ? `\nFocus only on "${category}" items.` : ''}
Return JSON only. Keep strings under 100 characters. Max 8 suggestions:
{"summary":"one sentence","suggestions":[{"product":"...","sku":"...","reason":"...","suggested_qty":0,"priority":"high|medium|low"}]}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content[0].text;
    res.json(parseJSON(text));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/generate-description', async (req, res) => {
  const { name, category, supplier } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const prompt = `Write a concise, professional product description (1-2 sentences) for a dental supply catalog.
Product: ${name}
Category: ${category || 'dental supplies'}
Supplier: ${supplier || 'unknown'}
Return only the description text, nothing else.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });
    res.json({ description: response.content[0].text.trim() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
