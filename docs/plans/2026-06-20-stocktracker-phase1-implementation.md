# StockTracker SaaS — Phase 1 MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a fully functional stock tracking SaaS MVP that replicates the Excel-based system (31 Indian companies) as a Next.js web app with Supabase backend.

**Architecture:** Next.js 15 App Router with Server Components for data fetching, Server Actions for mutations, Supabase for auth (Google OAuth) and PostgreSQL with RLS. Extensible via provider pattern (stock prices), repository pattern (data access), and service layer abstraction.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase, shadcn/ui, Tailwind CSS v4, Tiptap, Recharts

---

## Task 1: Project Scaffold & Configuration

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `.env.local.example`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**Step 1: Initialize Next.js project**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack
```

**Step 2: Initialize git**

```bash
git init
git add .
git commit -m "chore: scaffold Next.js 15 project"
```

**Step 3: Install core dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install recharts tiptap @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder
npm install dompurify
npm install -D @types/dompurify
```

**Step 4: Install shadcn/ui**

```bash
npx shadcn@latest init
```

Select: New York style, Zinc color, CSS variables enabled.

**Step 5: Add commonly needed shadcn components**

```bash
npx shadcn@latest add button card table input label tabs badge dialog dropdown-menu select separator sheet skeleton toast tooltip
```

**Step 6: Create environment template**

Create `.env.local.example`:
```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Step 7: Commit**

```bash
git add .
git commit -m "chore: add dependencies and shadcn/ui"
```

---

## Task 2: Project Structure & Extensible Architecture

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`
- Create: `src/middleware.ts`
- Create: `src/types/database.ts`
- Create: `src/lib/providers/stock-price/types.ts`
- Create: `src/lib/providers/stock-price/manual-provider.ts`
- Create: `src/lib/providers/stock-price/registry.ts`
- Create: `src/lib/repositories/types.ts`
- Create: `src/lib/services/company-service.ts`
- Create: `src/lib/utils/calculations.ts`

**Step 1: Create Supabase client (browser)**

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**Step 2: Create Supabase server client**

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  );
}
```

**Step 3: Create Supabase middleware helper**

```typescript
// src/lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

**Step 4: Create Next.js middleware**

```typescript
// src/middleware.ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

**Step 5: Create TypeScript types for database**

```typescript
// src/types/database.ts
export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  plan: "free" | "basic" | "pro" | "premium";
  plan_limits: {
    max_companies: number;
    max_portfolios: number;
    alerts_enabled: boolean;
  };
  created_at: string;
  updated_at: string;
}

export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  portfolio_id: string;
  user_id: string;
  name: string;
  symbol: string | null;
  sector: string | null;
  market_cap: number | null;
  current_price: number | null;
  buy_price: number | null;
  star_rating: number | null;
  strategy: "core" | "satellite" | null;
  investment_horizon_years: number | null;
  expected_returns: number | null;
  thesis: string | null;
  highlights: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialYear {
  id: string;
  company_id: string;
  user_id: string;
  year: string;
  is_estimate: boolean;
  revenue: number | null;
  revenue_growth_pct: number | null;
  ebitda: number | null;
  ebitda_margin_pct: number | null;
  ebitda_growth_pct: number | null;
  depreciation: number | null;
  finance_cost: number | null;
  other_income: number | null;
  exceptional_items: number | null;
  pbt: number | null;
  tax_pct: number | null;
  pat: number | null;
  pat_growth_pct: number | null;
  pat_margin_pct: number | null;
  minority_interest: number | null;
  pat_for_shareholders: number | null;
  pe: number | null;
  peg: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ValuationScenario {
  id: string;
  company_id: string;
  user_id: string;
  scenario_type: "bull" | "base" | "bare";
  target_pe: number | null;
  target_market_cap: number | null;
  irr: number | null;
  buying_market_cap: number | null;
  buy_price: number | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEntry {
  id: string;
  company_id: string;
  user_id: string;
  quarter: string | null;
  entry_date: string | null;
  content: string;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface SegmentValuation {
  id: string;
  company_id: string;
  user_id: string;
  segment_name: string;
  management_signal: string | null;
  metrics: string | null;
  multiple: string | null;
  estimated_value: number | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface MarketPerception {
  id: string;
  company_id: string;
  user_id: string;
  perception: string;
  own_view: string;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}
```

**Step 6: Create stock price provider interface (Provider Pattern)**

```typescript
// src/lib/providers/stock-price/types.ts
export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  volume?: number;
  timestamp: Date;
}

export interface StockPriceProvider {
  name: string;
  fetchQuote(symbol: string): Promise<StockQuote>;
  fetchBulkQuotes(symbols: string[]): Promise<Map<string, StockQuote>>;
  isAvailable(): Promise<boolean>;
}
```

**Step 7: Create manual price provider (default for Phase 1)**

```typescript
// src/lib/providers/stock-price/manual-provider.ts
import { StockPriceProvider, StockQuote } from "./types";

export class ManualPriceProvider implements StockPriceProvider {
  name = "manual";

  async fetchQuote(symbol: string): Promise<StockQuote> {
    throw new Error(
      "Manual provider does not fetch prices. Update prices manually."
    );
  }

  async fetchBulkQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
    return new Map();
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
```

**Step 8: Create provider registry**

```typescript
// src/lib/providers/stock-price/registry.ts
import { StockPriceProvider } from "./types";
import { ManualPriceProvider } from "./manual-provider";

class StockPriceProviderRegistry {
  private providers = new Map<string, StockPriceProvider>();
  private activeProvider: string = "manual";

  constructor() {
    this.register(new ManualPriceProvider());
  }

  register(provider: StockPriceProvider) {
    this.providers.set(provider.name, provider);
  }

  setActive(name: string) {
    if (!this.providers.has(name)) {
      throw new Error(`Provider "${name}" not registered`);
    }
    this.activeProvider = name;
  }

  getActive(): StockPriceProvider {
    return this.providers.get(this.activeProvider)!;
  }

  getProvider(name: string): StockPriceProvider | undefined {
    return this.providers.get(name);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const stockPriceRegistry = new StockPriceProviderRegistry();
```

**Step 9: Create calculation utilities**

```typescript
// src/lib/utils/calculations.ts
export function marginOfSafety(
  buyPrice: number,
  currentPrice: number
): number {
  if (buyPrice === 0) return 0;
  return (buyPrice - currentPrice) / buyPrice;
}

export function irr(
  targetMcap: number,
  buyingMcap: number,
  years: number
): number {
  if (buyingMcap === 0 || years === 0) return 0;
  return Math.pow(targetMcap / buyingMcap, 1 / years) - 1;
}

export function forwardPeg(currentPe: number, cagrPatGrowth: number): number {
  if (cagrPatGrowth === 0) return 0;
  return currentPe / (cagrPatGrowth * 100);
}

export function currentPe(marketCap: number, latestPat: number): number {
  if (latestPat === 0) return 0;
  return marketCap / latestPat;
}

export function cagrGrowth(
  futureValue: number,
  baseValue: number,
  years: number
): number {
  if (baseValue === 0 || years === 0) return 0;
  return Math.pow(futureValue / baseValue, 1 / years) - 1;
}

export function isBuySignal(
  currentPrice: number | null,
  buyPrice: number | null
): boolean {
  if (!currentPrice || !buyPrice) return false;
  return currentPrice <= buyPrice;
}
```

**Step 10: Commit**

```bash
git add .
git commit -m "feat: project structure with extensible provider and utility patterns"
```

---

## Task 3: Supabase Database Setup

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

**Step 1: Install Supabase CLI and init**

```bash
npm install -D supabase
npx supabase init
```

**Step 2: Create initial migration**

```sql
-- supabase/migrations/001_initial_schema.sql

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'basic', 'pro', 'premium')),
  plan_limits JSONB DEFAULT '{"max_companies": 50, "max_portfolios": 5, "alerts_enabled": true}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Portfolios
CREATE TABLE portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own portfolios" ON portfolios FOR ALL USING (auth.uid() = user_id);

-- Companies
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  symbol TEXT,
  sector TEXT,
  market_cap NUMERIC,
  current_price NUMERIC,
  buy_price NUMERIC,
  star_rating INTEGER CHECK (star_rating BETWEEN 1 AND 5),
  strategy TEXT CHECK (strategy IN ('core', 'satellite')),
  investment_horizon_years NUMERIC,
  expected_returns NUMERIC,
  thesis TEXT,
  highlights TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own companies" ON companies FOR ALL USING (auth.uid() = user_id);

-- Financial Years
CREATE TABLE financial_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year TEXT NOT NULL,
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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, year)
);

ALTER TABLE financial_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own financial data" ON financial_years FOR ALL USING (auth.uid() = user_id);

-- Valuation Scenarios
CREATE TABLE valuation_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario_type TEXT NOT NULL CHECK (scenario_type IN ('bull', 'base', 'bare')),
  target_pe NUMERIC,
  target_market_cap NUMERIC,
  irr NUMERIC,
  buying_market_cap NUMERIC,
  buy_price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, scenario_type)
);

