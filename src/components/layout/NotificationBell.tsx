"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Note = { id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

export default function NotificationBell({ userId, workspaceId, slug }: { userId: string; workspaceId: string; slug: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [perm, setPerm] = useState<string>("unsupported");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotes((data ?? []) as Note[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, workspaceId]);

  // Turn due reminders into notifications while the app is open
  const deliverReminders = useCallback(async () => {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("reminders")
      .update({ sent_at: now })
      .eq("user_id", userId)
      .is("sent_at", null)
      .lte("remind_at", now)
      .select("event_id, events(title, starts_at, workspace_id)");
    const rows = (data ?? []) as unknown as { event_id: string; events: { title: string; starts_at: string; workspace_id: string } | null }[];
    const mine = rows.filter((r) => r.events && r.events.workspace_id === workspaceId);
    if (mine.length) {
      await supabase.from("notifications").insert(
        mine.map((r) => ({
          user_id: userId, workspace_id: workspaceId, type: "reminder", title: r.events!.title,
          body: `Starts ${new Date(r.events!.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`,
          link: `/w/${slug}/calendar`,
        }))
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, workspaceId, slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
    load();
    deliverReminders();
    const timer = setInterval(deliverReminders, 30000);
    const ch = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === "INSERT" && typeof Notification !== "undefined" && Notification.permission === "granted") {
          const n = payload.new as Note;
          new Notification(n.title, { body: n.body ?? undefined });
        }
        load();
      })
      .subscribe();
    return () => { clearInterval(timer); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, workspaceId]);

  const unread = notes.filter((n) => !n.read_at).length;

  async function markAll() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    load();
  }
  async function openNote(n: Note) {
    if (!n.read_at) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    setOpen(false);
    // Only follow in-app links, never external URLs
    if (n.link && n.link.startsWith("/") && !n.link.startsWith("//")) router.push(n.link);
    load();
  }
  async function enableDesktop() {
    if (typeof Notification === "undefined") return;
    setPerm(await Notification.requestPermission());
  }

  return (
    <div className="fixed top-3 right-4 z-30">
      <button onClick={() => setOpen(!open)} className="card p-2 relative" aria-label="Notifications">
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-[10px] flex items-center justify-center">{unread}</span>
        )}
      </button>
      {open && (
        <div className="card absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] backdrop-blur overflow-hidden">
          <div className="flex justify-between items-center px-3 py-2 border-b border-border">
            <span className="font-medium">Notifications</span>
            {unread > 0 && <button className="text-xs text-accent" onClick={markAll}>Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {notes.length === 0 && <p className="p-4 text-muted text-sm">Nothing yet.</p>}
            {notes.map((n) => (
              <button key={n.id} onClick={() => openNote(n)} className="w-full text-left px-3 py-2 hover:bg-surface-2 flex gap-2">
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.read_at ? "bg-transparent" : "bg-accent"}`} />
                <span className="min-w-0">
                  <span className="block text-sm truncate">{n.title}</span>
                  {n.body && <span className="block text-xs text-muted truncate">{n.body}</span>}
                  <span className="block text-xs text-muted">{new Date(n.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                </span>
              </button>
            ))}
          </div>
          {perm === "default" && (
            <button className="w-full text-xs text-accent px-3 py-2 border-t border-border text-left" onClick={enableDesktop}>
              Enable desktop alerts
            </button>
          )}
        </div>
      )}
    </div>
  );
}
