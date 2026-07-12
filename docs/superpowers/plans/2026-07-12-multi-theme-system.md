# Multi-Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three colour themes (A=Indigo+Amber, B=Sapphire+Cyan, C=Violet+Saffron) × light/dark, defaulting to B/light, with a user-accessible switcher in Settings.

**Architecture:** CSS custom properties scoped to `[data-color-theme]` + `.dark` attributes on `<html>`. Theme B is the default (lives in `:root`/`.dark` — no attribute needed). A and C override via `data-color-theme="a"|"c"`. A `ColorThemeProvider` client component manages localStorage persistence and applies the attribute. A one-line inline script in `<head>` prevents the flash-of-wrong-theme on load.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4 (OKLCH tokens in globals.css), next-themes (already wired for light/dark), TypeScript.

## Global Constraints

- All CSS token names (`--primary`, `--secondary`, `--accent`, `--border`, `--ring`, `--sidebar-*`, `--chart-*`, etc.) remain unchanged — zero component edits needed.
- Semantic tokens (`--positive`, `--warning`, `--amber`, `--privacy`, `--shadow-soft`, `--shadow-lift`) are identical across all three colour themes; they only differ between light and dark.
- Green (`--positive`) and red (`--destructive`) are never used as brand/primary colours — they remain semantic-only.
- `localStorage` key for colour theme: `color-theme`. Values: `"a"` | `"b"` | `"c"`. Absent or `"b"` → remove the attribute (B is default).
- next-themes continues to own `localStorage` key `theme` for light/dark/system.
- No server-side theme persistence (localStorage only, per-device).
- Target branch: `feat/multi-theme` cut from `origin/develop`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/color-themes.ts` | Theme metadata: id, name, hex swatches |
| Modify | `src/app/globals.css` | 6 scoped CSS variable blocks (3 themes × 2 modes) |
| Create | `src/components/theme/color-theme-provider.tsx` | Context + localStorage + `data-color-theme` attribute |
| Modify | `src/app/layout.tsx` | Flash-prevention `<script>` in head + `<ColorThemeProvider>` wrapper |
| Create | `src/components/theme/color-theme-selector.tsx` | Appearance UI: 3 swatches + Light/Dark/System buttons |
| Modify | `src/app/(authenticated)/settings/page.tsx` | Add Appearance card at top |

---

### Task 1: Create branch and theme metadata module

**Files:**
- Create: `src/lib/color-themes.ts`

**Interfaces:**
- Produces: `ColorThemeId`, `ColorTheme`, `COLOR_THEMES`, `DEFAULT_COLOR_THEME` — used by provider and selector

- [ ] **Step 1: Cut branch from origin/develop**

```bash
git fetch origin
git checkout -b feat/multi-theme origin/develop
```

Expected: `Switched to a new branch 'feat/multi-theme'`

- [ ] **Step 2: Create the theme metadata file**

Create `src/lib/color-themes.ts`:

```typescript
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

export const DEFAULT_COLOR_THEME: ColorThemeId = "b";

export const VALID_COLOR_THEME_IDS: ColorThemeId[] = ["a", "b", "c"];

