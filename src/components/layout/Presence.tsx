"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Activity = "available" | "focus" | "meeting" | "away" | "listening" | "working";
export type Status = {
  user_id: string;
  activity: Activity;
  emoji: string;
  message: string;
  track: string;
  artist: string;
  track_set_at: string | null;
  share_activity: boolean;
};

export const ACTIVITIES: { id: Activity; label: string; emoji: string; dot: string }[] = [
  { id: "available", label: "Available", emoji: "🟢", dot: "bg-emerald-400" },
  { id: "working", label: "Working", emoji: "💻", dot: "bg-sky-400" },
  { id: "focus", label: "Focus (do not disturb)", emoji: "🎯", dot: "bg-red-400" },
  { id: "meeting", label: "In a meeting", emoji: "📅", dot: "bg-amber-400" },
  { id: "listening", label: "Listening to music", emoji: "🎧", dot: "bg-fuchsia-400" },
  { id: "away", label: "Away", emoji: "🌙", dot: "bg-zinc-500" },
];
export const activityOf = (a: Activity) => ACTIVITIES.find((x) => x.id === a) ?? ACTIVITIES[0];

const NOW_PLAYING_HOURS = 3;
/** A track counts as "now playing" for a few hours after it was set. */
export function nowPlaying(s: Status | undefined): { track: string; artist: string } | null {
  if (!s || !s.share_activity || !s.track || !s.track_set_at) return null;
  if (Date.now() - new Date(s.track_set_at).getTime() > NOW_PLAYING_HOURS * 3600_000) return null;
  return { track: s.track, artist: s.artist };
}

const PAGES: Record<string, string> = {
  dashboard: "the dashboard", chat: "chat", projects: "projects", calendar: "the calendar",
  analytics: "analytics", members: "members", settings: "settings",
};

type Ctx = {
  online: Set<string>;
  where: Record<string, string>;
  statuses: Record<string, Status>;
  mine: Status;
  saveStatus: (patch: Partial<Omit<Status, "user_id">>) => Promise<string | null>;
};
const blank = (user_id: string): Status => ({ user_id, activity: "available", emoji: "", message: "", track: "", artist: "", track_set_at: null, share_activity: true });
const PresenceContext = createContext<Ctx>({ online: new Set(), where: {}, statuses: {}, mine: blank(""), saveStatus: async () => null });
export const usePresence = () => useContext(PresenceContext);

/** Workspace-wide presence (who is online and where) plus everyone's activity status, live. */
export function PresenceProvider({ workspaceId, userId, children }: { workspaceId: string; userId: string; children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [where, setWhere] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [ready, setReady] = useState(false);

  const mine = statuses[userId] ?? blank(userId);
  const share = mine.share_activity;
  const section = pathname.split("/")[3] ?? "";
  const page = PAGES[section] ?? "";

  // Presence channel
  useEffect(() => {
    const ch = supabase.channel(`presence-${workspaceId}`, { config: { presence: { key: userId } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, { page?: string }[]>;
      setOnline(new Set(Object.keys(state)));
      const w: Record<string, string> = {};
      Object.entries(state).forEach(([id, metas]) => { const pg = metas[metas.length - 1]?.page; if (pg) w[id] = pg; });
      setWhere(w);
    });
    ch.subscribe((s) => { if (s === "SUBSCRIBED") { chRef.current = ch; setReady(true); } });
    return () => { chRef.current = null; setReady(false); supabase.removeChannel(ch); };
  }, [supabase, workspaceId, userId]);

  // Tell others where I am (only if I share my activity)
  useEffect(() => {
    if (ready) chRef.current?.track({ page: share ? page : "", at: Date.now() });
  }, [ready, page, share]);

  // Activity statuses of everyone in the workspace
  useEffect(() => {
    let alive = true;
    (async () => {
      const members = await supabase.from("workspace_members").select("user_id").eq("workspace_id", workspaceId);
      const ids = (members.data ?? []).map((m) => m.user_id as string);
      const { data, error } = await supabase.from("user_status").select("*").in("user_id", ids);
      if (!alive || error) return; // table missing (migration 0009 not applied yet): run without statuses
      setStatuses(Object.fromEntries((data as Status[]).map((s) => [s.user_id, s])));
    })();
    const ch = supabase
      .channel(`status-${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_status" }, (payload) => {
        if (payload.eventType === "DELETE") return;
        const s = payload.new as Status;
        setStatuses((all) => ({ ...all, [s.user_id]: s }));
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [supabase, workspaceId]);

  const saveStatus = useCallback(async (patch: Partial<Omit<Status, "user_id">>) => {
    const next = { ...mine, ...patch, user_id: userId };
    setStatuses((all) => ({ ...all, [userId]: next }));
    const { error } = await supabase.from("user_status").upsert({ ...next, updated_at: new Date().toISOString() });
    return error ? error.message : null;
  }, [supabase, userId, mine]);

  const value = useMemo(() => ({ online, where, statuses, mine, saveStatus }), [online, where, statuses, mine, saveStatus]);
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}
