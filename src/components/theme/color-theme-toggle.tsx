"use client";

import { useColorTheme } from "@/components/theme/color-theme-provider";
import { COLOR_THEMES, type ColorThemeId } from "@/lib/color-themes";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

export function ColorThemeToggle() {
  const { colorTheme, setColorTheme } = useColorTheme();

  return (
    <DropdownMenuRadioGroup
      value={colorTheme}
      onValueChange={(v) => setColorTheme(v as ColorThemeId)}
    >
      <DropdownMenuLabel className="px-2 pt-1 pb-0.5 uppercase tracking-wide">
        Theme
      </DropdownMenuLabel>
      {COLOR_THEMES.map(({ id, name }) => (
        <DropdownMenuRadioItem key={id} value={id} className="gap-2.5 py-2">
          {name}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
