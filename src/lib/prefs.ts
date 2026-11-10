// Per-viewer interface preferences (theme, accent, dashboard cards). Stored in this browser only.
export type Theme = "dark" | "light" | "system";
export const ACCENTS = [
  { id: "indigo", color: "#6366f1" },
  { id: "violet", color: "#8b5cf6" },
  { id: "sky", color: "#0284c7" },
  { id: "emerald", color: "#059669" },
  { id: "rose", color: "#e11d48" },
  { id: "amber", color: "#d97706" },
] as const;

export function readPref(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function writePref(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage may be blocked */ }
}

export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
export function applyAccent(id: string) {
  document.documentElement.dataset.accent = id;
}

// Runs before first paint (inlined in the root layout) so the page never flashes the wrong theme.
export const NO_FLASH_SCRIPT = `(function(){try{var t=localStorage.getItem("th-theme")||"dark";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.dataset.accent=localStorage.getItem("th-accent")||"indigo";}catch(e){}})();`;