export function isValidColorThemeId(value: unknown): value is ColorThemeId {
  return typeof value === "string" && VALID_COLOR_THEME_IDS.includes(value as ColorThemeId);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/color-themes.ts
git commit -m "feat(theme): add colour theme metadata module (A/B/C)"
```

---

### Task 2: Update globals.css with 6 scoped theme blocks

**Files:**
- Modify: `src/app/globals.css` (the `:root` and `.dark` blocks only — everything else stays)

**Interfaces:**
- Consumes: nothing
- Produces: CSS custom properties scoped to `[data-color-theme="a"|"c"]` + `.dark` combinator

- [ ] **Step 1: Replace the `:root` block with Theme B light values**

In `src/app/globals.css`, replace everything between `:root {` and the closing `}` (lines 65–110 in the original) with the following. The `@theme inline` block and all `@layer` blocks stay untouched.

```css
/* ── Theme B — Sapphire Blue + Cyan (DEFAULT light) ─────────────────────── */
:root {
  --background: oklch(0.97 0.01 222);
  --foreground: oklch(0.20 0.07 250);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.20 0.07 250);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.20 0.07 250);
  --primary: oklch(0.47 0.15 232);
  --primary-foreground: oklch(0.985 0.005 232);
  --secondary: oklch(0.96 0.04 220);
  --secondary-foreground: oklch(0.25 0.08 240);
  --muted: oklch(0.97 0.008 222);
  --muted-foreground: oklch(0.52 0.02 240);
  --accent: oklch(0.51 0.12 208);
  --accent-foreground: oklch(0.985 0.005 208);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0.01 25);
  --border: oklch(0.88 0.02 225);
  --input: oklch(0.88 0.02 225);
  --ring: oklch(0.74 0.14 218);
  --chart-1: oklch(0.47 0.15 232);
  --chart-2: oklch(0.51 0.12 208);
  --chart-3: oklch(0.65 0.17 54);
  --chart-4: oklch(0.60 0.18 20);
  --chart-5: oklch(0.60 0.18 290);
  --radius: 0.625rem;
  --sidebar: oklch(0.96 0.012 222);
  --sidebar-foreground: oklch(0.20 0.07 250);
  --sidebar-primary: oklch(0.47 0.15 232);
  --sidebar-primary-foreground: oklch(0.985 0.005 232);
  --sidebar-accent: oklch(0.93 0.04 220);
  --sidebar-accent-foreground: oklch(0.25 0.08 240);
  --sidebar-border: oklch(0.88 0.02 225);
  --sidebar-ring: oklch(0.74 0.14 218);
  /* Semantic — identical across all colour themes, differ only light vs dark */
  --positive: oklch(0.58 0.15 150);
  --warning: oklch(0.62 0.14 55);
  --amber: oklch(0.72 0.16 75);
  --shadow-soft: 0 1px 2px oklch(0 0 0 / 0.04), 0 8px 24px oklch(0 0 0 / 0.04);
  --shadow-lift: 0 2px 4px oklch(0 0 0 / 0.05), 0 14px 34px oklch(0 0 0 / 0.08);
  --privacy: oklch(0.46 0.22 264);
  --privacy-foreground: oklch(0.97 0.02 264);
}
```

- [ ] **Step 2: Replace the `.dark` block with Theme B dark values**

Replace everything inside `.dark { }`:

```css
/* ── Theme B — Sapphire Blue + Cyan (DEFAULT dark) ──────────────────────── */
.dark {
  --background: oklch(0.10 0.03 250);
  --foreground: oklch(0.93 0.01 220);
  --card: oklch(0.14 0.03 250);
  --card-foreground: oklch(0.93 0.01 220);
  --popover: oklch(0.14 0.03 250);
  --popover-foreground: oklch(0.93 0.01 220);
  --primary: oklch(0.74 0.14 218);
  --primary-foreground: oklch(0.10 0.03 250);
  --secondary: oklch(0.16 0.03 240);
  --secondary-foreground: oklch(0.88 0.01 220);
  --muted: oklch(0.16 0.03 240);
  --muted-foreground: oklch(0.64 0.02 225);
  --accent: oklch(0.79 0.12 205);
  --accent-foreground: oklch(0.10 0.03 250);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.985 0.01 25);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.74 0.14 218);
  --chart-1: oklch(0.74 0.14 218);
  --chart-2: oklch(0.79 0.12 205);
  --chart-3: oklch(0.75 0.15 54);
  --chart-4: oklch(0.70 0.18 20);
  --chart-5: oklch(0.70 0.18 290);
  --sidebar: oklch(0.12 0.03 250);
  --sidebar-foreground: oklch(0.93 0.01 220);
  --sidebar-primary: oklch(0.74 0.14 218);
  --sidebar-primary-foreground: oklch(0.10 0.03 250);
  --sidebar-accent: oklch(0.20 0.04 240);
  --sidebar-accent-foreground: oklch(0.88 0.01 220);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.74 0.14 218);
  /* Semantic dark overrides */
  --positive: oklch(0.72 0.16 150);
  --warning: oklch(0.75 0.14 65);
  --amber: oklch(0.82 0.15 80);
  --shadow-soft: 0 1px 2px oklch(0 0 0 / 0.3), 0 8px 24px oklch(0 0 0 / 0.3);
  --shadow-lift: 0 2px 4px oklch(0 0 0 / 0.4), 0 14px 34px oklch(0 0 0 / 0.5);
  --privacy: oklch(0.62 0.20 264);
  --privacy-foreground: oklch(0.97 0.02 264);
}
```

- [ ] **Step 3: Append Theme A and Theme C blocks after the `.dark` block**

Add the following immediately after the closing `}` of `.dark`:

```css
/* ── Theme A — Slate Indigo + Amber (light) ─────────────────────────────── */
[data-color-theme="a"] {
  --background: oklch(0.97 0.007 279);
  --foreground: oklch(0.18 0.08 279);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.18 0.08 279);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.18 0.08 279);
  --primary: oklch(0.47 0.22 264);
  --primary-foreground: oklch(0.985 0.003 264);
  --secondary: oklch(0.95 0.03 279);
  --secondary-foreground: oklch(0.32 0.12 270);
  --muted: oklch(0.96 0.005 279);
  --muted-foreground: oklch(0.52 0.01 264);
  --accent: oklch(0.65 0.17 54);
  --accent-foreground: oklch(0.985 0.005 54);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0.01 25);
  --border: oklch(0.91 0.015 279);
  --input: oklch(0.91 0.015 279);
  --ring: oklch(0.66 0.16 264);
  --chart-1: oklch(0.47 0.22 264);
  --chart-2: oklch(0.65 0.17 54);
  --chart-3: oklch(0.62 0.15 220);
  --chart-4: oklch(0.60 0.18 20);
  --chart-5: oklch(0.55 0.18 310);
  --sidebar: oklch(0.96 0.008 279);
  --sidebar-foreground: oklch(0.18 0.08 279);
  --sidebar-primary: oklch(0.47 0.22 264);
  --sidebar-primary-foreground: oklch(0.985 0.003 264);
  --sidebar-accent: oklch(0.92 0.05 279);
  --sidebar-accent-foreground: oklch(0.32 0.12 270);
  --sidebar-border: oklch(0.91 0.015 279);
  --sidebar-ring: oklch(0.66 0.16 264);
}

