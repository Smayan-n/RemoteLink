export function binToHex(binary) {
  if (!binary || !/^[01]+$/.test(binary)) return "—";
  try {
    const pad = Math.ceil(binary.length / 4);
    // BigInt avoids precision loss for long bit strings
    const hex = BigInt("0b" + binary).toString(16).toUpperCase();
    return hex.padStart(pad, "0");
  } catch {
    return "—";
  }
}

export function formatTimeHms(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

export function packetKey(remote_id, btn_id) {
  return `${remote_id}-${btn_id}`;
}

/** Primary label for a remote — registered name, or hex id if unnamed. */
export function remoteDisplayInfo(remoteId, remote) {
  const hex = binToHex(remoteId);
  if (remote?.registered && remote?.name?.trim()) {
    return {
      title: remote.name.trim(),
      idLabel: `0x${hex}`,
      isNamed: true,
    };
  }
  return { title: `0x${hex}`, idLabel: null, isNamed: false };
}

export const BUTTON_BADGE_COLORS = [
  "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  "border-violet-500/40 bg-violet-500/10 text-violet-300",
  "border-amber-500/40 bg-amber-500/10 text-amber-300",
  "border-rose-500/40 bg-rose-500/10 text-rose-300",
  "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  "border-blue-500/40 bg-blue-500/10 text-blue-300",
];

export function badgeColorForBtn(btn_id) {
  const n = parseInt(btn_id, 2);
  if (Number.isNaN(n)) return BUTTON_BADGE_COLORS[0];
  return BUTTON_BADGE_COLORS[n % BUTTON_BADGE_COLORS.length];
}

/**
 * Raw color palette (real CSS values) for the D3 canvas, where Tailwind
 * utility classes can't be used for SVG strokes / inline glows.
 * Order mirrors BUTTON_BADGE_COLORS so the inspector and graph stay in sync.
 */
export const BUTTON_PALETTE = [
  { name: "cyan", base: "#22d3ee", soft: "rgba(34, 211, 238, 0.14)", border: "rgba(34, 211, 238, 0.45)", text: "#67e8f9" },
  { name: "violet", base: "#a78bfa", soft: "rgba(167, 139, 250, 0.14)", border: "rgba(167, 139, 250, 0.45)", text: "#c4b5fd" },
  { name: "amber", base: "#fbbf24", soft: "rgba(251, 191, 36, 0.14)", border: "rgba(251, 191, 36, 0.45)", text: "#fcd34d" },
  { name: "rose", base: "#fb7185", soft: "rgba(251, 113, 133, 0.14)", border: "rgba(251, 113, 133, 0.45)", text: "#fda4af" },
  { name: "emerald", base: "#34d399", soft: "rgba(52, 211, 153, 0.14)", border: "rgba(52, 211, 153, 0.45)", text: "#6ee7b7" },
  { name: "blue", base: "#60a5fa", soft: "rgba(96, 165, 250, 0.14)", border: "rgba(96, 165, 250, 0.45)", text: "#93c5fd" },
];

export function paletteForBtn(btn_id) {
  const n = parseInt(btn_id, 2);
  if (Number.isNaN(n)) return BUTTON_PALETTE[0];
  return BUTTON_PALETTE[n % BUTTON_PALETTE.length];
}

/** Deterministic accent color for a remote, derived from its id bits. */
export function remoteAccent(remote_id) {
  let hash = 0;
  for (let i = 0; i < remote_id.length; i += 1) {
    hash = (hash * 31 + remote_id.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return {
    base: `hsl(${hue} 80% 62%)`,
    soft: `hsl(${hue} 80% 62% / 0.12)`,
    border: `hsl(${hue} 80% 62% / 0.45)`,
  };
}
