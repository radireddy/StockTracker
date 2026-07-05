# StockTracker — A Research-to-Allocation Operating System for the Serious Indian Equity Investor

## The problem this solves

If you have been running a concentrated portfolio of Indian companies for years, you already know the real work of investing isn't buying — it's *tracking*. You built a thesis on a company two years ago. You update it every quarter after the earnings call. You have a buy price in your head, a bull/base/bear model in a spreadsheet, a conviction level that shifts with each result, and a nagging sense that you're either over-exposed to your favourite idea or under-deployed on your highest-conviction bet.

The pain isn't a lack of data. It's that the data lives in **fifteen different places**: an Excel valuation model per company, a Notes app for the thesis, a WhatsApp forward with management guidance, a broker statement for actual holdings, and a mental math exercise every time fresh cash arrives about *where* it should go.

StockTracker collapses all of that into one place: **thesis, quarterly timeline, financial projections, bull/base/bare valuation, live margin of safety, and a conviction-driven allocation engine** — for both the companies you own and the ones you're only watching.

---

## Who it's for — the personas

**1. The Concentrated Long-Term Investor (the primary persona — you)**
Runs 20–40 names, holds for 3–5 years, sizes positions by conviction. Needs the thesis, the model, and the allocation discipline in one system. Uses star ratings as the backbone of position sizing.

**2. The Quarterly Tracker / Analyst**
Lives and dies by the earnings-call cadence. Every quarter, updates the timeline, revises FY estimates, checks whether the base-case IRR still holds. Needs a chronological record so that "what did management guide last quarter?" is one click, not one hour of scrolling old notes.

**3. The Watchlist Hunter**
Has a pipeline of 30–50 companies he'd *love* to own — but only at the right price. Doesn't own them yet. Needs a BUY signal the moment CMP crosses his target buy price, without checking prices daily.

**4. The Multi-Account Household Manager**
Holds the same stocks across a personal Zerodha account, a spouse's demat, and an HUF. Needs a *consolidated* view (true total position, cost-weighted average) but also the ability to drill into a single account.

**5. The Rebalancer / Capital Deployer**
Gets a bonus, a dividend, or a maturing FD. Has ₹5 lakh to deploy. Needs to know — objectively, not emotionally — *which* holdings are below their target weight and exactly how much to add.

**6. The Research-Service Subscriber — trapped with dead numbers on a page**
You pay good money for a recommendation and research service. Every report lands as a **PDF or an image**: a target price, a margin of safety, a neat bull/base/bear table. It looks authoritative — until you ask the obvious question: *based on what price?* The numbers were frozen the instant they were published. The stock has moved 15% since. Your "target price" and "MoS" are quietly lying to you, and there's no way to tell from a picture whether a name is now over-allocated, under-allocated, in buying range, or already past it.

You've caught yourself squinting at a three-month-old screenshot, doing mental arithmetic to guess whether the margin of safety is still positive. You've wondered: *why can't these numbers be alive?* Why can't the target price, the MoS, the bull/base/bare IRRs **recalculate the moment the market moves?* Why can't my star rating and allocation bands **auto-align to what my portfolio is actually worth today**, and tell me — in rupees — exactly where the next investment should go?

**That is precisely what StockTracker was built to do.** It takes the static wisdom of a research report and makes it *breathe with the market*: every valuation is a live formula, not a dead pixel. Your buy price, margin of safety, and scenario IRRs recompute against the current price automatically. Your conviction-based allocation bands measure themselves against your live portfolio value and flag every position that's out of line. **Stop reading yesterday's numbers. Start acting on today's.** This is the tool you've been waiting for.

---

These aren't six different people. They're six hats the same investor wears in a single week — and the product is built so each hat has a dedicated screen.

## The core mental model: two portfolio types

Everything hangs off one distinction that mirrors how you actually think:

- **Holdings portfolio** — companies you own. Real quantity, real average cost, real P&L, allocation tracking.
- **Watchlist portfolio** — companies you're researching to potentially buy. Same full research depth (thesis, model, valuation, timeline) but **no position data** — just a target and a signal.

Crucially, the *research* is identical across both. A watchlist company already has its complete thesis and valuation model built up, so when the price finally comes to you, moving it into your holdings is one action (`Move to Holdings`) and you already own the conviction. You don't scramble to "figure out if it's a buy" in the heat of a crash — the homework is already done.

---

## Getting your portfolio in — import from Zerodha

You don't build the holdings portfolio by hand, stock by stock. **Import your Zerodha holdings statement and the entire portfolio populates itself.** The import reads your actual positions — quantity, average buy price, and ISIN for every stock — **auto-creates the company records** for names you don't have yet, and files each position under the right **demat account** (detected from the statement, so a re-import cleanly refreshes that account rather than duplicating it).

