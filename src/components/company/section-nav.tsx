"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "thesis", label: "Thesis" },
  { id: "financials", label: "Financials" },
  { id: "valuation", label: "Valuation" },
  { id: "timeline", label: "Timeline" },
  { id: "highlights", label: "Highlights" },
  { id: "details", label: "Details" },
] as const;

export function SectionNav() {
  const [active, setActive] = useState<string>("thesis");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );

    for (const section of SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav className="sticky top-14 z-40 bg-background/95 backdrop-blur-sm border-b">
      <div className="flex gap-0 overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              active === s.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
