import React, { useState, useEffect } from 'react';
import { orders as ordersApi, products as productsApi } from '../api';

const STATUS_BADGE = {
  pending: 'badge-yellow',
  processing: 'badge-blue',
  shipped: 'badge-purple',
  delivered: 'badge-green',
  cancelled: 'badge-red',
};

const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

export default function Orders() {
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ customer: '', notes: '', items: [] });
  const [editId, setEditId] = useState(null);
  const [viewOrder, setViewOrder] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = () => {
    ordersApi.list({ status: filterStatus }).then(r => setItems(r.data));
    productsApi.list().then(r => setProducts(r.data));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [filterStatus]);

  const openNew = () => {
    setForm({ customer: '', notes: '', items: [{ product_id: '', quantity: 1 }] });
    setEditId(null);
    setError('');
    setModal('new');
  };

  const openEdit = (o) => {
    setForm({ customer: o.customer, notes: o.notes || '', items: [] });
    setEditId(o.id);
    setError('');
    setModal('edit');
  };

  const openView = async (id) => {
    const r = await ordersApi.get(id);
    setViewOrder(r.data);
    setModal('view');
  };

  const addLineItem = () => setForm(f => ({ ...f, items: [...f.items, { product_id: '', quantity: 1 }] }));
  const removeLineItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i, field, val) => setForm(f => ({
    ...f,
    items: f.items.map((it, idx) => idx === i ? { ...it, [field]: val } : it)
  }));

  const handleSave = async () => {
    setError('');
    try {
      if (editId) {
        await ordersApi.update(editId, { customer: form.customer, notes: form.notes });
        setSuccess('Order updated.');
      } else {
        const validItems = form.items.filter(it => it.product_id);
        await ordersApi.create({ customer: form.customer, notes: form.notes, items: validItems.map(it => ({ product_id: parseInt(it.product_id), quantity: parseInt(it.quantity) })) });
        setSuccess('Order created.');
      }
      setModal(null);
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this order?')) return;
    await ordersApi.delete(id);
    setSuccess('Deleted.');
    load();
  };

  return (
    <div>
      {success && <div className="alert alert-success" onClick={() => setSuccess('')}>{success} ✕</div>}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Orders ({items.length})</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={openNew}>+ New Order</button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Items</th>
                <th>Total</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={7} className="empty-state">No orders found.</td></tr>}
              {items.map(o => (
                <tr key={o.id}>
                  <td><code style={{ fontSize: '0.8rem', color: '#6366f1' }}>{o.order_number}</code></td>
                  <td style={{ fontWeight: 500 }}>{o.customer}</td>
                  <td><span className={`badge ${STATUS_BADGE[o.status] || 'badge-gray'}`}>{o.status}</span></td>
                  <td>{o.item_count}</td>
                  <td>${parseFloat(o.total).toFixed(2)}</td>
                  <td style={{ color: '#64748b', fontSize: '0.8rem' }}>{o.created_at?.slice(0, 10)}</td>
                  <td>
                    <div className="actions-cell">
                      <button className="btn btn-secondary btn-sm" onClick={() => openView(o.id)}>View</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(o)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(o.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(modal === 'new' || modal === 'edit') && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-title">{modal === 'new' ? 'New Order' : 'Edit Order'}</div>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-grid">
              <div className="form-group full">
                <label>Customer *</label>
                <input value={form.customer} onChange={e => setForm(f => ({ ...f, customer: e.target.value }))} placeholder="Customer name or company" />
              </div>
              <div className="form-group full">
                <label>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Shipping notes, special instructions..." />
              </div>
            </div>

            {modal === 'new' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label>Line Items</label>
                  <button className="btn btn-secondary btn-sm" onClick={addLineItem}>+ Add Item</button>
                </div>
                {form.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <select style={{ flex: 2 }} value={item.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)}>
                      <option value="">Select product...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} (${p.price})</option>)}
                    </select>
                    <input type="number" min="1" style={{ width: 70 }} value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} />
                    <button className="btn btn-danger btn-sm" onClick={() => removeLineItem(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {modal === 'edit' && (
              <div>
                <label style={{ marginBottom: 8, display: 'block' }}>Status</label>
                <select value={form.status || 'pending'} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'view' && viewOrder && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-title">Order {viewOrder.order_number}</div>
            <div style={{ marginBottom: 12 }}>
              <span className={`badge ${STATUS_BADGE[viewOrder.status] || 'badge-gray'}`}>{viewOrder.status}</span>
              <span style={{ marginLeft: 10, color: '#64748b', fontSize: '0.875rem' }}>{viewOrder.customer}</span>
            </div>
            {viewOrder.notes && <div className="alert alert-info" style={{ marginBottom: 12 }}>{viewOrder.notes}</div>}
            <table>
              <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead>
              <tbody>
                {viewOrder.items?.map(it => (
                  <tr key={it.id}>
                    <td>{it.name}</td>
                    <td><code style={{ fontSize: '0.8rem' }}>{it.sku}</code></td>
                    <td>{it.quantity}</td>
                    <td>${parseFloat(it.unit_price).toFixed(2)}</td>
                    <td>${(it.quantity * it.unit_price).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ textAlign: 'right', marginTop: 12, fontWeight: 700, fontSize: '1.1rem' }}>
              Total: ${parseFloat(viewOrder.total).toFixed(2)}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Close</button>
              <button className="btn btn-secondary" onClick={() => { setModal(null); openEdit(viewOrder); }}>Edit Status</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
