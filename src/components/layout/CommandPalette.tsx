"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Hash, FolderKanban, MessageCircle, User, Moon, Sun, Monitor, LogOut, Search, Music2, Image as ImageIcon, CornerDownLeft, type LucideIcon } from "lucide-react";
import { navItems } from "@/components/layout/nav";
import { useAppearance } from "@/components/layout/AppearanceMenu";
import { useBackgrounds } from "@/components/layout/Backgrounds";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";

type Item = { id: string; group: string; label: string; hint?: string; icon: LucideIcon; run: () => void | Promise<void> };
type Data = {
  people: { user_id: string; profiles: { full_name: string; username: string } | null }[];
  projects: { id: string; name: string }[];
  channels: { id: string; name: string | null; kind: string }[];
};

const SHORTCUTS = [
  ["Ctrl K", "Open search and commands"],
  ["?", "Show this help"],
  ["G then D", "Go to Dashboard"],
  ["G then C", "Go to Chat"],
  ["G then P", "Go to Projects"],
  ["G then L", "Go to Calendar"],
  ["G then A", "Go to Analytics"],
  ["G then M", "Go to Members"],
  ["G then U", "Go to My profile"],
  ["Esc", "Close dialogs"],
];

const typing = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
};

/** Ctrl/Cmd+K palette: jump anywhere, message people, switch theme. Also owns the "g then key" shortcuts. */
export default function CommandPalette({ slug, workspaceId, userId, isAdmin }: { slug: string; workspaceId: string; userId: string; isAdmin: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const { setTheme } = useAppearance();
  const { openSettings: openBackgrounds } = useBackgrounds();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const goPending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const close = useCallback(() => { setOpen(false); setQuery(""); setIndex(0); }, []);

  useEffect(() => {
    const items = navItems(slug, userId, isAdmin);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") { setHelp(false); close(); return; }
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "?") { setHelp(true); return; }
      if (goPending.current) {
        clearTimeout(goPending.current);
        goPending.current = undefined;
        const hit = items.find((i) => i.key === e.key.toLowerCase());
        if (hit) { e.preventDefault(); router.push(hit.href); }
        return;
      }
      if (e.key.toLowerCase() === "g") goPending.current = setTimeout(() => { goPending.current = undefined; }, 1200);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("open-palette", onOpen); };
  }, [slug, userId, isAdmin, router, close]);

  // Load searchable data each time the palette opens
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const [people, projects, channels] = await Promise.all([
        supabase.from("workspace_members").select("user_id, profiles(full_name, username)").eq("workspace_id", workspaceId),
        supabase.from("projects").select("id, name").eq("workspace_id", workspaceId).neq("status", "archived").order("created_at", { ascending: false }).limit(50),
        supabase.from("channels").select("id, name, kind").eq("workspace_id", workspaceId).neq("kind", "dm").order("created_at"),
      ]);
      if (alive) setData({
        people: (people.data ?? []) as unknown as Data["people"],
        projects: (projects.data ?? []) as Data["projects"],
        channels: (channels.data ?? []) as Data["channels"],
      });
    })();
    return () => { alive = false; };
  }, [open, supabase, workspaceId]);

  const all = useMemo<Item[]>(() => {
    const out: Item[] = [];
    navItems(slug, userId, isAdmin).forEach((n) =>
      out.push({ id: `nav-${n.href}`, group: "Go to", label: n.label, hint: `G ${n.key.toUpperCase()}`, icon: n.icon, run: () => router.push(n.href) }));
    data?.channels.forEach((c) =>
      out.push({ id: `ch-${c.id}`, group: "Channels", label: c.name ?? "project", icon: c.kind === "project" ? FolderKanban : Hash, run: () => router.push(`/w/${slug}/chat/${c.id}`) }));
    data?.projects.forEach((pr) =>
      out.push({ id: `pr-${pr.id}`, group: "Projects", label: pr.name, icon: FolderKanban, run: () => router.push(`/w/${slug}/projects/${pr.id}`) }));
    data?.people.forEach((m) => {
      const name = m.profiles?.full_name || m.profiles?.username || "Member";
      out.push({ id: `pf-${m.user_id}`, group: "People", label: name, hint: "Profile", icon: User, run: () => router.push(`/w/${slug}/members/${m.user_id}`) });
      if (m.user_id !== userId) {
        out.push({
          id: `dm-${m.user_id}`, group: "People", label: `Message ${name}`, hint: "Direct message", icon: MessageCircle,
          run: async () => {
            const { data: ch, error } = await supabase.rpc("get_or_create_dm", { p_ws: workspaceId, other: m.user_id });
            if (error) return toast(error.message, "error");
            router.push(`/w/${slug}/chat/${ch}`);
          },
        });
      }
    });
    out.push(
      { id: "t-dark", group: "Actions", label: "Switch to dark theme", icon: Moon, run: () => setTheme("dark") },
      { id: "t-light", group: "Actions", label: "Switch to light theme", icon: Sun, run: () => setTheme("light") },
      { id: "t-sys", group: "Actions", label: "Use system theme", icon: Monitor, run: () => setTheme("system") },
      { id: "status", group: "Actions", label: "Set my status or now playing", icon: Music2, run: () => { window.dispatchEvent(new Event("open-status")); } },
      { id: "bgs", group: "Actions", label: "Backgrounds & chat theme", icon: ImageIcon, run: () => { openBackgrounds(true); } },
      { id: "keys", group: "Actions", label: "Keyboard shortcuts", hint: "?", icon: Search, run: () => setHelp(true) },
      {
        id: "logout", group: "Actions", label: "Log out", icon: LogOut,
        run: async () => { await supabase.auth.signOut(); router.replace("/login"); router.refresh(); },
      },
    );
    return out;
  }, [data, slug, userId, isAdmin, workspaceId, router, supabase, toast, setTheme, openBackgrounds]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all.filter((i) => i.group === "Go to" || i.group === "Actions").slice(0, 14);
    return all.filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q)).slice(0, 30);
  }, [all, query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  async function choose(item: Item | undefined) {
    if (!item) return;
    close();
    await item.run();
  }

  if (help) {
    return (
      <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={() => setHelp(false)}>
        <div className="card w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
          <h2 className="font-semibold">Keyboard shortcuts</h2>
          <div className="divide-y divide-border">
            {SHORTCUTS.map(([k, d]) => (
              <div key={k} className="flex justify-between items-center py-1.5 text-sm"><span>{d}</span><span className="kbd">{k}</span></div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (!open) return null;

  let last = "";
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-start justify-center p-4 pt-[12vh]" onClick={close}>
      <div className="card w-full max-w-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 border-b border-border">
          <Search size={16} className="text-muted" />
          <input
            className="w-full bg-transparent py-3 outline-none"
            placeholder="Search pages, channels, projects, people…"
            value={query}
            autoFocus
            onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter") { e.preventDefault(); choose(results[index]); }
            }}
          />
          <span className="kbd">Esc</span>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1">
          {results.length === 0 && <p className="p-4 text-center text-muted text-sm">{data ? "No matches." : "Loading…"}</p>}
          {results.map((r, i) => {
            const header = r.group !== last ? r.group : null;
            last = r.group;
            const Icon = r.icon;
            return (
              <div key={r.id}>
                {header && <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-muted">{header}</div>}
                <button
                  data-i={i}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => choose(r)}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left ${i === index ? "bg-surface-2" : ""}`}
                >
                  <Icon size={16} className="text-muted shrink-0" />
                  <span className="flex-1 truncate">{r.label}</span>
                  {r.hint && <span className="text-xs text-muted">{r.hint}</span>}
                  {i === index && <CornerDownLeft size={13} className="text-muted" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
