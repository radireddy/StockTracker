import { describe, it, expect } from "vitest";
import {
  SITE_URL,
  SITE_NAME,
  canonical,
  breadcrumbJsonLd,
  faqJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
} from "@/lib/seo";

describe("canonical", () => {
  it("returns the bare site URL for the home path", () => {
    expect(canonical("/")).toBe(SITE_URL);
  });

  it("appends a sub-path to the site URL", () => {
    expect(canonical("/portfolio-allocation")).toBe(
      `${SITE_URL}/portfolio-allocation`
    );
  });
});

describe("breadcrumbJsonLd", () => {
  it("builds a two-item BreadcrumbList for a sub-page", () => {
    const json = breadcrumbJsonLd("Portfolio Allocation", "/portfolio-allocation");
    const parsed = JSON.parse(json);
    expect(parsed["@type"]).toBe("BreadcrumbList");
    expect(parsed.itemListElement).toHaveLength(2);
    expect(parsed.itemListElement[0]).toMatchObject({ position: 1, item: SITE_URL });
    expect(parsed.itemListElement[1]).toMatchObject({
      position: 2,
      name: "Portfolio Allocation",
      item: `${SITE_URL}/portfolio-allocation`,
    });
  });

  it("escapes '<' so it cannot break out of an inline <script>", () => {
    const json = breadcrumbJsonLd("<script>alert(1)</script>", "/x");
    expect(json).not.toContain("<");
    expect(json).toContain("\\u003c");
  });
});

describe("faqJsonLd", () => {
  it("maps Q/A pairs into a FAQPage graph", () => {
    const json = faqJsonLd([
      { q: "What is it?", a: "A tracker." },
      { q: "How much?", a: "Free." },
    ]);
    const parsed = JSON.parse(json);
    expect(parsed["@type"]).toBe("FAQPage");
    expect(parsed.mainEntity).toHaveLength(2);
    expect(parsed.mainEntity[0]).toMatchObject({
      "@type": "Question",
      name: "What is it?",
      acceptedAnswer: { "@type": "Answer", text: "A tracker." },
    });
  });

  it("produces an empty entity list for no FAQs and escapes '<'", () => {
    const json = faqJsonLd([{ q: "1 < 2?", a: "yes < always" }]);
    expect(json).not.toContain("<");
    const emptyJson = faqJsonLd([]);
    expect(JSON.parse(emptyJson).mainEntity).toEqual([]);
  });
});

describe("organizationJsonLd", () => {
  it("builds an Organization graph with name and site URL", () => {
    const parsed = JSON.parse(organizationJsonLd());
    expect(parsed["@type"]).toBe("Organization");
    expect(parsed).toMatchObject({ name: SITE_NAME, url: SITE_URL });
    expect(parsed.logo).toBe(`${SITE_URL}/opengraph-image`);
  });
});

describe("softwareApplicationJsonLd", () => {
  it("builds a free FinanceApplication graph", () => {
    const parsed = JSON.parse(softwareApplicationJsonLd());
    expect(parsed["@type"]).toBe("SoftwareApplication");
    expect(parsed).toMatchObject({
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
    });
    expect(parsed.offers).toMatchObject({ price: "0", priceCurrency: "INR" });
  });
});
