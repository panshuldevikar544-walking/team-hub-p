"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type Person = { user_id: string; profiles: { full_name: string; username: string } | null };
export type AnalyticsData = {
  people: Person[];
  skills: { id: string; name: string }[];
  memberSkills: { user_id: string; skill_id: string; level: number; verified_by: string | null }[];
  events: { user_id: string; skill_id: string; old_level: number | null; new_level: number; created_at: string }[];
  tasks: { id: string; status: string; completed_at: string | null; task_assignees: { user_id: string }[] }[];
  projects: { id: string; status: string; completed_at: string | null }[];
  projectMembers: { project_id: string; user_id: string }[];
  activity: { actor_id: string | null; created_at: string }[];
  messages: { author_id: string; created_at: string }[];
  learning: { user_id: string; title: string; completed_at: string | null }[];
  achievements: { user_id: string; title: string; achieved_at: string }[];
  certificates: { user_id: string; title: string; issued_on: string | null }[];
};

export const LEVELS = ["", "Beginner", "Basic", "Intermediate", "Advanced", "Expert"];
// Sequential single-hue ramp for proficiency levels 1-5; categorical hues for unrelated series
export const LEVEL_COLORS = ["", "#312e81", "#4338ca", "#6366f1", "#818cf8", "#c7d2fe"];
export const SERIES = ["#6366f1", "#10b981", "#f59e0b", "#38bdf8", "#f43f5e"];
export const AXIS = { stroke: "var(--muted)", fontSize: 12 };
export const TIP = {
  contentStyle: { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "var(--foreground)" },
};

