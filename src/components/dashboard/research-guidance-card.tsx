import { Star, Target, TrendingUp } from "lucide-react";

/** One "input → what it unlocks" row inside the guidance card. */
function GuideRow({
  icon,
  title,
  detail,
  unlocks,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  unlocks: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[0.82rem] font-semibold leading-tight">{title}</div>
        <div className="text-[0.72rem] text-muted-foreground">{detail}</div>
      </div>
      <span className="ml-auto shrink-0 rounded-full bg-accent px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-primary">
        {unlocks}
      </span>
    </div>
  );
}

/**
 * Shown in the allocation slot when a holdings portfolio has no research data.
 * Purely informational: it explains what each research input unlocks and tells
 * the user to click a company to add it. No buttons — the action is opening a
 * company row (existing behavior).
 */
export function ResearchGuidanceCard({
  companiesCount,
  accountsCount,
}: {
  companiesCount: number;
  accountsCount: number;
}) {
  const companyLabel = companiesCount === 1 ? "company" : "companies";
  const accountLabel = accountsCount === 1 ? "account" : "accounts";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-6 shadow-soft">
      <div>
        <h3 className="text-sm font-semibold">📊 Unlock allocation &amp; valuation tracking</h3>
        <p className="mt-1 text-[0.8rem] text-muted-foreground">
          You&rsquo;re tracking {companiesCount} {companyLabel}
          {accountsCount > 0 ? ` across ${accountsCount} ${accountLabel}` : ""}. Click a company
          to add its rating and research data — each feature below turns on by itself.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <GuideRow
          icon={<Star size={15} aria-hidden="true" />}
          title="Rate conviction (1–4★)"
          detail="How strongly you back each company"
          unlocks="Allocation health"
        />
        <GuideRow
          icon={<Target size={15} aria-hidden="true" />}
          title="Set a target buy price"
          detail="Your ideal entry price"
          unlocks="MoS %"
        />
        <GuideRow
          icon={<TrendingUp size={15} aria-hidden="true" />}
          title="Add valuation scenarios"
          detail="Base / bare-case fair value & IRR"
          unlocks="Base / Bare"
        />
      </div>
    </div>
  );
}