The moment those positions land, the whole system comes alive: your **P&L, margin of safety, IRRs, and — most importantly — your allocation weights** are all computed off the real quantities and cost from your broker. In other words, the Zerodha import is what turns a pile of research into a *live allocation portfolio* you can actually rebalance. Hold across several accounts? Import each one — the dashboard consolidates them into a true total position while still letting you drill into any single account. Manual entry is always there as a fallback or for a name held outside Zerodha.

---

## Feature-by-feature: how you actually track a company

### 1. The Company Detail page — your entire research file for one name

Every company opens to a tabbed workspace. The header, always visible, is your at-a-glance verdict:

- **Current Price (CMP)** and **Market Cap** (live)
- **Target Buy Price** — either your manual override *or*, if you leave it blank, the buy price computed from your base-case model
- **Margin of Safety (MoS%)** — `(buy price − current price) / buy price`, colour-coded: green when you have a margin, yellow when it's thin (0 to −10%), red when the stock is expensive (below −10%)
- **A green "BUY" badge** the instant CMP ≤ your target buy price
- **Star rating (1–4)** — your conviction, front and centre
- **Base-case IRR** — recomputed *live* off current market cap, so it stays honest as the price moves
- **Strategy** (Core / Satellite) and **Horizon** (auto-derived from how many estimate years your model runs)

Then the tabs:

### 2. Thesis tab — the "why I own this"
A full rich-text editor. This is where the 30-year investor writes the actual argument: the moat, the management, the reinvestment runway, the risks. It's the document you re-read before averaging down at the bottom, when your conviction is being tested.

### 3. Projections & Valuations tab — the model, finally out of Excel

This is the heart of the system and where it earns its keep against a spreadsheet.

**Financial projections grid** — a spreadsheet-style table, one column per year (FY25, FY26E, FY27E…), where you enter the *drivers* and the app computes the rest in the same cascade your Excel model does:

- You input: Revenue, EBITDA margin %, depreciation, finance cost, other income, tax %
- It computes: EBITDA, PBT, **PAT**, PAT margin, and every growth % — plus **forward PE and PEG** off live market cap

You're not re-typing formulas per company anymore. The engine supports **two valuation frameworks** — **PE/Earnings** and **EV/EBITDA** (the latter adds net debt, lease liability, EV/EBITDA ratio for leveraged or capital-heavy businesses) — and you can keep **multiple models per company** (e.g., a PE model and an EV/EBITDA cross-check), marking one as default.

**Bull / Base / Bare valuation scenarios** — the three-case discipline, built in. For each case you enter the lever that matters (target PE, or target EV/EBITDA), and the engine derives:

- **Target Market Cap** (target multiple × terminal-year earnings)
- **IRR** — `(target MC / current MC)^(1/horizon) − 1`, your expected annualised return
- **Buying Market Cap & Buy Price** — the price you'd need to pay *today* to earn your required return — i.e., it back-solves your buy target from your return hurdle

That last point is the quiet killer feature: your **buy price is not a gut number, it's an output of your model and your required return.** Change your growth assumption after a bad quarter, and your buy target — and therefore your MoS and BUY signal — update automatically. A **Forward PEG** summary (trailing PE ÷ earnings CAGR) sits on top as a sanity check on whether growth justifies the multiple.

### 4. Timeline tab — quarterly tracking as a living record

This directly attacks the "where did I write that down?" problem. Each entry is a dated, labelled (`Q1FY26`, `Annual Report`, `Concall`) rich-text note that goes beyond plain text — you can **embed images** (a chart, a screenshot of a key slide), **attach PDFs** (the concall transcript, the investor presentation, the annual report), and **drop in URLs** (a news article, a filing, a management interview). Everything about a quarter's story lives in the one entry. Entries display newest-first, paginated. Over years, this becomes the **institutional memory of your thesis**: every quarter's result, every guidance revision, every management promise and whether they kept it — with the source material attached, not just remembered. When you're deciding whether to add or trim, you scroll one company's timeline and see the entire arc of execution in two minutes.

### 5. Holdings tab (owned companies only)
Your actual position, **broken out per demat account** and consolidated with a cost-weighted average. Import a Zerodha statement or add manually. This is the bridge from research to reality.

### 6. Highlights tab
A short rich-text scratchpad for the handful of things that truly matter on this name — the TL;DR of your thesis. Use it for the **top points to track** each quarter (the metric, the trigger, the risk you're watching), the **points that assure your conviction** (the reasons you'd hold through a drawdown), and **anything you want surfaced in the consolidated dashboard** so it's one glance away, not buried three tabs deep. It's the two or three things that would make you buy more — or sell.

---

## The Dashboard — your morning 60-second scan

The dashboard is where the quarterly tracker and the concentrated investor start their day. It consolidates every holding across every account (or filters to one account) and gives you two things a spreadsheet can't:

**A Portfolio P&L bar** — total Invested, total Current value, absolute and % P&L, at the top.

**A sortable, filterable companies table** where each row is a company and the columns are exactly the decision-relevant metrics:

| Qty | Avg Buy | CMP | Cost | Cur. Value | P&L% | P&L₹ | Target Buy | **MoS%** | **Base Case IRR** | **Bare Case IRR** |

