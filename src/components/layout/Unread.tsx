"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Ctx = { counts: Record<string, number>; total: number; markRead: (channelId: string) => Promise<void> };
const UnreadContext = createContext<Ctx>({ counts: {}, total: 0, markRead: async () => {} });
export const useUnread = () => useContext(UnreadContext);

/** Tracks unread chat messages per channel for the signed-in user, live. */
export function UnreadProvider({ workspaceId, userId, children }: { workspaceId: string; userId: string; children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("unread_counts", { p_ws: workspaceId });
    if (error) return; // migration 0008 not applied yet: show no badges rather than break the page
    const next: Record<string, number> = {};
    (data as { channel_id: string; unread: number }[] | null)?.forEach((r) => { next[r.channel_id] = Number(r.unread); });
    setCounts(next);
  }, [supabase, workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const refresh = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 250); };
    const ch = supabase
      .channel(`unread-${workspaceId}-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `workspace_id=eq.${workspaceId}` }, refresh)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, refresh)
      .subscribe();
    return () => { clearTimeout(timer.current); supabase.removeChannel(ch); };
  }, [supabase, workspaceId, userId, load]);

  const markRead = useCallback(async (channelId: string) => {
    setCounts((c) => (c[channelId] ? { ...c, [channelId]: 0 } : c));
    await supabase.from("channel_reads").upsert({ channel_id: channelId, user_id: userId, last_read_at: new Date().toISOString() });
  }, [supabase, userId]);

  const value = useMemo(() => ({ counts, total: Object.values(counts).reduce((a, b) => a + b, 0), markRead }), [counts, markRead]);
  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}
