import React, { useState } from 'react';
import Backorders from './components/Backorders';
import AuditPanel from './components/CatalogAudit';
import './App.css';

const TABS = ['Backorders', 'AI Audit'];

export default function App() {
  const [tab, setTab] = useState('Backorders');

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div>
            <h1>TCA Dental Supply</h1>
            <span className="subtitle">Backorder Tracker</span>
          </div>
          <nav className="nav-tabs">
            {TABS.map(t => (
              <button
                key={t}
                className={`nav-tab ${tab === t ? 'active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'AI Audit' ? '🤖 ' : ''}{t}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="main-content">
        {tab === 'Backorders' && <Backorders />}
        {tab === 'AI Audit' && <AuditPanel />}
      </main>
    </div>
  );
}
