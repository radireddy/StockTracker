import Link from "next/link";
import { Upload, PlusCircle, Star, Target, TrendingUp } from "lucide-react";

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
      {/* Pain narrative */}
      <div className="mx-auto max-w-xl text-center">
        <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground dark:bg-primary/10 dark:text-primary">
          For research advisory subscribers
        </span>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Your RA just published a buy call.
          <br />
          The stock moved 6% by Monday.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          StockTracker makes sure you always know if it&rsquo;s still worth
          buying — and exactly how much to add. Set up takes minutes.
        </p>
      </div>

      {/* 3 steps */}
      <div className="mt-10 w-full max-w-xl space-y-3">
        <Step
          number={1}
          icon={<Upload size={16} aria-hidden />}
          title="Import your holdings"
          detail="Real quantities + cost basis from your broker statement → allocation comes alive instantly"
        />
        <Step
          number={2}
          icon={<PlusCircle size={16} aria-hidden />}
          title="Add your RA companies"
          detail="Both the ones you own and the ones you're watching — same full research depth for both"
        />
        <Step
          number={3}
          icon={<Star size={16} aria-hidden />}
          title="Set rating, target price & valuation"
          detail="MoS%, IRR and a live BUY signal activate the moment you enter the data from the report"
        />
      </div>

      {/* CTAs */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
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
      <div className="mx-auto mt-14 w-full max-w-xl rounded-2xl border border-border bg-card p-6 text-center">
        <p className="text-base font-semibold text-foreground">
          The next time volatility hits, you&rsquo;ll have an answer.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Which companies are below your buy price. Which positions are
          under-allocated. The exact rupees to deploy. Data, not panic.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {[
            { icon: <Target size={12} />, label: "MoS live" },
            { icon: <TrendingUp size={12} />, label: "Allocation gap" },
            { icon: <Star size={12} />, label: "BUY signal" },
          ].map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
            >
              {chip.icon}
              {chip.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
