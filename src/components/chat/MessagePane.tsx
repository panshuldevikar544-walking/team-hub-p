"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pin, MessageSquare, Smile, Pencil, Trash2, Paperclip, X, Send } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import EmptyState from "@/components/ui/EmptyState";
import { BgMedia, useBackgrounds } from "@/components/layout/Backgrounds";
import type { Person } from "@/components/chat/ChatClient";
import { createClient } from "@/lib/supabase/client";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "🙏"];

type Msg = {
  id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  pinned: boolean;
  created_at: string;
  edited_at: string | null;
  message_attachments: { id: string; name: string; path: string; size: number | null; mime: string | null }[];
  reactions: { user_id: string; emoji: string }[];
};

type Props = {
  slug: string;
  channelId: string;
  channelTitle: string;
  topic: string | null;
  workspaceId: string;
  viewerId: string;
  viewerRole: string;
  people: Person[];
  online: Set<string>;
};

const EMOJI_GRID = ["😀","😁","😂","🤣","😊","😍","😘","😎","🤔","😅","😢","😭","😡","🥳","🤯","😴","👍","👎","👏","🙌","🙏","💪","👀","🔥","✨","🎉","❤️","💯","✅","❌","⚡","🚀","☕","🍕","🎯","📌","📎","💡","🐛","🔧"];
const MENTION = /@([a-zA-Z0-9_.-]+)/g;
const isImage = (mime: string | null, name: string) => !!mime?.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)$/i.test(name);

const time = (d: string) => new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const day = (d: string) => new Date(d).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

