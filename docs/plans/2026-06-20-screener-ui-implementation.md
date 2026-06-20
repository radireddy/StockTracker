# Screener-Style UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign StockTracker's company detail page and dashboard to match screener.in's data-dense, vertical-scroll, flat design aesthetic.

**Architecture:** Replace the tabbed company detail page with a single vertical-scroll page using IntersectionObserver-based sticky section nav. Rebuild the dashboard table for density. Remove Card wrappers throughout and use thin border separators. Keep all existing data logic, server actions, and Tiptap editors untouched.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v4, shadcn/ui primitives (Table, Input, Button, Badge), Tiptap rich text, existing Supabase data layer.

---

### Task 1: Create SectionNav Component

**Files:**
- Create: `src/components/company/section-nav.tsx`

**Step 1: Create the sticky section nav client component**

This component renders a horizontal nav bar that sticks below the app header. It highlights the active section based on scroll position using IntersectionObserver.

```tsx
"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "thesis", label: "Thesis" },
  { id: "financials", label: "Financials" },
  { id: "valuation", label: "Valuation" },
  { id: "timeline", label: "Timeline" },
  { id: "highlights", label: "Highlights" },
  { id: "details", label: "Details" },
] as const;

export function SectionNav() {
  const [active, setActive] = useState<string>("thesis");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );

    for (const section of SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav className="sticky top-14 z-40 bg-background/95 backdrop-blur-sm border-b">
      <div className="flex gap-0 overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              active === s.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
```

**Step 2: Verify it compiles**

Run: `npx next build --no-lint 2>&1 | head -20` (just check for TS errors on this file)

**Step 3: Commit**

```bash
git add src/components/company/section-nav.tsx
git commit -m "feat: add SectionNav component for scroll-based navigation"
```

---

### Task 2: Rebuild Company Header as Metrics Bar

**Files:**
- Modify: `src/components/company/company-header.tsx` (replace entirely)

**Step 1: Rewrite CompanyHeader**

Replace the Card-based header with a flat header bar + metrics grid. The component needs access to valuation scenarios for IRR display.

```tsx
import { Badge } from "@/components/ui/badge";
import { marginOfSafety, isBuySignal } from "@/lib/utils/calculations";
import { DeleteCompanyButton } from "@/components/dashboard/delete-company-dialogs";
import type { Company, ValuationScenario } from "@/types/database";
import Link from "next/link";
import { Pencil } from "lucide-react";

function fmtPrice(val: number | null): string {
  if (val == null) return "-";
  return `₹${val.toLocaleString("en-IN")}`;
}

function fmtPct(val: number | null): string {
  if (val == null) return "-";
  return `${(val * 100).toFixed(1)}%`;
}

function MetricItem({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-base font-semibold tabular-nums ${className ?? ""}`}>{value}</span>
    </div>
  );
}

