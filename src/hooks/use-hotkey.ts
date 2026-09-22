"use client";

import { useEffect, useState } from "react";

/** Fires a callback when Escape is pressed (dialogs, palettes). */
export function useEscape(handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") handler();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [handler, enabled]);
}

/** Global shortcut registration (⌘K palette, shortcuts help). */
export function useHotkey(match: (event: KeyboardEvent) => boolean, handler: () => void) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (match(event)) {
        event.preventDefault();
        handler();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [match, handler]);
}

export function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Persists a small UI preference (filters, view mode) across reloads. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) setValue(JSON.parse(stored) as T);
    } catch {
      /* ignore malformed storage */
    }
  }, [key]);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable (private mode) — state stays in memory */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
