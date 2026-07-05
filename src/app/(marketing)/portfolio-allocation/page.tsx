import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { SubPageShell } from "@/components/marketing/sub-page-shell";
import { ValuePoints } from "@/components/marketing/value-points";
import { ProofShot } from "@/components/marketing/proof-shot";
import { HowTo } from "@/components/marketing/how-to";
import { AllocationDemo } from "@/components/marketing/demos/allocation-demo";
import { AllocationProof } from "@/components/marketing/demos/allocation-proof";
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

const HOW_TO_STEPS = [
  {
    title: "Rate each company by conviction",
    body: "Assign 1–4 stars to every holding. Four stars means highest conviction; one star is a small, speculative position. Ratings are yours to set and revise any time.",
  },
  {
    title: "Set your target weight bands in Settings",
    body: "Map each star rating to a weight range — for example, 4★ = 6–8%, 3★ = 4–6%. The defaults are a sensible starting point; adjust them to match your portfolio style.",
  },
  {
    title: "Open the Allocation view and read the health widget",
    body: "The top panel shows each conviction bucket's current weight vs. its target band at a glance. Orange = under-deployed, green = in range, red = over-weight.",
  },
  {
    title: "Follow the rupee signals down the table",
    body: "Each company row shows Inv %, Cur %, its visual status bar, and the exact rupee amount to add or trim. Deploy fresh capital into the highest-conviction under-weight positions first.",
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
      <ProofShot
        alt="StockTracker allocation view showing an Allocation health widget at the top with conviction-bucket bars: 4-star bucket at 20.2% (UNDER, target 24–32%), 3-star at 54.7% (UNDER, target 64–96%), 2-star at 17.2% (IN RANGE, target 10–20%), 1-star at 7.9% (OVER, target 0–4%). Below it, a grouped table lists 2–3 companies per star bucket with columns for CMP, Target Buy, Inv%, Cur%, Target range, an invested status bar, Status badge (UNDER/IN RANGE/OVER), Delta, and MoS%. Company names and tickers are masked with redaction bars."
        caption="Real StockTracker allocation screen — company names masked, figures illustrative."
      >
        <AllocationProof />
      </ProofShot>
      <HowTo
        title="How to track and rebalance your allocation"
        sub="From star ratings to exact rupee signals — here's the workflow."
        steps={HOW_TO_STEPS}
      />
    </SubPageShell>
  );
}
