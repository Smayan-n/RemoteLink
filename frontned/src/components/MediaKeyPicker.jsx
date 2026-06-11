import { MEDIA_KEY_COMMANDS } from "../lib/macros";

function MediaIcon({ command }) {
  const cls = "h-5 w-5";
  switch (command) {
    case "volumeup":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15.5 8.5a5 5 0 010 7" strokeLinecap="round" />
          <path d="M18 6a8 8 0 010 12" strokeLinecap="round" />
        </svg>
      );
    case "volumedown":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15.5 12a5 5 0 000 0" strokeLinecap="round" />
        </svg>
      );
    case "volumemute":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 9l5 6M21 9l-5 6" strokeLinecap="round" />
        </svg>
      );
    case "playpause":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8v8l6-4-6-4z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "nexttrack":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M5 6v12" strokeLinecap="round" />
          <path d="M9 6l9 6-9 6V6z" strokeLinejoin="round" />
        </svg>
      );
    case "prevtrack":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M19 6v12" strokeLinecap="round" />
          <path d="M15 6L6 12l9 6V6z" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

export default function MediaKeyPicker({ value, onChange }) {
  const volume = MEDIA_KEY_COMMANDS.filter((c) => c.group === "volume");
  const transport = MEDIA_KEY_COMMANDS.filter((c) => c.group === "transport");

  return (
    <div className="mb-3 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Global command
      </p>

      <CommandGroup
        title="Volume"
        commands={volume}
        value={value}
        onChange={onChange}
      />
      <CommandGroup
        title="Playback"
        commands={transport}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

function CommandGroup({ title, commands, value, onChange }) {
  return (
    <div>
      <p className="mb-1.5 text-[9px] font-medium uppercase tracking-[0.18em] text-slate-600">
        {title}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {commands.map((cmd) => {
          const selected = value === cmd.value;
          return (
            <button
              key={cmd.value}
              type="button"
              onClick={() => onChange(cmd.value)}
              className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 transition-all ${
                selected
                  ? "border-emerald-500/50 bg-emerald-500/12 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.15)]"
                  : "border-slate-700/80 bg-[#0b0f19]/60 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              }`}
            >
              <MediaIcon command={cmd.value} />
              <span className="text-center text-[9px] font-medium leading-tight">
                {cmd.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
