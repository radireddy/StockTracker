import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { SubPageShell } from "@/components/marketing/sub-page-shell";
import { ValuePoints } from "@/components/marketing/value-points";
import { AllocationDemo } from "@/components/marketing/demos/allocation-demo";
import type { Faq } from "@/components/marketing/faq";

const PATH = "/portfolio-allocation";
const TITLE = "Portfolio allocation & rebalancing by conviction";
const DESCRIPTION =
  "Size positions by conviction with star-rating target weight bands you control. StockTracker flags every over- and under-weight holding and tells you the exact rupees to add or trim — so incremental capital follows conviction.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "portfolio allocation tool",
    "portfolio rebalancing",
    "conviction based position sizing",
    "position sizing tool",
    "where to invest more",
  ],
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: canonical(PATH) },
};

const FAQS: Faq[] = [
  {
    q: "How does the allocation feature decide where I should invest more?",
    a: "You assign each holding a star rating, and each rating maps to a target weight band you configure. The allocation view then flags which positions are under- or over-weight and shows the exact rupee amount to add or trim to get back in range.",
  },
  {
    q: "Can I set my own target weights?",
    a: "Yes. The default bands (for example 6–8% for four-star names) are just a starting point — you set your own minimum and maximum per star rating in Settings, and the engine measures every position against your rules.",
  },
  {
    q: "Can I allocate by invested cost or by current value?",
    a: "Both. Toggle the basis between what you paid (invested cost) and what it's worth today (market value) to see allocation either way.",
  },
  {
    q: "Does it help me rebalance an over-weight position?",
    a: "Yes. Over-weight holdings are flagged in red with the exact rupee amount to trim to bring them back inside their target band.",
  },
];

const POINTS = [
  {
    title: "Conviction sets the weight",
    body: "Star ratings become target weight bands. Your best ideas get the most room; laggards can't quietly bloat past their limit.",
  },
  {
    title: "Answered to the rupee",
    body: "Every under- and over-weight position shows the exact amount to add or trim — so deploying fresh cash is objective, not emotional.",
  },
  {
    title: "See the whole book at a glance",
    body: "Visual range bars and status filters show what's under, in-range and over, so you can rebalance the entire portfolio in minutes.",
  },
];

export default function AllocationPage() {
  return (
    <SubPageShell
      path={PATH}
      breadcrumbLabel="Portfolio allocation"
      eyebrow="Where the next rupee goes"
      h1="Portfolio allocation anchored to your conviction"
      sub="You have cash to invest — which stock, and how much? StockTracker turns your conviction into target weight bands, flags every position that's out of line, and tells you the exact rupees to add or trim."
      demo={<AllocationDemo />}
      faqs={FAQS}
    >
      <ValuePoints
        title="Incremental investing, made mechanical"
        sub="Let your portfolio drift toward your conviction with every rupee you add."
        points={POINTS}
      />
    </SubPageShell>
  );
}
