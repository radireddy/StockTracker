import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { SubPageShell } from "@/components/marketing/sub-page-shell";
import { ValuePoints } from "@/components/marketing/value-points";
import { ZerodhaImportDemo } from "@/components/marketing/demos/zerodha-import-demo";
import type { Faq } from "@/components/marketing/faq";

const PATH = "/zerodha-portfolio-tracker";
const TITLE = "Zerodha portfolio tracker — import holdings in one click";
const DESCRIPTION =
  "Import your Zerodha holdings statement in one click and track your whole portfolio — quantity, average cost, P&L and allocation — across multiple demat accounts, consolidated into one true position.";

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
      h1="Track your Zerodha portfolio without the spreadsheet"
      sub="Import your Zerodha holdings statement in one click. StockTracker parses every position, consolidates across demat accounts, and turns it into a live portfolio you can value and rebalance."
      demo={<ZerodhaImportDemo />}
      faqs={FAQS}
    >
      <ValuePoints
        title="From broker statement to living portfolio"
        sub="Stop rebuilding your holdings by hand every month."
        points={POINTS}
      />
    </SubPageShell>
  );
}
