"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "home-dashboard-theme";

function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "light";
    }
    return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  const toggle = () => {
    const nextMode: ThemeMode = mode === "dark" ? "light" : "dark";
    setMode(nextMode);
    applyTheme(nextMode);
    window.localStorage.setItem(STORAGE_KEY, nextMode);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-1.5 text-xs font-semibold text-[color:var(--app-foreground)] transition hover:brightness-95"
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
    >
      {mode === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
