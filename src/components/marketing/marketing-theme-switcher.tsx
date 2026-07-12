"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun, Palette } from "lucide-react";
import { useColorTheme } from "@/components/theme/color-theme-provider";
import { COLOR_THEMES, type ColorThemeId } from "@/lib/color-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MODE_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/** Compact colour-theme + light/dark mode picker for the marketing header. */
export function MarketingThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { colorTheme, setColorTheme } = useColorTheme();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Theme settings"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Palette size={15} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-40 p-1.5">
        <DropdownMenuRadioGroup
          value={mounted ? colorTheme : undefined}
          onValueChange={(v) => setColorTheme(v as ColorThemeId)}
        >
          <DropdownMenuLabel className="px-2 pt-1 pb-0.5 uppercase tracking-wide">
            Colour
          </DropdownMenuLabel>
          {COLOR_THEMES.map(({ id, name }) => (
            <DropdownMenuRadioItem key={id} value={id} className="py-2">
              {name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={mounted ? theme : undefined}
          onValueChange={setTheme}
        >
          <DropdownMenuLabel className="px-2 pt-1 pb-0.5 uppercase tracking-wide">
            Mode
          </DropdownMenuLabel>
          {MODE_OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="gap-2.5 py-2">
              <Icon size={13} className="text-muted-foreground" aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
