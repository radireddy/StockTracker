import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { SubPageShell } from "@/components/marketing/sub-page-shell";
import { ValuePoints } from "@/components/marketing/value-points";
import { ProofShot } from "@/components/marketing/proof-shot";
import { ZerodhaImportDemo } from "@/components/marketing/demos/zerodha-import-demo";
import { ZerodhaProof } from "@/components/marketing/demos/zerodha-proof";
import type { Faq } from "@/components/marketing/faq";

const PATH = "/zerodha-portfolio-tracker";
const TITLE = "Track multiple Zerodha accounts — one consolidated portfolio, zero manual work";
const DESCRIPTION =
  "Import holdings from every Zerodha demat account you own — self, spouse, HUF — and StockTracker merges them into one live portfolio. P&L, allocation health, margin of safety, and IRR update against the price in real time. Filter to any single account in one click.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "Zerodha portfolio tracker",
    "import Zerodha holdings",
    "Zerodha holdings tracker",
    "track Zerodha portfolio",
    "multi account demat tracker",
  ],
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: canonical(PATH) },
};

const FAQS: Faq[] = [
  {
    q: "How do I import my Zerodha holdings?",
    a: "Download your holdings statement from Zerodha and upload it. StockTracker parses every position instantly — quantity, average cost and ISIN — and creates the companies for you. No manual data entry.",
  },
  {
    q: "Can I track more than one demat account?",
    a: "Yes. Import a statement for each account — self, spouse, HUF and more — and StockTracker consolidates them into one true, cost-weighted position, while still letting you filter to any single account.",
  },
  {
    q: "What happens when I re-import an updated statement?",
    a: "StockTracker detects the account and cleanly refreshes its positions, so your portfolio always reflects your latest holdings instead of piling up duplicates.",
  },
  {
    q: "Can I add holdings from a broker that isn't Zerodha?",
    a: "Yes. You can add and edit holdings manually for any broker or account, alongside your imported Zerodha positions.",
  },
];

const POINTS = [
  {
    title: "One-click import",
    body: "Upload the statement and every position lands in seconds — quantity, average cost and ISIN — with companies auto-created for names you don't track yet.",
  },
  {
    title: "Every account, consolidated",
    body: "Track any number of demat accounts and see a single true position, cost-weighted — or drill into one account at a time.",
  },
  {
    title: "A live portfolio, not a snapshot",
    body: "The moment positions land, your P&L, margin of safety, IRR and allocation weights compute against the live price — always current.",
  },
];

export default function ZerodhaPage() {
  return (
    <SubPageShell
      path={PATH}
      breadcrumbLabel="Zerodha portfolio tracker"
      eyebrow="Zerodha-ready"
      h1="Three Zerodha accounts. One portfolio. Zero manual entry."
      sub="Upload a holdings statement per account and StockTracker consolidates everything — self, spouse, HUF — into one live view. P&L, allocation, and buy signals recompute the moment the price moves. Filter to any single account in one click."
      demo={<ZerodhaImportDemo />}
      faqs={FAQS}
    >
      <ValuePoints
        title="From broker statement to living portfolio"
        sub="Stop rebuilding your holdings by hand every month."
        points={POINTS}
      />
      <ProofShot
        alt="StockTracker holdings dashboard showing a consolidated portfolio across 3 Zerodha demat accounts. The summary card shows current value, invested amount, all-time P&L, and 3 accounts tracked. An account filter dropdown is open showing Account A, B, and C. The company table lists 8 holdings with star ratings, quantities, CMP, cost, current value, P&L, and valuation metrics. Company names and account identifiers are masked."
        caption="Real StockTracker dashboard — company names and account IDs masked for privacy. Numbers randomly generated for visualization."
      >
        <ZerodhaProof />
      </ProofShot>
    </SubPageShell>
  );
}