ALTER TABLE valuation_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own valuations" ON valuation_scenarios FOR ALL USING (auth.uid() = user_id);

-- Timeline Entries
CREATE TABLE timeline_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quarter TEXT,
  entry_date DATE,
  content TEXT NOT NULL,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE timeline_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own timeline" ON timeline_entries FOR ALL USING (auth.uid() = user_id);

-- Segment Valuations (SOTP)
CREATE TABLE segment_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  segment_name TEXT NOT NULL,
  management_signal TEXT,
  metrics TEXT,
  multiple TEXT,
  estimated_value NUMERIC,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE segment_valuations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own segments" ON segment_valuations FOR ALL USING (auth.uid() = user_id);

-- Market Perceptions
CREATE TABLE market_perceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  perception TEXT NOT NULL,
  own_view TEXT NOT NULL,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE market_perceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own perceptions" ON market_perceptions FOR ALL USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_companies_portfolio ON companies(portfolio_id);
CREATE INDEX idx_companies_user ON companies(user_id);
CREATE INDEX idx_financial_years_company ON financial_years(company_id);
CREATE INDEX idx_valuation_scenarios_company ON valuation_scenarios(company_id);
CREATE INDEX idx_timeline_entries_company ON timeline_entries(company_id);
CREATE INDEX idx_segment_valuations_company ON segment_valuations(company_id);
CREATE INDEX idx_market_perceptions_company ON market_perceptions(company_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON portfolios FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON financial_years FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON valuation_scenarios FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON timeline_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON segment_valuations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON market_perceptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Step 3: Run migration against Supabase**

```bash
npx supabase db push
```

**Step 4: Configure Google OAuth in Supabase Dashboard**

- Go to Supabase Dashboard → Authentication → Providers → Google
- Enable Google provider
- Add Google OAuth Client ID and Secret (from Google Cloud Console)
- Set redirect URL: `https://<project-ref>.supabase.co/auth/v1/callback`

**Step 5: Commit**

```bash
git add .
git commit -m "feat: database schema with RLS policies and triggers"
```

---

## Task 4: Authentication (Google OAuth)

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/auth/callback/route.ts`
- Create: `src/components/auth/login-button.tsx`
- Create: `src/components/auth/user-nav.tsx`

**Step 1: Create auth callback route**

```typescript
// src/app/auth/callback/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
```

**Step 2: Create login page**

```typescript
// src/app/login/page.tsx
import { LoginButton } from "@/components/auth/login-button";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">StockTracker</h1>
          <p className="text-sm text-muted-foreground">
            Track your stock investments with precision
          </p>
        </div>
        <LoginButton />
      </div>
    </div>
  );
}
```

**Step 3: Create login button (client component)**

```typescript
// src/components/auth/login-button.tsx
"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function LoginButton() {
  const handleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <Button onClick={handleLogin} className="w-full" size="lg">
      Continue with Google
    </Button>
  );
}
```

**Step 4: Create user nav component**

```typescript
// src/components/auth/user-nav.tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Profile } from "@/types/database";

