"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

/**
 * Theme picker rendered as a labeled radio group inside the user dropdown
 * menu. 3-way: System / Light / Dark. Reads/writes via next-themes.
 *
 * Guarded by a `mounted` flag: `theme` is undefined during SSR, so we render a
 * stable placeholder to avoid a hydration mismatch on the checked indicator.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Mount guard for SSR: `theme` is only known on the client, so we flip this
  // after hydration to avoid a mismatch on the checked indicator. The one-time
  // setState is the intended effect behaviour, not a cascading-render bug.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  return (
    <DropdownMenuRadioGroup
      value={mounted ? theme : undefined}
      onValueChange={setTheme}
    >
      <DropdownMenuLabel className="px-2 pt-1 pb-0.5 uppercase tracking-wide">
        Theme
      </DropdownMenuLabel>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <DropdownMenuRadioItem key={value} value={value} className="gap-2.5 py-2">
          <Icon className="text-muted-foreground" aria-hidden="true" />
          {label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
