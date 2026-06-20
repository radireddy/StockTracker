# StockTracker SaaS — Design Document

## Overview

Convert an Excel-based stock tracking system (31 Indian companies with financial models, valuation scenarios, investment thesis, quarterly timelines) into a Next.js SaaS application. Start as a personal tool, architect for multi-tenant scale.

## Source Data Structure

The Excel has 32 sheets:
- **"All Companies"** — Consolidated dashboard: company name, star rating (2-4), strategy (core/satellite), buy price, current price, base/bare case returns, margin of safety, forward PEG, FY26 PEG, buy signal, highlights
- **31 company sheets** — Each contains:
  - Header: NSE symbol, market cap, number of years (investment horizon), star rating, strategy, base/bare case returns, current price, buy price
  - Investment thesis (rich text, multi-paragraph)
  - Financial model: Multi-year P&L (FY24-FY28/29) with Revenue, Revenue growth %, EBITDA, EBITDA margins %, Depreciation, Finance cost, Other income, Exceptional items, PBT, Tax %, PAT, PAT growth %, PAT margins %, PE, PEG
  - Valuation scenarios: Bull/Base/Bare with target PE, target market cap, IRR, buying market cap, buy price
  - Computed fields: Current PE, CAGR PAT growth, Forward PEG, Expected returns
  - Highlights (rich text bullets)
  - Timeline: Quarterly earnings updates with management commentary
  - Optional: Market perception vs own view (Samhi), Segment-wise SOTP valuation (JM Financial), Dividend projections

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 15 (App Router) | Server Components, Server Actions, API routes |
| UI | React 19 + shadcn/ui + Tailwind CSS v4 | Fast, polished, customizable |
| Auth | Supabase Auth (Google OAuth) | Managed auth, extensible to email/password later |
| Database | Supabase PostgreSQL + RLS | Multi-tenant isolation from day one |
| Charts | Recharts | Lightweight, React-native charting |
| Rich Text | Tiptap | Extensible, headless rich text editor |
| Deployment | Vercel | Native Next.js hosting |
| State | React Server Components + SWR for client | Minimal client state |

## Architecture

```
Browser
  │
  ├── Next.js App Router (Vercel)
  │     ├── Server Components (data fetching)
  │     ├── Server Actions (mutations)
  │     └── API Routes (future: webhooks, cron)
  │
  └── Supabase
        ├── Auth (Google OAuth → extensible)
        ├── PostgreSQL + Row Level Security
        ├── Realtime (Phase 2: live price updates)
        └── Storage (Phase 3: file attachments)
```

## Data Model

### Core Tables

