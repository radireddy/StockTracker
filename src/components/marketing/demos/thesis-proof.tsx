/**
 * ThesisProof — masked replica of the StockTracker Thesis tab.
 * The company name (including all partial occurrences) is replaced with a
 * redaction bar. All other thesis content is preserved verbatim to show the
 * depth and structure of research the product enables. Numbers are real but
 * the company cannot be identified from this screen alone.
 */

const TABS = ["Details", "Holdings", "Thesis", "Projections & Valuations", "Timeline", "Highlights"];
const ACTIVE_TAB = "Thesis";

/** Inline redaction bar — replaces any occurrence of the company name. */
function Mask({ wide = false }: { wide?: boolean }) {
  return (
    <span
      aria-label="company name masked"
      className={`inline-block align-middle rounded-[3px] bg-foreground/20 ${wide ? "h-[1em] w-28" : "h-[0.9em] w-16"}`}
    />
  );
}

function ToolbarBtn({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 items-center justify-center rounded text-xs text-muted-foreground hover:bg-muted"
    >
      {label}
    </span>
  );
}

export function ThesisProof() {
  return (
    <div className="w-full bg-background text-sm text-foreground">

      {/* Tab strip */}
      <div className="flex gap-0 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            className={[
              "shrink-0 px-4 py-3 text-sm font-medium transition-colors",
              t === ACTIVE_TAB
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Editor shell */}
      <div className="mx-auto mt-4 max-w-3xl rounded-xl border border-border bg-card">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-3 py-2">
          {["B", "I", "U", "S", "🎨", "⊘", "H₂", "H₃", "≡", "≡", "≡", "•", "1.", "☑", "{ }", "<>", "—", "🔗", "🖼", "📎", "▦"].map((l, i) => (
            <ToolbarBtn key={i} label={l} />
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <ToolbarBtn label="↩" />
          <ToolbarBtn label="↪" />
        </div>

        {/* Thesis body */}
        <div className="min-h-[520px] px-6 py-5 text-sm leading-relaxed text-foreground">

          {/* Title */}
          <h2 className="mb-4 text-xl font-bold text-foreground">
            <Mask wide /> – Investment Thesis
          </h2>

          {/* Paragraph 1 */}
          <p className="mb-4 text-muted-foreground">
            <Mask wide /> is transforming from a cyclical sugar-distillery company into a
            high-margin premium alco-bev business led by strong brands like Indri, Camikara,
            Whistler and Cashmir. The company is riding multiple structural tailwinds including
            premiumization of Indian liquor consumption, rising global acceptance of Indian single
            malts, export growth and increasing consumer preference for craft and luxury spirits.
          </p>

          {/* Paragraph 2 */}
          <p className="mb-4 text-muted-foreground">
            The biggest trigger is the successful creation of Indri, which has rapidly become one of
            the fastest-growing Indian single malt brands globally and has already won multiple
            international awards including "Best Whisky in the World". Unlike most Indian
            distilleries that remain commodity ethanol or bulk alcohol players, <Mask /> is moving
            aggressively toward branded IMFL where margins are significantly higher.
          </p>

          {/* Inflection point */}
          <p className="mb-2 font-semibold text-foreground">FY26 marks an inflection point:</p>
          <ul className="mb-4 space-y-1.5 text-muted-foreground">
            {[
              "Distillery revenue grew ~42% to ₹900+ Cr",
              "Distillery EBITDA margin reached ~31.5%",
              "Capacity expansion at Indri and the new Chhattisgarh facility has been completed",
              "Supply constraints that limited growth in FY25/FY26 are now removed",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" aria-hidden />
                {item}
              </li>
            ))}
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" aria-hidden />
              <span>
                <strong className="text-foreground">
                  Management has guided for 60%–70% growth in FY27 and targets 3x–4x business
                  growth over the next 3–4 years.
                </strong>{" "}
                With IMFL mix rising rapidly, EBITDA and PAT could scale much faster than revenue
                due to operating leverage and premiumization.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" aria-hidden />
              <span>
                <strong className="text-foreground">
                  The proposed sugar demerger is another major trigger.
                </strong>{" "}
                Once separated, the market may begin valuing <Mask /> as a pure-play premium
                alco-bev company rather than a sugar-linked cyclical business. This could potentially
                result in a valuation rerating closer to premium liquor peers.
              </span>
            </li>
          </ul>

          {/* Long-term drivers */}
          <p className="mb-2 font-semibold text-foreground">Key long-term drivers:</p>
          <ul className="mb-4 space-y-1.5 text-muted-foreground">
            {[
              "Rising premium and luxury IMFL mix",
              "Strong export opportunity for Indian single malts",
              "Large aging barrel inventory enabling future premium launches",
              "Increasing distribution across India and global markets",
              "High-margin brand-led business model",
              "Potential acquisitions and new premium product launches",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" aria-hidden />
                {item}
              </li>
            ))}
          </ul>

          {/* Risks */}
          <p className="mb-2 font-semibold text-foreground">Key risks:</p>
          <ul className="mb-4 space-y-1.5 text-muted-foreground">
            {[
              "Execution risk in scaling premium brands",
              "Working capital intensity due to aging inventory",
              "Regulatory/state policy risks in liquor industry",
              "Competition from larger players like Diageo, Radico and Amrut",
              "Premium demand slowdown",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" aria-hidden />
                {item}
              </li>
            ))}
          </ul>

          {/* Closing */}
          <p className="text-muted-foreground">
            Overall, <Mask /> appears to be at an early stage of becoming a scaled premium Indian
            spirits company with strong brand optionality, improving economics and significant
            operating leverage over the next few years.
          </p>

          {/* Cursor blink */}
          <span
            aria-hidden
            className="mt-2 inline-block h-4 w-0.5 animate-pulse bg-foreground/60 align-middle"
          />
        </div>

        {/* Save button */}
        <div className="border-t border-border px-6 py-3">
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Save Thesis
          </button>
        </div>
      </div>

      <p className="mt-3 text-center text-[10px] text-muted-foreground">
        Real StockTracker thesis editor — company name masked for privacy. Thesis content is illustrative.
      </p>
    </div>
  );
}
