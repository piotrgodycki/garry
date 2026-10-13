"use client";
import { useEffect, useState } from "react";
import { Icon } from "./icons";

type Theme = "light" | "system" | "dark";

/** Three way segmented control. "system" follows the OS preference live. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem("garry-theme");
    if (stored === "light" || stored === "dark") setTheme(stored);
  }, []);

  const pick = (next: Theme) => {
    setTheme(next);
    if (next === "system") {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem("garry-theme");
    } else {
      document.documentElement.dataset.theme = next;
      localStorage.setItem("garry-theme", next);
    }
  };

  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "light theme", icon: Icon.sun },
    { value: "system", label: "system theme", icon: Icon.monitor },
    { value: "dark", label: "dark theme", icon: Icon.moon },
  ];

  return (
    <div className="themeToggle" role="group" aria-label="theme">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={theme === o.value} aria-label={o.label} title={o.label} onClick={() => pick(o.value)}>
          {o.icon}
        </button>
      ))}
    </div>
  );
}
