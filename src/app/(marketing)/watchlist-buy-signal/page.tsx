import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { SubPageShell } from "@/components/marketing/sub-page-shell";
import { ValuePoints } from "@/components/marketing/value-points";
import { ProofShot } from "@/components/marketing/proof-shot";
import { HowTo } from "@/components/marketing/how-to";
import { DashboardScanDemo } from "@/components/marketing/demos/dashboard-scan-demo";
import { WatchlistProof } from "@/components/marketing/demos/watchlist-proof";
import type { Faq } from "@/components/marketing/faq";

const PATH = "/watchlist-buy-signal";
const TITLE = "Stock watchlist with a live buy signal";
const DESCRIPTION =
  "Research a company once, set your target buy price, and let StockTracker watch the market for you. A green BUY signal appears the moment a stock you've been waiting for finally trades at or below your price — no daily price-checking, no missed entries.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "stock watchlist with buy alerts",
    "target buy price tracker India",
    "when to buy a stock",
    "stock buy signal",
    "watchlist with margin of safety",
  ],
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: canonical(PATH) },
};

const FAQS: Faq[] = [
  {
    q: "How does the buy signal decide when a stock is a buy?",
    a: "Each watchlist company has a target buy price — either the price you set manually, or the price your base-case valuation model back-solves from your required return. When the current market price falls to or below that target, the Signal column turns to a green BUY ZONE. It is your own rule firing, not a recommendation from us.",
  },
  {
    q: "Do I have to check prices every day?",
    a: "No. That is the point of the watchlist. You do the research once and set the target; the dashboard's Signal column watches the price against your target for every name. Flip on 'Buy signals only' and the list collapses to just the names in your buy zone right now — the rest surface themselves the next time you glance at the screen.",
  },
  {
    q: "Is the research on a watchlist company as deep as on a holding?",
    a: "Identical. A watchlist company carries the same thesis, financial model, bull/base/bare valuation, and quarterly timeline as a company you own — it just has no position data yet. So when the price finally comes to you, the homework is already done.",
  },
  {
    q: "What happens when I actually buy the stock?",
    a: "One action — Move to Holdings — turns the watchlist company into a held position. You keep all the research you built up; you just add the quantity and cost (or import them from your broker statement).",
  },
];

const POINTS = [
  {
    title: "Do the homework once",
    body: "Build the thesis and the model on a name while it's still too expensive. When the crash comes, your conviction is already written down — you're not researching in a panic.",
  },
  {
    title: "Your price, not a tip",
    body: "The BUY ZONE fires against the target buy price you set (or your model back-solves). It tells you when your own rule is met — never what to buy. You stay the decision-maker.",
  },
  {
    title: "The market watches itself",
    body: "Stop refreshing charts. The Signal column tracks every watchlist name against its target, so a stock entering your buy zone is one glance away, not one hour of checking.",
  },
];

const STEPS = [
  {
    title: "Create a Watchlist portfolio",
    body: "Watchlists hold companies you're researching to buy — same depth as holdings, just no position yet. Keep as many as you like (e.g. 'Compounders', 'Turnarounds').",
  },
  {
    title: "Add a company and set your target buy price",
    body: "Type in a name and record your thesis. Enter a target buy price directly, or leave it blank and let your base-case model derive it from your required return.",
  },
  {
    title: "Let the Signal column do the watching",
    body: "On the dashboard, the watchlist swaps position columns for a Signal column. A green BUY ZONE tag appears on any name currently trading at or below your target, with margin of safety and base/bare-case IRR alongside. Tick 'Buy signals only' to see just those.",
  },
  {
    title: "Buy on your terms, then Move to Holdings",
    body: "When a signal fires and you decide to act, buy through your broker, then hit Move to Holdings to carry the whole research file over to your holdings portfolio.",
  },
];

export default function WatchlistBuySignalPage() {
  return (
    <SubPageShell
      path={PATH}
      breadcrumbLabel="Watchlist & buy signal"
      eyebrow="For the patient buyer"
      h1="The day it hits your price, you'll know."
      sub="Set a target buy price on every name you'd love to own. StockTracker flips the signal to BUY ZONE the moment the market finally offers it to you — so you act on your own rule, not on a daily price-check you'll forget to run."
      demo={<DashboardScanDemo />}
      faqs={FAQS}
    >
      <ValuePoints
        title="Patience, made mechanical"
        sub="The discipline of waiting for your price — enforced by the screen instead of your willpower."
        points={POINTS}
      />
      <ProofShot
        alt="StockTracker watchlist screen: a companies table with star ratings, CMP, target buy, margin of safety, base/bare IRR and a Signal column showing BUY ZONE and WAIT tags. Company names are masked."
        caption="Your actual watchlist in StockTracker — company names masked for privacy. Numbers illustrative."
      >
        <WatchlistProof />
      </ProofShot>
      <HowTo
        sub="From an idea you can't afford yet to a one-click buy when the price comes to you."
        steps={STEPS}
      />
    </SubPageShell>
  );
}
