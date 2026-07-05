import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { SubPageShell } from "@/components/marketing/sub-page-shell";
import { ValuePoints } from "@/components/marketing/value-points";
import { ProofShot } from "@/components/marketing/proof-shot";
import { LiveValuationDemo } from "@/components/marketing/demos/live-valuation-demo";
import { ValuationProof } from "@/components/marketing/demos/valuation-proof";
import type { Faq } from "@/components/marketing/faq";

const PATH = "/intrinsic-value-margin-of-safety";
const TITLE = "Intrinsic value & margin of safety calculator for stocks";
const DESCRIPTION =
  "Build bull, base and bear valuation scenarios and let StockTracker compute intrinsic value, margin of safety, IRR and a disciplined buy price — recalculated against the live price, never frozen in a PDF.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "intrinsic value calculator",
    "margin of safety",
    "stock valuation tool",
    "bull base bear valuation",
    "IRR calculator stocks",
  ],
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: canonical(PATH) },
};

const FAQS: Faq[] = [
  {
    q: "Do the valuations update when the price changes?",
    a: "Yes — that's the whole point. Unlike a static research PDF, StockTracker recomputes margin of safety, IRR, target buy price and the BUY signal against the live price every time you look. The numbers are never stale.",
  },
  {
    q: "How is intrinsic value calculated?",
    a: "You build a multi-year model — revenue, margins, tax — and set bull, base and bare assumptions using a target PE or EV/EBITDA. StockTracker derives the target market cap, IRR and the buy price that earns your required return.",
  },
  {
    q: "What is margin of safety and how is it shown?",
    a: "Margin of safety is the gap between your disciplined buy price and the current price, shown as a colour-coded percentage on every company and across the dashboard, so you can see at a glance what's trading below your target.",
  },
  {
    q: "Does it show forward PE and PEG?",
    a: "Yes. From your projection model, StockTracker computes forward PE and PEG so you can sanity-check whether the growth justifies the multiple.",
  },
];

const POINTS = [
  {
    title: "Bull, base and bare — built in",
    body: "Three-case valuation isn't a habit you have to remember; it's the structure. Enter one lever and the model does the rest.",
  },
  {
    title: "Your buy price is an output",
    body: "It's back-solved from your required return and your estimates — not a gut number. Revise an assumption and the target moves with it.",
  },
  {
    title: "Never a dead number",
    body: "Margin of safety, IRR and the buy signal recompute against the live price, so what you see today is true today.",
  },
];

export default function ValuationPage() {
  return (
    <SubPageShell
      path={PATH}
      breadcrumbLabel="Intrinsic value & margin of safety"
      eyebrow="Live, never stale"
      h1="Intrinsic value and margin of safety that move with the price"
      sub="A research PDF freezes the numbers the day it's printed. StockTracker keeps your target price, margin of safety and IRR recalculating against the live market — the discipline of a research desk, always current."
      demo={<LiveValuationDemo />}
      faqs={FAQS}
    >
      <ValuePoints
        title="The valuation workflow, automated"
        sub="Keep the rigour of a proper model — lose the fragile spreadsheet."
        points={POINTS}
      />
      <ProofShot
        alt="StockTracker Projections & Valuations tab. Top section: a PE/Earnings model grid showing Revenue, EBITDA, PAT, Forward PE and Forward PEG across Mar 2024 actuals and Mar 2026–2028 estimates (blue columns). PAT row is annotated as feeding into valuation scenarios. Bottom section: Valuation Scenarios table with Bull, Base and Bare rows showing Target PE, Target Market Cap, IRR, Buying Market Cap and Buy Price. The Expected Returns input (20%) is annotated as the driver of the Buying Market Cap and the Base case target buy price. Current Market Cap is annotated as live. Numbers are randomly generated."
        caption="Real StockTracker model — numbers randomly generated for visualization only."
      >
        <ValuationProof />
      </ProofShot>
    </SubPageShell>
  );
}