/* ── Theme A — Slate Indigo + Amber (dark) ───────────────────────────────── */
.dark[data-color-theme="a"] {
  --background: oklch(0.12 0.03 279);
  --foreground: oklch(0.93 0.01 279);
  --card: oklch(0.16 0.03 279);
  --card-foreground: oklch(0.93 0.01 279);
  --popover: oklch(0.16 0.03 279);
  --popover-foreground: oklch(0.93 0.01 279);
  --primary: oklch(0.66 0.16 264);
  --primary-foreground: oklch(0.12 0.03 279);
  --secondary: oklch(0.18 0.03 279);
  --secondary-foreground: oklch(0.85 0.02 264);
  --muted: oklch(0.18 0.03 279);
  --muted-foreground: oklch(0.62 0.01 264);
  --accent: oklch(0.83 0.15 78);
  --accent-foreground: oklch(0.12 0.03 279);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.985 0.01 25);
  --border: oklch(1 0 0 / 9%);
  --input: oklch(1 0 0 / 14%);
  --ring: oklch(0.66 0.16 264);
  --chart-1: oklch(0.66 0.16 264);
  --chart-2: oklch(0.83 0.15 78);
  --chart-3: oklch(0.70 0.15 220);
  --chart-4: oklch(0.70 0.18 20);
  --chart-5: oklch(0.65 0.18 310);
  --sidebar: oklch(0.13 0.03 279);
  --sidebar-foreground: oklch(0.93 0.01 279);
  --sidebar-primary: oklch(0.66 0.16 264);
  --sidebar-primary-foreground: oklch(0.12 0.03 279);
  --sidebar-accent: oklch(0.22 0.04 279);
  --sidebar-accent-foreground: oklch(0.85 0.02 264);
  --sidebar-border: oklch(1 0 0 / 9%);
  --sidebar-ring: oklch(0.66 0.16 264);
}