export function CompanyHeader({
  company,
  scenarios,
}: {
  company: Company;
  scenarios: ValuationScenario[];
}) {
  const mos =
    company.buy_price && company.current_price
      ? marginOfSafety(company.buy_price, company.current_price)
      : null;
  const buy = isBuySignal(company.current_price, company.buy_price);

  const getIRR = (type: string) => {
    const s = scenarios.find((v) => v.scenario_type === type);
    return s?.irr ?? null;
  };

  const mosColor = mos != null ? (mos > 0 ? "text-green-600" : mos < -0.1 ? "text-red-600" : "text-yellow-600") : "";

  return (
    <div className="space-y-4">
      {/* Name bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{company.name}</h1>
          {company.symbol && (
            <span className="text-sm text-muted-foreground">{company.symbol}</span>
          )}
          {buy && <Badge className="bg-green-600 text-white text-[10px] px-1.5 py-0">BUY</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <DeleteCompanyButton companyId={company.id} companyName={company.name} />
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-x-6 gap-y-3 py-3 border-y border-border/50">
        <MetricItem label="Market Cap" value={company.market_cap != null ? `₹${company.market_cap.toLocaleString("en-IN")} Cr` : "-"} />
        <MetricItem label="Current Price" value={fmtPrice(company.current_price)} />
        <MetricItem label="Buy Price" value={fmtPrice(company.buy_price)} />
        <MetricItem label="MoS" value={mos != null ? `${(mos * 100).toFixed(1)}%` : "-"} className={mosColor} />
        <MetricItem label="Star Rating" value={company.star_rating ? "★".repeat(company.star_rating) : "-"} />
        <MetricItem label="Strategy" value={company.strategy ?? "-"} />
        <MetricItem label="Horizon" value={company.investment_horizon_years ? `${company.investment_horizon_years}y` : "-"} />
        <MetricItem label="Base IRR" value={fmtPct(getIRR("base"))} className={getIRR("base") != null && getIRR("base")! > 0 ? "text-green-600" : ""} />
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles (will fail until Task 3 updates the page to pass scenarios)**

**Step 3: Commit**

```bash
git add src/components/company/company-header.tsx
git commit -m "feat: rebuild CompanyHeader as flat metrics bar"
```

---

### Task 3: Rebuild Company Detail Page (Tabs → Vertical Scroll)

**Files:**
- Modify: `src/app/(authenticated)/company/[id]/page.tsx` (replace entirely)

**Step 1: Rewrite the company detail page**

Replace the Tabs-based layout with a vertical scroll layout using section IDs and the new SectionNav.

```tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CompanyHeader } from "@/components/company/company-header";
import { SectionNav } from "@/components/company/section-nav";
import { ThesisTab } from "@/components/company/thesis-tab";
import { FinancialModelTab } from "@/components/company/financial-model-tab";
import { ValuationTab } from "@/components/company/valuation-tab";
import { TimelineTab } from "@/components/company/timeline-tab";
import { EditCompanyTab } from "@/components/company/edit-company-tab";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company, error } = await supabase
    .from("companies")
    .select(`
      *,
      valuation_scenarios(*),
      financial_years(*),
      timeline_entries(*),
      segment_valuations(*),
      market_perceptions(*)
    `)
    .eq("id", id)
    .single();

  if (error || !company) notFound();

  const financialYears = (company.financial_years ?? []).sort(
    (a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const timelineEntries = (company.timeline_entries ?? []).sort(
    (a: { sort_order: number }, b: { sort_order: number }) => (b.sort_order ?? 0) - (a.sort_order ?? 0)
  );

  return (
    <div className="max-w-6xl mx-auto">
      <CompanyHeader company={company} scenarios={company.valuation_scenarios ?? []} />
      <SectionNav />

      <div className="space-y-12 py-6">
        {/* Thesis Section */}
        <section id="thesis" className="scroll-mt-28">
          <h2 className="text-base font-medium border-b border-border/50 pb-2 mb-4">
            Investment Thesis
          </h2>
          <ThesisTab company={company} />
        </section>

        {/* Financial Model Section */}
        <section id="financials" className="scroll-mt-28">
          <FinancialModelTab
            companyId={company.id}
            financialYears={financialYears}
          />
        </section>

        {/* Valuation Section */}
        <section id="valuation" className="scroll-mt-28">
          <h2 className="text-base font-medium border-b border-border/50 pb-2 mb-4">
            Valuation Scenarios
          </h2>
          <ValuationTab
            companyId={company.id}
            scenarios={company.valuation_scenarios ?? []}
            currentPrice={company.current_price}
            marketCap={company.market_cap}
            expectedReturns={company.expected_returns}
            horizonYears={company.investment_horizon_years}
            financialYears={financialYears}
          />
        </section>

        {/* Timeline Section */}
        <section id="timeline" className="scroll-mt-28">
          <h2 className="text-base font-medium border-b border-border/50 pb-2 mb-4">
            Timeline
          </h2>
          <TimelineTab
            companyId={company.id}
            entries={timelineEntries}
          />
        </section>

        {/* Highlights Section */}
        <section id="highlights" className="scroll-mt-28">
          <h2 className="text-base font-medium border-b border-border/50 pb-2 mb-4">
            Highlights
          </h2>
          <HighlightsSection company={company} />
        </section>

        {/* Details/Edit Section */}
        <section id="details" className="scroll-mt-28">
          <h2 className="text-base font-medium border-b border-border/50 pb-2 mb-4">
            Company Details
          </h2>
          <EditCompanyTab company={company} />
        </section>
      </div>
    </div>
  );
}

