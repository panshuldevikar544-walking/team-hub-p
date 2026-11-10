"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal, ChevronUp, ChevronDown, Eye, EyeOff, RotateCcw } from "lucide-react";
import { readPref, writePref } from "@/lib/prefs";

export type Section = { id: string; title: string; wide?: boolean; node: React.ReactNode };

/** Lets each person choose which dashboard cards to show and in what order. Saved in this browser. */
export default function DashboardLayout({ sections, storageKey }: { sections: Section[]; storageKey: string }) {
  const defaults = sections.map((s) => s.id);
  const [order, setOrder] = useState<string[]>(defaults);
  const [hidden, setHidden] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(readPref(storageKey) ?? "null") as { order?: string[]; hidden?: string[] } | null;
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOrder([...(saved.order ?? []).filter((id) => defaults.includes(id)), ...defaults.filter((id) => !(saved.order ?? []).includes(id))]);
        setHidden((saved.hidden ?? []).filter((id) => defaults.includes(id)));
      }
    } catch { /* ignore a corrupted preference */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const save = (o: string[], h: string[]) => { setOrder(o); setHidden(h); writePref(storageKey, JSON.stringify({ order: o, hidden: h })); };
  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    save(next, hidden);
  };
  const toggle = (id: string) => save(order, hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]);

  const byId = new Map(sections.map((s) => [s.id, s]));
  const shown = order.map((id) => byId.get(id)!).filter((s) => s && !hidden.includes(s.id));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setEditing(!editing)} className={`flex items-center gap-1.5 text-sm rounded-lg border px-3 py-1.5 ${editing ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}>
          <SlidersHorizontal size={14} /> Customize
        </button>
      </div>

      {editing && (
        <div className="card p-3 space-y-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">Show, hide and reorder cards</span>
            <button className="text-xs text-muted hover:text-foreground flex items-center gap-1" onClick={() => save(defaults, [])}><RotateCcw size={12} /> Reset</button>
          </div>
          {order.map((id, i) => {
            const s = byId.get(id)!;
            const off = hidden.includes(id);
            return (
              <div key={id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                <button onClick={() => toggle(id)} aria-label={off ? `Show ${s.title}` : `Hide ${s.title}`} className={off ? "text-muted" : "text-accent"}>
                  {off ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <span className={`flex-1 text-sm ${off ? "text-muted line-through" : ""}`}>{s.title}</span>
                <button disabled={i === 0} onClick={() => move(id, -1)} className="text-muted hover:text-foreground disabled:opacity-30" aria-label="Move up"><ChevronUp size={16} /></button>
                <button disabled={i === order.length - 1} onClick={() => move(id, 1)} className="text-muted hover:text-foreground disabled:opacity-30" aria-label="Move down"><ChevronDown size={16} /></button>
              </div>
            );
          })}
        </div>
      )}

      {shown.length === 0 && <p className="card p-6 text-center text-muted">All cards are hidden. Use Customize to bring some back.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {shown.map((s) => (
          <div key={s.id} className={s.wide ? "lg:col-span-2" : ""}>{s.node}</div>
        ))}
      </div>
    </div>
  );
}