/* ── Theme C — Deep Violet + Saffron (light) ────────────────────────────── */
[data-color-theme="c"] {
  --background: oklch(0.99 0.005 295);
  --foreground: oklch(0.16 0.08 300);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.16 0.08 300);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.16 0.08 300);
  --primary: oklch(0.52 0.26 280);
  --primary-foreground: oklch(0.985 0.003 280);
  --secondary: oklch(0.97 0.02 295);
  --secondary-foreground: oklch(0.36 0.15 285);
  --muted: oklch(0.97 0.02 295);
  --muted-foreground: oklch(0.52 0.01 260);
  --accent: oklch(0.65 0.17 54);
  --accent-foreground: oklch(0.985 0.005 54);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0.01 25);
  --border: oklch(0.91 0.02 295);
  --input: oklch(0.91 0.02 295);
  --ring: oklch(0.69 0.18 286);
  --chart-1: oklch(0.52 0.26 280);
  --chart-2: oklch(0.65 0.17 54);
  --chart-3: oklch(0.62 0.15 220);
  --chart-4: oklch(0.60 0.18 20);
  --chart-5: oklch(0.55 0.12 208);
  --sidebar: oklch(0.96 0.01 295);
  --sidebar-foreground: oklch(0.16 0.08 300);
  --sidebar-primary: oklch(0.52 0.26 280);
  --sidebar-primary-foreground: oklch(0.985 0.003 280);
  --sidebar-accent: oklch(0.93 0.04 295);
  --sidebar-accent-foreground: oklch(0.36 0.15 285);
  --sidebar-border: oklch(0.91 0.02 295);
  --sidebar-ring: oklch(0.69 0.18 286);
}

/* ── Theme C — Deep Violet + Saffron (dark) ─────────────────────────────── */
.dark[data-color-theme="c"] {
  --background: oklch(0.11 0.03 295);
  --foreground: oklch(0.94 0.02 290);
  --card: oklch(0.14 0.05 300);
  --card-foreground: oklch(0.94 0.02 290);
  --popover: oklch(0.14 0.05 300);
  --popover-foreground: oklch(0.94 0.02 290);
  --primary: oklch(0.69 0.18 286);
  --primary-foreground: oklch(0.11 0.03 295);
  --secondary: oklch(0.15 0.04 295);
  --secondary-foreground: oklch(0.88 0.02 286);
  --muted: oklch(0.15 0.04 295);
  --muted-foreground: oklch(0.62 0.01 286);
  --accent: oklch(0.83 0.15 78);
  --accent-foreground: oklch(0.11 0.03 295);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.985 0.01 25);
  --border: oklch(1 0 0 / 8%);
  --input: oklch(1 0 0 / 13%);
  --ring: oklch(0.69 0.18 286);
  --chart-1: oklch(0.69 0.18 286);
  --chart-2: oklch(0.83 0.15 78);
  --chart-3: oklch(0.70 0.15 220);
  --chart-4: oklch(0.70 0.18 20);
  --chart-5: oklch(0.60 0.12 208);
  --sidebar: oklch(0.12 0.04 300);
  --sidebar-foreground: oklch(0.94 0.02 290);
  --sidebar-primary: oklch(0.69 0.18 286);
  --sidebar-primary-foreground: oklch(0.11 0.03 295);
  --sidebar-accent: oklch(0.20 0.05 295);
  --sidebar-accent-foreground: oklch(0.88 0.02 286);
  --sidebar-border: oklch(1 0 0 / 8%);
  --sidebar-ring: oklch(0.69 0.18 286);
}
```

- [ ] **Step 4: Verify build compiles cleanly**

```bash
cd /Users/ravindraadireddy/StockTracker && npm run build 2>&1 | tail -20
```

Expected: no CSS errors. TypeScript errors unrelated to this task are acceptable.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): replace green monochrome tokens with 3×2 scoped theme blocks"
```

---

### Task 3: ColorThemeProvider + flash-prevention script

**Files:**
- Create: `src/components/theme/color-theme-provider.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `ColorThemeId`, `isValidColorThemeId`, `DEFAULT_COLOR_THEME` from `src/lib/color-themes.ts`
- Produces: `ColorThemeProvider` (component), `useColorTheme()` hook returning `{ colorTheme: ColorThemeId, setColorTheme: (id: ColorThemeId) => void }`

- [ ] **Step 1: Create the provider**

Create `src/components/theme/color-theme-provider.tsx`:

```tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_COLOR_THEME,
  isValidColorThemeId,
  type ColorThemeId,
} from "@/lib/color-themes";

const STORAGE_KEY = "color-theme";

type ColorThemeContextValue = {
  colorTheme: ColorThemeId;
  setColorTheme: (id: ColorThemeId) => void;
};

const ColorThemeContext = createContext<ColorThemeContextValue>({
  colorTheme: DEFAULT_COLOR_THEME,
  setColorTheme: () => {},
});

