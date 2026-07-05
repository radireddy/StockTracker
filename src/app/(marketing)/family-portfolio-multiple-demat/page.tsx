import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { SubPageShell } from "@/components/marketing/sub-page-shell";
import { ValuePoints } from "@/components/marketing/value-points";
import { ProofShot } from "@/components/marketing/proof-shot";
import { HowTo } from "@/components/marketing/how-to";
import { ZerodhaImportDemo } from "@/components/marketing/demos/zerodha-import-demo";
import { FamilyPortfolioProof } from "@/components/marketing/demos/family-portfolio-proof";
import type { Faq } from "@/components/marketing/faq";

const PATH = "/family-portfolio-multiple-demat";
const TITLE = "Family portfolio tracker — one view across all demat accounts";
const DESCRIPTION =
  "Import holdings from every demat account in your household — self, spouse, HUF — and StockTracker consolidates them into one true, cost-weighted portfolio. Drill into any single account in one click. No manual merging, no shared spreadsheets.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "family portfolio tracker",
    "multiple demat accounts tracker",
    "HUF demat portfolio",
    "joint portfolio tracker India",
    "consolidate demat accounts",
    "track spouse demat account",
  ],
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: canonical(PATH) },
};

const FAQS: Faq[] = [
  {
    q: "Can I track accounts from different family members in one place?",
    a: "Yes. Import a holdings statement for each account — your own, your spouse's, your HUF's, or any other. StockTracker labels each account and merges them into a single consolidated view, cost-weighted across the household.",
  },
  {
    q: "How does the consolidated position work when two accounts hold the same stock?",
    a: "StockTracker sums the quantities and computes a cost-weighted average buy price across all accounts — so your consolidated IRR and margin of safety reflect your true blended position, not just one account's figures.",
  },
  {
    q: "Can I see one account at a time if I need to?",
    a: "Yes. An account filter lets you isolate any single demat account in one click — useful for quarterly reviews, tax workings, or checking one family member's portfolio independently.",
  },
  {
    q: "What if I buy more shares in one account later — do I re-import everything?",
    a: "Just re-import the updated statement for that account. StockTracker detects the account and refreshes its positions cleanly — the other accounts stay untouched.",
  },
  {
    q: "Does each family member need their own StockTracker login?",
    a: "No. One login can hold multiple accounts — one per demat — under the same portfolio. Each account is labelled separately (e.g. 'Self', 'Spouse', 'HUF') and consolidated automatically.",
  },
];

const POINTS = [
  {
    title: "Every account in one place",
    body: "Import a statement for each demat account in your household. Self, spouse, HUF — they all land under one login, labelled and ready to consolidate.",
  },
  {
    title: "One true position, cost-weighted",
    body: "When the same stock appears in two accounts, StockTracker merges the quantities and computes a blended average cost. Your IRR and margin of safety reflect the actual household position.",
  },
  {
    title: "Drill into any account in one click",
    body: "Need to isolate your HUF for tax time? One account filter and you see only that account's holdings — allocation, P&L, and valuation metrics all recompute for the slice.",
  },
];

const STEPS = [
  {
    title: "Import each account's holdings statement",
    body: "Download the statement from your broker (Zerodha and more supported) and upload once per account. StockTracker auto-detects the account from the file — no manual labelling needed.",
  },
  {
    title: "Label accounts for the household",
    body: "Name each account something clear — 'Self', 'Spouse', 'HUF'. StockTracker keeps them separate under the hood while showing a consolidated total on the dashboard.",
  },
  {
    title: "Watch the consolidated portfolio update live",
    body: "The dashboard adds up every account's positions. P&L, allocation health, margin of safety, and IRR all reflect the combined household view, recomputed against live prices.",
  },
  {
    title: "Filter to one account when you need the detail",
    body: "Tax workings, a spouse's review, an HUF audit — tap the account filter and the dashboard slices to just that account. One click back to the full view.",
  },
];

export default function FamilyPortfolioMultipleDematPage() {
  return (
    <SubPageShell
      path={PATH}
      breadcrumbLabel="Family portfolio & multiple demat accounts"
      eyebrow="For the household investor"
      h1="Self. Spouse. HUF. One portfolio view."
      sub="Import a holdings statement for each demat account in your household and StockTracker merges them into one live, consolidated portfolio — cost-weighted, allocation-aware, and filterable to any single account in one click."
      demo={<ZerodhaImportDemo />}
      faqs={FAQS}
    >
      <ValuePoints
        title="Your whole household, consolidated"
        sub="Stop rebuilding a shared spreadsheet every time one account changes."
        points={POINTS}
      />
      <ProofShot
        alt="Two-panel StockTracker screenshot. Top: Import Holdings screen with two files queued — holdings-SELF and holdings-SPOUSE — each showing stock count and 'Will replace holdings in Self (Zerodha)' / 'Spouse (Zerodha)'. Bottom: Portfolio dashboard with the account filter dropdown open showing All accounts, Self · Zerodha, Spouse · Zerodha, HUF · Zerodha. The holdings table lists companies with star ratings, quantities, CMP, cost, P&L, target buy, margin of safety, and IRR. Company names and account identifiers are masked."
        caption="Real StockTracker screens — importing two Zerodha statements (top) and the consolidated household portfolio with account filter (bottom). Names and account IDs masked for privacy."
      >
        <FamilyPortfolioProof />
      </ProofShot>
      <HowTo
        sub="From scattered broker statements to one household portfolio view — in minutes."
        steps={STEPS}
      />
    </SubPageShell>
  );
}
