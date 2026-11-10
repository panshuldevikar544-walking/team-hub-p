"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar, BarChart, CartesianGrid, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import IndividualCharts, {
  AXIS, Card, Empty, LEVELS, LEVEL_COLORS, SERIES, TIP, Tiles, monthKey, monthLabel, monthRange, type AnalyticsData,
} from "@/components/analytics/IndividualCharts";

const RANGES = [["3", "Last 3 months"], ["6", "Last 6 months"], ["12", "Last 12 months"], ["all", "All time"]] as const;

export default function AnalyticsClient({ viewerId, slug, data: raw }: { viewerId: string; slug: string; data: AnalyticsData }) {
  const router = useRouter();
  const [tab, setTab] = useState<"me" | "team">("me");
  const [userId, setUserId] = useState(viewerId);
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("all");
  const [skillFocus, setSkillFocus] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  // Date range: keep only activity inside the window (current skill levels are a snapshot and are never filtered)
  const p = useMemo<AnalyticsData>(() => {
    if (range === "all") return raw;
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - Number(range));
    const from = cutoff.toISOString();
    const day = from.slice(0, 10);
    return {
      ...raw,
      events: raw.events.filter((e) => e.created_at >= from),
      tasks: raw.tasks.filter((t) => t.status !== "completed" || (t.completed_at ?? "") >= from),
      projects: raw.projects.filter((x) => x.status !== "completed" || (x.completed_at ?? "") >= from),
      activity: raw.activity.filter((a) => a.created_at >= from),
      messages: raw.messages.filter((m) => m.created_at >= from),
      learning: raw.learning.filter((l) => (l.completed_at ?? "") >= from),
      achievements: raw.achievements.filter((a) => a.achieved_at >= day),
      certificates: raw.certificates.filter((c) => (c.issued_on ?? "") >= day),
    };
  }, [raw, range, now]);

  const skillName = useMemo(() => new Map(p.skills.map((s) => [s.id, s.name])), [p.skills]);
  const nameOf = (id: string) => {
    const pr = p.people.find((x) => x.user_id === id)?.profiles;
    return pr?.full_name || pr?.username || "Member";
  };

  const team = useMemo(() => {
    const bySkill = new Map<string, number[]>();
    p.memberSkills.forEach((s) => {
      const arr = bySkill.get(s.skill_id) ?? [0, 0, 0, 0, 0, 0];
      arr[s.level]++;
      bySkill.set(s.skill_id, arr);
    });
    const dist = [...bySkill.entries()]
      .map(([id, c]) => ({
        id, name: skillName.get(id) ?? "Skill", total: c.slice(1).reduce((a, b) => a + b, 0),
        l1: c[1], l2: c[2], l3: c[3], l4: c[4], l5: c[5], sum: c.reduce((n, v, lv) => n + v * lv, 0),
      }))
      .sort((a, b) => b.total - a.total);
    const radar = dist.slice(0, 6).map((d) => ({ skill: d.name, avg: Number((d.sum / d.total).toFixed(2)) }));

    const added = p.events.filter((e) => e.old_level == null);
    const months = monthRange(added.map((e) => e.created_at));
    const gained = months.map((m) => ({ month: monthLabel(m), added: added.filter((e) => monthKey(e.created_at) === m).length }));

    const done = new Map<string, number>();
    p.tasks.filter((t) => t.status === "completed").forEach((t) => t.task_assignees.forEach((a) => done.set(a.user_id, (done.get(a.user_id) ?? 0) + 1)));
    const tasksBy = [...done.entries()].map(([id, n]) => ({ id, name: nameOf(id), tasks: n })).sort((a, b) => b.tasks - a.tasks).slice(0, 10);

    return {
      dist: dist.slice(0, 12), radar, gained, tasksBy,
      tiles: [
        { label: "Members", value: p.people.length },
        { label: "Distinct skills", value: p.skills.length },
        { label: "Skill entries", value: p.memberSkills.length },
        { label: "Verified", value: p.memberSkills.length ? `${Math.round((p.memberSkills.filter((s) => s.verified_by).length / p.memberSkills.length) * 100)}%` : "–" },
        { label: "Tasks done", value: p.tasks.filter((t) => t.status === "completed").length },
        { label: "Projects done", value: p.projects.filter((x) => x.status === "completed").length },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold mr-auto">Skill analytics</h1>
        <select className="input !w-auto !py-1.5" value={range} onChange={(e) => setRange(e.target.value as typeof range)} aria-label="Date range">
          {RANGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        {tab === "me" && (
          <select className="input !w-auto !py-1.5" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Member">
            {p.people.map((x) => (
              <option key={x.user_id} value={x.user_id}>{x.user_id === viewerId ? "Me" : nameOf(x.user_id)}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex gap-1 border-b border-border">
        {([["me", "Individual progress"], ["team", "Team skills"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-2 border-b-2 -mb-px ${tab === id ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "me" && <IndividualCharts data={p} userId={userId} />}

      {tab === "team" && (
        <div className="space-y-4">
          <Tiles items={team.tiles} />
          {skillFocus && (() => {
            const holders = p.memberSkills.filter((m) => m.skill_id === skillFocus).sort((a, b) => b.level - a.level);
            return (
              <section className="card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{skillName.get(skillFocus) ?? "Skill"} · {holders.length} {holders.length === 1 ? "member" : "members"}</h3>
                  <button className="text-sm text-muted hover:text-foreground" onClick={() => setSkillFocus(null)}>Close</button>
                </div>
                <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {holders.map((h) => (
                    <Link key={h.user_id} href={`/w/${slug}/members/${h.user_id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                      <span className="truncate">{nameOf(h.user_id)}</span>
                      <span className="text-xs text-muted shrink-0">{LEVELS[h.level]}{h.verified_by ? " ✓" : ""}</span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })()}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Team skill distribution" note="Members per skill, split by proficiency level. Click a bar to see who.">
              {team.dist.length ? (
                <ResponsiveContainer width="100%" height={Math.max(220, team.dist.length * 32)}>
                  <BarChart data={team.dist} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid stroke="var(--grid)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} {...AXIS} />
                    <YAxis type="category" dataKey="name" width={90} {...AXIS} />
                    <Tooltip {...TIP} cursor={{ fill: "var(--hover)" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {[1, 2, 3, 4, 5].map((lv) => (
                      <Bar key={lv} dataKey={`l${lv}`} name={LEVELS[lv]} stackId="a" fill={LEVEL_COLORS[lv]} cursor="pointer"
                        onClick={(d) => setSkillFocus((d as unknown as { id?: string }).id ?? null)} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty text="No skills recorded yet." />}
            </Card>

            <Card title="Average proficiency" note="Six most common skills, average level 1–5">
              {team.radar.length >= 3 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={team.radar}>
                    <PolarGrid stroke="var(--grid)" />
                    <PolarAngleAxis dataKey="skill" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                    <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={{ fill: "var(--muted)", fontSize: 10 }} />
                    <Tooltip {...TIP} />
                    <Radar dataKey="avg" name="Average level" stroke={SERIES[0]} fill={SERIES[0]} fillOpacity={0.3} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : <Empty text="Needs at least three different skills." />}
            </Card>

            <Card title="Skills added per month">
              {team.gained.some((g) => g.added > 0) ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={team.gained}>
                    <CartesianGrid stroke="var(--grid)" vertical={false} />
                    <XAxis dataKey="month" {...AXIS} /><YAxis allowDecimals={false} {...AXIS} width={30} />
                    <Tooltip {...TIP} cursor={{ fill: "var(--hover)" }} />
                    <Bar dataKey="added" name="Skills added" fill={SERIES[1]} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty text="No skills added yet." />}
            </Card>

            <Card title="Tasks completed by member" note="Top 10. Click a bar to open the profile.">
              {team.tasksBy.length ? (
                <ResponsiveContainer width="100%" height={Math.max(200, team.tasksBy.length * 34)}>
                  <BarChart data={team.tasksBy} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid stroke="var(--grid)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} {...AXIS} />
                    <YAxis type="category" dataKey="name" width={90} {...AXIS} />
                    <Tooltip {...TIP} cursor={{ fill: "var(--hover)" }} />
                    <Bar dataKey="tasks" name="Completed tasks" fill={SERIES[2]} radius={[0, 3, 3, 0]} cursor="pointer"
                      onClick={(d) => { const id = (d as unknown as { id?: string }).id; if (id) router.push(`/w/${slug}/members/${id}`); }} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty text="No completed tasks yet." />}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