function applyColorTheme(id: ColorThemeId) {
  const el = document.documentElement;
  if (id === "b") {
    el.removeAttribute("data-color-theme");
  } else {
    el.setAttribute("data-color-theme", id);
  }
}

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const [colorTheme, setColorThemeState] =
    useState<ColorThemeId>(DEFAULT_COLOR_THEME);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isValidColorThemeId(stored)) {
      setColorThemeState(stored);
      applyColorTheme(stored);
    }
  }, []);

  function setColorTheme(id: ColorThemeId) {
    setColorThemeState(id);
    localStorage.setItem(STORAGE_KEY, id);
    applyColorTheme(id);
  }

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export function useColorTheme(): ColorThemeContextValue {
  return useContext(ColorThemeContext);
}
```

- [ ] **Step 2: Add flash-prevention script + provider to layout.tsx**

In `src/app/layout.tsx`, add a `<head>` block with an inline script, and wrap the existing `<ThemeProvider>` with `<ColorThemeProvider>`.

The flash-prevention script reads `localStorage` synchronously before first paint and sets `data-color-theme` if needed. It must run before any React hydration.

Replace the entire `return (...)` in `RootLayout` with:

```tsx
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Runs before paint — prevents flash of wrong colour theme */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('color-theme');if(t&&t!=='b')document.documentElement.setAttribute('data-color-theme',t);}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ColorThemeProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </ColorThemeProvider>
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener('click',function(e){var a=e.target.closest('.prose a[href]');if(a){a.target='_blank';a.rel='noopener noreferrer'}})`,
          }}
        />
      </body>
    </html>
  );
```

Also add the import at the top of the file:

```tsx
import { ColorThemeProvider } from "@/components/theme/color-theme-provider";
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npm run typecheck 2>&1 | grep -E "(error|Error)" | head -20
```

Expected: 0 new errors introduced by these files.

- [ ] **Step 4: Commit**

```bash
git add src/components/theme/color-theme-provider.tsx src/app/layout.tsx
git commit -m "feat(theme): add ColorThemeProvider with localStorage persistence and flash prevention"
```

---

### Task 4: ColorThemeSelector UI component

**Files:**
- Create: `src/components/theme/color-theme-selector.tsx`

**Interfaces:**
- Consumes: `useColorTheme()` from `color-theme-provider.tsx`; `useTheme()` from `next-themes`; `COLOR_THEMES` from `src/lib/color-themes.ts`
- Produces: `<ColorThemeSelector />` — zero props, self-contained

- [ ] **Step 1: Create the selector component**

Create `src/components/theme/color-theme-selector.tsx`:

```tsx
"use client";

import { useTheme } from "next-themes";
import { useColorTheme } from "@/components/theme/color-theme-provider";
import { COLOR_THEMES } from "@/lib/color-themes";
import { cn } from "@/lib/utils";

const MODES = [
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark",  label: "Dark",  icon: "🌙" },
  { value: "system",label: "System",icon: "⊙" },
] as const;

export function ColorThemeSelector() {
  const { colorTheme, setColorTheme } = useColorTheme();
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-5">
      {/* Colour theme row */}
      <div>
        <p className="mb-3 text-sm font-medium">Colour theme</p>
        <div
          role="radiogroup"
          aria-label="Colour theme"
          className="grid grid-cols-3 gap-3"
        >
          {COLOR_THEMES.map((t) => {
            const selected = colorTheme === t.id;
            return (
              <button
                key={t.id}
                role="radio"
                aria-checked={selected}
                onClick={() => setColorTheme(t.id)}
                className={cn(
                  "overflow-hidden rounded-xl border-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  selected
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border hover:border-primary/40"
                )}
              >
                {/* Colour strip */}
                <div className="flex h-9">
                  <div className="flex-1" style={{ background: t.primaryHex }} />
                  <div className="flex-1" style={{ background: t.secondaryHex }} />
                  <div className="flex-1" style={{ background: t.accentHex }} />
                </div>
                {/* Label */}
                <div className="px-3 py-2">
                  <p className="text-xs font-semibold">{t.name}</p>
                  {selected && (
                    <p className="text-[10px] font-medium text-primary">
                      Selected ✓
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode row */}
      <div>
        <p className="mb-3 text-sm font-medium">Mode</p>
        <div
          role="radiogroup"
          aria-label="Display mode"
          className="grid grid-cols-3 gap-3"
        >
          {MODES.map((m) => {
            const selected = theme === m.value;
            return (
              <button
                key={m.value}
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(m.value)}
                className={cn(
                  "rounded-xl border-2 px-4 py-3 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                <div className="text-lg" aria-hidden="true">{m.icon}</div>
                <p className="mt-1 text-xs font-semibold">{m.label}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck 2>&1 | grep -E "(error|Error)" | head -20
```

Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/theme/color-theme-selector.tsx
git commit -m "feat(theme): add ColorThemeSelector UI component (swatches + mode buttons)"
```

---

### Task 5: Wire selector into Settings page

**Files:**
- Modify: `src/app/(authenticated)/settings/page.tsx`

**Interfaces:**
- Consumes: `<ColorThemeSelector />` from `color-theme-selector.tsx`; existing `Card`, `CardContent`, `CardHeader`, `CardTitle` from `@/components/ui/card`

- [ ] **Step 1: Add import and Appearance card to settings page**

In `src/app/(authenticated)/settings/page.tsx`:

Add import after the existing imports:

```tsx
import { ColorThemeSelector } from "@/components/theme/color-theme-selector";
```

Then add an Appearance card as the **first** card inside the `<div className="mx-auto max-w-2xl space-y-6">`, before the Profile card:

```tsx
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <ColorThemeSelector />
        </CardContent>
      </Card>
