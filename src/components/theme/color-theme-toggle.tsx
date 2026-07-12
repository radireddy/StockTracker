"use client";

import { useEffect, useState } from "react";
import { useColorTheme } from "@/components/theme/color-theme-provider";
import { COLOR_THEMES, type ColorThemeId } from "@/lib/color-themes";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

/**
 * Colour-theme picker rendered as a labeled radio group inside the user
 * dropdown menu. Text-only — no swatches. Reads/writes via ColorThemeProvider.
 *
 * Guarded by a `mounted` flag to avoid SSR hydration mismatches on the
 * checked indicator (same pattern as ThemeToggle).
 */
export function ColorThemeToggle() {
  const { colorTheme, setColorTheme } = useColorTheme();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  return (
    <DropdownMenuRadioGroup
      value={mounted ? colorTheme : undefined}
      onValueChange={(v) => setColorTheme(v as ColorThemeId)}
    >
      <DropdownMenuLabel className="px-2 pt-1 pb-0.5 uppercase tracking-wide">
        Colour
      </DropdownMenuLabel>
      {COLOR_THEMES.map(({ id, name }) => (
        <DropdownMenuRadioItem key={id} value={id} className="gap-2.5 py-2">
          {name}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
