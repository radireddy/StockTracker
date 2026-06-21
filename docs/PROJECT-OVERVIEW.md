# StockTracker — Project Overview

**StockTracker** is a SaaS web application that converts a personal Excel-based stock tracking system (tracking 31 Indian companies) into a full-featured web app. It's designed as a personal investment research and portfolio management tool, architected from day one for multi-tenant SaaS scale.

## What It Does

The app lets an investor manage their entire equity research workflow in one place:

- **Dashboard** — A dense, sortable/filterable data table of all tracked companies with color-coded buy signals, margin of safety, returns, and star ratings
- **Company Profiles** — Detailed pages per company with tabs for thesis, financials, valuation, and timeline
- **Financial Modeling** — Spreadsheet-like editor for multi-year P&L projections (Revenue, EBITDA, PAT, PE, PEG, etc.)
- **Valuation Scenarios** — Bull/Base/Bare case analysis with target PE, market cap, IRR, and buy price
- **Investment Thesis & Highlights** — Rich text editor (Tiptap) for writing and maintaining research notes
- **Quarterly Timeline** — Journal of earnings updates and management commentary
- **Excel Import** — One-time import tool to seed the database from the existing spreadsheet
- **Optional Modules** — Segment-wise SOTP valuation, market perception vs own view analysis

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) + React 19 + TypeScript |
| Database | Supabase PostgreSQL with Row Level Security |
| Auth | Google OAuth via Supabase Auth |
| UI | shadcn/ui + Tailwind CSS v4 |
| Charts | Recharts |
| Rich Text | Tiptap |
| Hosting | Vercel |

## Requirements

### Phase 1 — MVP (Current)

1. Google OAuth authentication
2. Dashboard with sortable, filterable, color-coded company table
3. Company CRUD (create, edit, delete)
4. Multi-year financial model editor with auto-calculations
5. Valuation scenarios (bull/base/bare) with IRR, target PE, buy price
6. Investment thesis & highlights (rich text)
7. Quarterly timeline journal
8. Excel import tool (parse existing spreadsheet)
9. Segment valuations & market perceptions (optional per company)
10. Multi-portfolio support
11. Computed fields: Margin of Safety, IRR, Forward PEG, Current PE, CAGR PAT Growth, Buy Signal
12. RLS-based tenant isolation on all tables
13. Projection models with strategy pattern (PE/Earnings, EV/EBITDA)

### Phase 2 — Enhanced (Planned)

14. Auto-fetch live stock prices (NSE/BSE), with cron-based refresh
15. Price alerts & email notifications
16. Charts (revenue/PAT trends, PE band, scenario comparison)
17. Sensitivity analysis with slider-based adjustments
18. Dark mode, mobile refinements

### Phase 3 — Multi-User SaaS (Future)

19. Public sign-up + onboarding
20. Freemium model (5 companies free, unlimited paid)
21. Stripe/Razorpay billing
22. Shareable thesis

### Phase 4 — Growth (Future)

23. Community features (public portfolios, follow investors)
24. AI-assisted thesis from concall transcripts
25. API access for power users

## Current State

The app has active development with recent commits adding projection model support (strategy pattern with PE/Earnings and EV/EBITDA strategies), combined projections UI, and dashboard updates. Price refresh infrastructure (cron route, Twelve Data provider) is scaffolded. The core MVP features are largely built out.
