"use client";

import { useTheme } from "next-themes";
import { useColorTheme } from "@/components/theme/color-theme-provider";
import { COLOR_THEMES } from "@/lib/color-themes";
import { cn } from "@/lib/utils";

const MODES = [
  { value: "light",  label: "Light",  icon: "☀" },
  { value: "dark",   label: "Dark",   icon: "🌙" },
  { value: "system", label: "System", icon: "⊙" },
] as const;

export function ColorThemeSelector() {
  const { colorTheme, setColorTheme } = useColorTheme();
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-5">
      {/* Colour theme picker */}
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
                {/* Colour strip showing primary / secondary / accent */}
                <div className="flex h-9">
                  <div className="flex-1" style={{ background: t.primaryHex }} />
                  <div className="flex-1" style={{ background: t.secondaryHex }} />
                  <div className="flex-1" style={{ background: t.accentHex }} />
                </div>
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

      {/* Light / Dark / System picker */}
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