```sql
-- Managed by Supabase Auth
-- auth.users (id, email, created_at, ...)

-- User profile extension
profiles (
  id UUID PK DEFAULT auth.uid(),
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  plan TEXT DEFAULT 'free', -- free | basic | pro | premium
  plan_limits JSONB DEFAULT '{"max_companies": 50, "max_portfolios": 5, "alerts_enabled": true}',
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Portfolio grouping
portfolios (
  id UUID PK DEFAULT gen_random_uuid(),
  user_id UUID FK → auth.users NOT NULL,
  name TEXT NOT NULL, -- e.g., "SOIC Flexicap", "Microcap Picks"
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Company within a portfolio
companies (
  id UUID PK DEFAULT gen_random_uuid(),
  portfolio_id UUID FK → portfolios NOT NULL,
  user_id UUID FK → auth.users NOT NULL, -- denormalized for RLS
  name TEXT NOT NULL,
  symbol TEXT, -- e.g., "NSE:SAMHI"
  sector TEXT,
  market_cap NUMERIC,
  current_price NUMERIC,
  buy_price NUMERIC,
  star_rating INTEGER CHECK (1-5),
  strategy TEXT CHECK ('core', 'satellite'),
  investment_horizon_years NUMERIC,
  expected_returns NUMERIC, -- e.g., 0.25 for 25%
  thesis TEXT, -- rich text (HTML from Tiptap)
  highlights TEXT, -- rich text
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Financial model rows (one per year per company)
financial_years (
  id UUID PK DEFAULT gen_random_uuid(),
  company_id UUID FK → companies NOT NULL,
  user_id UUID FK → auth.users NOT NULL,
  year TEXT NOT NULL, -- "FY24", "FY25", "FY26E", "FY27E"
  is_estimate BOOLEAN DEFAULT false,
  revenue NUMERIC,
  revenue_growth_pct NUMERIC,
  ebitda NUMERIC,
  ebitda_margin_pct NUMERIC,
  ebitda_growth_pct NUMERIC,
  depreciation NUMERIC,
  finance_cost NUMERIC,
  other_income NUMERIC,
  exceptional_items NUMERIC,
  pbt NUMERIC,
  tax_pct NUMERIC,
  pat NUMERIC,
  pat_growth_pct NUMERIC,
  pat_margin_pct NUMERIC,
  minority_interest NUMERIC,
  pat_for_shareholders NUMERIC,
  pe NUMERIC,
  peg NUMERIC,
  sort_order INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Valuation scenarios (bull/base/bare per company)
valuation_scenarios (
  id UUID PK DEFAULT gen_random_uuid(),
  company_id UUID FK → companies NOT NULL,
  user_id UUID FK → auth.users NOT NULL,
  scenario_type TEXT CHECK ('bull', 'base', 'bare') NOT NULL,
  target_pe NUMERIC,
  target_market_cap NUMERIC,
  irr NUMERIC,
  buying_market_cap NUMERIC,
  buy_price NUMERIC,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Quarterly timeline entries
timeline_entries (
  id UUID PK DEFAULT gen_random_uuid(),
  company_id UUID FK → companies NOT NULL,
  user_id UUID FK → auth.users NOT NULL,
  quarter TEXT, -- "Q1FY26", "Q2FY26"
  entry_date DATE,
  content TEXT NOT NULL, -- rich text
  sort_order INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Segment valuations (SOTP analysis, e.g., JM Financial)
segment_valuations (
  id UUID PK DEFAULT gen_random_uuid(),
  company_id UUID FK → companies NOT NULL,
  user_id UUID FK → auth.users NOT NULL,
  segment_name TEXT NOT NULL,
  management_signal TEXT,
  metrics TEXT,
  multiple TEXT,
  estimated_value NUMERIC,
  sort_order INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Market perceptions (e.g., Samhi Hotels pattern)
market_perceptions (
  id UUID PK DEFAULT gen_random_uuid(),
  company_id UUID FK → companies NOT NULL,
  user_id UUID FK → auth.users NOT NULL,
  perception TEXT NOT NULL,
  own_view TEXT NOT NULL,
  sort_order INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Price alerts (Phase 2)
alerts (
  id UUID PK DEFAULT gen_random_uuid(),
  user_id UUID FK → auth.users NOT NULL,
  company_id UUID FK → companies NOT NULL,
  alert_type TEXT CHECK ('price_below', 'price_above', 'margin_of_safety', 'custom'),
  threshold NUMERIC,
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
```

### Row Level Security

Every table enforced with:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access own data"
  ON <table> FOR ALL
  USING (auth.uid() = user_id);
