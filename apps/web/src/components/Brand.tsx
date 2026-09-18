import { useState } from 'react';

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

/**
 * Distinct colours that all keep white initials at 4.5:1 or better. A continuous hue let similar
 * names land on near-identical colours, which hid people who share initials.
 */
const AVATAR_COLOURS = [
  '#4f46e5',
  '#7c3aed',
  '#c026d3',
  '#db2777',
  '#dc2626',
  '#c2410c',
  '#b45309',
  '#15803d',
  '#0f766e',
  '#0e7490',
  '#1d4ed8',
  '#475569',
];

/**
 * The person's picture when they have one, otherwise initials on a colour derived from the name,
 * so a person looks the same everywhere. A picture that fails to load falls back to initials.
 */
export function Avatar({
  name,
  size = 28,
  url = null,
}: {
  name: string;
  size?: number;
  url?: string | null;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const picture = url && failed !== url ? url : null;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
  // FNV-1a spreads similar names apart.
  let hash = 0x811c9dc5;
  for (const ch of name) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return (
    <span
      aria-hidden="true"
      className={picture ? 'avatar picture' : 'avatar'}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        ['--avatar' as string]: AVATAR_COLOURS[hash % AVATAR_COLOURS.length],
      }}
    >
      {picture ? <img src={picture} alt="" onError={() => setFailed(picture)} /> : initials}
    </span>
  );
}

/** Stands in for an avatar where nobody is assigned. */
export function NobodyAvatar({ size = 28 }: { size?: number }) {
  return (
    <span
      className="avatar nobody"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      ?
    </span>
  );
}
