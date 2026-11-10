"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useUnread } from "@/components/layout/Unread";
import { isActive, navItems } from "@/components/layout/nav";

/** Bottom navigation for phones. The "More" tab opens the full menu. */
export default function MobileTabBar({ slug, userId }: { slug: string; userId: string }) {
  const pathname = usePathname();
  const { total } = useUnread();
  const tabs = navItems(slug, userId, false).filter((i) => ["Dashboard", "Chat", "Projects", "Calendar"].includes(i.label));

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-surface/95 backdrop-blur border-t border-border grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
      {tabs.map(({ href, label, icon: Icon, prefix }) => {
        const active = isActive(pathname, href, prefix);
        return (
          <Link key={href} href={href} className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "text-accent" : "text-muted"}`}>
            <Icon size={20} />
            {label}
            {label === "Chat" && total > 0 && (
              <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-accent text-white text-[10px] flex items-center justify-center">{total > 99 ? "99+" : total}</span>
            )}
          </Link>
        );
      })}
      <button onClick={() => window.dispatchEvent(new Event("open-menu"))} className="flex flex-col items-center justify-center gap-0.5 text-[11px] text-muted" aria-label="More">
        <Menu size={20} />
        More
      </button>
    </nav>
  );
}
