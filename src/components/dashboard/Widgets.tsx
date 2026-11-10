"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MessageSquare, FolderKanban, CalendarDays, Music2, Sparkles } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { ACTIVITIES, activityOf, nowPlaying, usePresence } from "@/components/layout/Presence";
import { AXIS, TIP } from "@/components/analytics/IndividualCharts";

export type PersonLite = { user_id: string; name: string; avatar_url: string | null };

const greeting = (h: number) => (h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

/** Personal welcome card: greeting, today's numbers and shortcuts. Time-of-day is read in the browser so it matches your clock. */
export function HeroCard({ slug, name, dueDates, eventStarts, openTasks }: {
  slug: string; name: string; dueDates: string[]; eventStarts: string[]; openTasks: number;
}) {
  const [now] = useState(() => new Date());
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const dueToday = dueDates.filter((d) => d === today).length;
  const overdue = dueDates.filter((d) => d < today).length;
  const eventsToday = eventStarts.filter((s) => new Date(s).toDateString() === now.toDateString()).length;

  const bits = [
    dueToday ? `${dueToday} task${dueToday > 1 ? "s" : ""} due today` : null,
    overdue ? `${overdue} overdue` : null,
    eventsToday ? `${eventsToday} event${eventsToday > 1 ? "s" : ""} today` : null,
  ].filter(Boolean);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border p-5 sm:p-6"
      style={{ background: "linear-gradient(135deg, rgb(var(--accent-rgb) / 0.28), rgb(var(--accent-rgb) / 0.06) 55%, transparent)" }}>
      <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full blur-3xl opacity-40" style={{ background: "var(--accent)" }} aria-hidden />
      <div className="relative">
        <p className="text-sm text-muted">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
        <h2 className="text-2xl sm:text-3xl font-semibold mt-0.5">{greeting(now.getHours())}, {name.split(" ")[0]}</h2>
        <p className="mt-1 text-muted">
          {bits.length ? bits.join(" · ") : openTasks === 0 ? "Nothing on your plate right now. Nice." : "You are all caught up for today."}
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          <Link href={`/w/${slug}/chat`} className="btn !py-1.5 text-sm flex items-center gap-1.5"><MessageSquare size={15} /> Open chat</Link>
          <Link href={`/w/${slug}/projects`} className="rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-sm flex items-center gap-1.5 hover:bg-surface-2"><FolderKanban size={15} /> Projects</Link>
          <Link href={`/w/${slug}/calendar`} className="rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-sm flex items-center gap-1.5 hover:bg-surface-2"><CalendarDays size={15} /> Calendar</Link>
        </div>
      </div>
    </section>
  );
}

