import sanitizeHtmlLib from "sanitize-html";

/**
 * Server-side HTML sanitizer for rich-text content (thesis, highlights, timeline
 * entries) produced by the Tiptap editor. Replaces the previous
 * isomorphic-dompurify/jsdom pipeline, which crashed the serverless runtime once
 * a transitive dep (jsdom → html-encoding-sniffer → @exodus/bytes) became
 * ESM-only and could no longer be require()'d in the CJS bundle.
 *
 * The allowlist mirrors what the editor can emit (see
 * `src/components/ui/rich-text-editor-impl.tsx`): StarterKit formatting, tables,
 * images, links, underline, text-align, highlight, text color, font size, and
 * task lists. Anything outside the allowlist (scripts, event handlers, unknown
 * schemes) is stripped.
 */
const OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: [
    // block / text
    "p", "br", "hr", "div", "span", "blockquote", "pre", "code",
    "h1", "h2", "h3", "h4", "h5", "h6",
    // inline formatting
    "strong", "b", "em", "i", "u", "s", "strike", "mark", "sub", "sup",
    // lists (incl. Tiptap task lists)
    "ul", "ol", "li", "label", "input",
    // links & media
    "a", "img",
    // tables
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup", "col",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel", "class"],
    img: ["src", "alt", "title", "width", "height", "class", "style"],
    // Tiptap task lists render <ul data-type="taskList"> / <li data-checked>
    // with a disabled checkbox input.
    li: ["class", "style", "data-type", "data-checked"],
    ul: ["class", "style", "data-type"],
    input: ["type", "checked", "disabled"],
    // Tables carry colspan/rowspan and per-column width.
    td: ["colspan", "rowspan", "colwidth", "style", "class"],
    th: ["colspan", "rowspan", "colwidth", "style", "class"],
    col: ["style", "class", "width"],
    // Everything else may carry inline formatting styles + class.
    "*": ["style", "class"],
  },
  // Constrain inline styles to the properties the editor actually sets, so a
  // hostile `style` can't smuggle anything executable (e.g. url()/expression()).
  allowedStyles: {
    "*": {
      color: [/.*/],
      "background-color": [/.*/],
      "text-align": [/^(left|right|center|justify)$/],
      "font-size": [/^\d+(\.\d+)?(px|em|rem|%|pt)$/],
      width: [/^\d+(\.\d+)?(px|em|rem|%)$/],
      height: [/^\d+(\.\d+)?(px|em|rem|%)$/],
    },
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  // Allow inline base64 images (pasted/uploaded) but not on links.
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  // Force safe rel on links that open in a new tab.
  transformTags: {
    a: sanitizeHtmlLib.simpleTransform("a", { rel: "noopener noreferrer nofollow" }),
  },
};

/**
 * Returns sanitized HTML, or `null` for empty/nullish input — mirroring the
 * previous `sanitizeHtml` helper so nullable columns (thesis, highlights) keep
 * storing NULL rather than an empty string.
 */
export function sanitizeRichText(html: string | null | undefined): string | null {
  if (!html) return null;
  return sanitizeHtmlLib(html, OPTIONS);
}
