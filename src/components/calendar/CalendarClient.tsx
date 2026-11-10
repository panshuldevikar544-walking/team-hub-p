"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, EventClickArg, EventDropArg, EventInput } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Kind = "meeting" | "deadline" | "personal" | "other";
type Rsvp = "pending" | "accepted" | "declined";
type Ev = {
  id: string; title: string; description: string | null; kind: Kind; starts_at: string; ends_at: string; all_day: boolean | null;
  project_id: string | null; is_personal: boolean; created_by: string; event_attendees: { user_id: string; status: Rsvp }[];
};
type Person = { user_id: string; profiles: { full_name: string; username: string } | null };

type Props = {
  slug: string;
  workspaceId: string;
  viewerId: string;
  viewerRole: string;
  events: Ev[];
  projects: { id: string; name: string; deadline: string | null }[];
  people: Person[];
  reminders: { id: string; event_id: string; remind_at: string }[];
};

const COLORS: Record<Kind, string> = { meeting: "#6366f1", deadline: "#ef4444", personal: "#10b981", other: "#71717a" };
const REMINDERS = [
  { label: "No reminder", minutes: -1 },
  { label: "At start", minutes: 0 },
  { label: "10 minutes before", minutes: 10 },
  { label: "30 minutes before", minutes: 30 },
  { label: "1 hour before", minutes: 60 },
  { label: "1 day before", minutes: 1440 },
];

