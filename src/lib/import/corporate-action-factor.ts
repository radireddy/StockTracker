/** Parse an NSE/BSE corporate-action subject into an equity share-multiplier.
 *  Returns null for anything that isn't an equity split, bonus, or merger. */
export function parseCorporateAction(
  subject: string
): { action_type: "split" | "bonus"; factor: number } | { action_type: "merger"; factor: number | null } | null {
  const s = subject.toLowerCase();

  // Exclude non-equity instruments outright.
  if (/ncrps|preference|warrant|debenture/.test(s)) return null;
  // Scheme of Arrangement is only valid when it IS a merger/amalgamation.
  if (/scheme of arrangement/.test(s) && !/merger|amalgam/.test(s)) return null;

  // Merger / amalgamation: detect first (before bonus, to avoid false bonus match).
  if (/\bmerger\b|amalgam/.test(s)) {
    // Try to parse an explicit ratio like "42:25".
    const m = s.match(/(\d+)\s*:\s*(\d+)/);
    if (m) {
      const num = parseInt(m[1], 10);
      const den = parseInt(m[2], 10);
      if (num > 0 && den > 0) return { action_type: "merger", factor: num / den };
    }
    return { action_type: "merger", factor: null };
  }

  // Split: face-value sub-division "From Rs X ... To (Rs|Re) Y".
  if (/split|sub-division|subdivision/.test(s)) {
    const m = s.match(/from\s*rs?\.?\s*([\d.]+).*?to\s*rs?e?\.?\s*([\d.]+)/);
    if (m) {
      const oldFv = parseFloat(m[1]);
      const newFv = parseFloat(m[2]);
      if (oldFv > 0 && newFv > 0 && oldFv !== newFv) {
        return { action_type: "split", factor: oldFv / newFv };
      }
    }
    return null;
  }

  // Bonus a:b → (a + b) / b.
  if (/\bbonus\b/.test(s)) {
    const m = s.match(/bonus\s*(\d+)\s*:\s*(\d+)/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (a > 0 && b > 0) return { action_type: "bonus", factor: (a + b) / b };
    }
    return null;
  }

  return null;
}
