import { LayoutDashboard, MessageSquare, CalendarDays, BarChart3, FolderKanban, Users, UserCircle, Settings } from "lucide-react";

export function navItems(slug: string, userId: string, isAdmin: boolean) {
  return [
    { href: `/w/${slug}/dashboard`, label: "Dashboard", icon: LayoutDashboard, key: "d", prefix: false },
    { href: `/w/${slug}/chat`, label: "Chat", icon: MessageSquare, key: "c", prefix: true },
    { href: `/w/${slug}/projects`, label: "Projects", icon: FolderKanban, key: "p", prefix: true },
    { href: `/w/${slug}/calendar`, label: "Calendar", icon: CalendarDays, key: "l", prefix: false },
    { href: `/w/${slug}/analytics`, label: "Analytics", icon: BarChart3, key: "a", prefix: false },
    { href: `/w/${slug}/members`, label: "Members", icon: Users, key: "m", prefix: false },
    { href: `/w/${slug}/members/${userId}`, label: "My profile", icon: UserCircle, key: "u", prefix: false },
    ...(isAdmin ? [{ href: `/w/${slug}/settings`, label: "Members & invites", icon: Settings, key: "i", prefix: false }] : []),
  ];
}

export const isActive = (pathname: string, href: string, prefix: boolean) =>
  pathname === href || (prefix && pathname.startsWith(href + "/"));
