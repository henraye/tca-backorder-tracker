# TCA Dental Supply — Backorder Tracker

A full-stack web application built to automate backorder tracking and fulfillment management for a dental supply company. Built with React, Node.js/Express, SQLite, and the Claude API.

## Background

During my time as an Operations & Web Associate at TCA Dental Supply, I manually tracked backorders, validated product data, and coordinated order fulfillment across platforms. This application automates that workflow — replacing spreadsheets and notebooks with a real-time, AI-assisted tracking system.

## Features

### Backorder Management
- Create backorder orders with multiple line items per order (one client can owe multiple products)
- Track client, order date, product name, SKU, category, and quantity needed
- Expandable rows to view all items per order
- Mark orders as received or reopen if needed
- Search by client name in real time

### Time Tracking
- Days waiting calculated automatically from order date
- Visual progress bar with urgency levels (Low → Medium → High → Critical)
- Stats dashboard showing open orders, total items owed, longest wait, and resolved count

### Bulk Import
- Import backorders from a CSV file exported from Excel
- Rows with the same client and date are automatically grouped into one order

### AI Features (Claude API)
- **Backorder Audit** — Claude reviews all open backorders, flags overdue items and missing information, and identifies which orders to prioritize
- **Restock Suggestions** — Claude analyzes full backorder history and recommends what to proactively reorder and in what quantities, ranked by priority

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Axios |
| Backend | Node.js, Express |
| Database | SQLite (via `sqlite` + `sqlite3`) |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) |

## Project Structure

```
├── server/
│   ├── index.js          # Express server entry point
│   ├── db.js             # SQLite connection and schema
│   └── routes/
│       ├── backorders.js # CRUD + CSV import endpoints
│       └── ai.js         # Claude API audit and restock routes
├── client/
│   └── src/
│       ├── App.js                    # App shell and tab navigation
│       ├── api.js                    # Axios API calls
│       └── components/
│           ├── Backorders.jsx        # Main backorder tracker UI
│           └── CatalogAudit.jsx      # AI audit and restock suggestions UI
├── .env.example          # Environment variable template
└── tca.db                # SQLite database (auto-created on first run)
```

## Data Model

```
backorder_orders          backorder_items
─────────────────         ────────────────────
id                        id
client                    order_id (foreign key)
ordered_date              product_name
status                    sku
notes                     category
created_at                quantity_needed
resolved_at
```

One order → many items (one-to-many relationship)

## Getting Started

### Prerequisites
- Node.js
- An Anthropic API key (for AI features)

### Installation

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/tca-backorder-tracker.git
cd tca-backorder-tracker

# Install backend dependencies
npm install

# Install frontend dependencies
cd client && npm install && cd ..

# Set up environment variables
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
```

### Running the App

**Terminal 1 — Backend:**
```bash
npm run dev
```

**Terminal 2 — Frontend:**
```bash
npm run client
```

Open [http://localhost:3000](http://localhost:3000)

### CSV Import Format

To bulk import backorders from Excel, export as CSV with these columns:

```
client, ordered_date, product_name, sku, category, quantity_needed, notes
```

- `ordered_date` format: `YYYY-MM-DD`
- Rows with the same `client` + `ordered_date` are grouped into one order
- Only `product_name` is required

## AI Integration

The Claude API is used for two workflows:

**1. Backorder Audit**
Sends all open backorders to Claude with instructions to identify overdue items, missing information, supplier patterns, and prioritization. Returns a structured JSON response with a health score, critical issues, warnings, and recommendations.

**2. Restock Suggestions**
Sends full backorder history (open and resolved) to Claude and asks it to recommend which items to proactively reorder, suggested quantities, and priority level based on frequency and wait times.

Both prompts are engineered to return consistent JSON that the frontend parses and displays directly.
