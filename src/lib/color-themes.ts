export type ColorThemeId = "a" | "b" | "c";

export type ColorTheme = {
  id: ColorThemeId;
  name: string;
  description: string;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  primaryHexDark: string;
};

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: "a",
    name: "Indigo",
    description: "Slate Indigo + Amber",
    primaryHex: "#4338ca",
    secondaryHex: "#ede9f6",
    accentHex: "#d97706",
    primaryHexDark: "#818cf8",
  },
  {
    id: "b",
    name: "Sapphire",
    description: "Sapphire Blue + Cyan",
    primaryHex: "#0369a1",
    secondaryHex: "#e0f2fe",
    accentHex: "#0e7490",
    primaryHexDark: "#38bdf8",
  },
  {
    id: "c",
    name: "Violet",
    description: "Deep Violet + Saffron",
    primaryHex: "#7c3aed",
    secondaryHex: "#f5f3ff",
    accentHex: "#d97706",
    primaryHexDark: "#a78bfa",
  },
];

export const DEFAULT_COLOR_THEME: ColorThemeId = "c";

export const VALID_COLOR_THEME_IDS: ColorThemeId[] = ["a", "b", "c"];

export function isValidColorThemeId(value: unknown): value is ColorThemeId {
  return (
    typeof value === "string" &&
    VALID_COLOR_THEME_IDS.includes(value as ColorThemeId)
  );
}
