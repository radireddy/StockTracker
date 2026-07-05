"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * App-wide theme provider. Uses class-based dark mode (`.dark` on <html>) to
 * match the `@custom-variant dark` + `.dark {}` tokens in globals.css.
 *
 * Defaults to light; `enableSystem` lets users pick "System" to follow the OS.
 */
export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
