"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hash, FolderKanban, Plus, Search, List, X } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import MessagePane from "@/components/chat/MessagePane";
import { useUnread } from "@/components/layout/Unread";
import { usePresence } from "@/components/layout/Presence";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";

export type Person = { user_id: string; profiles: { full_name: string; username: string; avatar_url: string | null } | null };
type Channel = { id: string; kind: "text" | "project" | "dm"; name: string | null; topic: string | null; project_id: string | null };

type Props = {
  slug: string;
  workspaceId: string;
  viewerId: string;
  viewerRole: string;
  channels: Channel[];
  dmOther: Record<string, string>;
  people: Person[];
  activeId: string;
};

type SearchHit = { id: string; channel_id: string; body: string; author_id: string; created_at: string; channels: { name: string | null; kind: string } | null };

export default function ChatClient(p: Props) {
  const router = useRouter();
  const supabase = createClient();
  const { counts, markRead } = useUnread();
  const { toast } = useToast();
  const { online } = usePresence();
  const [showList, setShowList] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const person = (id: string) => p.people.find((x) => x.user_id === id)?.profiles;
  const nameOf = (id: string) => person(id)?.full_name || person(id)?.username || "Someone";
  const active = p.channels.find((c) => c.id === p.activeId)!;
  const rooms = p.channels.filter((c) => c.kind !== "dm");
  const dms = p.channels.filter((c) => c.kind === "dm");
  const dmCandidates = p.people.filter((x) => x.user_id !== p.viewerId);

  // Keep the channel / DM list live: a new DM with me or a new channel appears without a reload
  useEffect(() => {
    const ch = supabase
      .channel(`chat-list-${p.workspaceId}-${p.viewerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "channels", filter: `workspace_id=eq.${p.workspaceId}` }, () => router.refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "channel_members", filter: `user_id=eq.${p.viewerId}` }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.workspaceId, p.viewerId]);

  // Opening a channel (or receiving a message while it is open) marks it read
  const activeUnread = counts[p.activeId] ?? 0;
  useEffect(() => {
    markRead(p.activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.activeId, activeUnread]);

  const badge = (id: string) => (counts[id] ?? 0) > 0 && id !== p.activeId
    ? <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-accent text-white text-[11px] font-medium flex items-center justify-center">{counts[id] > 99 ? "99+" : counts[id]}</span>
    : null;
  const unreadCls = (id: string) => (counts[id] ?? 0) > 0 && id !== p.activeId ? "font-semibold text-foreground" : "";

  async function createChannel(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = newName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!name) return setError("Enter a channel name.");
    const { data, error } = await supabase
      .from("channels").insert({ workspace_id: p.workspaceId, kind: "text", name, topic: newTopic || null, created_by: p.viewerId })
      .select("id").single();
    if (error) return setError(error.message);
    setNewOpen(false); setNewName(""); setNewTopic("");
    toast(`Channel #${name} created`);
    router.push(`/w/${p.slug}/chat/${data.id}`);
    router.refresh();
  }

  async function startDm(other: string) {
    if (!other) return;
    const { data, error } = await supabase.rpc("get_or_create_dm", { p_ws: p.workspaceId, other });
    if (error) return setError(error.message);
    router.push(`/w/${p.slug}/chat/${data}`);
    router.refresh();
    setShowList(false);
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const { data, error } = await supabase
      .from("messages")
      .select("id, channel_id, body, author_id, created_at, channels(name, kind)")
      .eq("workspace_id", p.workspaceId)
      .textSearch("search", query.trim(), { type: "websearch", config: "english" })
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) return setError(error.message);
    setHits((data ?? []) as unknown as SearchHit[]);
  }

  const title = (c: Channel) => (c.kind === "dm" ? nameOf(p.dmOther[c.id] ?? "") : c.name ?? "channel");

  const list = (
    <div className="h-full flex flex-col bg-surface border border-border rounded-xl overflow-hidden">
      <div className="p-3 border-b border-border flex gap-2">
        <button className="input !py-1.5 text-left text-muted flex items-center gap-2" onClick={() => { setSearchOpen(true); setShowList(false); }}>
          <Search size={14} /> Search messages
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        <div>
          <div className="flex items-center justify-between px-2 py-1 text-xs uppercase tracking-wide text-muted">
            Channels
            <button onClick={() => setNewOpen(true)} aria-label="New channel" className="hover:text-foreground"><Plus size={14} /></button>
          </div>
          {rooms.map((c) => (
            <Link key={c.id} href={`/w/${p.slug}/chat/${c.id}`} onClick={() => setShowList(false)}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${c.id === p.activeId ? "bg-surface-2" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}>
              {c.kind === "project" ? <FolderKanban size={15} /> : <Hash size={15} />}
              <span className={`truncate ${unreadCls(c.id)}`}>{c.name ?? "project"}</span>
              {badge(c.id)}
            </Link>
          ))}
        </div>
        <div>
          <div className="px-2 py-1 text-xs uppercase tracking-wide text-muted">Direct messages</div>
          {dms.map((c) => {
            const other = p.dmOther[c.id];
            return (
              <Link key={c.id} href={`/w/${p.slug}/chat/${c.id}`} onClick={() => setShowList(false)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${c.id === p.activeId ? "bg-surface-2" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}>
                <span className="relative">
                  <Avatar url={person(other)?.avatar_url} name={nameOf(other)} size={22} />
                  <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${online.has(other) ? "bg-emerald-400" : "bg-zinc-600"}`} />
                </span>
                <span className={`truncate ${unreadCls(c.id)}`}>{nameOf(other)}</span>
                {badge(c.id)}
              </Link>
            );
          })}
          <select className="input !py-1.5 mt-2 text-sm" value="" onChange={(e) => startDm(e.target.value)}>
            <option value="">New message…</option>
            {dmCandidates.map((x) => (
              <option key={x.user_id} value={x.user_id}>{online.has(x.user_id) ? "● " : "○ "}{x.profiles?.full_name || x.profiles?.username}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="p-3 border-t border-border text-xs text-muted">{online.size} online</div>
    </div>
  );

  return (
    <div className="h-[calc(100dvh-11rem)] md:h-[calc(100vh-8rem)] flex gap-3">
      <div className="hidden md:block w-60 shrink-0">{list}</div>
      {showList && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60 p-4 pt-16" onClick={() => setShowList(false)}>
          <div className="h-full" onClick={(e) => e.stopPropagation()}>{list}</div>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="md:hidden mb-2">
          <button className="card px-3 py-1.5 flex items-center gap-2" onClick={() => setShowList(true)}><List size={16} /> {title(active)}</button>
        </div>
        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
        <MessagePane
          key={p.activeId}
          slug={p.slug}
          channelId={p.activeId}
          channelTitle={active.kind === "dm" ? title(active) : `# ${title(active)}`}
          topic={active.topic}
          workspaceId={p.workspaceId}
          viewerId={p.viewerId}
          viewerRole={p.viewerRole}
          people={p.people}
          online={online}
        />
      </div>

      {newOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setNewOpen(false)}>
          <form onSubmit={createChannel} onClick={(e) => e.stopPropagation()} className="card w-full max-w-sm p-5 space-y-3 backdrop-blur">
            <h2 className="font-semibold">New channel</h2>
            <input className="input" placeholder="channel-name" value={newName} onChange={(e) => setNewName(e.target.value)} required autoFocus />
            <input className="input" placeholder="Topic (optional)" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-2 text-muted" onClick={() => setNewOpen(false)}>Cancel</button>
              <button className="btn">Create</button>
            </div>
          </form>
        </div>
      )}

      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 pt-24" onClick={() => setSearchOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-lg p-4 space-y-3 backdrop-blur">
            <form onSubmit={search} className="flex gap-2">
              <input className="input" placeholder="Search messages…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
              <button className="btn">Search</button>
              <button type="button" onClick={() => setSearchOpen(false)} aria-label="Close"><X size={18} /></button>
            </form>
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {hits && hits.length === 0 && <p className="text-muted py-2">No messages found.</p>}
              {hits?.map((h) => (
                <Link key={h.id} href={`/w/${p.slug}/chat/${h.channel_id}`} onClick={() => setSearchOpen(false)} className="block py-2 hover:bg-surface-2 px-2 rounded">
                  <div className="text-xs text-muted">
                    {h.channels?.kind === "dm" ? "Direct message" : `# ${h.channels?.name}`} · {nameOf(h.author_id)} · {new Date(h.created_at).toLocaleDateString()}
                  </div>
                  <div className="text-sm line-clamp-2">{h.body}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
