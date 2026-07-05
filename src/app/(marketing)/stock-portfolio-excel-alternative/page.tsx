import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { SubPageShell } from "@/components/marketing/sub-page-shell";
import { ValuePoints } from "@/components/marketing/value-points";
import { ProofShot } from "@/components/marketing/proof-shot";
import { HowTo } from "@/components/marketing/how-to";
import { UnifiedCompanyDemo } from "@/components/marketing/demos/unified-company-demo";
import { ResearchOrganizerProof } from "@/components/marketing/demos/research-organizer-proof";
import type { Faq } from "@/components/marketing/faq";

const PATH = "/stock-portfolio-excel-alternative";
const TITLE = "Stock portfolio tracker — a better alternative to Excel";
const DESCRIPTION =
  "Your stock spreadsheet breaks every quarter when results come in, lives on one laptop, and has no idea what the current price is. StockTracker keeps the model, the thesis, the timeline, and the allocation in one place — live, connected, and never stale.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "portfolio tracker excel alternative",
    "stock spreadsheet replacement",
    "stock portfolio tracker India",
    "replace stock tracking excel",
    "investment tracker app",
    "portfolio management without excel",
  ],
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: canonical(PATH) },
};

const FAQS: Faq[] = [
  {
    q: "I have years of data in my Excel — do I have to start from scratch?",
    a: "No. You can bring your existing holdings directly — import from your broker statement (Zerodha supported, more coming) or add positions manually. Your historical model data can be entered into the projections grid, company by company, as you migrate.",
  },
  {
    q: "My Excel does some calculations that are specific to how I invest. Can StockTracker match that?",
    a: "StockTracker computes the metrics most value investors rely on — IRR, margin of safety, forward PEG, bull/base/bare scenarios — from the inputs you provide. If you have a highly custom formula it can be noted in the thesis, with StockTracker handling everything else.",
  },
  {
    q: "What happens to my model when quarterly results come in?",
    a: "You update the drivers in the projections grid — revenue, margins, growth — and the model, IRRs, and valuations recompute instantly. No formula re-linking, no broken cell references, no rebuilding the sheet.",
  },
  {
    q: "Is my data safe if I'm on a phone or a different computer?",
    a: "Everything is in the cloud. Open StockTracker on any device and your portfolio, models, and notes are exactly as you left them — no file to email yourself, no version confusion.",
  },
  {
    q: "Can I still see all my companies in a table like Excel?",
    a: "Yes. The dashboard is a live table — every company in rows, every metric in columns, sortable. You can scan your whole portfolio the same way you scan a spreadsheet, but each number links through to the full model behind it.",
  },
];

const POINTS = [
  {
    title: "No more broken formulas",
    body: "Quarterly results come in — update the numbers and every metric recomputes: margin of safety, IRR, bull/base/bare buy prices. No cell references to re-link, no rows to re-sort.",
  },
  {
    title: "Model, thesis, and timeline — in one place",
    body: "Your valuation model, written thesis, quarterly notes, and holdings are one tabbed workspace per company. Nothing to copy between files; nothing to lose.",
  },
  {
    title: "Always live, on any device",
    body: "Your spreadsheet sits on one laptop and goes stale the moment the price moves. StockTracker is in the browser — prices and metrics update in real time, everywhere.",
  },
];

const STEPS = [
  {
    title: "Import your holdings or add them manually",
    body: "Upload your broker statement or type in existing positions. StockTracker creates the company pages for you — no manual row-by-row setup.",
  },
  {
    title: "Move your model into the projections grid",
    body: "Enter the drivers — revenue, margins, growth — and pick PE or EV/EBITDA. The app computes PAT, IRR, and buy price for each scenario. One grid replaces a sheet full of interlinked formulas.",
  },
  {
    title: "Write the thesis and log the quarters",
    body: "Use the Thesis tab for your investment case. After each result, add a Timeline entry. Every note, attachment, and concall summary lives alongside the model — not in a separate document.",
  },
  {
    title: "Check allocation, not just individual picks",
    body: "The Allocation view shows how each conviction bucket is weighted against your target — so you see the whole portfolio, not just one stock. Rebalancing decisions are visible at a glance.",
  },
];

export default function StockPortfolioExcelAlternativePage() {
  return (
    <SubPageShell
      path={PATH}
      breadcrumbLabel="Stock portfolio tracker — Excel alternative"
      eyebrow="For the spreadsheet investor"
      h1="Your stock spreadsheet breaks every quarter. This doesn't."
      sub="StockTracker keeps your model, thesis, timeline, and holdings in one connected place. Quarterly results in — update the numbers — every metric recomputes instantly. No broken formulas, no stale prices, no version filed to the wrong folder."
      demo={<UnifiedCompanyDemo />}
      faqs={FAQS}
    >
      <ValuePoints
        title="Everything your spreadsheet does — without the fragility"
        sub="A live, connected workspace that survives results season."
        points={POINTS}
      />
      <ProofShot
        alt="StockTracker company detail page showing the full tabbed workspace: header verdict with CMP, target buy price, margin of safety, BUY signal, star rating and IRR. Tab strip shows Thesis, Projections & Valuations, Timeline, Highlights, and Holdings tabs. Company name and ticker are masked."
        caption="Real StockTracker company page — name and ticker masked for privacy. Numbers illustrative."
      >
        <ResearchOrganizerProof />
      </ProofShot>
      <HowTo
        sub="From a folder of scattered spreadsheets to one connected research workspace."
        steps={STEPS}
      />
    </SubPageShell>
  );
}
