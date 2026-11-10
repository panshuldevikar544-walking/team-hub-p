"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const SECTIONS: Record<string, string> = {
  dashboard: "Dashboard", chat: "Chat", projects: "Projects", calendar: "Calendar",
  analytics: "Analytics", members: "Members", settings: "Members & invites",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Workspace > Section > Detail. The detail name (project, channel, person) is looked up by id. */
export default function Breadcrumbs({ slug, workspaceName }: { slug: string; workspaceName: string }) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [detail, setDetail] = useState<{ path: string; name: string } | null>(null);

  const parts = pathname.split("/").filter(Boolean); // ["w", slug, section, id?]
  const section = parts[2];
  const id = parts[3] && UUID.test(parts[3]) ? parts[3] : null;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      let name: string | null = null;
      if (section === "projects") {
        name = (await supabase.from("projects").select("name").eq("id", id).maybeSingle()).data?.name ?? null;
      } else if (section === "chat") {
        const c = (await supabase.from("channels").select("name, kind").eq("id", id).maybeSingle()).data;
        name = c ? (c.kind === "dm" ? "Direct message" : `# ${c.name ?? "channel"}`) : null;
      } else if (section === "members") {
        const pr = (await supabase.from("profiles").select("full_name, username").eq("id", id).maybeSingle()).data;
        name = pr ? pr.full_name || pr.username : null;
      }
      if (alive && name) setDetail({ path: pathname, name });
    })();
    return () => { alive = false; };
  }, [id, section, pathname, supabase]);

  if (!section || !SECTIONS[section]) return null;
  const detailName = id && detail?.path === pathname ? detail.name : null;

  return (
    <nav className="hidden md:flex items-center gap-1 text-xs text-muted mb-4" aria-label="Breadcrumb">
      <Link href={`/w/${slug}/dashboard`} className="hover:text-foreground">{workspaceName}</Link>
      <ChevronRight size={12} />
      {id ? <Link href={`/w/${slug}/${section}`} className="hover:text-foreground">{SECTIONS[section]}</Link> : <span className="text-foreground">{SECTIONS[section]}</span>}
      {id && <><ChevronRight size={12} /><span className="text-foreground truncate max-w-xs">{detailName ?? "…"}</span></>}
    </nav>
  );
}
