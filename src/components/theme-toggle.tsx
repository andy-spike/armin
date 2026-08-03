"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/theme/theme-provider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted outline-none transition-colors hover:bg-bg-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
    >
      {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
