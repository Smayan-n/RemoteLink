export default function RadarIcon({ className = "h-12 w-12" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle
        cx="32"
        cy="32"
        r="28"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-slate-600"
      />
      <circle
        cx="32"
        cy="32"
        r="18"
        stroke="currentColor"
        strokeWidth="1"
        className="text-slate-700"
      />
      <circle
        cx="32"
        cy="32"
        r="8"
        stroke="currentColor"
        strokeWidth="1"
        className="text-slate-700"
      />
      <g className="origin-center animate-radar-sweep" style={{ transformOrigin: "32px 32px" }}>
        <line
          x1="32"
          y1="32"
          x2="32"
          y2="6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="text-emerald-400/80"
        />
      </g>
      <circle cx="32" cy="32" r="2.5" fill="currentColor" className="text-emerald-400" />
    </svg>
  );
}