const toLocalInput = (iso: string, dateOnly = false) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return dateOnly ? date : `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type Draft = {
  id: string | null; title: string; description: string; kind: Kind; start: string; end: string; allDay: boolean;
  projectId: string; personal: boolean; attendees: string[]; reminder: number;
};

export default function CalendarClient(p: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [filter, setFilter] = useState<string>("all"); // all | me | <userId>
  const [kinds, setKinds] = useState<Record<Kind, boolean>>({ meeting: true, deadline: true, personal: true, other: true });
  const [showProjects, setShowProjects] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [viewing, setViewing] = useState<Ev | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: string) => p.people.find((x) => x.user_id === id)?.profiles?.full_name || p.people.find((x) => x.user_id === id)?.profiles?.username || "Someone";
  const isLead = p.viewerRole === "admin" || p.viewerRole === "lead";
  const canEdit = (e: Ev) => e.created_by === p.viewerId || isLead;

  const involves = (e: Ev, uid: string) => e.created_by === uid || e.event_attendees.some((a) => a.user_id === uid);

  const fcEvents: EventInput[] = useMemo(() => {
    const list = p.events
      .filter((e) => kinds[e.kind])
      .filter((e) => filter === "all" || (filter === "me" ? involves(e, p.viewerId) : involves(e, filter) && !e.is_personal))
      .map<EventInput>((e) => ({
        id: e.id, title: e.title, start: e.starts_at, end: e.ends_at, allDay: !!e.all_day,
        backgroundColor: COLORS[e.kind], editable: canEdit(e), extendedProps: { type: "event" },
      }));
    if (showProjects && filter === "all") {
      p.projects.forEach((pr) =>
        list.push({
          id: `proj-${pr.id}`, title: `Deadline: ${pr.name}`, start: pr.deadline!, allDay: true,
          backgroundColor: "#f59e0b", editable: false, extendedProps: { type: "project", projectId: pr.id },
        })
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.events, p.projects, filter, kinds, showProjects]);

  function openNew(start: Date, end: Date, allDay: boolean) {
    setError(null);
    setDraft({
      id: null, title: "", description: "", kind: "meeting",
      start: toLocalInput(start.toISOString(), allDay), end: toLocalInput(end.toISOString(), allDay), allDay,
      projectId: "", personal: false, attendees: [], reminder: -1,
    });
  }

  function onSelect(arg: DateSelectArg) {
    // FullCalendar gives an exclusive end for all-day ranges; show inclusive end in the form
    const end = arg.allDay ? new Date(arg.end.getTime() - 86400000) : arg.end;
    openNew(arg.start, end, arg.allDay);
  }

  function onEventClick(arg: EventClickArg) {
    arg.jsEvent.preventDefault();
    if (arg.event.extendedProps.type === "project") {
      router.push(`/w/${p.slug}/projects/${arg.event.extendedProps.projectId}`);
      return;
    }
    setError(null);
    setViewing(p.events.find((e) => e.id === arg.event.id) ?? null);
  }

  async function persistTimes(arg: EventDropArg | EventResizeDoneArg) {
    const ev = arg.event;
    const start = ev.start!;
    const end = ev.end ?? new Date(start.getTime() + (ev.allDay ? 86400000 : 3600000));
    const { error } = await supabase.from("events").update({ starts_at: start.toISOString(), ends_at: end.toISOString(), all_day: ev.allDay }).eq("id", ev.id);
    if (error) { setError(error.message); arg.revert(); } else router.refresh();
  }

  async function save(d: Draft) {
    setError(null);
    const starts = d.allDay ? new Date(d.start + "T00:00") : new Date(d.start);
    let ends = d.allDay ? new Date(d.end + "T23:59") : new Date(d.end);
    if (isNaN(starts.getTime()) || isNaN(ends.getTime())) return setError("Enter valid dates.");
    if (ends < starts) return setError("End must be after start.");
    if (d.allDay) ends = new Date(d.end + "T23:59");
    const payload = {
      title: d.title.trim(), description: d.description, kind: d.kind, starts_at: starts.toISOString(), ends_at: ends.toISOString(),
      all_day: d.allDay, project_id: d.projectId || null, is_personal: d.personal || d.kind === "personal",
    };

    let id = d.id;
    let before: string[] = [];
    if (id) {
      const { error } = await supabase.from("events").update(payload).eq("id", id);
      if (error) return setError(error.message);
      before = p.events.find((e) => e.id === id)?.event_attendees.map((a) => a.user_id) ?? [];
    } else {
      const { data, error } = await supabase.from("events").insert({ ...payload, workspace_id: p.workspaceId, created_by: p.viewerId }).select("id").single();
      if (error) return setError(error.message);
      id = data.id;
    }

    const added = d.attendees.filter((u) => !before.includes(u));
    const removed = before.filter((u) => !d.attendees.includes(u));
    if (removed.length) await supabase.from("event_attendees").delete().eq("event_id", id!).in("user_id", removed);
    if (added.length) {
      const { error } = await supabase.from("event_attendees").insert(added.map((user_id) => ({ event_id: id!, user_id })));
      if (error) return setError(error.message);
      const others = added.filter((u) => u !== p.viewerId);
      if (others.length) {
        await supabase.from("notifications").insert(others.map((user_id) => ({
          user_id, workspace_id: p.workspaceId, type: "event_invite", title: `Invited: ${payload.title}`,
          body: starts.toLocaleString(), link: `/w/${p.slug}/calendar`,
        })));
      }
    }

    await setMyReminder(id!, starts, d.reminder);
    setDraft(null);
    setViewing(null);
    router.refresh();
  }

  async function setMyReminder(eventId: string, start: Date, minutes: number) {
    await supabase.from("reminders").delete().eq("event_id", eventId).eq("user_id", p.viewerId).is("sent_at", null);
    if (minutes >= 0) {
      const at = new Date(start.getTime() - minutes * 60000);
      await supabase.from("reminders").insert({ event_id: eventId, user_id: p.viewerId, remind_at: at.toISOString() });
    }
  }

  async function remove(e: Ev) {
    if (!confirm(`Delete "${e.title}"?`)) return;
    const { error } = await supabase.from("events").delete().eq("id", e.id);
    if (error) return setError(error.message);
    setViewing(null);
    router.refresh();
  }

  async function rsvp(e: Ev, status: Rsvp) {
    const { error } = await supabase.from("event_attendees").update({ status }).eq("event_id", e.id).eq("user_id", p.viewerId);
    if (error) return setError(error.message);
    router.refresh();
    setViewing({ ...e, event_attendees: e.event_attendees.map((a) => (a.user_id === p.viewerId ? { ...a, status } : a)) });
  }

  async function changeMyReminder(e: Ev, minutes: number) {
    await setMyReminder(e.id, new Date(e.starts_at), minutes);
    router.refresh();
  }

  function startEdit(e: Ev) {
    setViewing(null);
    setError(null);
    const myRem = p.reminders.find((r) => r.event_id === e.id);
    const minutes = myRem ? Math.round((new Date(e.starts_at).getTime() - new Date(myRem.remind_at).getTime()) / 60000) : -1;
    setDraft({
      id: e.id, title: e.title, description: e.description ?? "", kind: e.kind,
      start: toLocalInput(e.starts_at, !!e.all_day), end: toLocalInput(e.ends_at, !!e.all_day), allDay: !!e.all_day,
      projectId: e.project_id ?? "", personal: e.is_personal, attendees: e.event_attendees.map((a) => a.user_id),
      reminder: REMINDERS.some((r) => r.minutes === minutes) ? minutes : -1,
    });
  }

  const myRemFor = (e: Ev) => {
    const r = p.reminders.find((x) => x.event_id === e.id);
    if (!r) return -1;
    const m = Math.round((new Date(e.starts_at).getTime() - new Date(r.remind_at).getTime()) / 60000);
    return REMINDERS.some((x) => x.minutes === m) ? m : -1;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold mr-auto">Calendar</h1>
        <select className="input !w-auto !py-1.5" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Whose events">
          <option value="all">Whole team</option>
          <option value="me">My events</option>
          {p.people.filter((x) => x.user_id !== p.viewerId).map((x) => (
            <option key={x.user_id} value={x.user_id}>{x.profiles?.full_name || x.profiles?.username}</option>
          ))}
        </select>
        <button className="btn" onClick={() => { const s = new Date(); s.setMinutes(0, 0, 0); s.setHours(s.getHours() + 1); openNew(s, new Date(s.getTime() + 3600000), false); }}>New event</button>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        {(Object.keys(COLORS) as Kind[]).map((k) => (
          <label key={k} className="flex items-center gap-1.5 cursor-pointer capitalize">
            <input type="checkbox" checked={kinds[k]} onChange={(e) => setKinds({ ...kinds, [k]: e.target.checked })} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[k] }} /> {k}
          </label>
        ))}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showProjects} onChange={(e) => setShowProjects(e.target.checked)} />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Project deadlines
        </label>
      </div>

      {error && !draft && <p className="text-red-400 text-sm">{error}</p>}

      <div className="card p-3 md:p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
          buttonText={{ today: "Today", month: "Month", week: "Week", day: "Day" }}
          events={fcEvents}
          selectable
          select={onSelect}
          eventClick={onEventClick}
          eventDrop={persistTimes}
          eventResize={persistTimes}
          nowIndicator
          height="auto"
          dayMaxEvents={3}
          firstDay={1}
        />
      </div>

      {viewing && (
        <Modal onClose={() => setViewing(null)}>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-lg">{viewing.title}</h2>
                <div className="text-sm text-muted capitalize">{viewing.kind}{viewing.is_personal ? " · private" : ""}</div>
              </div>
              <button onClick={() => setViewing(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="text-sm">
              {viewing.all_day
                ? new Date(viewing.starts_at).toLocaleDateString(undefined, { dateStyle: "full" })
                : `${new Date(viewing.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} – ${new Date(viewing.ends_at).toLocaleTimeString(undefined, { timeStyle: "short" })}`}
            </div>
            {viewing.description && <p className="text-sm whitespace-pre-wrap">{viewing.description}</p>}
            <div className="text-sm text-muted">Organizer: {nameOf(viewing.created_by)}</div>
            {viewing.event_attendees.length > 0 && (
              <div>
                <div className="text-sm text-muted mb-1">Attendees</div>
                {viewing.event_attendees.map((a) => (
                  <div key={a.user_id} className="flex justify-between text-sm py-0.5">
                    <span>{nameOf(a.user_id)}</span><span className="text-muted capitalize">{a.status}</span>
                  </div>
                ))}
              </div>
            )}
            {viewing.event_attendees.some((a) => a.user_id === p.viewerId) && (
              <div className="flex gap-2">
                <button className="btn !py-1.5 text-sm" onClick={() => rsvp(viewing, "accepted")}>Accept</button>
                <button className="btn !py-1.5 text-sm !bg-surface-2" onClick={() => rsvp(viewing, "declined")}>Decline</button>
              </div>
            )}
            <label className="block text-sm text-muted">My reminder
              <select className="input mt-1" value={myRemFor(viewing)} onChange={(e) => { const m = Number(e.target.value); changeMyReminder(viewing, m); setViewing({ ...viewing }); }}>
                {REMINDERS.map((r) => <option key={r.minutes} value={r.minutes}>{r.label}</option>)}
              </select>
            </label>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {canEdit(viewing) && (
              <div className="flex justify-between pt-2">
                <button className="text-red-400 text-sm" onClick={() => remove(viewing)}>Delete</button>
                <button className="btn" onClick={() => startEdit(viewing)}>Edit</button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {draft && (
        <Modal onClose={() => setDraft(null)}>
          <form onSubmit={(e) => { e.preventDefault(); save(draft); }} className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-lg">{draft.id ? "Edit event" : "New event"}</h2>
              <button type="button" onClick={() => setDraft(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <input className="input" placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required autoFocus />
            <textarea className="input" rows={3} placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Kind })}>
                <option value="meeting">Meeting</option>
                <option value="deadline">Deadline</option>
                <option value="personal">Personal</option>
                <option value="other">Other</option>
              </select>
              <select className="input" value={draft.projectId} onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}>
                <option value="">No project</option>
                {p.projects.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={draft.allDay}
                onChange={(e) => {
                  const allDay = e.target.checked;
                  setDraft({ ...draft, allDay, start: allDay ? draft.start.slice(0, 10) : `${draft.start.slice(0, 10)}T09:00`, end: allDay ? draft.end.slice(0, 10) : `${draft.end.slice(0, 10)}T10:00` });
                }} /> All day
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm text-muted">Starts
                <input className="input mt-1" type={draft.allDay ? "date" : "datetime-local"} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} required />
              </label>
              <label className="text-sm text-muted">Ends
                <input className="input mt-1" type={draft.allDay ? "date" : "datetime-local"} value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} required />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={draft.personal || draft.kind === "personal"} disabled={draft.kind === "personal"} onChange={(e) => setDraft({ ...draft, personal: e.target.checked })} />
              Private (only you and attendees can see it)
            </label>
            <div>
              <div className="text-sm text-muted mb-1">Attendees</div>
              <div className="max-h-32 overflow-y-auto">
                {p.people.filter((x) => x.user_id !== p.viewerId).map((x) => (
                  <label key={x.user_id} className="flex items-center gap-2 py-0.5 cursor-pointer text-sm">
                    <input type="checkbox" checked={draft.attendees.includes(x.user_id)}
                      onChange={(e) => setDraft({ ...draft, attendees: e.target.checked ? [...draft.attendees, x.user_id] : draft.attendees.filter((u) => u !== x.user_id) })} />
                    {x.profiles?.full_name || x.profiles?.username}
                  </label>
                ))}
              </div>
            </div>
            <label className="block text-sm text-muted">Remind me
              <select className="input mt-1" value={draft.reminder} onChange={(e) => setDraft({ ...draft, reminder: Number(e.target.value) })}>
                {REMINDERS.map((r) => <option key={r.minutes} value={r.minutes}>{r.label}</option>)}
              </select>
            </label>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-2 text-muted" onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="card w-full max-w-md p-5 backdrop-blur max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