You can filter by **star rating**, by **Core/Satellite strategy**, and search by name/symbol. Sort by MoS to see what's cheapest against your target, or by IRR to see where the forward return is richest.

For a **watchlist** portfolio, the table swaps position columns for a **"Signal" column** — a green **BUY** badge on every name currently trading at or below your target. This is the hunter's screen: one glance tells you which of your 40 researched-but-unowned companies just came into buying range, no daily price-checking required.

The key insight: **the dashboard shows model-derived metrics (MoS, IRR) alongside market data (P&L)** — so you're never looking at price without also seeing what your own homework says the stock is worth.

---

## The Allocation screen — the feature that answers "where does the next rupee go?"

This is the differentiator, and it's built precisely around the incremental-capital decision that every experienced investor faces and most spreadsheets handle badly.

The philosophy: **conviction should drive position size, expressed as a target weight band per star rating.** The app ships with sensible defaults you can edit in Settings:

- **4★ (highest conviction): 6–8%** of portfolio
- **3★: 4–6%**
- **2★: 2–4%**
- **1★: 0–2%**

These are just the starting defaults — **you set your own bands per star rating in Settings.** Run a tighter book of high-conviction names? Push 4★ to 10–12%. Prefer a flatter, more diversified spread? Compress the ranges. The allocation engine then measures every position against *your* rules, not someone else's.

Switch the dashboard to **Allocation view** and every holding is shown against its target band:

- **Invested %** and **Current %** — your weight at cost and at market value (toggle the basis)
- **A visual RangeBar** per stock — a bar showing where your actual weight sits inside (or outside) the grey target band. Green = in range, rose = under-allocated, red = over-allocated
- **A Status label** — Over / In Range / Under — and an **Allocation Status filter** so you can show *only* the under-allocated names in one click
- **A Delta column with a rupee-precise instruction**: hover and it tells you, in actual money, *"Invest ₹X to ₹Y more to reach target"* or *"Reduce ₹X to ₹Y."*

An **Allocation Summary bar** rolls this up by star group so you can see at the portfolio level: are my 4-star convictions actually getting 6–8% each, or has a laggard 2-star quietly bloated to 5% while my best idea sits at 3%?

### How this changes the incremental-investment decision

Old way: bonus arrives, you buy "the one that feels cheap" or the one in the news. Emotional, unsystematic, and it slowly decouples your portfolio from your conviction.

StockTracker way, in order:
1. Open Allocation view, filter to **Under-allocated**.
2. Among under-allocated names, sort by **MoS%** or **Base-case IRR** — so you're funding the position that is both *below its conviction-warranted weight* **and** *cheapest against your target / highest forward return*.
3. The **Delta** column tells you exactly how many rupees bring it into band.
4. Deploy. Your portfolio drifts *toward* your conviction structure with every capital injection, not away from it.

That is the entire loop the product is built to enforce: **research sets conviction → conviction sets a star rating → the star rating sets a target weight → the allocation engine tells you the rupee gap → you fill the gap with the cheapest under-weight, highest-IRR name.** Discipline, made mechanical.

---

## Why use it — the honest case

- **One source of truth.** Thesis, model, quarterly history, holdings, and valuation for a company live on one page — not across Excel, Notes, and your broker.
- **Your buy price is a model output, not a guess.** It falls out of your required return and your estimates, and it updates the moment you revise a number after results.
- **Live margin of safety and BUY signals** mean you don't watch prices — the system watches them against *your* targets and flags the moment to act.
- **Bull/base/bare is enforced structure**, not a habit you have to remember.
- **The timeline turns quarterly tracking into compounding memory** instead of scattered notes.
- **Allocation is conviction-anchored and rupee-precise**, so incremental capital and rebalancing become objective decisions.
- **Watchlist has the same depth as holdings**, so you're never caught unprepared when a name finally gets cheap.
- **Multi-account consolidation** gives a true household position without losing per-account detail.
- **Nothing is a dead number on a page.** Unlike a research PDF, every valuation, MoS, and IRR recalculates against the live price — so what you see today is true today.

---

## A day-in-the-life

- **Earnings season:** Company reports Q1FY26. You open its Timeline, paste your concall notes. Flip to Projections, bump FY26E revenue growth down 200bps. Your PAT, forward PE, base-case IRR, and target buy price all recompute. MoS on the dashboard updates. Nothing else to touch.
- **Fresh cash:** ₹5L to deploy. Allocation view → filter Under-allocated → sort by IRR. Your 4-star that's sitting at 4% (target 6–8%) with a 22% base IRR tops the list. Delta says "Invest ₹1.8L to ₹3.4L more." You add ₹3L. Done in ninety seconds, fully consistent with your conviction map.
- **A watchlist name crashes 15%:** You didn't notice — but the dashboard did. A green BUY badge is now on it, MoS is +12%. Your thesis and model, written six months ago, are right there. You buy, then `Move to Holdings`. No panic research.
