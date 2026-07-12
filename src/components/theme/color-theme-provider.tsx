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
  if (id === "c") {
    el.removeAttribute("data-color-theme");
  } else {
    el.setAttribute("data-color-theme", id);
  }
}

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const [colorTheme, setColorThemeState] = useState<ColorThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_COLOR_THEME;
    const stored = localStorage.getItem(STORAGE_KEY);
    return isValidColorThemeId(stored) ? stored : DEFAULT_COLOR_THEME;
  });

  useEffect(() => {
    applyColorTheme(colorTheme);
  }, [colorTheme]);

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
