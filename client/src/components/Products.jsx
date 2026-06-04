import React, { useState, useEffect, useRef } from 'react';
import { products as productsApi, ai as aiApi, backorders as backordersApi } from '../api';

const STATUS_BADGE = { ok: 'badge-green', warning: 'badge-yellow', error: 'badge-red' };

const EMPTY_FORM = { sku: '', name: '', category: '', price: '', stock: '', supplier: '', description: '' };

export default function Products() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [modal, setModal] = useState(null); // null | 'add' | 'edit' | 'validate'
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef();

  const load = () => {
    productsApi.list({ search, category: filterCat }).then(r => setItems(r.data));
    productsApi.categories().then(r => setCategories(r.data));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [search, filterCat]);

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setValidation(null); setError(''); setModal('add'); };
  const openEdit = (p) => {
    setForm({ sku: p.sku, name: p.name, category: p.category || '', price: p.price, stock: p.stock, supplier: p.supplier || '', description: p.description || '' });
    setEditId(p.id);
    setValidation(null);
    setError('');
    setModal('edit');
  };

  const handleSave = async () => {
    setError('');
    try {
      if (editId) {
        await productsApi.update(editId, { ...form, price: parseFloat(form.price), stock: parseInt(form.stock) });
        setSuccess('Product updated.');
      } else {
        await productsApi.create({ ...form, price: parseFloat(form.price), stock: parseInt(form.stock) });
        setSuccess('Product added.');
      }
      setModal(null);
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    await productsApi.delete(id);
    setSuccess('Deleted.');
    load();
  };

  const handleValidate = async () => {
    setValidating(true);
    setValidation(null);
    try {
      const r = await aiApi.validateProduct({ ...form, price: parseFloat(form.price), stock: parseInt(form.stock), id: editId });
      setValidation(r.data);
    } catch (e) {
      setError('AI validation failed: ' + (e.response?.data?.error || e.message));
    }
    setValidating(false);
  };

  const handleGenerateDesc = async () => {
    setGenerating(true);
    try {
      const r = await aiApi.generateDescription({ name: form.name, category: form.category, supplier: form.supplier });
      setForm(f => ({ ...f, description: r.data.description }));
    } catch (e) {}
    setGenerating(false);
  };

  const handleCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const r = await productsApi.importCSV(file);
      setSuccess(`Imported ${r.data.imported} of ${r.data.total} products.`);
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Import failed');
    }
    e.target.value = '';
  };

  return (
    <div>
      {success && <div className="alert alert-success" onClick={() => setSuccess('')}>{success} ✕</div>}
      {error && !modal && <div className="alert alert-error" onClick={() => setError('')}>{error} ✕</div>}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Products ({items.length})</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()}>Import CSV</button>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSV} />
            <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Product</button>
          </div>
        </div>

        <div className="search-row">
          <input placeholder="Search by name, SKU, supplier..." value={search} onChange={e => setSearch(e.target.value)} />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Supplier</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={7} className="empty-state">No products found.</td></tr>
              )}
              {items.map(p => (
                <tr key={p.id}>
                  <td><code style={{ fontSize: '0.8rem', color: '#6366f1' }}>{p.sku}</code></td>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td>{p.category && <span className="badge badge-blue">{p.category}</span>}</td>
                  <td>${parseFloat(p.price).toFixed(2)}</td>
                  <td>
                    <span className={p.stock === 0 ? 'stock-low' : p.stock < 10 ? 'stock-low' : 'stock-ok'}>{p.stock}</span>
                    {p.stock === 0 && <span className="badge badge-red" style={{ marginLeft: 6 }}>Out</span>}
                  </td>
                  <td>{p.supplier || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                  <td>
                    <div className="actions-cell">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>Edit</button>
                      {p.stock === 0 && (
                        <button className="btn btn-danger btn-sm" onClick={async () => {
                          try {
                            await backordersApi.create({ product_id: p.id, quantity_needed: 1, supplier: p.supplier });
                            setSuccess(`Backorder created for ${p.name}.`);
                          } catch (e) {
                            setSuccess(e.response?.data?.error || 'Backorder already exists for this product.');
                          }
                        }}>Backorder</button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-title">{modal === 'add' ? 'Add Product' : 'Edit Product'}</div>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-grid">
              <div className="form-group">
                <label>SKU *</label>
                <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="DEN-001" />
              </div>
              <div className="form-group">
                <label>Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Product name" />
              </div>
              <div className="form-group">
                <label>Category</label>
                <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="PPE, Hygiene..." list="cats" />
                <datalist id="cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="form-group">
                <label>Price *</label>
                <input type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label>Stock</label>
                <input type="number" min="0" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} placeholder="0" />
              </div>
              <div className="form-group">
                <label>Supplier</label>
                <input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Supplier name" />
              </div>
              <div className="form-group full">
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  Description
                  <button className="btn btn-ai btn-sm" onClick={handleGenerateDesc} disabled={!form.name || generating} style={{ textTransform: 'none', letterSpacing: 0 }}>
                    {generating ? 'Generating...' : '✨ AI Generate'}
                  </button>
                </label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Product description..." />
              </div>
            </div>

            {validation && (
              <div className="validation-result">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className={`badge ${STATUS_BADGE[validation.status]}`}>{validation.status.toUpperCase()}</span>
                  <span style={{ fontSize: '0.875rem' }}>{validation.summary}</span>
                </div>
                {validation.issues?.map((issue, i) => (
                  <div key={i} className="issue-item">
                    <span className={`severity-${issue.severity}`}>●</span>
                    <span><strong>{issue.field}:</strong> {issue.message}</span>
                  </div>
                ))}
                {validation.suggestions?.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#64748b' }}>
                    <strong>Suggestions:</strong> {validation.suggestions.join(' • ')}
                  </div>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-ai" onClick={handleValidate} disabled={validating || !form.name}>
                {validating ? 'Validating...' : '🤖 Validate with AI'}
              </button>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
