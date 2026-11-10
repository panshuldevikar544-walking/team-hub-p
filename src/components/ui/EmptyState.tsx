import type { LucideIcon } from "lucide-react";

/** Friendly empty state: an icon in a soft circle, a title and an optional hint. */
export default function EmptyState({ icon: Icon, title, hint, compact }: { icon: LucideIcon; title: string; hint?: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "py-6" : "py-12"} px-4`}>
      <div className="h-12 w-12 rounded-full bg-accent/10 text-accent flex items-center justify-center mb-3">
        <Icon size={22} />
      </div>
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-muted mt-1 max-w-xs">{hint}</p>}
    </div>
  );
}