export const monthKey = (d: string | Date) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
};
export const monthLabel = (k: string) => new Date(k + "-01T00:00").toLocaleDateString(undefined, { month: "short", year: "2-digit" });
const mondayOf = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function monthRange(keys: string[]) {
  const now = monthKey(new Date());
  const start = keys.length ? keys.slice().sort()[0] : now;
  const out: string[] = [];
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = now.split("-").map(Number);
  for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? (y++, (m = 1)) : m++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

export function Card({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="card p-4 space-y-3">
      <div>
        <h3 className="font-medium">{title}</h3>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}
export const Empty = ({ text }: { text: string }) => <p className="text-muted text-sm py-8 text-center">{text}</p>;

export function Tiles({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {items.map((t) => (
        <div key={t.label} className="card p-4">
          <div className="text-muted text-xs uppercase tracking-wide">{t.label}</div>
          <div className="text-2xl font-semibold tabular-nums">{t.value}</div>
        </div>
      ))}
    </div>
  );
}

/** Progress dashboard for one member. Used on the Analytics page and on profile pages. */
export default function IndividualCharts({ data, userId }: { data: AnalyticsData; userId: string }) {
  const skillName = useMemo(() => new Map(data.skills.map((s) => [s.id, s.name])), [data.skills]);
  const [now] = useState(() => Date.now());

  const me = useMemo(() => {
    const mySkills = data.memberSkills.filter((s) => s.user_id === userId);
    const myEvents = data.events.filter((e) => e.user_id === userId);

    const added = myEvents.filter((e) => e.old_level == null);
    const months = monthRange(added.map((e) => e.created_at));
    const gained = months.map((m, idx) => ({
      month: monthLabel(m),
      skills: added.filter((e) => monthKey(e.created_at) <= months[idx]).length,
    }));

    const top = [...mySkills].sort((a, b) => b.level - a.level).slice(0, 5);
    const topIds = new Set(top.map((s) => s.skill_id));
    const dates = [...new Set(myEvents.filter((e) => topIds.has(e.skill_id)).map((e) => e.created_at.slice(0, 10)))].sort();
    const carry: Record<string, number> = {};
    const progression = dates.map((d) => {
      myEvents.filter((e) => topIds.has(e.skill_id) && e.created_at.slice(0, 10) === d).forEach((e) => (carry[e.skill_id] = e.new_level));
      const row: Record<string, string | number> = { date: new Date(d + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
      top.forEach((s) => { if (carry[s.skill_id] != null) row[skillName.get(s.skill_id) ?? "Skill"] = carry[s.skill_id]; });
      return row;
    });

    const weeks = Array.from({ length: 12 }, (_, i) => {
      const w = mondayOf(new Date(now - (11 - i) * 7 * 86400000));
      return { start: w.getTime(), label: w.toLocaleDateString(undefined, { month: "short", day: "numeric" }), project: 0, messages: 0 };
    });
    const bucket = (iso: string) => weeks.find((w) => w.start === mondayOf(new Date(iso)).getTime());
    data.activity.filter((a) => a.actor_id === userId).forEach((a) => { const b = bucket(a.created_at); if (b) b.project++; });
    data.messages.filter((m) => m.author_id === userId).forEach((m) => { const b = bucket(m.created_at); if (b) b.messages++; });

    const myProjectIds = new Set(data.projectMembers.filter((m) => m.user_id === userId).map((m) => m.project_id));
    const projectsDone = data.projects.filter((pr) => pr.status === "completed" && myProjectIds.has(pr.id)).length;
    const tasksDone = data.tasks.filter((t) => t.status === "completed" && t.task_assignees.some((a) => a.user_id === userId)).length;
    const contributions = weeks.reduce((n, w) => n + w.project + w.messages, 0);

    const milestones = [
      ...data.learning.filter((l) => l.user_id === userId).map((l) => ({ date: l.completed_at!, text: `Finished learning: ${l.title}` })),
      ...data.achievements.filter((a) => a.user_id === userId).map((a) => ({ date: a.achieved_at, text: `Achievement: ${a.title}` })),
      ...data.certificates.filter((c) => c.user_id === userId && c.issued_on).map((c) => ({ date: c.issued_on!, text: `Certificate: ${c.title}` })),
      ...myEvents.filter((e) => e.new_level === 5).map((e) => ({ date: e.created_at, text: `Reached Expert in ${skillName.get(e.skill_id) ?? "a skill"}` })),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);

    const avg = mySkills.length ? (mySkills.reduce((n, s) => n + s.level, 0) / mySkills.length).toFixed(1) : "–";
    return {
      tiles: [
        { label: "Skills", value: mySkills.length },
        { label: "Verified", value: mySkills.filter((s) => s.verified_by).length },
        { label: "Avg level", value: avg },
        { label: "Tasks done", value: tasksDone },
        { label: "Projects done", value: projectsDone },
        { label: "Contributions (12 wk)", value: contributions },
      ],
      gained, progression, topNames: top.map((s) => skillName.get(s.skill_id) ?? "Skill"), weeks, milestones, hasSkills: mySkills.length > 0,
    };
  }, [userId, data, skillName, now]);

  return (
    <div className="space-y-4">
      <Tiles items={me.tiles} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Skills gained over time" note="Cumulative number of skills added">
          {me.hasSkills ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={me.gained}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="month" {...AXIS} /><YAxis allowDecimals={false} {...AXIS} width={30} />
                <Tooltip {...TIP} />
                <Line type="monotone" dataKey="skills" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty text="No skills yet." />}
        </Card>

        <Card title="Proficiency progression" note="Level over time for the five strongest skills (1 Beginner – 5 Expert)">
          {me.progression.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={me.progression}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="date" {...AXIS} /><YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} {...AXIS} width={30} />
                <Tooltip {...TIP} formatter={(v) => LEVELS[Number(v)] ?? v} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {me.topNames.map((n, i) => (
                  <Line key={n} type="stepAfter" dataKey={n} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty text="History appears as skill levels change." />}
        </Card>

        <Card title="Contributions" note="Project actions and chat messages per week, last 12 weeks">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={me.weeks}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="label" {...AXIS} /><YAxis allowDecimals={false} {...AXIS} width={30} />
              <Tooltip {...TIP} cursor={{ fill: "var(--hover)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="project" name="Project actions" stackId="a" fill={SERIES[0]} />
              <Bar dataKey="messages" name="Messages" stackId="a" fill={SERIES[1]} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Learning milestones">
          {me.milestones.length === 0 ? <Empty text="Finished courses, achievements, certificates and Expert levels show up here." /> : (
            <ol className="space-y-2">
              {me.milestones.map((m, i) => (
                <li key={i} className="flex justify-between gap-3 text-sm">
                  <span>{m.text}</span><span className="text-muted shrink-0">{fmt(m.date)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
