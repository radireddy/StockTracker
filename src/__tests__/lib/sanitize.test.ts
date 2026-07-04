import { describe, it, expect } from "vitest";
import { sanitizeRichText } from "@/lib/sanitize";

describe("sanitizeRichText", () => {
  it("returns null for empty/nullish input (keeps nullable columns NULL)", () => {
    expect(sanitizeRichText(null)).toBeNull();
    expect(sanitizeRichText(undefined)).toBeNull();
    expect(sanitizeRichText("")).toBeNull();
  });

  it("strips <script> tags entirely", () => {
    const out = sanitizeRichText('<p>hi</p><script>alert(1)</script>');
    expect(out).toBe("<p>hi</p>");
    expect(out).not.toContain("script");
  });

  it("strips inline event handlers", () => {
    const out = sanitizeRichText('<p onclick="steal()">click</p>');
    expect(out).toBe("<p>click</p>");
    expect(out).not.toContain("onclick");
  });

  it("strips javascript: hrefs but keeps safe links (with safe rel)", () => {
    const evil = sanitizeRichText('<a href="javascript:alert(1)">x</a>');
    expect(evil).not.toContain("javascript:");

    const safe = sanitizeRichText('<a href="https://example.com" target="_blank">x</a>');
    expect(safe).toContain('href="https://example.com"');
    expect(safe).toContain('rel="noopener noreferrer nofollow"');
  });

  it("preserves Tiptap formatting: headings, bold, italic, underline, lists", () => {
    const html =
      "<h2>Title</h2><p><strong>bold</strong> <em>it</em> <u>u</u></p><ul><li>a</li></ul>";
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("preserves allowed inline styles (color, text-align, font-size)", () => {
    const out = sanitizeRichText(
      '<p style="text-align:center"><span style="color:#ff0000;font-size:18px">red</span></p>'
    );
    expect(out).toContain("text-align:center");
    expect(out).toContain("color:#ff0000");
    expect(out).toContain("font-size:18px");
  });

  it("drops disallowed style properties (e.g. position) while keeping allowed ones", () => {
    const out = sanitizeRichText('<p style="color:red;position:fixed">x</p>');
    expect(out).toContain("color:red");
    expect(out).not.toContain("position");
  });

  it("preserves tables with colspan/rowspan", () => {
    const html =
      '<table><tbody><tr><td colspan="2">a</td></tr><tr><td>b</td><td>c</td></tr></tbody></table>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("keeps http/https/data image sources, drops javascript image sources", () => {
    expect(sanitizeRichText('<img src="https://x.com/a.png" alt="a" />')).toContain(
      'src="https://x.com/a.png"'
    );
    expect(sanitizeRichText('<img src="data:image/png;base64,AAAA" />')).toContain(
      "data:image/png;base64,AAAA"
    );
    expect(sanitizeRichText('<img src="javascript:alert(1)" />')).not.toContain("javascript:");
  });
});
