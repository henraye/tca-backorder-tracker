import React, { useState, useEffect, useRef } from 'react';
import { backorders as backordersApi } from '../api';

const URGENCY = (days) => {
  if (days >= 40) return { label: 'Critical', cls: 'badge-red' };
  if (days >= 30)  return { label: 'High',     cls: 'badge-yellow' };
  if (days >= 10)  return { label: 'Medium',   cls: 'badge-blue' };
  return           { label: 'Low',      cls: 'badge-gray' };
};

const DaysBar = ({ days }) => {
  const pct = Math.min(100, (days / 21) * 100);
  const color = days >= 14 ? '#dc2626' : days >= 7 ? '#d97706' : '#6366f1';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 6 }}>
        <div style={{ width: `${pct}%`, background: color, borderRadius: 4, height: '100%', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color, minWidth: 50 }}>{days}d</span>
    </div>
  );
};

const EMPTY_ORDER = { client: '', ordered_date: '', notes: '' };
const EMPTY_ITEM = { product_name: '', sku: '', category: '', quantity_needed: 1 };

export default function Backorders() {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ open: 0, resolved: 0, oldest_days: 0, open_items: 0 });
  const [showResolved, setShowResolved] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [modal, setModal] = useState(null);
  const [orderForm, setOrderForm] = useState(EMPTY_ORDER);
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState('');
  const [pendingQty, setPendingQty] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef();

  const load = async () => {
    const [listRes, statsRes] = await Promise.all([
      showResolved ? backordersApi.all() : backordersApi.list({ status: 'open' }),
      backordersApi.stats(),
    ]);
    setOrders(listRes.data);
    setStats(statsRes.data);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [showResolved]);

  const setOrderField = (field) => (e) => setOrderForm(f => ({ ...f, [field]: e.target.value }));

  const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const setItemField = (i, field) => (e) => setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: e.target.value } : item));

  const openNew = () => {
    setOrderForm(EMPTY_ORDER);
    setItems([{ ...EMPTY_ITEM }]);
    setEditId(null);
    setError('');
    setModal('form');
  };

  const openEdit = (order) => {
    setOrderForm({ client: order.client || '', ordered_date: order.ordered_date || '', notes: order.notes || '' });
    setItems(order.items.length > 0 ? order.items.map(i => ({ product_name: i.product_name, sku: i.sku || '', category: i.category || '', quantity_needed: i.quantity_needed })) : [{ ...EMPTY_ITEM }]);
    setEditId(order.id);
    setError('');
    setModal('form');
  };

  const handleSave = async () => {
    setError('');
    const validItems = items.filter(i => i.product_name.trim());
    if (validItems.length === 0) return setError('Add at least one product.');
    try {
      const payload = { ...orderForm, items: validItems.map(i => ({ ...i, quantity_needed: parseInt(i.quantity_needed) || 1 })) };
      if (editId) {
        await backordersApi.update(editId, payload);
        setSuccess('Backorder updated.');
      } else {
        await backordersApi.create(payload);
        setSuccess('Backorder added.');
      }
      setModal(null);
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed');
    }
  };

  const handleResolve = async (id) => {
    await backordersApi.update(id, { status: 'resolved' });
    setSuccess('Marked as received.');
    load();
  };

  const handleUnresolve = async (id) => {
    await backordersApi.update(id, { status: 'open' });
    setSuccess('Backorder reopened.');
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this backorder?')) return;
    await backordersApi.delete(id);
    setSuccess('Removed.');
    load();
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const r = await backordersApi.importCSV(file);
      setSuccess(`Imported ${r.data.imported} item(s) across ${r.data.orders} order(s).`);
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Import failed');
    }
    e.target.value = '';
  };

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const filtered = search
    ? orders.filter(o => o.client?.toLowerCase().includes(search.toLowerCase()))
    : orders;
  const openOrders = filtered.filter(o => o.status === 'open');
  const resolvedOrders = filtered.filter(o => o.status === 'resolved');

  const renderOrders = (list, isResolved = false) => list.map(order => {
    const urg = URGENCY(order.days_waiting);
    const isOpen = expanded[order.id];
    return (
      <React.Fragment key={order.id}>
        <tr style={{ opacity: isResolved ? 0.55 : 1, cursor: 'pointer' }} onClick={() => toggleExpand(order.id)}>
          <td style={{ width: 28, color: '#94a3b8', fontSize: '0.9rem' }}>{isOpen ? '▾' : '▸'}</td>
          <td style={{ fontWeight: 600 }}>{order.client || <span style={{ color: '#94a3b8' }}>No client</span>}</td>
          <td style={{ fontSize: '0.8rem' }}>{order.ordered_date || <span style={{ color: '#94a3b8' }}>—</span>}</td>
          <td><span className="badge badge-blue">{order.item_count} item{order.item_count !== 1 ? 's' : ''}</span></td>
          {!isResolved && <td><span className={`badge ${urg.cls}`}>{urg.label}</span></td>}
          {!isResolved && <td style={{ minWidth: 130 }}><DaysBar days={order.days_waiting} /></td>}
          <td><span className={`badge ${isResolved ? 'badge-green' : 'badge-yellow'}`}>{isResolved ? 'Resolved' : 'Open'}</span></td>
          <td style={{ maxWidth: 160, fontSize: '0.8rem', color: '#64748b' }}>{order.notes || '—'}</td>
          <td onClick={e => e.stopPropagation()}>
            <div className="actions-cell">
              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(order)}>Edit</button>
              {!isResolved && <button className="btn btn-success btn-sm" onClick={() => handleResolve(order.id)}>✓ Received</button>}
              {isResolved && <button className="btn btn-secondary btn-sm" onClick={() => handleUnresolve(order.id)}>↩ Reopen</button>}
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(order.id)}>✕</button>
            </div>
          </td>
        </tr>
        {isOpen && (
          <tr>
            <td colSpan={isResolved ? 8 : 10} style={{ padding: 0, background: '#f8fafc' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 48 }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '10%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 48 }}></th>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Qty Needed</th>
                    <th>Received</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map(item => {
                    const fullyReceived = item.resolved_quantity >= item.quantity_needed;
                    const partiallyReceived = item.resolved_quantity > 0 && !fullyReceived;
                    return (
                    <tr key={item.id} style={{ opacity: fullyReceived ? 0.5 : 1 }}>
                      <td style={{ paddingLeft: 48 }}></td>
                      <td style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name}</td>
                      <td>{item.sku ? <code style={{ fontSize: '0.8rem', color: '#6366f1' }}>{item.sku}</code> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                      <td>{item.category ? <span className="badge badge-gray">{item.category}</span> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                      <td style={{ fontWeight: 600 }}>{item.quantity_needed}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="number" min="0" max={item.quantity_needed}
                            value={pendingQty[item.id] ?? item.resolved_quantity}
                            style={{ width: 64, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: '0.8rem' }}
                            onChange={e => {
                              const val = Math.min(Math.max(parseInt(e.target.value) || 0, 0), item.quantity_needed);
                              setPendingQty(prev => ({ ...prev, [item.id]: val }));
                            }}
                          />
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/ {item.quantity_needed}</span>
                          {pendingQty[item.id] !== undefined && pendingQty[item.id] !== item.resolved_quantity && (
                            <button className="btn btn-primary btn-sm" onClick={async () => {
                              const val = pendingQty[item.id];
                              const updated = await backordersApi.resolveItem(order.id, item.id, val);
                              setOrders(prev => prev.map(o => o.id === order.id ? updated.data : o));
                              setPendingQty(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                            }}>Confirm</button>
                          )}
                        </div>
                      </td>
                      <td>
                        {fullyReceived && <span className="badge badge-green">Received</span>}
                        {partiallyReceived && <span className="badge badge-yellow">Partial</span>}
                        {!fullyReceived && !partiallyReceived && <span className="badge badge-gray">Pending</span>}
                      </td>
                      <td>
                        {!fullyReceived && (
                          <button className="btn btn-success btn-sm" onClick={async () => {
                            const updated = await backordersApi.resolveItem(order.id, item.id, item.quantity_needed);
                            setOrders(prev => prev.map(o => o.id === order.id ? updated.data : o));
                            setPendingQty(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                          }}>✓ All</button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  });

  return (
    <div>
      {success && <div className="alert alert-success" onClick={() => setSuccess('')}>{success} ✕</div>}
      {error && !modal && <div className="alert alert-error" onClick={() => setError('')}>{error} ✕</div>}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 130, textAlign: 'center', padding: '16px 20px' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Open Orders</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: stats.open > 0 ? '#dc2626' : '#16a34a', marginTop: 4 }}>{stats.open}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 130, textAlign: 'center', padding: '16px 20px' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Items Owed</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: stats.open_items > 0 ? '#d97706' : '#16a34a', marginTop: 4 }}>{stats.open_items}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 130, textAlign: 'center', padding: '16px 20px' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Longest Wait</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: stats.oldest_days >= 14 ? '#dc2626' : stats.oldest_days >= 7 ? '#d97706' : '#1a3a5c', marginTop: 4 }}>
            {stats.oldest_days}<span style={{ fontSize: '1rem', fontWeight: 400 }}> days</span>
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 130, textAlign: 'center', padding: '16px 20px' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resolved</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#16a34a', marginTop: 4 }}>{stats.resolved}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Backorder Tracker</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, color: '#374151' }}>
              <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
              Show resolved
            </label>
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()}>Import CSV</button>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
            <button className="btn btn-primary btn-sm" onClick={openNew}>+ Add Backorder</button>
          </div>
        </div>

        <div className="search-row">
          <input
            placeholder="Search by client name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="btn btn-secondary btn-sm" onClick={() => setSearch('')}>Clear</button>}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Client</th>
                <th>Order Date</th>
                <th>Items</th>
                <th>Urgency</th>
                <th>Days Waiting</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {openOrders.length === 0 && !showResolved && (
                <tr><td colSpan={9} className="empty-state">No open backorders.</td></tr>
              )}
              {renderOrders(openOrders)}
              {showResolved && resolvedOrders.length > 0 && (
                <>
                  <tr><td colSpan={9} style={{ background: '#f1f5f9', color: '#94a3b8', fontSize: '0.75rem', padding: '6px 12px', fontWeight: 600 }}>RESOLVED</td></tr>
                  {renderOrders(resolvedOrders, true)}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === 'form' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth: 660 }}>
            <div className="modal-title">{editId ? 'Edit Backorder' : 'New Backorder'}</div>
            {error && <div className="alert alert-error">{error}</div>}

            {/* Order header */}
            <div className="form-grid" style={{ marginBottom: 20 }}>
              <div className="form-group">
                <label>Client / Company</label>
                <input value={orderForm.client} onChange={setOrderField('client')} placeholder="Who ordered" autoFocus />
              </div>
              <div className="form-group">
                <label>Order Date</label>
                <input type="date" value={orderForm.ordered_date} onChange={setOrderField('ordered_date')} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input value={orderForm.notes} onChange={setOrderField('notes')} placeholder="Rush, special instructions..." />
              </div>
            </div>

            {/* Line items */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Products *</label>
              <button className="btn btn-secondary btn-sm" onClick={addItem}>+ Add Product</button>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
              {items.map((item, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderBottom: i < items.length - 1 ? '1px solid #f1f5f9' : 'none', background: 'white' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input style={{ flex: 3 }} value={item.product_name} onChange={setItemField(i, 'product_name')} placeholder="Product name *" />
                    <input style={{ flex: 1, minWidth: 60 }} type="number" min="1" value={item.quantity_needed} onChange={setItemField(i, 'quantity_needed')} placeholder="Qty" />
                    <button className="btn btn-danger btn-sm" onClick={() => removeItem(i)} disabled={items.length === 1} style={{ padding: '5px 8px', flexShrink: 0 }}>✕</button>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input style={{ flex: 1 }} value={item.sku} onChange={setItemField(i, 'sku')} placeholder="SKU (optional)" />
                    <input style={{ flex: 1 }} value={item.category} onChange={setItemField(i, 'category')} placeholder="Category (optional)" />
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
