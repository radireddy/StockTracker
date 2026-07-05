import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { SubPageShell } from "@/components/marketing/sub-page-shell";
import { ValuePoints } from "@/components/marketing/value-points";
import { ProofShot } from "@/components/marketing/proof-shot";
import { HowTo } from "@/components/marketing/how-to";
import { UnifiedCompanyDemo } from "@/components/marketing/demos/unified-company-demo";
import { ResearchOrganizerProof } from "@/components/marketing/demos/research-organizer-proof";
import type { Faq } from "@/components/marketing/faq";

const PATH = "/stock-research-organizer";
const TITLE = "Stock research organizer — thesis, model, timeline and holdings in one place";
const DESCRIPTION =
  "Your investment thesis, financial model, quarterly notes, and broker holdings for every stock you track — all in one tabbed workspace instead of four separate tools. StockTracker keeps your research alive and connected so you always know where you stand on a name.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "stock research organizer",
    "investment thesis tracker",
    "one place for stock research",
    "stock portfolio research tool",
    "investment research app India",
  ],
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: canonical(PATH) },
};

const FAQS: Faq[] = [
  {
    q: "What tabs does each company workspace have?",
    a: "Every company you track gets six tabs: Details (the verdict — CMP, target buy, margin of safety, IRR, conviction stars, BUY badge), Thesis (rich text for your investment case), Projections & Valuations (multi-year model + bull/base/bare scenarios), Timeline (quarterly notes and attachments), Highlights (the 2–3 bullet points that would make you buy more, surfaced on the dashboard), and Holdings (your actual position from a broker import or manual entry).",
  },
  {
    q: "Is this only for stocks I already hold?",
    a: "No. A company in StockTracker can be a holding (you own it), a watchlist name (you want to buy it), or pure research (you're still deciding). The workspace is identical for all three — only the Holdings tab differs based on whether you have a position.",
  },
  {
    q: "Does the thesis tab support formatting and images?",
    a: "Yes. The Thesis tab and the Timeline entries both use a full rich-text editor — headings, bold, bullet lists, tables, and embedded images. You can paste directly from a Word document or a web page.",
  },
  {
    q: "What are Highlights and how are they different from the thesis?",
    a: "Highlights are a 2–3 bullet TL;DR of the conviction case — the specific things that would make you buy more, or that you'd want to remember on results day without re-reading the full thesis. They surface on the dashboard card for the company so you don't have to open the workspace to recall them.",
  },
];

const POINTS = [
  {
    title: "One workspace, not four tools",
    body: "Thesis in Notes, model in Excel, targets in a PDF, holdings in Zerodha — that is the current state for most investors. StockTracker collapses all four into a single tabbed page per company so nothing is orphaned.",
  },
  {
    title: "Research that stays connected to the position",
    body: "The model updates the buy price. The buy price updates the BUY badge. The badge lives on the same page as the thesis and the holdings. When the CMP moves, you see the implication without switching tools.",
  },
  {
    title: "Conviction notes that surface at the right moment",
    body: "Pin the 2–3 things you'd want to remember on results day in Highlights. They appear on the dashboard card — so your own conviction is in front of you exactly when the market is testing it.",
  },
];

const STEPS = [
  {
    title: "Add a company",
    body: "Search by name or ISIN, pick the portfolio it belongs to (holdings, watchlist, or a named research basket), and the workspace opens immediately.",
  },
  {
    title: "Write the thesis",
    body: "Open the Thesis tab and write your investment case — why the business is good, why the price is right (or not yet), and what would change your mind. Rich text, images, and tables all work.",
  },
  {
    title: "Build the model",
    body: "Go to Projections & Valuations, enter your revenue and margin assumptions, and set target multiples for your bull, base, and bare cases. The target buy price and IRRs compute automatically.",
  },
  {
    title: "Log the quarter",
    body: "After each result, add a Timeline entry, label it Q1 FY26 (or whatever the period is), paste your concall notes, and attach the PDF or filing link. The arc builds itself entry by entry.",
  },
  {
    title: "Pin your conviction in Highlights",
    body: "Add the 2–3 things that would make you buy more — or that are load-bearing for the thesis. They surface on the dashboard card so you see them without opening the workspace.",
  },
];

export default function StockResearchOrganizerPage() {
  return (
    <SubPageShell
      path={PATH}
      breadcrumbLabel="Stock research organizer"
      eyebrow="For the concentrated investor"
      h1="Thesis in Notes. Model in Excel. Targets in a PDF. Not any more."
      sub="StockTracker gives every stock you track a single tabbed workspace — thesis, financial model, quarterly timeline, conviction highlights, and your broker position, all connected so the research you did yesterday is useful tomorrow."
      demo={<UnifiedCompanyDemo />}
      faqs={FAQS}
    >
      <ValuePoints
        title="One page per company, all the research"
        sub="The discipline of deep research — without the overhead of managing four separate tools."
        points={POINTS}
      />
      <ProofShot
        alt="StockTracker company detail page: a masked company header showing CMP ₹2,841.5, target buy ₹2,272, margin of safety +25%, base IRR 18.4%, and a BUY ZONE badge with 3-star conviction. Below the header is a tab strip (Details / Thesis / Projections / Timeline / Highlights / Holdings) with the Thesis tab active, showing masked rich-text content and a Highlights panel. Company name and ticker are masked."
        caption="A real company workspace in StockTracker — names masked for privacy. Numbers illustrative."
      >
        <ResearchOrganizerProof />
      </ProofShot>
      <HowTo
        sub="From scattered notes and spreadsheets to one workspace that does the heavy lifting."
        steps={STEPS}
      />
    </SubPageShell>
  );
}