// Highlights was part of ThesisTab. Now it's a standalone section.
// We create a minimal client component inline for this.
import { HighlightsSection } from "@/components/company/highlights-section";
```

**Step 2: Create the HighlightsSection component**

Since Thesis and Highlights were in the same tab, we need to split Highlights into its own component.

Create `src/components/company/highlights-section.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { updateCompany } from "@/app/(authenticated)/actions/company-actions";
import type { Company } from "@/types/database";

export function HighlightsSection({ company }: { company: Company }) {
  const [saving, setSaving] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Key highlights..." }),
    ],
    content: company.highlights ?? "",
  });

  const handleSave = async () => {
    setSaving(true);
    await updateCompany(company.id, {
      highlights: editor?.getHTML(),
    });
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="prose prose-sm max-w-none min-h-[100px] rounded-md border border-border/50 p-3">
        <EditorContent editor={editor} />
      </div>
      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Highlights"}
      </Button>
    </div>
  );
}
```

**Step 3: Verify the build compiles**

Run: `npm run build 2>&1 | tail -30`

**Step 4: Commit**

```bash
git add src/app/(authenticated)/company/[id]/page.tsx src/components/company/highlights-section.tsx
git commit -m "feat: rebuild company detail page as vertical scroll with section nav"
```

---

### Task 4: Restyle ThesisTab (Remove Card Wrapper)

**Files:**
- Modify: `src/components/company/thesis-tab.tsx`

**Step 1: Remove Card/CardHeader/CardContent wrappers and simplify**

The thesis section now lives inside a `<section>` with its own heading from the parent page. Remove the Card wrapper, remove the Highlights editor (now separate), and keep only the thesis editor with a save button.

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { updateCompany } from "@/app/(authenticated)/actions/company-actions";
import type { Company } from "@/types/database";

export function ThesisTab({ company }: { company: Company }) {
  const [saving, setSaving] = useState(false);

  const thesisEditor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Write your investment thesis..." }),
    ],
    content: company.thesis ?? "",
  });

  const handleSave = async () => {
    setSaving(true);
    await updateCompany(company.id, {
      thesis: thesisEditor?.getHTML(),
    });
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="prose prose-sm max-w-none min-h-[200px] rounded-md border border-border/50 p-3">
        <EditorContent editor={thesisEditor} />
      </div>
      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Thesis"}
      </Button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/company/thesis-tab.tsx
git commit -m "refactor: remove Card wrapper from ThesisTab"
```

---

### Task 5: Restyle ValuationTab (Remove Card Wrapper)

**Files:**
- Modify: `src/components/company/valuation-tab.tsx`

**Step 1: Remove Card/CardHeader/CardContent wrappers**

Replace the Card wrapper with a plain div. The section heading now comes from the parent page. Keep all calculation logic and table structure identical.

Changes:
- Remove `Card`, `CardContent`, `CardHeader`, `CardTitle` imports
- Replace `<Card>` with `<div>`
- Replace `<CardHeader>` with a simple div containing the save button
- Replace `<CardContent>` with the inner content directly
- Tighten borders: use `border-border/50` instead of default

Apply these changes to lines 150-252 of `src/components/company/valuation-tab.tsx`:

- Line 1: Remove Card imports
- Line 151: `<Card className="border shadow-sm">` → `<div>`
- Line 152-156: Replace CardHeader with `<div className="flex items-center justify-between mb-4">`  containing just the save button (remove CardTitle since parent has heading)
- Line 158: `<CardContent className="p-4 space-y-4">` → `<div className="space-y-4">`
- Line 251: `</CardContent>` → `</div>`
- Line 252: `</Card>` → `</div>`

**Step 2: Commit**