export default function MessagePane(p: Props) {
  const supabase = createClient();
  const { toast } = useToast();
  const { chat: chatBg } = useBackgrounds();
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [typingNow, setTypingNow] = useState<Record<string, number>>({});
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<string | null>(null);
  const [showPins, setShowPins] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const person = (id: string) => p.people.find((x) => x.user_id === id)?.profiles;
  const nameOf = (id: string) => person(id)?.full_name || person(id)?.username || "Someone";
  const isLead = p.viewerRole === "admin" || p.viewerRole === "lead";

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("id, author_id, parent_id, body, pinned, created_at, edited_at, message_attachments(id, name, path, size, mime), reactions(user_id, emoji)")
      .eq("channel_id", p.channelId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) setError(error.message);
    else setMessages(((data ?? []) as unknown as Msg[]).reverse());
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.channelId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(load, 150); };
    const ch = supabase
      .channel(`chat-${p.channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `channel_id=eq.${p.channelId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_attachments" }, refresh)
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.channelId, load]);

  // Typing indicators over a Realtime broadcast channel
  useEffect(() => {
    const ch = supabase.channel(`typing-${p.channelId}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "typing" }, ({ payload }) => {
      const id = (payload as { user_id?: string })?.user_id;
      if (id && id !== p.viewerId) setTypingNow((t) => ({ ...t, [id]: Date.now() }));
    }).subscribe();
    typingChannel.current = ch;
    const sweep = setInterval(() => setTypingNow((t) => {
      const keep = Object.fromEntries(Object.entries(t).filter(([, at]) => Date.now() - at < 4000));
      return Object.keys(keep).length === Object.keys(t).length ? t : keep;
    }), 1000);
    return () => { clearInterval(sweep); typingChannel.current = null; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.channelId, p.viewerId]);
  const sendTyping = useCallback(() => {
    typingChannel.current?.send({ type: "broadcast", event: "typing", payload: { user_id: p.viewerId } });
  }, [p.viewerId]);
  const typingNames = Object.keys(typingNow).filter((id) => id !== p.viewerId).map((id) => nameOf(id));

  // Signed URLs for inline image previews
  useEffect(() => {
    const missing = messages.flatMap((m) => m.message_attachments).filter((a) => isImage(a.mime, a.name) && !imageUrls[a.id]);
    if (missing.length === 0) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.storage.from("attachments").createSignedUrls(missing.map((a) => a.path), 3600);
      if (!alive || !data) return;
      const next: Record<string, string> = {};
      data.forEach((d, i) => { if (d.signedUrl) next[missing[i].id] = d.signedUrl; });
      setImageUrls((u) => ({ ...u, ...next }));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    if (stickRef.current) bottomRef.current?.scrollIntoView();
  }, [messages]);

  const top = messages.filter((m) => !m.parent_id);
  const replies = (id: string) => messages.filter((m) => m.parent_id === id);
  const pinned = messages.filter((m) => m.pinned);
  const threadMsg = messages.find((m) => m.id === thread);

  async function send(body: string, files: File[], parentId: string | null) {
    setError(null);
    const { data, error } = await supabase
      .from("messages")
      .insert({ channel_id: p.channelId, workspace_id: p.workspaceId, author_id: p.viewerId, parent_id: parentId, body: body.trim() })
      .select("id").single();
    if (error) return setError(error.message), false;
    for (const f of files) {
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${p.workspaceId}/chat/${p.channelId}/${Date.now()}-${safe}`;
      const up = await supabase.storage.from("attachments").upload(path, f);
      if (up.error) { setError(up.error.message); continue; }
      const { error: e2 } = await supabase.from("message_attachments").insert({ message_id: data.id, name: f.name, path, size: f.size, mime: f.type });
      if (e2) setError(e2.message);
    }
    // Notify mentioned people. The notification names the channel only, never the message text,
    // in case the person cannot open that channel.
    const mentioned = new Set<string>();
    for (const m of body.matchAll(MENTION)) {
      const hit = p.people.find((x) => x.profiles?.username?.toLowerCase() === m[1].toLowerCase());
      if (hit && hit.user_id !== p.viewerId) mentioned.add(hit.user_id);
    }
    if (mentioned.size) {
      await supabase.from("notifications").insert([...mentioned].map((user_id) => ({
        user_id, workspace_id: p.workspaceId, type: "mention", title: `${nameOf(p.viewerId)} mentioned you`,
        body: `in ${p.channelTitle}`, link: `/w/${p.slug}/chat/${p.channelId}`,
      })));
    }
    stickRef.current = true;
    await load();
    return true;
  }

  async function toggleReaction(m: Msg, emoji: string) {
    const mine = m.reactions.some((r) => r.user_id === p.viewerId && r.emoji === emoji);
    const { error } = mine
      ? await supabase.from("reactions").delete().eq("message_id", m.id).eq("user_id", p.viewerId).eq("emoji", emoji)
      : await supabase.from("reactions").insert({ message_id: m.id, user_id: p.viewerId, emoji });
    if (error) setError(error.message);
    setPickerFor(null);
    load();
  }

  async function togglePin(m: Msg) {
    const { error } = await supabase.from("messages").update({ pinned: !m.pinned }).eq("id", m.id);
    if (error) setError(error.message);
    load();
  }

  async function saveEdit(m: Msg) {
    if (!editText.trim()) return;
    const { error } = await supabase.from("messages").update({ body: editText.trim(), edited_at: new Date().toISOString() }).eq("id", m.id);
    if (error) setError(error.message);
    setEditingId(null);
    load();
  }

  async function remove(m: Msg) {
    if (!confirm("Delete this message?")) return;
    const { error } = await supabase.from("messages").delete().eq("id", m.id);
    if (error) setError(error.message);
    if (thread === m.id) setThread(null);
    load();
  }

  async function openAttachment(path: string, name: string) {
    const { data, error } = await supabase.storage.from("attachments").createSignedUrl(path, 60, { download: name });
    if (error) return setError(error.message);
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const renderBody = (text: string) => {
    const out: React.ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(MENTION)) {
      const hit = p.people.find((x) => x.profiles?.username?.toLowerCase() === m[1].toLowerCase());
      if (!hit) continue;
      out.push(text.slice(last, m.index));
      out.push(
        <span key={m.index} className={`rounded px-1 ${hit.user_id === p.viewerId ? "bg-accent/30 text-foreground" : "bg-accent/15 text-accent"}`}>@{hit.profiles?.username}</span>
      );
      last = (m.index ?? 0) + m[0].length;
    }
    out.push(text.slice(last));
    return out;
  };

  const row = (m: Msg, compact: boolean, inThread = false) => {
    const grouped = new Map<string, number>();
    m.reactions.forEach((r) => grouped.set(r.emoji, (grouped.get(r.emoji) ?? 0) + 1));
    const canEdit = m.author_id === p.viewerId;
    const canDelete = canEdit || p.viewerRole === "admin";
    const canPin = canEdit || isLead;
    const count = replies(m.id).length;

    return (
      <div className="group relative flex gap-3 px-3 py-1 hover:bg-[var(--hover)] rounded-lg">
        <div className="w-9 shrink-0">
          {!compact && (
            <span className="relative block">
              <Avatar url={person(m.author_id)?.avatar_url} name={nameOf(m.author_id)} size={36} />
              <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${p.online.has(m.author_id) ? "bg-emerald-400" : "bg-zinc-600"}`} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {!compact && (
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{nameOf(m.author_id)}</span>
              <span className="text-xs text-muted">{time(m.created_at)}</span>
              {m.pinned && <Pin size={12} className="text-accent" />}
            </div>
          )}
          {editingId === m.id ? (
            <div className="space-y-1">
              <textarea className="input" rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(m); } if (e.key === "Escape") setEditingId(null); }} />
              <div className="text-xs text-muted">Enter to save · Esc to cancel</div>
            </div>
          ) : (
            m.body && <div className="whitespace-pre-wrap break-words">{renderBody(m.body)}{m.edited_at && <span className="text-xs text-muted"> (edited)</span>}</div>
          )}
          {m.message_attachments.filter((a) => isImage(a.mime, a.name) && imageUrls[a.id]).map((a) => (
            <button key={a.id} onClick={() => openAttachment(a.path, a.name)} className="block mt-1 mr-2 align-top" title={a.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrls[a.id]} alt={a.name} className="max-h-60 max-w-full sm:max-w-xs rounded-lg border border-border object-cover" loading="lazy" />
            </button>
          ))}
          {m.message_attachments.filter((a) => !(isImage(a.mime, a.name) && imageUrls[a.id])).map((a) => (
            <button key={a.id} onClick={() => openAttachment(a.path, a.name)} className="mt-1 mr-2 inline-flex items-center gap-1.5 card px-2 py-1 text-sm text-accent">
              <Paperclip size={13} /> {a.name}
            </button>
          ))}
          {grouped.size > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {[...grouped.entries()].map(([emoji, n]) => {
                const mine = m.reactions.some((r) => r.user_id === p.viewerId && r.emoji === emoji);
                return (
                  <button key={emoji} onClick={() => toggleReaction(m, emoji)}
                    className={`text-xs rounded-full px-2 py-0.5 border ${mine ? "border-accent bg-accent/15" : "border-border bg-surface-2"}`}>
                    {emoji} {n}
                  </button>
                );
              })}
            </div>
          )}
          {!inThread && count > 0 && (
            <button className="text-xs text-accent mt-1 flex items-center gap-1" onClick={() => setThread(m.id)}>
              <MessageSquare size={12} /> {count} {count === 1 ? "reply" : "replies"}
            </button>
          )}
        </div>
        <div className="absolute right-2 -top-3 hidden group-hover:flex items-center gap-0.5 card px-1 py-0.5 text-muted z-10">
          <button className="p-1 hover:text-foreground" title="React" onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}><Smile size={15} /></button>
          {!inThread && <button className="p-1 hover:text-foreground" title="Reply in thread" onClick={() => setThread(m.id)}><MessageSquare size={15} /></button>}
          {canPin && <button className="p-1 hover:text-foreground" title={m.pinned ? "Unpin" : "Pin"} onClick={() => togglePin(m)}><Pin size={15} /></button>}
          {canEdit && <button className="p-1 hover:text-foreground" title="Edit" onClick={() => { setEditingId(m.id); setEditText(m.body); }}><Pencil size={15} /></button>}
          {canDelete && <button className="p-1 hover:text-red-400" title="Delete" onClick={() => remove(m)}><Trash2 size={15} /></button>}
        </div>
        {pickerFor === m.id && (
          <div className="absolute right-2 top-5 card px-2 py-1 flex gap-1 z-20">
            {EMOJIS.map((e) => <button key={e} className="hover:scale-125 transition-transform" onClick={() => toggleReaction(m, e)}>{e}</button>)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex gap-3">
      <section className="relative isolate flex-1 min-w-0 flex flex-col bg-surface border border-border rounded-xl overflow-hidden">
        {chatBg && <div className="absolute inset-0 -z-10"><BgMedia bg={chatBg} /></div>}
        <header className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold truncate">{p.channelTitle}</div>
            {p.topic && <div className="text-xs text-muted truncate">{p.topic}</div>}
          </div>
          <button className={`flex items-center gap-1 text-sm ${showPins ? "text-accent" : "text-muted hover:text-foreground"}`} onClick={() => setShowPins(!showPins)}>
            <Pin size={14} /> {pinned.length}
          </button>
        </header>

        {showPins && (
          <div className="border-b border-border max-h-48 overflow-y-auto bg-surface-2/50">
            {pinned.length === 0 && <p className="p-3 text-muted text-sm">No pinned messages.</p>}
            {pinned.map((m) => (
              <div key={m.id} className="px-4 py-2 text-sm border-b border-border last:border-0">
                <span className="font-medium">{nameOf(m.author_id)}</span> <span className="text-muted text-xs">{day(m.created_at)}</span>
                <div className="line-clamp-2">{m.body || "Attachment"}</div>
              </div>
            ))}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto py-3"
          onScroll={() => { const el = scrollRef.current!; stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
          {!loaded && <p className="text-muted px-4">Loading…</p>}
          {loaded && top.length === 0 && <EmptyState icon={MessageSquare} title="No messages yet" hint="Say hello and start the conversation." />}
          {top.map((m, i) => {
            const prev = top[i - 1];
            const newDay = !prev || day(prev.created_at) !== day(m.created_at);
            const compact = !!prev && !newDay && prev.author_id === m.author_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60000;
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted">
                    <div className="flex-1 h-px bg-border" />{day(m.created_at)}<div className="flex-1 h-px bg-border" />
                  </div>
                )}
                {row(m, compact)}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {error && <p className="text-red-400 text-sm px-4">{error}</p>}
        {typingNames.length > 0 && (
          <div className="px-4 pb-1 text-xs text-muted flex items-center gap-1.5">
            <span className="inline-flex gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="h-1 w-1 rounded-full bg-muted animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />)}</span>
            {typingNames.length === 1 ? `${typingNames[0]} is typing…` : typingNames.length === 2 ? `${typingNames[0]} and ${typingNames[1]} are typing…` : "Several people are typing…"}
          </div>
        )}
        <Composer placeholder={`Message ${p.channelTitle}`} people={p.people} viewerId={p.viewerId} onTyping={sendTyping} onError={(m) => toast(m, "error")} onSend={(b, f) => send(b, f, null)} />
      </section>

      {threadMsg && (
        <aside className="hidden md:flex w-80 shrink-0 flex-col bg-surface border border-border rounded-xl overflow-hidden">
          <header className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="font-semibold">Thread</span>
            <button onClick={() => setThread(null)} aria-label="Close thread"><X size={16} /></button>
          </header>
          <div className="flex-1 overflow-y-auto py-2">
            {row(threadMsg, false, true)}
            <div className="px-4 py-1 text-xs text-muted">{replies(threadMsg.id).length} replies</div>
            {replies(threadMsg.id).map((r, i, arr) => (
              <div key={r.id}>{row(r, i > 0 && arr[i - 1].author_id === r.author_id, true)}</div>
            ))}
          </div>
          <Composer placeholder="Reply…" people={p.people} viewerId={p.viewerId} onTyping={sendTyping} onError={(m) => toast(m, "error")} onSend={(b, f) => send(b, f, threadMsg.id)} />
        </aside>
      )}
    </div>
  );
}

function Composer({ placeholder, people, viewerId, onSend, onTyping, onError }: {
  placeholder: string;
  people: Person[];
  viewerId: string;
  onSend: (body: string, files: File[]) => Promise<boolean | void>;
  onTyping: () => void;
  onError: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [pick, setPick] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);

  const matches = mention
    ? people.filter((x) => x.user_id !== viewerId && x.profiles &&
        (x.profiles.username.toLowerCase().includes(mention.query) || x.profiles.full_name.toLowerCase().includes(mention.query))).slice(0, 6)
    : [];

  async function submit() {
    if (busy || (!text.trim() && files.length === 0)) return;
    setBusy(true);
    const ok = await onSend(text, files);
    if (ok) { setText(""); setFiles([]); }
    setBusy(false);
  }

  function insertAtCursor(insert: string, replaceFrom?: number) {
    const el = ref.current;
    const end = el?.selectionStart ?? text.length;
    const start = replaceFrom ?? end;
    setText(text.slice(0, start) + insert + text.slice(end));
    requestAnimationFrame(() => { el?.focus(); const pos = start + insert.length; el?.setSelectionRange(pos, pos); });
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setText(value);
    const cursor = e.target.selectionStart;
    const m = /(?:^|\s)@([a-zA-Z0-9_.-]*)$/.exec(value.slice(0, cursor));
    setMention(m ? { start: cursor - m[1].length - 1, query: m[1].toLowerCase() } : null);
    setPick(0);
    if (value.trim() && Date.now() - lastTyping.current > 2500) { lastTyping.current = Date.now(); onTyping(); }
  }

  function chooseMention(x: Person | undefined) {
    if (!x?.profiles || !mention) return;
    insertAtCursor(`@${x.profiles.username} `, mention.start);
    setMention(null);
  }

  return (
    <div className="p-3 border-t border-border space-y-2 relative">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="card px-2 py-1 text-xs flex items-center gap-1">
              {f.name}
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remove file"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      {mention && matches.length > 0 && (
        <div className="card absolute left-12 right-3 bottom-full mb-1 p-1 z-20 shadow-lg">
          {matches.map((x, i) => (
            <button key={x.user_id} onMouseDown={(e) => { e.preventDefault(); chooseMention(x); }} onMouseMove={() => setPick(i)}
              className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left ${i === pick ? "bg-surface-2" : ""}`}>
              <Avatar url={x.profiles?.avatar_url} name={x.profiles?.full_name || x.profiles?.username || "?"} size={22} />
              <span className="truncate">{x.profiles?.full_name}</span>
              <span className="text-xs text-muted">@{x.profiles?.username}</span>
            </button>
          ))}
        </div>
      )}
      {emojiOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setEmojiOpen(false)} />
          <div className="card absolute left-3 bottom-full mb-1 p-2 z-20 shadow-lg grid grid-cols-8 gap-0.5 w-[19rem] max-w-[calc(100vw-2rem)]">
            {EMOJI_GRID.map((e) => (
              <button key={e} className="h-8 w-8 rounded hover:bg-surface-2 text-lg" onClick={() => { insertAtCursor(e); setEmojiOpen(false); }}>{e}</button>
            ))}
          </div>
        </>
      )}
      <div className="flex items-end gap-2">
        <label className="p-2 text-muted hover:text-foreground cursor-pointer" title="Attach files">
          <Paperclip size={18} />
          <input type="file" multiple className="hidden" onChange={(e) => {
            const all = Array.from(e.target.files ?? []);
            const picked = all.filter((f) => f.size <= 25 * 1024 * 1024);
            if (picked.length < all.length) onError("Files must be under 25 MB.");
            setFiles([...files, ...picked]);
            e.target.value = "";
          }} />
        </label>
        <button type="button" className="p-2 text-muted hover:text-foreground" title="Emoji" aria-label="Emoji" onClick={() => setEmojiOpen(!emojiOpen)}><Smile size={18} /></button>
        <textarea ref={ref} className="input resize-none" rows={1} placeholder={placeholder} value={text} onChange={onChange}
          onKeyDown={(e) => {
            if (mention && matches.length > 0) {
              if (e.key === "ArrowDown") { e.preventDefault(); setPick((i) => Math.min(i + 1, matches.length - 1)); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setPick((i) => Math.max(i - 1, 0)); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); chooseMention(matches[pick]); return; }
              if (e.key === "Escape") { setMention(null); return; }
            }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }} />
        <button className="btn !p-2.5" onClick={submit} disabled={busy} aria-label="Send"><Send size={16} /></button>
      </div>
    </div>
  );
}
