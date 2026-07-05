export type Faq = { q: string; a: string };

export const HOME_FAQS: Faq[] = [
  {
    q: "Do the valuations update when the price changes?",
    a: "Yes — that's the whole point. Unlike a static research PDF, StockTracker recomputes margin of safety, IRR, target buy price and the BUY signal against the live price every time you look. The numbers are never stale.",
  },
  {
    q: "Can it import my Zerodha holdings?",
    a: "In one click. Upload your Zerodha holdings statement and every position is parsed instantly — quantity, average cost and ISIN — and companies are created for you. You can also add holdings manually for any broker.",
  },
  {
    q: "Can it track multiple demat accounts?",
    a: "Yes. Import a statement for each account (self, spouse, HUF, and more) and StockTracker consolidates them into one true position, cost-weighted — while still letting you filter to any single account.",
  },
  {
    q: "How does the allocation feature help me invest incrementally?",
    a: "You assign each holding a star rating, and each rating maps to a target weight band you configure. The allocation view then shows which positions are under- or over-weight and the exact rupee amount to add or trim to get back in range.",
  },
  {
    q: "Does it calculate intrinsic value and margin of safety?",
    a: "Yes. Build a multi-year model, set bull/base/bare assumptions, and StockTracker computes target market cap, IRR, forward PEG, the disciplined buy price and margin of safety automatically.",
  },
  {
    q: "Is StockTracker free, and is my data private?",
    a: "It's currently free — sign in with Google and start in seconds. Your data is isolated per user with row-level security, so your portfolio is only ever visible to you. And you stay in full control: delete a portfolio and everything inside it — imported holdings, companies and all your research and thesis notes — is permanently and irreversibly removed. There's no soft-delete and no hidden archive left behind.",
  },
];

export function FaqSection({ faqs }: { faqs: Faq[] }) {
  return (
    <section id="faq" className="border-t bg-card">
      <div className="mx-auto max-w-3xl px-4 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight text-foreground">
          Frequently asked questions
        </h2>
        <dl className="mt-12 space-y-8">
          {faqs.map((f) => (
            <div key={f.q}>
              <dt className="text-base font-semibold text-foreground">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
