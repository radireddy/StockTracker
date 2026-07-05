import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { SubPageShell } from "@/components/marketing/sub-page-shell";
import { ValuePoints } from "@/components/marketing/value-points";
import { ProofShot } from "@/components/marketing/proof-shot";
import { HowTo } from "@/components/marketing/how-to";
import { LiveValuationDemo } from "@/components/marketing/demos/live-valuation-demo";
import { ValuationModelProof } from "@/components/marketing/demos/valuation-model-proof";
import type { Faq } from "@/components/marketing/faq";

const PATH = "/stock-valuation-model";
const TITLE = "Stock valuation model — PE, EV/EBITDA, PEG, live buy price. Out of the spreadsheet.";
const DESCRIPTION =
  "Build a multi-year financial model for every Indian stock you research — revenue and margin drivers, PE or EV/EBITDA framework, bull/base/bare scenarios, forward PEG sanity check, and a buy price back-solved from your required return. All in StockTracker, not in a new Excel sheet.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "stock valuation model",
    "EV/EBITDA calculator India",
    "PEG ratio tool",
    "intrinsic value spreadsheet alternative",
    "PE valuation model Indian stocks",
    "back-solved buy price calculator",
  ],
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: canonical(PATH) },
};

const FAQS: Faq[] = [
  {
    q: "Which valuation frameworks does StockTracker support?",
    a: "Two: PE/Earnings (you set the target PE and the forward EPS; the app computes target price, margin of safety, and IRR) and EV/EBITDA (same structure, with EBITDA as the driver and an EV-to-equity bridge). You pick one per model, but you can create multiple models per company — for example a PE model and an EV/EBITDA model side by side.",
  },
  {
    q: "What is the 'back-solved buy price'?",
    a: "Instead of asking 'what is this stock worth at today's CMP?', back-solving asks 'given my base-case target price and my required return of X% per year, what is the maximum price I should pay today?' The app solves for that entry price automatically — it's the same number as your target buy price on the watchlist and dashboard.",
  },
  {
    q: "What is the forward PEG check?",
    a: "PEG (PE divided by earnings growth rate) is a sanity check on whether the multiple you're paying is reasonable given the growth you're projecting. StockTracker computes it from your model's projected EPS growth and the base-case target PE so you can spot a stretched valuation before you finalise your price.",
  },
  {
    q: "Can I model multiple scenarios per company?",
    a: "Yes. Every company has a default model (the one whose buy price drives the dashboard BUY signal), but you can save additional models under the same company. Bull/base/bare is built into every model as three columns of the same projection — they share the same growth assumptions but differ only in the target multiple you assign each case.",
  },
];

const POINTS = [
  {
    title: "No more re-typing the same formulas",
    body: "Every new Excel sheet starts with the same skeleton: revenue growth, EBITDA margin, PAT, EPS. StockTracker has that skeleton built in — you enter the drivers, it computes the rest, for every company you research.",
  },
  {
    title: "Bull, base, and bare on the same page",
    body: "Set optimistic, realistic, and pessimistic multiples for the same set of projections. The three target prices, margins of safety, and IRRs are side by side — so you know the downside before you decide, not after.",
  },
  {
    title: "The buy price recomputes when results come in",
    body: "After each quarterly result you revise the projections. The target price, margin of safety, and buy price all update immediately — in the same model you built originally, not in a copy that forked six months ago.",
  },
];

const STEPS = [
  {
    title: "Open a company and go to Projections & Valuations",
    body: "Every company in StockTracker has a Projections & Valuations tab. It starts with a blank grid ready for your assumptions.",
  },
  {
    title: "Pick PE/Earnings or EV/EBITDA",
    body: "Choose the framework that fits the business — PE for most listed companies, EV/EBITDA for capital-intensive or loss-making businesses where EBITDA is the more meaningful driver.",
  },
  {
    title: "Enter the drivers",
    body: "Fill in revenue growth, EBITDA (or PAT) margin, and any other assumptions for each year. The app computes PAT, EPS, EBITDA, and growth rates — you focus on the assumptions, not the formulas.",
  },
  {
    title: "Set target multiples for bull, base, and bare",
    body: "Assign a PE (or EV/EBITDA) multiple to each scenario. StockTracker computes the implied target price, margin of safety, and IRR for each case automatically.",
  },
  {
    title: "Read your buy price and IRRs — they update after every result",
    body: "Your base-case buy price back-solves from your required return and lives on the dashboard as your watchlist target. After each quarterly result, revise the projections and the numbers update in place — the same model, not a new copy.",
  },
];

export default function StockValuationModelPage() {
  return (
    <SubPageShell
      path={PATH}
      breadcrumbLabel="Stock valuation model"
      eyebrow="For the analyst and modeller"
      h1="Stop re-typing the same formulas in a new sheet for every company."
      sub="StockTracker has the projection grid and valuation framework built in. Enter the drivers — revenue growth, margins, target multiples — and the buy price, margin of safety, and IRRs compute themselves. Bull, base, and bare on one page; recomputed every time results come in."
      demo={<LiveValuationDemo />}
      faqs={FAQS}
    >
      <ValuePoints
        title="Your model, out of the spreadsheet"
        sub="The rigour of a financial model — without rebuilding it from a blank sheet every time."
        points={POINTS}
      />
      <ProofShot
        alt="StockTracker Projections & Valuations tab: a multi-year projection grid with rows for Revenue, EBITDA, EBITDA margin, PAT, EPS, and EPS growth across FY23A to FY28E, with estimated years highlighted. Below the grid is a bull/base/bare scenario table showing PE multiples, target prices, margin of safety percentages, and IRRs for each case. Company name and ticker are masked."
        caption="A real valuation model in StockTracker — names masked for privacy. Numbers illustrative."
      >
        <ValuationModelProof />
      </ProofShot>
      <HowTo
        sub="From a blank projection grid to a live buy price with three scenarios — in one session."
        steps={STEPS}
      />
    </SubPageShell>
  );
}
