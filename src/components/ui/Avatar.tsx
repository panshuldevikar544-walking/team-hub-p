export default function Avatar({
  url,
  name,
  size = 40,
}: {
  url?: string | null;
  name: string;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const style = { width: size, height: size, fontSize: size * 0.38 };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} style={style} className="rounded-full object-cover shrink-0" />;
  }
  return (
    <div style={style} className="rounded-full bg-surface-2 border border-border flex items-center justify-center text-muted shrink-0 font-medium">
      {initials || "?"}
    </div>
  );
}
