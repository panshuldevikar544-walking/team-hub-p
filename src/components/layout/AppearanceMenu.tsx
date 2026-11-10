"use client";

import { useEffect, useState } from "react";
import { Palette, Moon, Sun, Monitor, Check, Image as ImageIcon } from "lucide-react";
import { useBackgrounds } from "@/components/layout/Backgrounds";
import { ACCENTS, applyAccent, applyTheme, readPref, writePref, type Theme } from "@/lib/prefs";

export function useAppearance() {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [accent, setAccentState] = useState<string>("indigo");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState((readPref("th-theme") as Theme) || "dark");
    setAccentState(readPref("th-accent") || "indigo");
  }, []);

  // Follow the operating system when the theme is "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);

  return {
    theme, accent,
    setTheme(t: Theme) { setThemeState(t); writePref("th-theme", t); applyTheme(t); },
    setAccent(a: string) { setAccentState(a); writePref("th-accent", a); applyAccent(a); },
  };
}

export default function AppearanceMenu({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const { theme, accent, setTheme, setAccent } = useAppearance();
  const { openSettings } = useBackgrounds();
  const themes = [
    { id: "dark" as const, label: "Dark", icon: Moon },
    { id: "light" as const, label: "Light", icon: Sun },
    { id: "system" as const, label: "System", icon: Monitor },
  ];

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-muted hover:bg-surface-2 hover:text-foreground">
        <Palette size={18} className="shrink-0" />
        {!collapsed && <span>Appearance</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="card absolute bottom-full left-0 mb-2 w-60 p-3 space-y-3 z-50 shadow-lg">
            <div>
              <div className="text-xs text-muted mb-1.5">Theme</div>
              <div className="grid grid-cols-3 gap-1">
                {themes.map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => setTheme(id)}
                    className={`flex flex-col items-center gap-1 rounded-lg py-2 text-xs border ${theme === id ? "border-accent bg-accent/10" : "border-border hover:bg-surface-2"}`}>
                    <Icon size={16} />{label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => { setOpen(false); openSettings(true); }}
              className="w-full flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2"
            >
              <ImageIcon size={15} /> Backgrounds &amp; chat theme…
            </button>
            <div>
              <div className="text-xs text-muted mb-1.5">Accent color</div>
              <div className="flex gap-2">
                {ACCENTS.map((a) => (
                  <button key={a.id} onClick={() => setAccent(a.id)} aria-label={a.id} title={a.id}
                    className="h-7 w-7 rounded-full flex items-center justify-center ring-offset-2 ring-offset-[var(--surface)]"
                    style={{ background: a.color, boxShadow: accent === a.id ? `0 0 0 2px var(--surface), 0 0 0 4px ${a.color}` : undefined }}>
                    {accent === a.id && <Check size={14} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
