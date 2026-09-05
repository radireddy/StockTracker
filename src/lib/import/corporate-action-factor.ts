/** Parse an NSE/BSE corporate-action subject into an equity share-multiplier.
 *  Returns null for anything that isn't an equity split or equity bonus. */
export function parseCorporateAction(
  subject: string
): { action_type: "split" | "bonus"; factor: number } | null {
  const s = subject.toLowerCase();

  // Exclude non-equity instruments outright.
  if (/ncrps|preference|warrant|debenture|scheme of arrangement/.test(s)) return null;

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
