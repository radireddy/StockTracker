import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { SubPageShell } from "@/components/marketing/sub-page-shell";
import { ValuePoints } from "@/components/marketing/value-points";
import { HowTo } from "@/components/marketing/how-to";
import { RaPainSection } from "@/components/marketing/ra-pain-section";
import { RaVolatilitySection } from "@/components/marketing/ra-volatility-section";
import { LiveValuationDemo } from "@/components/marketing/demos/live-valuation-demo";
import type { Faq } from "@/components/marketing/faq";

const PATH = "/research-advisory-portfolio-tracker";
const TITLE = "Portfolio tracker for research advisory subscribers";
const DESCRIPTION =
  "Your RA's buy call lands as a PDF with a price that's already changed. StockTracker takes the star rating, target price and valuation from any research advisory report and makes it live — margin of safety, IRR and allocation recomputed against today's price, every time.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "research advisory portfolio tracker",
    "RA service stock tracker",
    "live margin of safety RA report",
    "stock allocation RA subscriber",
    "research advisory buy call tracker",
  ],
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: canonical(PATH) },
};

const POINTS = [
  {
    title: "A buy price range, not a single number",
    body: "Enter the bull, base and bear case assumptions from the report — or build your own. StockTracker back-solves the buy price for each scenario. Below the base-case price the fundamentals work; near the bear-case price you need full conviction. A range is more honest than a single target.",
  },
  {
    title: "Live, never frozen",
    body: "The PDF target was computed at a price that no longer exists. Every valuation in StockTracker — margin of safety, IRR, buy price — recomputes against the live CMP the moment you open it. Always today's answer, never last month's.",
  },
  {
    title: "Allocation to the rupee",
    body: "Import your broker holdings in one click. The moment star ratings are set, the allocation engine tells you exactly how many rupees short you are in each conviction bucket — no spreadsheet required.",
  },
  {
    title: "A BUY signal, not a price check",
    body: "Set the target from your RA report once. The dashboard watches the price for you and flags a green BUY the moment the stock crosses into buying range — stop refreshing the broker app every morning.",
  },
];

const HOW_TO_STEPS = [
  {
    title: "Import your Zerodha holdings statement",
    body: "Upload the statement and your entire portfolio loads in under 30 seconds — real quantities, real average cost, all positions auto-detected by account.",
  },
  {
    title: "Add your RA companies to a holdings or watchlist portfolio",
    body: "Companies you already own go into your holdings portfolio. Names the RA recommends but you haven't bought yet go into a watchlist — same full research depth for both.",
  },
  {
    title: "Enter the star rating and target buy price from the report",
    body: "The star rating sets your conviction and target allocation band. The target price activates the margin of safety percentage and the BUY signal. Both turn live immediately.",
  },
  {
    title: "Add the valuation scenarios",
    body: "Enter the bull, base and bear case assumptions from the report — or build your own. IRR and the scenario buy prices recompute off today's market cap, not the PDF's.",
  },
];

const FAQS: Faq[] = [
  {
    q: "Does it work with any research advisory service?",
    a: "Yes. StockTracker is not connected to any specific RA service. You enter the data from any report — target price, star rating, valuation assumptions — and the app keeps it live. It works the same whether you follow one service or several.",
  },
  {
    q: "What if the RA only gives a target price, not a full valuation model?",
    a: "A target price is enough to unlock margin of safety, the BUY signal and allocation tracking. The full valuation model (bull/base/bear IRR) is optional — you can add it later or build your own.",
  },
  {
    q: "Can I track companies my RA recommends but I haven't bought yet?",
    a: "Yes — that's the watchlist portfolio. It carries the full research depth: thesis, valuation, target buy price and the BUY signal. When the price comes to you, the homework is already done.",
  },
  {
    q: "Do I need to update anything when my RA revises their report?",
    a: "Only if the target price or star rating changes. When you update either, every derived figure — MoS, IRR, allocation band — recalculates immediately. Everything else (live CMP, portfolio weights) updates on its own.",
  },
  {
    q: "How does the RA's star rating map to allocation weights?",
    a: "You set your own target weight bands per star rating in Settings — for example, 4★ = 6–8% of portfolio, 3★ = 4–6%. The allocation engine then measures every position against your own bands and flags what's under or over, to the rupee.",
  },
];

export default function RaSubscriberPage() {
  return (
    <SubPageShell
      path={PATH}
      breadcrumbLabel="Research advisory portfolio tracker"
      eyebrow="For research advisory subscribers"
      h1="Your RA research, finally alive"
      sub="Every buy call lands as a PDF with a price that's already changed. StockTracker takes your RA's thesis, star rating, target and valuation — and makes it breathe with the market. The numbers you act on are always today's."
      demo={<LiveValuationDemo />}
      faqs={FAQS}
    >
      <RaPainSection />

      <ValuePoints
        title="From stale PDF to live, data-backed decisions"
        sub="Four features that solve the RA subscriber's real problems."
        points={POINTS}
      />

      <RaVolatilitySection />

      <HowTo
        title="How to turn your RA research into a live portfolio"
        sub="From import to live signals — here's the workflow."
        steps={HOW_TO_STEPS}
      />
    </SubPageShell>
  );
}
