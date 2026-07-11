import Link from "next/link";
import { Upload, PlusCircle, Star, Target, TrendingUp, BarChart2 } from "lucide-react";

function SignalCard({
  icon,
  question,
  answer,
}: {
  icon: React.ReactNode;
  question: string;
  answer: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-primary">
        {icon}
      </span>
      <p className="mt-3 text-[0.82rem] font-medium text-muted-foreground">
        {question}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{answer}</p>
    </div>
  );
}

function Step({
  number,
  icon,
  title,
  detail,
}: {
  number: number;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-border bg-card p-5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        {number}
      </span>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-[0.8rem] leading-relaxed text-muted-foreground">
            {detail}
          </p>
        </div>
      </div>
    </div>
  );
}

export function WelcomeScreen() {
  return (
    <div className="flex flex-col items-center px-4 py-16">
      {/* Main headline — data over emotions */}
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Every buy and sell decision,
          <br className="hidden sm:block" /> backed by data. Not by how you
          feel.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          Most investors buy because something feels right and sell because
          something feels wrong. StockTracker gives you three live answers so
          every call is objective — not emotional.
        </p>
      </div>

      {/* 3 data signals — the core value, prominently shown */}
      <div className="mt-10 grid w-full max-w-2xl gap-4 sm:grid-cols-3">
        <SignalCard
          icon={<Target size={18} aria-hidden />}
          question="Should I buy this today?"
          answer="Margin of safety — live, against today's price"
        />
        <SignalCard
          icon={<BarChart2 size={18} aria-hidden />}
          question="How much should I add or trim?"
          answer="Allocation gap — in exact rupees, per conviction"
        />
        <SignalCard
          icon={<TrendingUp size={18} aria-hidden />}
          question="Is it still worth it at this price?"
          answer="Bull / base / bear buy price range — derived from your assumptions, live"
        />
      </div>

      {/* RA callout — one line, not the headline */}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Subscribed to a research advisory service?{" "}
        <Link
          href="/research-advisory-portfolio-tracker"
          className="font-medium text-primary hover:underline"
        >
          See how StockTracker makes static RA reports live →
        </Link>
      </p>

      {/* Setup steps */}
      <div className="mt-12 w-full max-w-2xl space-y-3">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Set up in 3 steps
        </p>
        <Step
          number={1}
          icon={<Upload size={16} aria-hidden />}
          title="Import your holdings"
          detail="Real quantities + cost basis from your broker statement — allocation and P&L come alive instantly"
        />
        <Step
          number={2}
          icon={<PlusCircle size={16} aria-hidden />}
          title="Add your companies"
          detail="Holdings you own and names you're watching — same full research depth for both"
        />
        <Step
          number={3}
          icon={<Star size={16} aria-hidden />}
          title="Set rating, valuation assumptions & expected return"
          detail="Bull, base and bear case buy prices are derived from your assumptions — giving you a range, not a single number. MoS%, IRR and a BUY signal turn live instantly."
        />
      </div>

      {/* CTAs */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/import"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-soft transition-[filter] hover:brightness-105"
        >
          <Upload size={15} aria-hidden />
          Import Zerodha statement
        </Link>
        <Link
          href="/company/new"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
        >
          <PlusCircle size={15} aria-hidden />
          Add a company manually
        </Link>
      </div>

      {/* Volatility promise */}
      <div className="mx-auto mt-14 w-full max-w-2xl rounded-2xl border border-border bg-card p-6 text-center">
        <p className="text-base font-semibold text-foreground">
          When volatility hits, most investors freeze. You won&rsquo;t.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          A market fall looks like a crisis or a buying opportunity — without
          data you can&rsquo;t tell which. With live MoS, allocation gaps and
          base-case returns in front of you, you shuffle the portfolio, add to
          high-conviction names and trim the crowded ones. The data decides —
          not the panic.
        </p>
      </div>
    </div>
  );
}
