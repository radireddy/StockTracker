import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { SubPageShell } from "@/components/marketing/sub-page-shell";
import { ValuePoints } from "@/components/marketing/value-points";
import { ProofShot } from "@/components/marketing/proof-shot";
import { HowTo } from "@/components/marketing/how-to";
import { LiveValuationDemo } from "@/components/marketing/demos/live-valuation-demo";
import { ValuationProof } from "@/components/marketing/demos/valuation-proof";
import type { Faq } from "@/components/marketing/faq";

const PATH = "/living-research-report";
const TITLE = "Turn a static advisory report into a live valuation model";
const DESCRIPTION =
  "Your stock advisor's report had a target price and a thesis the day it was written. StockTracker takes that target, pairs it with live prices, and lets you watch the margin of safety move in real time — so the report stays useful long after it was published.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "stock advisory tracker",
    "research report to live model",
    "SEBI advisor recommendation tracker",
    "track stock tips margin of safety",
    "advisory portfolio tracker India",
    "stock research report tracker",
  ],
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: canonical(PATH) },
};

const FAQS: Faq[] = [
  {
    q: "My advisor gives me a buy price and a target — how does that fit into StockTracker?",
    a: "Enter the advisor's buy price as your target buy price and their target as the bull-case value in your valuation scenarios. The moment CMP falls to or below your buy price, the Signal column lights up BUY ZONE — the report's recommendation made actionable, live.",
  },
  {
    q: "The report had a 12-month target price. Can I track how close we are?",
    a: "Yes. Enter the target as a valuation scenario — bull, base, or bare — and StockTracker computes your margin of safety against it live. You see in real time how far the market still is from the advisor's target and what IRR you would get if the stock reaches it.",
  },
  {
    q: "What if the advisor revises the target after quarterly results?",
    a: "Edit the valuation scenario. The margin of safety and IRR update instantly — no rebuilding a new sheet, no hunting through old emails.",
  },
  {
    q: "The report came with a full financial model. Can I replicate that here?",
    a: "Yes. The Projections & Valuations tab has a multi-year driver grid — revenue, margins, growth — from which the app computes PAT, valuation, and buy prices. You can enter the advisor's projection assumptions directly and see where they lead.",
  },
  {
    q: "I follow multiple advisors and services. Can I track each separately?",
    a: "Yes. Each company gets its own workspace. If two advisors cover the same stock you can keep both as separate valuation scenarios (e.g. 'Advisor A base' vs. 'Advisor B base') and compare them side by side.",
  },
];

const POINTS = [
  {
    title: "The thesis stays useful",
    body: "Enter the advisor's target and thesis once. The margin of safety against it updates live as the price moves — so the report is not a frozen PDF but a living signal.",
  },
  {
    title: "Your buy zone, made visible",
    body: "Set the buy price from the advisory note as your target buy price. The Signal column turns green the moment the market offers it to you — you act on the recommendation when the entry is actually available, not just when the report was fresh.",
  },
  {
    title: "Log every revision, forever",
    body: "Each quarter, advisors revise projections and targets. Log every change in the Timeline — what was projected, what actually came in — and build an honest record of how well the research held up.",
  },
];

const STEPS = [
  {
    title: "Add the company from the advisory note",
    body: "Create a company page and paste the report's thesis into the Thesis tab. You now have a permanent home for the research that travels with you, not with the PDF.",
  },
  {
    title: "Enter the advisor's target as a valuation scenario",
    body: "In Projections & Valuations, create a base-case (or bull-case) scenario with the report's target price and the implied multiple. StockTracker computes your margin of safety and IRR against it — live.",
  },
  {
    title: "Set the recommended buy price as your target buy price",
    body: "Type the advisor's entry price into the Target buy field. Now the Signal column watches live prices against it — when the stock finally trades there, a green BUY ZONE tag appears.",
  },
  {
    title: "Log each quarterly revision in the Timeline",
    body: "After every result, add a Timeline entry: what the advisor projected, what the company actually delivered, whether the thesis still holds. Build an evidence trail that makes the next decision easier.",
  },
];

export default function LivingResearchReportPage() {
  return (
    <SubPageShell
      path={PATH}
      breadcrumbLabel="Living research report"
      eyebrow="For the advisory subscriber"
      h1="Your advisor's report was frozen the day it printed."
      sub="Take the target price and thesis from any stock advisory note and give them a live feed. StockTracker shows you the current margin of safety, fires a buy signal when price finally meets the recommendation, and lets you log how the thesis held up quarter by quarter."
      demo={<LiveValuationDemo />}
      faqs={FAQS}
    >
      <ValuePoints
        title="The report's target, made actionable"
        sub="Static advice + live prices = a signal you can actually act on."
        points={POINTS}
      />
      <ProofShot
        alt="StockTracker Projections & Valuations tab showing a multi-year P&L model grid and a valuation scenarios table with bull, base, and bare cases — each with a target price, margin of safety, and IRR. Company name, ticker, and all financial figures are masked."
        caption="Real StockTracker valuation screen — company name and figures masked for privacy. Numbers illustrative."
      >
        <ValuationProof />
      </ProofShot>
      <HowTo
        sub="From a PDF that ages on arrival to a live model you update every quarter."
        steps={STEPS}
      />
    </SubPageShell>
  );
}
