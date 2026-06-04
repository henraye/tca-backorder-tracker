import React, { useState, useEffect } from 'react';
import { ai as aiApi, backorders as backordersApi } from '../api';

const PRIORITY_BADGE = { high: 'badge-red', medium: 'badge-yellow', low: 'badge-gray' };

function loadCached(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export default function AuditPanel() {
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState(() => loadCached('tca_audit'));
  const [auditTimestamp, setAuditTimestamp] = useState(() => localStorage.getItem('tca_audit_ts'));
  const [restockLoading, setRestockLoading] = useState(false);
  const [restockCache, setRestockCache] = useState(() => {
    const cache = loadCached('tca_restock_cache') || {};
    // migrate old single-key cache
    const old = loadCached('tca_restock');
    const oldTs = localStorage.getItem('tca_restock_ts');
    if (old && !cache['__all__']) cache['__all__'] = { data: old, ts: oldTs || '' };
    return cache;
  });
  const [restockCategory, setRestockCategory] = useState('');
  const [availableCategories, setAvailableCategories] = useState([]);

  const restockResult = restockCache[restockCategory || '__all__']?.data || null;
  const restockTimestamp = restockCache[restockCategory || '__all__']?.ts || null;
  const [error, setError] = useState('');

  useEffect(() => {
    backordersApi.all().then(r => {
      const cats = [...new Set(
        r.data.flatMap(o => o.items?.map(i => i.category).filter(Boolean) || [])
      )].sort();
      setAvailableCategories(cats);
    }).catch(() => {});
  }, []);

  const runAudit = async () => {
    setAuditLoading(true);
    setError('');
    try {
      const r = await aiApi.auditBackorders();
      const ts = new Date().toLocaleString();
      setAuditResult(r.data);
      setAuditTimestamp(ts);
      saveCache('tca_audit', r.data);
      localStorage.setItem('tca_audit_ts', ts);
    } catch (e) {
      setError(e.response?.data?.error || 'Audit failed. Check that your ANTHROPIC_API_KEY is set.');
    }
    setAuditLoading(false);
  };

  const runRestock = async () => {
    setRestockLoading(true);
    setError('');
    try {
      const r = await aiApi.restockSuggestions(restockCategory || null);
      const ts = new Date().toLocaleString();
      const key = restockCategory || '__all__';
      const updated = { ...restockCache, [key]: { data: r.data, ts } };
      setRestockCache(updated);
      saveCache('tca_restock_cache', updated);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed. Check that your ANTHROPIC_API_KEY is set.');
    }
    setRestockLoading(false);
  };

  const scoreClass = (s) => s >= 80 ? 'score-good' : s >= 50 ? 'score-warn' : 'score-bad';

  return (
    <div>
      {error && <div className="alert alert-error" onClick={() => setError('')}>{error} ✕</div>}

      {/* Backorder Audit */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">🔍 Backorder Status Audit</div>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: 4 }}>
              Claude reviews all open backorders, flags overdue items and missing info, and tells you what to act on first.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <button className="btn btn-ai" onClick={runAudit} disabled={auditLoading}>
              {auditLoading ? 'Analyzing...' : auditResult ? '↻ Refresh Audit' : 'Run Audit'}
            </button>
            {auditTimestamp && !auditLoading && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>Last run: {auditTimestamp}</div>}
          </div>
        </div>

        {auditLoading && <div className="loading"><div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>Reviewing open backorders...</div>}

        {auditResult && (
          <div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
              <div className="card" style={{ flex: '0 0 160px', textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 4 }}>FULFILLMENT HEALTH</div>
                <div className={`health-score ${scoreClass(auditResult.health_score)}`}>{auditResult.health_score}</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>out of 100</div>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ color: '#374151', lineHeight: 1.6 }}>{auditResult.summary}</p>
                {auditResult.priority_skus?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <strong style={{ fontSize: '0.875rem' }}>Act on first: </strong>
                    {auditResult.priority_skus.map(s => (
                      <span key={s} className="badge badge-red" style={{ marginLeft: 4 }}>{s}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {auditResult.critical_issues?.length > 0 && (
              <div className="card" style={{ borderLeft: '4px solid #dc2626', marginBottom: 12 }}>
                <div className="card-title" style={{ marginBottom: 12, color: '#dc2626' }}>Critical Issues</div>
                {auditResult.critical_issues.map((issue, i) => (
                  <div key={i} className="issue-item"><span className="severity-high">●</span><span>{issue}</span></div>
                ))}
              </div>
            )}

            {auditResult.warnings?.length > 0 && (
              <div className="card" style={{ borderLeft: '4px solid #d97706', marginBottom: 12 }}>
                <div className="card-title" style={{ marginBottom: 12, color: '#d97706' }}>Warnings</div>
                {auditResult.warnings.map((w, i) => (
                  <div key={i} className="issue-item"><span className="severity-medium">●</span><span>{w}</span></div>
                ))}
              </div>
            )}

            {auditResult.recommendations?.length > 0 && (
              <div className="card" style={{ borderLeft: '4px solid #1a3a5c' }}>
                <div className="card-title" style={{ marginBottom: 12 }}>Recommendations</div>
                {auditResult.recommendations.map((r, i) => (
                  <div key={i} className="issue-item"><span style={{ color: '#6366f1' }}>→</span><span>{r}</span></div>
                ))}
              </div>
            )}
          </div>
        )}

        {!auditResult && !auditLoading && (
          <div className="empty-state">
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
            Click "Run Audit" to analyze your open backorders.
          </div>
        )}
      </div>

      {/* Restock Suggestions */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">📦 Restock Suggestions</div>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: 4 }}>
              Claude looks at your backorder history and recommends what to proactively reorder and how much.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={restockCategory}
                onChange={e => setRestockCategory(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.875rem' }}
              >
                <option value="">All Categories</option>
                {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="btn btn-ai" onClick={runRestock} disabled={restockLoading}>
                {restockLoading ? 'Analyzing...' : restockResult ? '↻ Refresh' : 'Get Suggestions'}
              </button>
            </div>
            {restockTimestamp && !restockLoading && (
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Last run: {restockTimestamp}</div>
            )}
          </div>
        </div>

        {restockLoading && <div className="loading"><div style={{ fontSize: '2rem', marginBottom: 8 }}>📦</div>Analyzing backorder history...</div>}

        {restockResult && (
          <div>
            {restockResult.summary && (
              <p style={{ color: '#374151', lineHeight: 1.6, marginBottom: 16 }}>{restockResult.summary}</p>
            )}
            {restockResult.suggestions?.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Suggested Qty</th>
                      <th>Priority</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restockResult.suggestions.map((s, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{s.product}</td>
                        <td>{s.sku ? <code style={{ fontSize: '0.8rem', color: '#6366f1' }}>{s.sku}</code> : '—'}</td>
                        <td style={{ fontWeight: 600 }}>{s.suggested_qty}</td>
                        <td><span className={`badge ${PRIORITY_BADGE[s.priority] || 'badge-gray'}`}>{s.priority}</span></td>
                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">Not enough backorder history yet to make suggestions.</div>
            )}
          </div>
        )}

        {!restockResult && !restockLoading && (
          <div className="empty-state">
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🤖</div>
            Click "Get Suggestions" to see what Claude recommends restocking based on your backorder history.
          </div>
        )}
      </div>
    </div>
  );
}
