import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { SubPageShell } from "@/components/marketing/sub-page-shell";
import { ValuePoints } from "@/components/marketing/value-points";
import { ProofShot } from "@/components/marketing/proof-shot";
import { HowTo } from "@/components/marketing/how-to";
import { TimelineDemo } from "@/components/marketing/demos/timeline-demo";
import { TimelineProof } from "@/components/marketing/demos/timeline-proof";
import type { Faq } from "@/components/marketing/faq";

const PATH = "/quarterly-earnings-timeline";
const TITLE = "Quarterly earnings tracker — concall notes, attachments, all in one place";
const DESCRIPTION =
  "Log every quarterly result, concall note, and annual report against the right company in StockTracker. A dated, labelled timeline keeps your research history alive so you can see exactly whether management is walking the talk — quarter by quarter.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "quarterly results tracker",
    "concall notes app",
    "earnings tracking India",
    "management guidance tracker",
    "quarterly earnings journal",
  ],
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: canonical(PATH) },
};

const FAQS: Faq[] = [
  {
    q: "What can I attach to a timeline entry?",
    a: "Each entry supports rich text (paste or type your notes), embedded images, attached PDFs, and hyperlinks — so a concall transcript PDF, a results slide deck, and the BSE filing URL can all live on the same entry. Nothing is stored on a third-party service; only the URL reference is saved.",
  },
  {
    q: "How do I label entries by quarter?",
    a: "When you create an entry you pick a label — Q1 FY26, Q4 FY25, Annual Report, Concall Notes, whatever fits. StockTracker shows entries newest-first so the most recent result is always at the top without any sorting.",
  },
  {
    q: "Can I look back across several quarters at once?",
    a: "Yes. Every entry on a company's Timeline tab is visible as a scrollable list. Because they're labelled and dated, you can read management's Q1 guidance, scroll to Q2, and see immediately whether they delivered — no switching tabs or cross-referencing spreadsheets.",
  },
  {
    q: "Is the timeline per-company or shared across the portfolio?",
    a: "Per-company. Each company you track has its own independent timeline so the quarterly arc of a single business stays in one place. You can track as many companies as you like, each with its own history.",
  },
];

const POINTS = [
  {
    title: "Did management walk the talk?",
    body: "Log guidance in Q1 and results in Q2 side-by-side. When the same name appears again in Q3, the pattern of delivery — or slippage — is right there in your own words.",
  },
  {
    title: "Attachments that stay where the notes are",
    body: "Paste a concall transcript, drop in the result PDF, add the BSE filing URL. All of it lives on the same entry — no hunting across three folders next quarter.",
  },
  {
    title: "Institutional memory that survives the next result",
    body: "A plain chat note or a voice memo disappears under the next thing. A dated, labelled timeline entry is searchable, linked, and waiting the next time you open the company — three quarters from now.",
  },
];

const STEPS = [
  {
    title: "Open a company and go to its Timeline tab",
    body: "Every company in StockTracker has a Timeline tab alongside its thesis, model, and holdings. It starts empty and fills in entry by entry as you track the story.",
  },
  {
    title: "Add an entry and label the quarter",
    body: "Click 'Add entry', choose a label (Q1 FY26, Annual Report, Concall Notes — your vocabulary), and write your notes in the rich-text editor.",
  },
  {
    title: "Paste your concall notes, embed the slide, attach the PDF or AR",
    body: "Drag in an image, paste the transcript, or link the BSE filing. Everything goes on the same entry so your notes and the source document are never separated.",
  },
  {
    title: "Next quarter, scroll the arc — guidance vs. delivery at a glance",
    body: "New entries stack at the top, oldest below. Open the company after results day and you can see what management guided, what they delivered, and how the trend is moving — without rebuilding context from scratch.",
  },
];

export default function QuarterlyEarningsTimelinePage() {
  return (
    <SubPageShell
      path={PATH}
      breadcrumbLabel="Quarterly earnings timeline"
      eyebrow="For the quarterly tracker"
      h1="Did management walk the talk — or just talk?"
      sub="Log every result, concall, and annual report on the company it belongs to. StockTracker's dated, labelled timeline turns a stack of PDFs and scattered notes into a living arc of management delivery you can read in two minutes before the next call."
      demo={<TimelineDemo />}
      faqs={FAQS}
    >
      <ValuePoints
        title="One place for every quarter"
        sub="The research you do each quarter, organised so the next quarter builds on it instead of repeating it."
        points={POINTS}
      />
      <ProofShot
        alt="StockTracker company Timeline tab: a list of entries labelled Q1 FY26, Annual Report, Q4 FY25 and Q3 FY25, each with a date, masked rich-text body, and attachment chips for concall PDFs, slides, and BSE filing links. Company name and ticker are masked."
        caption="A real company timeline in StockTracker — names masked for privacy."
      >
        <TimelineProof />
      </ProofShot>
      <HowTo
        sub="From a quarterly result you'll never find again to an arc you can read in two minutes."
        steps={STEPS}
      />
    </SubPageShell>
  );
}