```bash
git add src/components/company/valuation-tab.tsx
git commit -m "refactor: remove Card wrapper from ValuationTab"
```

---

### Task 6: Restyle TimelineTab (Remove Card Wrappers, Compact Entries)

**Files:**
- Modify: `src/components/company/timeline-tab.tsx`

**Step 1: Remove Card wrappers and make entries compact**

Replace Card-wrapped entries with simple bordered rows. Remove the Card wrapper from the "Add Update" form too.

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  createTimelineEntry,
  deleteTimelineEntry,
} from "@/app/(authenticated)/actions/timeline-actions";
import type { TimelineEntry } from "@/types/database";

export function TimelineTab({
  companyId,
  entries,
}: {
  companyId: string;
  entries: TimelineEntry[];
}) {
  const [quarter, setQuarter] = useState("");
  const [saving, setSaving] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Add quarterly update..." }),
    ],
    content: "",
  });

  const handleAdd = async () => {
    if (!editor?.getHTML() || editor.isEmpty) return;
    setSaving(true);
    await createTimelineEntry(companyId, {
      quarter: quarter || undefined,
      entry_date: new Date().toISOString().split("T")[0],
      content: editor.getHTML(),
      sort_order: 0,
    });
    editor.commands.clearContent();
    setQuarter("");
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await deleteTimelineEntry(id, companyId);
  };

  return (
    <div className="space-y-4">
      {/* Add entry form */}
      <div className="space-y-3 pb-4 border-b border-border/50">
        <Input
          placeholder="Quarter (e.g., Q1FY26)"
          value={quarter}
          onChange={(e) => setQuarter(e.target.value)}
          className="w-48"
        />
        <div className="prose prose-sm max-w-none min-h-[80px] rounded-md border border-border/50 p-3">
          <EditorContent editor={editor} />
        </div>
        <Button size="sm" onClick={handleAdd} disabled={saving}>
          {saving ? "Adding..." : "Add Entry"}
        </Button>
      </div>

      {/* Entries list */}
      <div className="divide-y divide-border/30">
        {entries.map((entry) => (
          <div key={entry.id} className="py-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 text-sm">
                {entry.quarter && (
                  <span className="font-semibold">{entry.quarter}</span>
                )}
                {entry.entry_date && (
                  <span className="text-muted-foreground text-xs">{entry.entry_date}</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(entry.id)}
              >
                Delete
              </Button>
            </div>
            <div
              className="prose prose-sm max-w-none text-foreground/80"
              dangerouslySetInnerHTML={{ __html: entry.content }}
            />
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No timeline entries yet.
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/company/timeline-tab.tsx
git commit -m "refactor: remove Card wrappers from TimelineTab, compact entries"
```

---

### Task 7: Restyle EditCompanyTab (Remove Card Wrapper)

**Files:**
- Modify: `src/components/company/edit-company-tab.tsx`

**Step 1: Remove Card wrapper**

Replace Card/CardHeader/CardContent with a plain div. The heading comes from the parent page section.

Changes:
- Remove Card, CardContent, CardHeader, CardTitle imports
- Line 49: `<Card className="border shadow-sm max-w-2xl">` → `<div className="max-w-2xl">`
- Lines 50-52: Remove CardHeader entirely
- Line 53: `<CardContent className="p-4">` → `<div>`
- Line 163: `</CardContent>` → `</div>`
- Line 164: `</Card>` → `</div>`

**Step 2: Commit**

```bash
git add src/components/company/edit-company-tab.tsx
git commit -m "refactor: remove Card wrapper from EditCompanyTab"
```

---

### Task 8: Update Layout for Screener-Style Spacing

**Files:**
- Modify: `src/app/(authenticated)/layout.tsx`

**Step 1: Update the main padding**

Change the main content area padding from `p-4` to `px-4 md:px-8 py-4` for wider horizontal padding on desktop.

Change line 42:
```tsx
<main className="px-4 md:px-8 py-4">{children}</main>
```

**Step 2: Commit**

```bash
git add src/app/(authenticated)/layout.tsx
git commit -m "refactor: update layout padding for screener-style spacing"
```

---

### Task 9: Rebuild Dashboard Table (Dense Screener Style)

**Files:**
- Modify: `src/components/dashboard/companies-table.tsx`

**Step 1: Restyle the dashboard table**

Apply dense, screener-style table with:
- Tighter row padding (`py-1.5 px-3`)
- Alternating row backgrounds
- Added Sector column
- Remove inline delete column (delete moves to company detail page)
- Sticky header row
- Right-aligned numeric columns with tabular-nums
- Remove AlertDialog import (no longer needed in table)

```tsx
"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { marginOfSafety, isBuySignal } from "@/lib/utils/calculations";
import type { Company, ValuationScenario } from "@/types/database";

type CompanyWithScenarios = Company & {
  valuation_scenarios: ValuationScenario[];
};

function getScenarioReturn(
  scenarios: ValuationScenario[],
  type: "base" | "bare"
): number | null {
  const s = scenarios.find((v) => v.scenario_type === type);
  return s?.irr ?? null;
}

function fmtPrice(val: number | null): string {
  if (val == null) return "-";
  return val.toLocaleString("en-IN");
}

export function CompaniesTable({
  companies,
}: {
  companies: CompanyWithScenarios[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [starFilter, setStarFilter] = useState<string>("all");
  const [strategyFilter, setStrategyFilter] = useState<string>("all");
  const [buyOnlyFilter, setBuyOnlyFilter] = useState(false);
  const [sortField, setSortField] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    let result = companies;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.symbol?.toLowerCase().includes(q)
      );
    }
    if (starFilter !== "all") {
      result = result.filter((c) => c.star_rating === Number(starFilter));
    }
    if (strategyFilter !== "all") {
      result = result.filter((c) => c.strategy === strategyFilter);
    }
    if (buyOnlyFilter) {
      result = result.filter((c) => isBuySignal(c.current_price, c.buy_price));
    }

    result.sort((a, b) => {
      const aVal = a[sortField as keyof Company];
      const bVal = b[sortField as keyof Company];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [companies, search, starFilter, strategyFilter, buyOnlyFilter, sortField, sortDir]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 h-8 text-sm"
        />
        <Select value={starFilter} onValueChange={(v) => setStarFilter(v ?? "all")}>
          <SelectTrigger className="w-28 h-8 text-sm">
            <SelectValue placeholder="Stars" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stars</SelectItem>
            {[1, 2, 3, 4, 5].map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s} Star{s > 1 ? "s" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={strategyFilter} onValueChange={(v) => setStrategyFilter(v ?? "all")}>
          <SelectTrigger className="w-28 h-8 text-sm">
            <SelectValue placeholder="Strategy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="core">Core</SelectItem>
            <SelectItem value="satellite">Satellite</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={buyOnlyFilter}
            onChange={(e) => setBuyOnlyFilter(e.target.checked)}
          />
          Buy signals only
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} companies
        </span>
      </div>

      {/* Dense table */}
      <div className="border border-border/60 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-border/40 bg-muted/30">
              <th
                className="sticky top-0 z-10 bg-muted/30 text-left px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("name")}
              >
                Company<SortIcon field="name" />
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-center px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("star_rating")}
              >
                Star<SortIcon field="star_rating" />
              </th>
              <th className="sticky top-0 z-10 bg-muted/30 text-center px-2 py-2 text-xs font-medium text-muted-foreground">
                Strategy
              </th>
              <th className="sticky top-0 z-10 bg-muted/30 text-left px-2 py-2 text-xs font-medium text-muted-foreground">
                Sector
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("market_cap")}
              >
                MCap<SortIcon field="market_cap" />
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("buy_price")}
              >
                Buy<SortIcon field="buy_price" />
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("current_price")}
              >
                CMP<SortIcon field="current_price" />
              </th>
              <th className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                MoS%
              </th>
              <th className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                IRR
              </th>
              <th className="sticky top-0 z-10 bg-muted/30 text-center px-2 py-2 text-xs font-medium text-muted-foreground">
                Signal
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((company, idx) => {
              const mos =
                company.buy_price && company.current_price
                  ? marginOfSafety(company.buy_price, company.current_price)
                  : null;
              const buy = isBuySignal(company.current_price, company.buy_price);
              const baseReturn = getScenarioReturn(company.valuation_scenarios, "base");

              return (
                <tr
                  key={company.id}
                  className={`cursor-pointer border-b border-border/20 hover:bg-muted/40 transition-colors ${
                    idx % 2 === 0 ? "" : "bg-muted/15"
                  }`}
                  onClick={() => router.push(`/company/${company.id}`)}
                >
                  <td className="px-3 py-1.5 font-medium">
                    {company.name}
                    {company.symbol && (
                      <span className="ml-1.5 text-[11px] text-muted-foreground">
                        {company.symbol}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center text-xs">
                    {"★".repeat(company.star_rating ?? 0)}
                  </td>
                  <td className="px-2 py-1.5 text-center text-xs capitalize text-muted-foreground">
                    {company.strategy ?? "-"}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground truncate max-w-[120px]">
                    {company.sector ?? "-"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {company.market_cap != null ? fmtPrice(company.market_cap) : "-"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {company.buy_price != null ? fmtPrice(company.buy_price) : "-"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {company.current_price != null ? fmtPrice(company.current_price) : "-"}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right tabular-nums font-medium ${
                      mos != null
                        ? mos > 0
                          ? "text-green-600"
                          : mos < -0.1
                            ? "text-red-600"
                            : "text-yellow-600"
                        : ""
                    }`}
                  >
                    {mos != null ? `${(mos * 100).toFixed(0)}%` : "-"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {baseReturn != null ? `${(baseReturn * 100).toFixed(0)}%` : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {buy && (
                      <span className="text-[10px] font-semibold text-green-600 bg-green-50 dark:bg-green-950/30 px-1.5 py-0.5 rounded">
                        BUY
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-sm text-muted-foreground">
                  No companies found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -30`

**Step 3: Commit**

```bash
git add src/components/dashboard/companies-table.tsx
git commit -m "feat: rebuild dashboard table with dense screener-style layout"
```

---

### Task 10: Update Dashboard Page (Screener Title Bar)

**Files:**
- Modify: `src/app/(authenticated)/page.tsx`

**Step 1: Update dashboard page layout**

Tighten the title bar and add company count. Remove DeleteAllCompaniesButton from the header (less clutter, screener-style). Add max-width.

```tsx
import { createClient } from "@/lib/supabase/server";
import { CompaniesTable } from "@/components/dashboard/companies-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ensureDefaultPortfolio } from "./actions/portfolio-actions";

export default async function DashboardPage() {
  const supabase = await createClient();

  await ensureDefaultPortfolio();

  const { data: companies } = await supabase
    .from("companies")
    .select("*, valuation_scenarios(*)")
    .order("name");

  return (
    <div className="max-w-6xl mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          All Companies
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({companies?.length ?? 0})
          </span>
        </h1>
        <Link href="/company/new">
          <Button size="sm" className="h-8 text-sm">+ Add Company</Button>
        </Link>
      </div>
      <CompaniesTable companies={companies ?? []} />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/(authenticated)/page.tsx
git commit -m "refactor: update dashboard page with screener-style title bar"
```

---

### Task 11: Final Build Verification & Visual QA

**Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 2: Run dev server and visually verify**

Run: `npm run dev`

Verify:
- Dashboard loads with dense table, alternating rows, all columns visible
- Company detail page scrolls vertically with all sections
- Section nav sticks and highlights active section on scroll
- Metrics grid shows all 8 metrics in the header
- Financial model table renders correctly
- Valuation table renders without Card wrapper
- Timeline entries show as compact rows
- Thesis and Highlights are separate sections with editors
- Edit form works without Card wrapper
- Dark mode works correctly

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address visual QA issues from screener redesign"
```

---

### Task 12: Final Commit

**Step 1: Create a single summary commit if needed, or just verify all commits are clean**

Run: `git log --oneline -12`

Verify all commits from this redesign are present and build passes.