export function UserNav({ profile }: { profile: Profile }) {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          {profile.display_name?.[0] ?? "U"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="flex items-center gap-2 p-2">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{profile.display_name}</p>
            <p className="text-xs text-muted-foreground">{profile.email}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: Google OAuth authentication flow"
```

---

## Task 5: App Layout & Navigation

**Files:**
- Create: `src/components/layout/app-header.tsx`
- Create: `src/components/layout/app-shell.tsx`
- Modify: `src/app/layout.tsx`
- Create: `src/app/(authenticated)/layout.tsx`
- Create: `src/app/(authenticated)/page.tsx`

**Step 1: Create app header**

```typescript
// src/components/layout/app-header.tsx
import Link from "next/link";
import { UserNav } from "@/components/auth/user-nav";
import type { Profile } from "@/types/database";

export function AppHeader({ profile }: { profile: Profile }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4">
        <Link href="/" className="mr-6 font-bold">
          StockTracker
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/settings" className="text-muted-foreground hover:text-foreground">
            Settings
          </Link>
        </nav>
        <div className="ml-auto">
          <UserNav profile={profile} />
        </div>
      </div>
    </header>
  );
}
```

**Step 2: Create authenticated layout**

```typescript
// src/app/(authenticated)/layout.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader profile={profile} />
      <main className="p-4">{children}</main>
    </div>
  );
}
```

**Step 3: Create dashboard page placeholder**

```typescript
// src/app/(authenticated)/page.tsx
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground">Your companies will appear here.</p>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add .
git commit -m "feat: app layout with header and authenticated routing"
```

---

## Task 6: Server Actions for CRUD Operations

**Files:**
- Create: `src/app/(authenticated)/actions/portfolio-actions.ts`
- Create: `src/app/(authenticated)/actions/company-actions.ts`
- Create: `src/app/(authenticated)/actions/financial-actions.ts`
- Create: `src/app/(authenticated)/actions/valuation-actions.ts`
- Create: `src/app/(authenticated)/actions/timeline-actions.ts`

**Step 1: Portfolio actions**

```typescript
// src/app/(authenticated)/actions/portfolio-actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createPortfolio(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const name = formData.get("name") as string;
  const description = formData.get("description") as string | null;

  const { error } = await supabase.from("portfolios").insert({
    user_id: user.id,
    name,
    description,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function getPortfolios() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("portfolios")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function ensureDefaultPortfolio() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: existing } = await supabase
    .from("portfolios")
    .select("id")
    .eq("is_default", true)
    .single();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("portfolios")
    .insert({
      user_id: user.id,
      name: "My Portfolio",
      is_default: true,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data!.id;
}
```

**Step 2: Company actions**

```typescript
// src/app/(authenticated)/actions/company-actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const window = new JSDOM("").window;
const purify = DOMPurify(window as unknown as Window);

function sanitizeHtml(html: string | null): string | null {
  if (!html) return null;
  return purify.sanitize(html);
}

export async function getCompanies(portfolioId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  let query = supabase
    .from("companies")
    .select("*, valuation_scenarios(*)")
    .order("name");

  if (portfolioId) {
    query = query.eq("portfolio_id", portfolioId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function getCompany(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("companies")
    .select(`
      *,
      valuation_scenarios(*),
      financial_years(*, order: sort_order),
      timeline_entries(*, order: sort_order),
      segment_valuations(*, order: sort_order),
      market_perceptions(*, order: sort_order)
    `)
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createCompany(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("companies").insert({
    user_id: user.id,
    portfolio_id: formData.get("portfolio_id") as string,
    name: formData.get("name") as string,
    symbol: formData.get("symbol") as string | null,
    sector: formData.get("sector") as string | null,
    market_cap: formData.get("market_cap") ? Number(formData.get("market_cap")) : null,
    current_price: formData.get("current_price") ? Number(formData.get("current_price")) : null,
    buy_price: formData.get("buy_price") ? Number(formData.get("buy_price")) : null,
    star_rating: formData.get("star_rating") ? Number(formData.get("star_rating")) : null,
    strategy: formData.get("strategy") as "core" | "satellite" | null,
    investment_horizon_years: formData.get("investment_horizon_years") ? Number(formData.get("investment_horizon_years")) : null,
    thesis: sanitizeHtml(formData.get("thesis") as string | null),
    highlights: sanitizeHtml(formData.get("highlights") as string | null),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function updateCompany(id: string, data: Record<string, unknown>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (data.thesis) data.thesis = sanitizeHtml(data.thesis as string);
  if (data.highlights) data.highlights = sanitizeHtml(data.highlights as string);

  const { error } = await supabase
    .from("companies")
    .update(data)
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${id}`);
  revalidatePath("/");
}

export async function deleteCompany(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}
```

**Step 3: Financial year actions**

```typescript
// src/app/(authenticated)/actions/financial-actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertFinancialYear(
  companyId: string,
  yearData: {
    year: string;
    is_estimate: boolean;
    revenue?: number | null;
    revenue_growth_pct?: number | null;
    ebitda?: number | null;
    ebitda_margin_pct?: number | null;
    ebitda_growth_pct?: number | null;
    depreciation?: number | null;
    finance_cost?: number | null;
    other_income?: number | null;
    exceptional_items?: number | null;
    pbt?: number | null;
    tax_pct?: number | null;
    pat?: number | null;
    pat_growth_pct?: number | null;
    pat_margin_pct?: number | null;
    minority_interest?: number | null;
    pat_for_shareholders?: number | null;
    pe?: number | null;
    peg?: number | null;
    sort_order: number;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("financial_years").upsert(
    {
      company_id: companyId,
      user_id: user.id,
      ...yearData,
    },
    { onConflict: "company_id,year" }
  );

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
}

export async function bulkUpsertFinancialYears(
  companyId: string,
  years: Array<{
    year: string;
    is_estimate: boolean;
    sort_order: number;
    [key: string]: unknown;
  }>
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const rows = years.map((y) => ({
    company_id: companyId,
    user_id: user.id,
    ...y,
  }));

  const { error } = await supabase
    .from("financial_years")
    .upsert(rows, { onConflict: "company_id,year" });

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
}
```

**Step 4: Valuation actions**

```typescript
// src/app/(authenticated)/actions/valuation-actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertValuation(
  companyId: string,
  scenario: {
    scenario_type: "bull" | "base" | "bare";
    target_pe?: number | null;
    target_market_cap?: number | null;
    irr?: number | null;
    buying_market_cap?: number | null;
    buy_price?: number | null;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("valuation_scenarios").upsert(
    {
      company_id: companyId,
      user_id: user.id,
      ...scenario,
    },
    { onConflict: "company_id,scenario_type" }
  );

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
}
```

**Step 5: Timeline actions**

```typescript
// src/app/(authenticated)/actions/timeline-actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const window = new JSDOM("").window;
const purify = DOMPurify(window as unknown as Window);

export async function createTimelineEntry(
  companyId: string,
  data: { quarter?: string; entry_date?: string; content: string; sort_order?: number }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("timeline_entries").insert({
    company_id: companyId,
    user_id: user.id,
    quarter: data.quarter,
    entry_date: data.entry_date,
    content: purify.sanitize(data.content),
    sort_order: data.sort_order,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
}

export async function updateTimelineEntry(
  id: string,
  companyId: string,
  data: { quarter?: string; entry_date?: string; content?: string }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const updateData: Record<string, unknown> = { ...data };
  if (data.content) updateData.content = purify.sanitize(data.content);

  const { error } = await supabase
    .from("timeline_entries")
    .update(updateData)
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
}

export async function deleteTimelineEntry(id: string, companyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("timeline_entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
}
```

**Step 6: Commit**

```bash
git add .
git commit -m "feat: server actions for all CRUD operations"
```

---

## Task 7: Dashboard — All Companies Data Table

**Files:**
- Create: `src/app/(authenticated)/page.tsx` (replace placeholder)
- Create: `src/components/dashboard/companies-table.tsx`
- Create: `src/components/dashboard/table-filters.tsx`
- Create: `src/components/dashboard/company-row.tsx`

**Step 1: Build companies table component**

```typescript
// src/components/dashboard/companies-table.tsx
"use client";

import { useState, useMemo } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
      let aVal: unknown = a[sortField as keyof Company];
      let bVal: unknown = b[sortField as keyof Company];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Select value={starFilter} onValueChange={setStarFilter}>
          <SelectTrigger className="w-32">
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
        <Select value={strategyFilter} onValueChange={setStrategyFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Strategy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="core">Core</SelectItem>
            <SelectItem value="satellite">Satellite</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={buyOnlyFilter}
            onChange={(e) => setBuyOnlyFilter(e.target.checked)}
          />
          Buy signals only
        </label>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} companies
        </span>
      </div>

      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("name")}>
                Company {sortField === "name" && (sortDir === "asc" ? "^" : "v")}
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("star_rating")}>Star</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("buy_price")}>Buy Price</TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("current_price")}>Current Price</TableHead>
              <TableHead className="text-right">Base Returns</TableHead>
              <TableHead className="text-right">Bare Returns</TableHead>
              <TableHead className="text-right">MoS</TableHead>
              <TableHead className="text-center">Buy Signal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((company) => {
              const mos =
                company.buy_price && company.current_price
                  ? marginOfSafety(company.buy_price, company.current_price)
                  : null;
              const buy = isBuySignal(company.current_price, company.buy_price);
              const baseReturn = getScenarioReturn(company.valuation_scenarios, "base");
              const bareReturn = getScenarioReturn(company.valuation_scenarios, "bare");

              return (
                <TableRow
                  key={company.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/company/${company.id}`)}
                >
                  <TableCell className="font-medium">
                    {company.name}
                    {company.symbol && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {company.symbol}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{"*".repeat(company.star_rating ?? 0)}</TableCell>
                  <TableCell>
                    {company.strategy && (
                      <Badge variant={company.strategy === "core" ? "default" : "secondary"}>
                        {company.strategy}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{company.buy_price?.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">{company.current_price?.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">
                    {baseReturn != null ? `${(baseReturn * 100).toFixed(0)}%` : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {bareReturn != null ? `${(bareReturn * 100).toFixed(0)}%` : "-"}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
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
                  </TableCell>
                  <TableCell className="text-center">
                    {buy && <Badge variant="default" className="bg-green-600">BUY</Badge>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

**Step 2: Update dashboard page**

```typescript
// src/app/(authenticated)/page.tsx
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">All Companies</h1>
        <Link href="/company/new">
          <Button>Add Company</Button>
        </Link>
      </div>
      <CompaniesTable companies={companies ?? []} />
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat: dashboard with sortable, filterable companies table"
```

---

## Task 8: Company Detail Page with Tabs

**Files:**
- Create: `src/app/(authenticated)/company/[id]/page.tsx`
- Create: `src/app/(authenticated)/company/[id]/loading.tsx`
- Create: `src/components/company/company-header.tsx`
- Create: `src/components/company/thesis-tab.tsx`
- Create: `src/components/company/financial-model-tab.tsx`
- Create: `src/components/company/valuation-tab.tsx`
- Create: `src/components/company/timeline-tab.tsx`

**Step 1: Company detail page**

```typescript
// src/app/(authenticated)/company/[id]/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyHeader } from "@/components/company/company-header";
import { ThesisTab } from "@/components/company/thesis-tab";
import { FinancialModelTab } from "@/components/company/financial-model-tab";
import { ValuationTab } from "@/components/company/valuation-tab";
import { TimelineTab } from "@/components/company/timeline-tab";

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
      financial_years(*, order: sort_order.asc),
      timeline_entries(*, order: sort_order.desc),
      segment_valuations(*, order: sort_order.asc),
      market_perceptions(*, order: sort_order.asc)
    `)
    .eq("id", id)
    .single();

  if (error || !company) notFound();

  return (
    <div className="space-y-6">
      <CompanyHeader company={company} />
      <Tabs defaultValue="thesis">
        <TabsList>
          <TabsTrigger value="thesis">Thesis</TabsTrigger>
          <TabsTrigger value="model">Financial Model</TabsTrigger>
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>
        <TabsContent value="thesis">
          <ThesisTab company={company} />
        </TabsContent>
        <TabsContent value="model">
          <FinancialModelTab
            companyId={company.id}
            financialYears={company.financial_years}
          />
        </TabsContent>
        <TabsContent value="valuation">
          <ValuationTab
            companyId={company.id}
            scenarios={company.valuation_scenarios}
            currentPrice={company.current_price}
          />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineTab
            companyId={company.id}
            entries={company.timeline_entries}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**Step 2: Company header component**

```typescript
// src/components/company/company-header.tsx
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { marginOfSafety, isBuySignal } from "@/lib/utils/calculations";
import type { Company } from "@/types/database";

export function CompanyHeader({ company }: { company: Company }) {
  const mos =
    company.buy_price && company.current_price
      ? marginOfSafety(company.buy_price, company.current_price)
      : null;
  const buy = isBuySignal(company.current_price, company.buy_price);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 pt-6">
        <div>
          <h1 className="text-2xl font-bold">{company.name}</h1>
          {company.symbol && (
            <p className="text-sm text-muted-foreground">{company.symbol}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {company.star_rating && (
            <Badge variant="outline">
              {"*".repeat(company.star_rating)} Star
            </Badge>
          )}
          {company.strategy && (
            <Badge variant={company.strategy === "core" ? "default" : "secondary"}>
              {company.strategy}
            </Badge>
          )}
          {buy && <Badge className="bg-green-600">BUY</Badge>}
        </div>
        <div className="ml-auto flex gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Current: </span>
            <span className="font-medium">
              {company.current_price?.toLocaleString("en-IN") ?? "-"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Buy: </span>
            <span className="font-medium">
              {company.buy_price?.toLocaleString("en-IN") ?? "-"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">MoS: </span>
            <span
              className={`font-medium ${
                mos != null
                  ? mos > 0
                    ? "text-green-600"
                    : "text-red-600"
                  : ""
              }`}
            >
              {mos != null ? `${(mos * 100).toFixed(1)}%` : "-"}
            </span>
          </div>
          {company.market_cap && (
            <div>
              <span className="text-muted-foreground">MCap: </span>
              <span className="font-medium">
                {company.market_cap.toLocaleString("en-IN")} Cr
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 3: Thesis tab (with Tiptap editor)**

```typescript
// src/components/company/thesis-tab.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const highlightsEditor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Key highlights..." }),
    ],
    content: company.highlights ?? "",
  });

  const handleSave = async () => {
    setSaving(true);
    await updateCompany(company.id, {
      thesis: thesisEditor?.getHTML(),
      highlights: highlightsEditor?.getHTML(),
    });
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Investment Thesis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose max-w-none min-h-[200px] rounded-md border p-3">
            <EditorContent editor={thesisEditor} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Highlights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose max-w-none min-h-[100px] rounded-md border p-3">
            <EditorContent editor={highlightsEditor} />
          </div>
        </CardContent>
      </Card>
      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
```

**Step 4: Financial model tab (spreadsheet-like)**

```typescript
// src/components/company/financial-model-tab.tsx
"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bulkUpsertFinancialYears } from "@/app/(authenticated)/actions/financial-actions";
import type { FinancialYear } from "@/types/database";

const ROWS = [
  { key: "revenue", label: "Revenue (Cr)" },
  { key: "revenue_growth_pct", label: "Revenue Growth %", format: "pct" },
  { key: "ebitda", label: "EBITDA (Cr)" },
  { key: "ebitda_margin_pct", label: "EBITDA Margin %", format: "pct" },
  { key: "depreciation", label: "Depreciation" },
  { key: "finance_cost", label: "Finance Cost" },
  { key: "other_income", label: "Other Income" },
  { key: "exceptional_items", label: "Exceptional Items" },
  { key: "pbt", label: "PBT" },
  { key: "tax_pct", label: "Tax %", format: "pct" },
  { key: "pat", label: "PAT (Cr)" },
  { key: "pat_growth_pct", label: "PAT Growth %", format: "pct" },
  { key: "pat_margin_pct", label: "PAT Margin %", format: "pct" },
  { key: "pe", label: "PE" },
  { key: "peg", label: "PEG" },
] as const;

export function FinancialModelTab({
  companyId,
  financialYears,
}: {
  companyId: string;
  financialYears: FinancialYear[];
}) {
  const [data, setData] = useState<FinancialYear[]>(financialYears);
  const [saving, setSaving] = useState(false);

  const years = data.map((fy) => fy.year);

  const updateCell = useCallback(
    (yearIdx: number, key: string, value: string) => {
      setData((prev) => {
        const next = [...prev];
        next[yearIdx] = {
          ...next[yearIdx],
          [key]: value === "" ? null : Number(value),
        };
        return next;
      });
    },
    []
  );

  const handleSave = async () => {
    setSaving(true);
    await bulkUpsertFinancialYears(
      companyId,
      data.map((fy, idx) => ({
        ...fy,
        sort_order: idx,
      }))
    );
    setSaving(false);
  };

  const addYear = () => {
    const lastYear = years[years.length - 1] ?? "FY25";
    const match = lastYear.match(/FY(\d+)/);
    const nextNum = match ? parseInt(match[1]) + 1 : 26;
    const newYear: FinancialYear = {
      id: crypto.randomUUID(),
      company_id: companyId,
      user_id: "",
      year: `FY${nextNum}E`,
      is_estimate: true,
      revenue: null,
      revenue_growth_pct: null,
      ebitda: null,
      ebitda_margin_pct: null,
      ebitda_growth_pct: null,
      depreciation: null,
      finance_cost: null,
      other_income: null,
      exceptional_items: null,
      pbt: null,
      tax_pct: null,
      pat: null,
      pat_growth_pct: null,
      pat_margin_pct: null,
      minority_interest: null,
      pat_for_shareholders: null,
      pe: null,
      peg: null,
      sort_order: data.length,
      created_at: "",
      updated_at: "",
    };
    setData((prev) => [...prev, newYear]);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Financial Model</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addYear}>
            Add Year
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save All"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left font-medium min-w-[160px]">
                  Metric
                </th>
                {years.map((y) => (
                  <th
                    key={y}
                    className={`py-2 px-2 text-right font-medium min-w-[100px] ${
                      y.includes("E") ? "text-blue-600" : ""
                    }`}
                  >
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key} className="border-b">
                  <td className="py-1 pr-4 font-medium text-muted-foreground">
                    {row.label}
                  </td>
                  {data.map((fy, idx) => (
                    <td key={fy.year} className="py-1 px-1">
                      <Input
                        type="number"
                        className="h-7 text-right text-sm"
                        value={
                          (fy[row.key as keyof FinancialYear] as number) ?? ""
                        }
                        onChange={(e) =>
                          updateCell(idx, row.key, e.target.value)
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 5: Valuation tab**

```typescript
// src/components/company/valuation-tab.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertValuation } from "@/app/(authenticated)/actions/valuation-actions";
import type { ValuationScenario } from "@/types/database";

const SCENARIO_CONFIG = {
  bull: { label: "Bull Case", color: "border-green-500 bg-green-50" },
  base: { label: "Base Case", color: "border-blue-500 bg-blue-50" },
  bare: { label: "Bare Case", color: "border-orange-500 bg-orange-50" },
} as const;

export function ValuationTab({
  companyId,
  scenarios,
  currentPrice,
}: {
  companyId: string;
  scenarios: ValuationScenario[];
  currentPrice: number | null;
}) {
  const [data, setData] = useState<Record<string, Partial<ValuationScenario>>>(
    () => {
      const map: Record<string, Partial<ValuationScenario>> = {};
      for (const type of ["bull", "base", "bare"] as const) {
        const existing = scenarios.find((s) => s.scenario_type === type);
        map[type] = existing ?? { scenario_type: type };
      }
      return map;
    }
  );
  const [saving, setSaving] = useState<string | null>(null);

  const handleSave = async (type: "bull" | "base" | "bare") => {
    setSaving(type);
    await upsertValuation(companyId, {
      scenario_type: type,
      target_pe: data[type].target_pe ?? null,
      target_market_cap: data[type].target_market_cap ?? null,
      irr: data[type].irr ?? null,
      buying_market_cap: data[type].buying_market_cap ?? null,
      buy_price: data[type].buy_price ?? null,
    });
    setSaving(null);
  };

  const updateField = (
    type: string,
    field: string,
    value: string
  ) => {
    setData((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: value === "" ? null : Number(value),
      },
    }));
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {(["bull", "base", "bare"] as const).map((type) => {
        const config = SCENARIO_CONFIG[type];
        const s = data[type];
        return (
          <Card key={type} className={`border-2 ${config.color}`}>
            <CardHeader>
              <CardTitle className="text-lg">{config.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: "target_pe", label: "Target PE" },
                { key: "target_market_cap", label: "Target Market Cap (Cr)" },
                { key: "irr", label: "IRR (%)" },
                { key: "buying_market_cap", label: "Buying Market Cap (Cr)" },
                { key: "buy_price", label: "Buy Price" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number"
                    className="h-8"
                    value={(s[key as keyof ValuationScenario] as number) ?? ""}
                    onChange={(e) => updateField(type, key, e.target.value)}
                  />
                </div>
              ))}
              <Button
                size="sm"
                className="w-full"
                onClick={() => handleSave(type)}
                disabled={saving === type}
              >
                {saving === type ? "Saving..." : "Save"}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

**Step 6: Timeline tab**

```typescript
// src/components/company/timeline-tab.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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
      <Card>
        <CardHeader>
          <CardTitle>Add Update</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Quarter (e.g., Q1FY26)"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            className="w-48"
          />
          <div className="prose max-w-none min-h-[80px] rounded-md border p-3">
            <EditorContent editor={editor} />
          </div>
          <Button onClick={handleAdd} disabled={saving}>
            {saving ? "Adding..." : "Add Entry"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {entries.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {entry.quarter && (
                    <span className="font-semibold text-foreground">
                      {entry.quarter}
                    </span>
                  )}
                  {entry.entry_date && <span>{entry.entry_date}</span>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(entry.id)}
                >
                  Delete
                </Button>
              </div>
              <Separator className="mb-2" />
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: entry.content }}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**Step 7: Loading state**

```typescript
// src/app/(authenticated)/company/[id]/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-10 w-96" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
```

**Step 8: Commit**

```bash
git add .
git commit -m "feat: company detail page with thesis, model, valuation, timeline tabs"
```

---

## Task 9: Add/Edit Company Form

**Files:**
- Create: `src/app/(authenticated)/company/new/page.tsx`
- Create: `src/components/company/company-form.tsx`

**Step 1: Company form component**

```typescript
// src/components/company/company-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createCompany } from "@/app/(authenticated)/actions/company-actions";

export function CompanyForm({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    const formData = new FormData(e.currentTarget);
    formData.set("portfolio_id", portfolioId);
    await createCompany(formData);
    setPending(false);
    router.push("/");
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Add New Company</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Company Name *</Label>
              <Input id="name" name="name" required />
            </div>
            <div>
              <Label htmlFor="symbol">Symbol</Label>
              <Input id="symbol" name="symbol" placeholder="NSE:SYMBOL" />
            </div>
            <div>
              <Label htmlFor="sector">Sector</Label>
              <Input id="sector" name="sector" />
            </div>
            <div>
              <Label htmlFor="market_cap">Market Cap (Cr)</Label>
              <Input id="market_cap" name="market_cap" type="number" />
            </div>
            <div>
              <Label htmlFor="current_price">Current Price</Label>
              <Input id="current_price" name="current_price" type="number" />
            </div>
            <div>
              <Label htmlFor="buy_price">Buy Price</Label>
              <Input id="buy_price" name="buy_price" type="number" />
            </div>
            <div>
              <Label htmlFor="star_rating">Star Rating</Label>
              <Select name="star_rating">
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s} Star{s > 1 ? "s" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="strategy">Strategy</Label>
              <Select name="strategy">
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="core">Core</SelectItem>
                  <SelectItem value="satellite">Satellite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="investment_horizon_years">Horizon (years)</Label>
              <Input
                id="investment_horizon_years"
                name="investment_horizon_years"
                type="number"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create Company"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

**Step 2: New company page**

```typescript
// src/app/(authenticated)/company/new/page.tsx
import { CompanyForm } from "@/components/company/company-form";
import { ensureDefaultPortfolio } from "../../actions/portfolio-actions";

export default async function NewCompanyPage() {
  const portfolioId = await ensureDefaultPortfolio();

  return (
    <div>
      <CompanyForm portfolioId={portfolioId} />
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat: add new company form"
```

---

## Task 10: Excel Import Tool

**Files:**
- Create: `src/app/(authenticated)/import/page.tsx`
- Create: `src/components/import/excel-import.tsx`
- Create: `src/app/api/import/route.ts`
- Create: `src/lib/import/excel-parser.ts`

**Step 1: Install xlsx library**

```bash
npm install xlsx
```

**Step 2: Create Excel parser**

```typescript
// src/lib/import/excel-parser.ts
import * as XLSX from "xlsx";

export interface ParsedCompany {
  name: string;
  symbol: string | null;
  market_cap: number | null;
  investment_horizon_years: number | null;
  star_rating: number | null;
  strategy: "core" | "satellite" | null;
  current_price: number | null;
  buy_price: number | null;
  expected_returns: number | null;
  thesis: string | null;
  highlights: string | null;
  financial_years: Array<{
    year: string;
    is_estimate: boolean;
    sort_order: number;
    revenue: number | null;
    revenue_growth_pct: number | null;
    ebitda: number | null;
    ebitda_margin_pct: number | null;
    depreciation: number | null;
    finance_cost: number | null;
    other_income: number | null;
    exceptional_items: number | null;
    pbt: number | null;
    tax_pct: number | null;
    pat: number | null;
    pat_growth_pct: number | null;
    pat_margin_pct: number | null;
    pe: number | null;
    peg: number | null;
  }>;
  valuation_scenarios: Array<{
    scenario_type: "bull" | "base" | "bare";
    target_pe: number | null;
    target_market_cap: number | null;
    irr: number | null;
    buying_market_cap: number | null;
    buy_price: number | null;
  }>;
  timeline_entries: Array<{
    quarter: string | null;
    content: string;
    sort_order: number;
  }>;
}

export function parseExcel(buffer: ArrayBuffer): ParsedCompany[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const companies: ParsedCompany[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName === "All Companies") continue;

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    if (data.length < 15) continue;

    // Parse header section (rows 1-12 typically)
    const company: ParsedCompany = {
      name: String(data[1]?.[1] ?? sheetName),
      symbol: data[2]?.[1] ? String(data[2][1]) : null,
      market_cap: parseNum(data[3]?.[1]),
      investment_horizon_years: parseNum(data[4]?.[1]),
      star_rating: parseNum(data[5]?.[1]),
      strategy: parseStrategy(data[6]?.[1]),
      expected_returns: parseNum(data[7]?.[1]),
      current_price: parseNum(data[8]?.[1]),
      buy_price: parseNum(data[9]?.[1]),
      thesis: data[12]?.[0] ? String(data[12][0]) : null,
      highlights: null,
      financial_years: [],
      valuation_scenarios: [],
      timeline_entries: [],
    };

    // Parse financial model (rows ~14-35)
    const fyStartRow = findRow(data, "Revenue", 13);
    if (fyStartRow >= 0) {
      const yearHeaders = data[fyStartRow - 1]?.slice(1) ?? [];
      const years = yearHeaders
        .filter((h) => h && String(h).match(/FY\d+/))
        .map(String);

      const metricRows: Record<string, number> = {};
      const metrics = [
        "Revenue", "Revenue growth", "EBITDA", "EBITDA margins",
        "Depreciation", "Finance cost", "Other income", "Exceptional",
        "PBT", "Tax", "PAT", "PAT growth", "PAT margins", "PE", "PEG",
      ];
      for (let r = fyStartRow; r < Math.min(fyStartRow + 25, data.length); r++) {
        const label = String(data[r]?.[0] ?? "").toLowerCase();
        for (const m of metrics) {
          if (label.includes(m.toLowerCase()) && !(m.toLowerCase() in metricRows)) {
            metricRows[m.toLowerCase()] = r;
          }
        }
      }

      for (let i = 0; i < years.length; i++) {
        const col = i + 1;
        company.financial_years.push({
          year: years[i],
          is_estimate: years[i].includes("E"),
          sort_order: i,
          revenue: getCell(data, metricRows["revenue"], col),
          revenue_growth_pct: getCell(data, metricRows["revenue growth"], col),
          ebitda: getCell(data, metricRows["ebitda"], col),
          ebitda_margin_pct: getCell(data, metricRows["ebitda margins"], col),
          depreciation: getCell(data, metricRows["depreciation"], col),
          finance_cost: getCell(data, metricRows["finance cost"], col),
          other_income: getCell(data, metricRows["other income"], col),
          exceptional_items: getCell(data, metricRows["exceptional"], col),
          pbt: getCell(data, metricRows["pbt"], col),
          tax_pct: getCell(data, metricRows["tax"], col),
          pat: getCell(data, metricRows["pat"], col),
          pat_growth_pct: getCell(data, metricRows["pat growth"], col),
          pat_margin_pct: getCell(data, metricRows["pat margins"], col),
          pe: getCell(data, metricRows["pe"], col),
          peg: getCell(data, metricRows["peg"], col),
        });
      }
    }

    // Parse valuation scenarios
    const valStartRow = findRow(data, "Bull", fyStartRow + 10);
    if (valStartRow >= 0) {
      for (const type of ["bull", "base", "bare"] as const) {
        const row = findRow(data, type, valStartRow - 1);
        if (row >= 0) {
          company.valuation_scenarios.push({
            scenario_type: type,
            target_pe: parseNum(data[row]?.[1]),
            target_market_cap: parseNum(data[row]?.[2]),
            irr: parseNum(data[row]?.[3]),
            buying_market_cap: parseNum(data[row]?.[4]),
            buy_price: parseNum(data[row]?.[5]),
          });
        }
      }
    }

    // Parse highlights
    const hlRow = findRow(data, "Highlight", valStartRow + 5);
    if (hlRow >= 0) {
      const hlParts: string[] = [];
      for (let r = hlRow + 1; r < data.length; r++) {
        const cell = data[r]?.[0];
        if (!cell || String(cell).match(/^(Timeline|Q\dFY)/i)) break;
        hlParts.push(String(cell));
      }
      if (hlParts.length) company.highlights = hlParts.join("\n");
    }

    // Parse timeline
    const tlRow = findRow(data, "Timeline", hlRow > 0 ? hlRow : 30);
    if (tlRow >= 0) {
      let sortOrder = 0;
      for (let r = tlRow + 1; r < data.length; r++) {
        const cell = data[r]?.[0];
        if (!cell) continue;
        const text = String(cell);
        const quarterMatch = text.match(/Q\dFY\d+/);
        company.timeline_entries.push({
          quarter: quarterMatch ? quarterMatch[0] : null,
          content: text,
          sort_order: sortOrder++,
        });
      }
    }

    companies.push(company);
  }

  return companies;
}

function parseNum(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function parseStrategy(val: unknown): "core" | "satellite" | null {
  if (!val) return null;
  const s = String(val).toLowerCase();
  if (s.includes("core")) return "core";
  if (s.includes("satellite")) return "satellite";
  return null;
}

function findRow(data: unknown[][], text: string, startFrom: number): number {
  const lower = text.toLowerCase();
  for (let r = Math.max(0, startFrom); r < data.length; r++) {
    if (String(data[r]?.[0] ?? "").toLowerCase().includes(lower)) return r;
  }
  return -1;
}

function getCell(data: unknown[][], row: number | undefined, col: number): number | null {
  if (row == null) return null;
  return parseNum(data[row]?.[col]);
}
```

**Step 3: Create import API route**

```typescript
// src/app/api/import/route.ts
import { createClient } from "@/lib/supabase/server";
import { parseExcel } from "@/lib/import/excel-parser";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const companies = parseExcel(buffer);

  // Ensure default portfolio
  let { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("is_default", true)
    .single();

  if (!portfolio) {
    const { data } = await supabase
      .from("portfolios")
      .insert({ user_id: user.id, name: "Imported Portfolio", is_default: true })
      .select("id")
      .single();
    portfolio = data;
  }

  let imported = 0;
  const errors: string[] = [];

  for (const c of companies) {
    try {
      const { data: company, error: compErr } = await supabase
        .from("companies")
        .insert({
          user_id: user.id,
          portfolio_id: portfolio!.id,
          name: c.name,
          symbol: c.symbol,
          market_cap: c.market_cap,
          current_price: c.current_price,
          buy_price: c.buy_price,
          star_rating: c.star_rating,
          strategy: c.strategy,
          investment_horizon_years: c.investment_horizon_years,
          expected_returns: c.expected_returns,
          thesis: c.thesis,
          highlights: c.highlights,
        })
        .select("id")
        .single();

      if (compErr) throw compErr;

      if (c.financial_years.length) {
        await supabase.from("financial_years").insert(
          c.financial_years.map((fy) => ({
            company_id: company!.id,
            user_id: user.id,
            ...fy,
          }))
        );
      }

      if (c.valuation_scenarios.length) {
        await supabase.from("valuation_scenarios").insert(
          c.valuation_scenarios.map((vs) => ({
            company_id: company!.id,
            user_id: user.id,
            ...vs,
          }))
        );
      }

      if (c.timeline_entries.length) {
        await supabase.from("timeline_entries").insert(
          c.timeline_entries.map((te) => ({
            company_id: company!.id,
            user_id: user.id,
            entry_date: new Date().toISOString().split("T")[0],
            ...te,
          }))
        );
      }

      imported++;
    } catch (err) {
      errors.push(`${c.name}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({ imported, total: companies.length, errors });
}
```

**Step 4: Create import UI page**

```typescript
// src/app/(authenticated)/import/page.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setStatus("Importing...");

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/import", { method: "POST", body: formData });
    const result = await res.json();

    if (res.ok) {
      setStatus(
        `Imported ${result.imported}/${result.total} companies.` +
        (result.errors.length ? `\nErrors: ${result.errors.join(", ")}` : "")
      );
    } else {
      setStatus(`Error: ${result.error}`);
    }
    setImporting(false);
  };

  return (
    <div className="max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Import from Excel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload your SOIC Flexicap Excel file to import all companies,
            financial models, valuations, and timeline entries.
          </p>
          <Input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={!file || importing}>
              {importing ? "Importing..." : "Import"}
            </Button>
            <Button variant="outline" onClick={() => router.push("/")}>
              Back to Dashboard
            </Button>
          </div>
          {status && (
            <pre className="whitespace-pre-wrap text-sm p-3 rounded bg-muted">
              {status}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 5: Add import link to navigation**

Update `src/components/layout/app-header.tsx` — add:
```tsx
<Link href="/import" className="text-muted-foreground hover:text-foreground">
  Import
</Link>
```

**Step 6: Commit**

```bash
git add .
git commit -m "feat: Excel import tool for SOIC Flexicap spreadsheet"
```

---

## Task 11: Settings Page

**Files:**
- Create: `src/app/(authenticated)/settings/page.tsx`

**Step 1: Settings page**

```typescript
// src/app/(authenticated)/settings/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("*, companies(count)")
    .order("created_at");

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Name:</strong> {profile?.display_name}</p>
          <p><strong>Email:</strong> {profile?.email}</p>
          <p>
            <strong>Plan:</strong>{" "}
            <Badge variant="outline">{profile?.plan ?? "free"}</Badge>
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Portfolios</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {portfolios?.map((p) => (
              <li key={p.id} className="flex items-center justify-between">
                <span>{p.name}{p.is_default && " (default)"}</span>
                <Badge variant="secondary">
                  {(p.companies as { count: number }[])?.[0]?.count ?? 0} companies
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add .
git commit -m "feat: settings page with profile and portfolio info"
```

---

## Task 12: Final Cleanup & Deploy Prep

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `vercel.json` (if needed)
- Modify: `next.config.ts`

**Step 1: Update root layout**

```typescript
// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "StockTracker — Track Your Investments",
  description: "Track stock investments with financial models, valuations, and thesis management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

**Step 2: Configure Next.js**

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "lh3.googleusercontent.com" }, // Google avatars
    ],
  },
};

export default nextConfig;
```

**Step 3: Run build and fix any errors**

```bash
npm run build
```

Fix any TypeScript or build errors that appear.

**Step 4: Commit**

```bash
git add .
git commit -m "chore: final cleanup, metadata, and build config"
```

**Step 5: Deploy to Vercel**

```bash
npx vercel
```

Follow prompts, link to Vercel project. Set environment variables in Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Step 6: Deploy production**

```bash
npx vercel --prod
```

**Step 7: Final commit**

```bash
git add .
git commit -m "chore: deploy configuration"
```

---

## Summary of Architecture Patterns

| Pattern | Where Used | Purpose |
|---------|-----------|---------|
| **Provider Pattern** | `src/lib/providers/stock-price/` | Swap price data sources without code changes |
| **Registry Pattern** | `stock-price/registry.ts` | Register/discover providers at runtime |
| **Repository Pattern** | Server Actions + Supabase client | Abstract data access, easy to swap DB layer |
| **RLS (Row Level Security)** | All tables | Multi-tenant isolation at DB level |
| **Server Components** | All page.tsx files | Secure data fetching, no client exposure |
| **Server Actions** | `actions/*.ts` | Mutations with built-in CSRF protection |
| **Computed Fields** | `lib/utils/calculations.ts` | Pure functions, testable, no storage overhead |
| **HTML Sanitization** | Server Actions (DOMPurify) | XSS prevention for rich text |

## File Structure Overview

```
src/
  app/
    layout.tsx
    (authenticated)/
      layout.tsx
      page.tsx                    # Dashboard
      actions/
        portfolio-actions.ts
        company-actions.ts
        financial-actions.ts
        valuation-actions.ts
        timeline-actions.ts
      company/
        new/page.tsx
        [id]/page.tsx
        [id]/loading.tsx
      import/page.tsx
      settings/page.tsx
    login/page.tsx
    auth/callback/route.ts
    api/import/route.ts
  components/
    auth/
      login-button.tsx
      user-nav.tsx
    layout/
      app-header.tsx
    dashboard/
      companies-table.tsx
    company/
      company-header.tsx
      company-form.tsx
      thesis-tab.tsx
      financial-model-tab.tsx
      valuation-tab.tsx
      timeline-tab.tsx
    ui/  (shadcn components)
  lib/
    supabase/
      client.ts
      server.ts
      middleware.ts
    providers/
      stock-price/
        types.ts
        manual-provider.ts
        registry.ts
    import/
      excel-parser.ts
    utils/
      calculations.ts
  types/
    database.ts
  middleware.ts
supabase/
  migrations/
    001_initial_schema.sql
```
