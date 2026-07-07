"use client";

import { useRef, useCallback, useEffect } from "react";
import { useSaveStatus } from "@/contexts/save-status-context";
import { toastError } from "@/lib/toast-error";
import type { ActionResult } from "@/lib/action-result";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function useAutoSave<T>(
  saveFn: (data: T) => Promise<ActionResult | void>,
  options?: { delay?: number; retries?: number }
): { trigger: (data: T) => void } {
  const { setStatus } = useSaveStatus();
  const delay = options?.delay ?? 1000;
  const maxRetries = options?.retries ?? 3;

  // Always call latest version of saveFn without stale closures
  const saveFnRef = useRef(saveFn);
  useEffect(() => { saveFnRef.current = saveFn; });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSave = useCallback(async (data: T) => {
    setStatus("saving");
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const result = await saveFnRef.current(data);
        if (result && !result.ok) throw new Error(result.error);
        setStatus("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setStatus("idle"), 3000);
        return;
      } catch (err) {
        attempt++;
        if (attempt < maxRetries) {
          await sleep(1000);
        } else {
          setStatus("error");
          toastError(err, { message: "Auto-save failed. Your changes may not be saved." });
        }
      }
    }
  }, [setStatus, maxRetries]);

  const trigger = useCallback((data: T) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (delay === 0) {
      void doSave(data);
      return;
    }
    timerRef.current = setTimeout(() => void doSave(data), delay);
  }, [doSave, delay]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  return { trigger };
}