```

### Computed Fields (Application Layer)

These are calculated in Server Components / utility functions, not stored:
- **Margin of Safety** = `(buy_price - current_price) / buy_price`
- **IRR** = `(target_mcap / buying_mcap) ^ (1/years) - 1`
- **Forward PEG** = `current_pe / cagr_pat_growth`
- **Current PE** = `market_cap / latest_pat`
- **CAGR PAT Growth** = `(future_pat / base_pat) ^ (1/years) - 1`
- **Buy Signal** = `current_price <= buy_price`

## Pages & Routes

```
/                          → Dashboard (All Companies table)
/login                     → Google OAuth login
/portfolio/[id]            → Portfolio-specific dashboard
/company/[id]              → Company detail page
/company/[id]/thesis       → Investment thesis tab
/company/[id]/model        → Financial model tab (spreadsheet-like editor)
/company/[id]/valuation    → Valuation scenarios tab
/company/[id]/timeline     → Quarterly updates timeline
/company/[id]/segments     → SOTP / Segment analysis (optional)
/company/new               → Add new company form
/alerts                    → Alerts management (Phase 2)
/settings                  → Profile, portfolio management, plan
/import                    → Excel import tool (one-time)
```

## UI Design

### Dashboard (Dense, data-table style)
- Full-width sortable/filterable table matching "All Companies" sheet
- Columns: Name, Star, Strategy, Buy Price, Current Price, Base Returns, Bare Returns, Margin of Safety, Fwd PEG, Buy Signal, Highlights (truncated)
- Color coding: Green (in buy zone / positive MoS), Red (overvalued / negative MoS), Yellow (near buy price)
- Quick filters: By star rating, strategy, buy signal
- Search by company name/symbol
- Click row → navigate to company detail

### Company Detail (Clean, card-based layout)
- Header card: Company name, symbol, star rating (stars), strategy badge, current price, buy price, margin of safety indicator
- Tab navigation: Thesis | Financial Model | Valuation | Timeline | Segments
- Each tab is a clean, focused view

### Financial Model (Spreadsheet-like)
- Editable table with year columns (FY24, FY25, FY26E, etc.)
- Row labels match Excel: Revenue, Revenue Growth %, EBITDA, EBITDA Margins %, etc.
- Inline editing with auto-save
- Growth rates and margins auto-calculated on input
- Visual indicators for estimate years (E suffix)

### Valuation Scenarios
- Three cards: Bull (green), Base (blue), Bare (orange)
- Each showing: Target PE, Target Market Cap, IRR, Buying Market Cap, Buy Price
- Bar chart comparing current price vs three scenario buy prices

### Timeline
- Reverse-chronological feed of quarterly updates
- Rich text content with Tiptap editor for new entries
- Quarter label (Q1FY26) + date + content

## Security

- **Auth**: Supabase Google OAuth (PKCE flow handled by Supabase SDK). No raw OAuth implementation.
- **Tenant isolation**: RLS on all tables with `auth.uid() = user_id`. Service role key never exposed to client.
- **Client-side**: Only Supabase anon key (public). All mutations via Next.js Server Actions that verify session.
- **IDs**: UUIDs everywhere. No sequential/enumerable identifiers.
- **Session**: Managed by Supabase Auth with httpOnly cookies. Session refresh handled automatically.
- **CSRF**: Server Actions use built-in Next.js CSRF protection.
- **Input sanitization**: Rich text HTML sanitized server-side before storage (DOMPurify).

## Phased Rollout

### Phase 1 — MVP (Personal Use)
- Google OAuth login
- Dashboard with all companies view (sortable, filterable, color-coded)
- Company CRUD: create, edit, delete companies
- Financial model editor with auto-calculations
- Valuation scenarios (bull/base/bare)
- Thesis & highlights (rich text via Tiptap)
- Timeline / quarterly journal
- Excel import tool (parse existing spreadsheet, seed database)
- Segment valuations & market perceptions (optional per company)
- Deploy to Vercel + Supabase free tier

### Phase 2 — Enhanced
- Auto-fetch live prices from NSE/BSE APIs (manual override preserved)
- Price alerts & email notifications
- Charts: Revenue/PAT trends, PE band, scenario comparison
- Sensitivity analysis: slider-based PE/growth adjustments
- Dark mode
- Mobile-responsive refinements

### Phase 3 — Multi-User SaaS
- Public sign-up, onboarding flow
- Freemium: 5 companies free, unlimited paid
- Stripe/Razorpay billing
- Share thesis publicly or with specific users
- Auto-fetch historical financials from BSE/screener APIs

### Phase 4 — Growth
- Community: public portfolios, follow investors
- AI-assisted thesis from concall transcripts
- Company search & data prefill
- API access for power users

## Monetization (Extensible)

`profiles.plan` + `profiles.plan_limits` JSONB pattern:
- Feature gating via `canAccess(user, feature)` helper
- Plan tiers: free → basic → pro → premium
- Limits enforced server-side in Server Actions
- Billing integration slot ready (Stripe/Razorpay) but not implemented in Phase 1
