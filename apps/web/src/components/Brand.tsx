/** Decorative marks: the accessible names live on the surrounding link, heading, or label. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      className="logo"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="9" fill="var(--accent-solid)" />
      {/* Two plates and the seam that joins them. */}
      <rect x="7" y="9" width="8" height="14" rx="2.5" fill="#fff" opacity="0.95" />
      <rect x="17" y="9" width="8" height="14" rx="2.5" fill="#fff" opacity="0.6" />
      <path
        d="M16 6.5v19"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="0.1 4"
      />
    </svg>
  );
}

/** Initials on a colour derived from the name, so a person looks the same everywhere. */
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
  let hash = 0;
  for (const ch of name) hash = (hash * 137 + ch.charCodeAt(0)) % 360;
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.4, ['--hue' as string]: hash }}
    >
      {initials}
    </span>
  );
}
