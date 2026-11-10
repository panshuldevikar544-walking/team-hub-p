"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, LogOut, X, Search, ChevronsUpDown, Plus, Check } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import AppearanceMenu from "@/components/layout/AppearanceMenu";
import StatusMenu from "@/components/layout/StatusMenu";
import { useUnread } from "@/components/layout/Unread";
import { isActive, navItems } from "@/components/layout/nav";
import { readPref, writePref } from "@/lib/prefs";
import { createClient } from "@/lib/supabase/client";

type Props = {
  slug: string;
  workspaceName: string;
  workspaces: { slug: string; name: string }[];
  userName: string;
  avatarUrl: string | null;
  userId: string;
  isAdmin: boolean;
};

export default function Sidebar({ slug, workspaceName, workspaces, userName, avatarUrl, userId, isAdmin }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { total: unreadTotal } = useUnread();
  const items = navItems(slug, userId, isAdmin);

  useEffect(() => {
    setCollapsed(readPref("th-sidebar") === "collapsed");
    const openMenu = () => setOpen(true);
    window.addEventListener("open-menu", openMenu);
    return () => window.removeEventListener("open-menu", openMenu);
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => { writePref("th-sidebar", c ? "open" : "collapsed"); return !c; });
  }

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const nav = (compact: boolean) => (
    <aside className={`h-full flex flex-col bg-surface border-r border-border transition-[width] duration-200 ${compact ? "w-16" : "w-64 md:w-60"}`}>
      <div className="relative flex items-center justify-between gap-1 p-2 h-14 border-b border-border">
        <button
          onClick={() => setSwitcher(!switcher)}
          className="flex items-center gap-2 min-w-0 flex-1 rounded-lg px-2 py-1.5 hover:bg-surface-2 text-left"
          aria-label="Switch workspace"
        >
          <span className="h-7 w-7 shrink-0 rounded-md bg-accent text-white text-sm font-semibold flex items-center justify-center">
            {workspaceName.slice(0, 1).toUpperCase()}
          </span>
          {!compact && <span className="font-semibold truncate flex-1">{workspaceName}</span>}
          {!compact && <ChevronsUpDown size={14} className="text-muted shrink-0" />}
        </button>
        {!compact && (
          <button className="hidden md:block text-muted hover:text-foreground p-1" onClick={toggleCollapsed} aria-label="Collapse sidebar">
            <PanelLeftClose size={18} />
          </button>
        )}
        <button className="md:hidden text-muted p-1" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
        {switcher && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setSwitcher(false)} />
            <div className="card absolute left-2 top-full mt-1 w-56 p-1 z-50 shadow-lg">
              {workspaces.map((w) => (
                <Link key={w.slug} href={`/w/${w.slug}/dashboard`} onClick={() => { setSwitcher(false); setOpen(false); }}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                  <span className="truncate flex-1">{w.name}</span>
                  {w.slug === slug && <Check size={14} className="text-accent" />}
                </Link>
              ))}
              <Link href="/onboarding" onClick={() => setSwitcher(false)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-muted hover:bg-surface-2 hover:text-foreground border-t border-border mt-1 pt-2">
                <Plus size={14} /> Create or join a workspace
              </Link>
            </div>
          </>
        )}
      </div>

      <div className="p-2">
        <button
          onClick={() => window.dispatchEvent(new Event("open-palette"))}
          className="w-full flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-muted hover:text-foreground"
        >
          <Search size={15} className="shrink-0" />
          {!compact && <><span className="flex-1 text-left">Search…</span><span className="kbd">Ctrl K</span></>}
        </button>
      </div>

      <nav className="flex-1 p-2 pt-0 space-y-1 overflow-y-auto">
        {items.map(({ href, label, icon: Icon, prefix }) => {
          const badge = label === "Chat" ? unreadTotal : 0;
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              title={compact ? label : undefined}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                isActive(pathname, href, prefix) ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              <Icon size={18} className="shrink-0" />
              {!compact && <span className="flex-1">{label}</span>}
              {badge > 0 && (
                compact
                  ? <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" />
                  : <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-white text-[11px] font-medium flex items-center justify-center">{badge > 99 ? "99+" : badge}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-2 border-t border-border space-y-1">
        <AppearanceMenu collapsed={compact} />
        {compact && (
          <button className="hidden md:flex w-full items-center gap-3 rounded-lg px-3 py-2 text-muted hover:bg-surface-2 hover:text-foreground" onClick={toggleCollapsed} aria-label="Expand sidebar">
            <PanelLeftOpen size={18} />
          </button>
        )}
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Link href={`/w/${slug}/members/${userId}`} className="shrink-0" onClick={() => setOpen(false)}>
            <Avatar url={avatarUrl} name={userName} size={28} />
          </Link>
          <StatusMenu userName={userName} collapsed={compact} />
          <button onClick={logout} className="text-muted hover:text-foreground p-1" aria-label="Log out" title="Log out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden md:block h-screen sticky top-0">{nav(collapsed)}</div>
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="h-full">{nav(false)}</div>
          <div className="flex-1 bg-black/60" onClick={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
