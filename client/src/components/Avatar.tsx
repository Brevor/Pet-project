export function Avatar({
  url,
  name,
  size = 28
}: {
  url: string | null | undefined;
  name: string;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full border border-slate-200 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initials || '?'}
    </span>
  );
}