/** Everyone in the workspace: online state, status, current page and what they are listening to. Live. */
export function TeamPulse({ slug, people, viewerId }: { slug: string; people: PersonLite[]; viewerId: string }) {
  const { online, where, statuses } = usePresence();
  const rows = useMemo(
    () => [...people].sort((a, b) => Number(online.has(b.user_id)) - Number(online.has(a.user_id)) || a.name.localeCompare(b.name)),
    [people, online]
  );
  const onlineCount = people.filter((p) => online.has(p.user_id)).length;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Team pulse</h2>
        <span className="text-xs text-muted flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />{onlineCount} online</span>
      </div>
      <div className="card divide-y divide-border max-h-[26rem] overflow-y-auto">
        {rows.map((p) => {
          const s = statuses[p.user_id];
          const isOn = online.has(p.user_id);
          const share = s?.share_activity ?? true;
          const act = activityOf(isOn && share ? (s?.activity ?? "available") : "available");
          const song = nowPlaying(s);
          const sub = isOn
            ? share
              ? song ? `🎵 ${song.track}${song.artist ? ` · ${song.artist}` : ""}` : s?.message ? `${s.emoji} ${s.message}`.trim() : act.label
              : "Online"
            : "Offline";
          return (
            <Link key={p.user_id} href={`/w/${slug}/members/${p.user_id}`} className="flex items-center gap-3 p-3 hover:bg-surface-2">
              <span className="relative shrink-0">
                <Avatar url={p.avatar_url} name={p.name} size={34} />
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${isOn ? act.dot : "bg-zinc-600"}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.name}{p.user_id === viewerId ? " (you)" : ""}</span>
                <span className="block text-xs text-muted truncate">{sub}</span>
              </span>
              {isOn && share && where[p.user_id] && <span className="text-[11px] text-muted shrink-0 hidden sm:block">in {where[p.user_id]}</span>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** Animated "now playing" cards for teammates who are sharing music. */
export function ListeningNow({ slug, people }: { slug: string; people: PersonLite[] }) {
  const { statuses, online } = usePresence();
  const listeners = people
    .map((p) => ({ p, song: nowPlaying(statuses[p.user_id]) }))
    .filter((x): x is { p: PersonLite; song: { track: string; artist: string } } => !!x.song);

  return (
    <section className="space-y-2">
      <h2 className="font-medium flex items-center gap-2"><Music2 size={16} className="text-accent" /> Listening now</h2>
      {listeners.length === 0 ? (
        <div className="card p-6 text-center space-y-2">
          <div className="mx-auto h-11 w-11 rounded-full bg-accent/10 text-accent flex items-center justify-center"><Music2 size={20} /></div>
          <p className="font-medium">Quiet in here</p>
          <p className="text-sm text-muted">Nobody is sharing a song. Be the first and set yours.</p>
          <button className="btn !py-1.5 text-sm" onClick={() => window.dispatchEvent(new Event("open-status"))}>Share what I am playing</button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {listeners.map(({ p, song }) => (
            <Link key={p.user_id} href={`/w/${slug}/members/${p.user_id}`}
              className="card p-3 flex items-center gap-3 hover:bg-surface-2 overflow-hidden relative">
              <Avatar url={p.avatar_url} name={p.name} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{song.track}</span>
                <span className="block text-xs text-muted truncate">{song.artist || "Unknown artist"} · {p.name}</span>
              </span>
              <span className={`eq ${online.has(p.user_id) ? "" : "eq-paused"}`} aria-hidden><i /><i /><i /><i /></span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** Workspace activity over the last seven days (chat messages and project actions). */
export function WeekActivity({ messages, actions }: { messages: string[]; actions: string[] }) {
  const [now] = useState(() => Date.now());
  const data = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now - (6 - i) * 86400000);
      d.setHours(0, 0, 0, 0);
      return { key: d.toDateString(), label: d.toLocaleDateString(undefined, { weekday: "short" }), messages: 0, actions: 0 };
    });
    const idx = new Map(days.map((d, i) => [d.key, i]));
    messages.forEach((t) => { const i = idx.get(new Date(t).toDateString()); if (i != null) days[i].messages++; });
    actions.forEach((t) => { const i = idx.get(new Date(t).toDateString()); if (i != null) days[i].actions++; });
    return days;
  }, [messages, actions, now]);
  const total = data.reduce((n, d) => n + d.messages + d.actions, 0);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">This week</h2>
        <span className="text-xs text-muted">{total} contributions</span>
      </div>
      <div className="card p-3">
        {total === 0 ? (
          <p className="text-center text-muted text-sm py-12">No activity in the last 7 days yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="gm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.5} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="label" {...AXIS} /><YAxis allowDecimals={false} {...AXIS} width={28} />
              <Tooltip {...TIP} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="messages" name="Messages" stroke="#10b981" fill="url(#gm)" strokeWidth={2} />
              <Area type="monotone" dataKey="actions" name="Project actions" stroke="#6366f1" fill="url(#ga)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

export type Leader = { user_id: string; name: string; avatar_url: string | null; count: number };
/** Who contributed most over the last seven days. */
export function Leaderboard({ slug, leaders }: { slug: string; leaders: Leader[] }) {
  const max = Math.max(1, ...leaders.map((l) => l.count));
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <section className="space-y-2">
      <h2 className="font-medium">Top contributors this week</h2>
      <div className="card divide-y divide-border">
        {leaders.length === 0 && <p className="p-6 text-center text-muted text-sm">Contributions show up here as the team works.</p>}
        {leaders.map((l, i) => (
          <Link key={l.user_id} href={`/w/${slug}/members/${l.user_id}`} className="flex items-center gap-3 p-3 hover:bg-surface-2">
            <span className="w-6 text-center">{medals[i] ?? <span className="text-xs text-muted">{i + 1}</span>}</span>
            <Avatar url={l.avatar_url} name={l.name} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{l.name}</span>
              <span className="block h-1.5 rounded-full bg-surface-2 mt-1 overflow-hidden"><span className="block h-full bg-accent" style={{ width: `${(l.count / max) * 100}%` }} /></span>
            </span>
            <span className="text-sm tabular-nums text-muted">{l.count}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export type Spotlight = { id: string; user_id: string; name: string; text: string; when: string };
/** Recent skill wins across the team. */
export function SkillSpotlight({ slug, items }: { slug: string; items: Spotlight[] }) {
  return (
    <section className="space-y-2">
      <h2 className="font-medium flex items-center gap-2"><Sparkles size={16} className="text-accent" /> Skill spotlight</h2>
      <div className="card divide-y divide-border">
        {items.length === 0 && <p className="p-6 text-center text-muted text-sm">New skills and level-ups from the team appear here.</p>}
        {items.map((s) => (
          <Link key={s.id} href={`/w/${slug}/members/${s.user_id}`} className="p-3 flex justify-between gap-3 text-sm hover:bg-surface-2">
            <span className="min-w-0 truncate"><span className="font-medium">{s.name}</span> <span className="text-muted">{s.text}</span></span>
            <span className="text-xs text-muted shrink-0">{new Date(s.when).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export { ACTIVITIES };