```

So the full return block becomes:

```tsx
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Account" title="Settings" />
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <ColorThemeSelector />
        </CardContent>
      </Card>
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Name:</strong> {profile?.display_name}</p>
          <p><strong>Email:</strong> {profile?.email}</p>
          <p>
            <strong>Plan:</strong>{" "}
            <Badge className="border-primary/25 bg-primary/10 font-semibold uppercase tracking-wide text-primary">
              {profile?.plan ?? "free"}
            </Badge>
          </p>
        </CardContent>
      </Card>
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Allocation Ranges</CardTitle>
        </CardHeader>
        <CardContent>
          <AllocationRangesEditor
            initialRanges={(profile?.allocation_ranges as AllocationRanges | null) ?? null}
          />
        </CardContent>
      </Card>
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Portfolios</CardTitle>
          <CardDescription>
            Star a portfolio to make it the default — it&rsquo;s the one your
            dashboard opens on. Only one portfolio (holdings or watchlist) can
            be the default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PortfolioManager portfolios={portfolios} />
        </CardContent>
      </Card>
      <AccountsManager />
      <Card className="border-destructive/30 shadow-soft">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Permanently delete your account and all associated data.
            This action cannot be undone.
          </p>
          <DeleteAccountDialog />
        </CardContent>
      </Card>
    </div>
  );
```

- [ ] **Step 2: Run full build to confirm no errors**

```bash
npm run build 2>&1 | tail -30
```

Expected: build succeeds. Note: `settings/page.tsx` is a server component — `ColorThemeSelector` is a client component imported into it, which is valid in Next.js App Router.

- [ ] **Step 3: Commit**

```bash
git add src/app/(authenticated)/settings/page.tsx
git commit -m "feat(theme): add Appearance card to Settings with colour theme + mode selector"
```

---

### Task 6: Verify end-to-end and push branch

- [ ] **Step 1: Run typecheck and build one final time**

```bash
npm run typecheck && npm run build 2>&1 | tail -20
```

Expected: 0 type errors, successful build.

- [ ] **Step 2: Manual smoke-test checklist**

Start dev server (`npm run dev`) and check each of the following:

1. Visit `/` (marketing landing page) — loads with Sapphire blue primary (not green). Header "Sign in" button is blue.
2. Sign in and visit `/dashboard` — header logo, nav active state, Add Company button are all blue.
3. Visit `/settings` — Appearance card appears at top with 3 swatches (Indigo / Sapphire ✓ / Violet) and 3 mode buttons (Light ✓ / Dark / System).
4. Click "Indigo" — page instantly switches to deep indigo primary. Reload — indigo persists.
5. Toggle Dark — page goes dark. Reload — dark persists.
6. Click "Violet" in dark mode — violet + dark renders correctly. Reload — persists.
7. Click "Sapphire" + Light — back to default.
8. Check Dashboard: green +P&L, red −P&L, green BUY badge still render correctly (semantic colours unchanged).
9. Open mobile viewport (375px) — Settings page swatches are readable, tappable.

- [ ] **Step 3: Push branch**

```bash
git push -u origin feat/multi-theme
```

Expected: branch pushed, upstream set.
