"use client";

import { createContext, useContext, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const SaveStatusContext = createContext<{
  status: SaveStatus;
  setStatus: (s: SaveStatus) => void;
} | null>(null);

export function SaveStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  return (
    <SaveStatusContext.Provider value={{ status, setStatus }}>
      {children}
    </SaveStatusContext.Provider>
  );
}

export function useSaveStatus() {
  const ctx = useContext(SaveStatusContext);
  if (!ctx) throw new Error("useSaveStatus must be used within SaveStatusProvider");
  return ctx;
}
