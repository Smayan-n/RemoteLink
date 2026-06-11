export default function LeftSidebar({ connected, uniqueRemoteCount }) {
  const noiseFloor = 0.22;
  const signalThreshold = 0.5;

  return (
    <aside className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-800/80 bg-[#0f1524]/60 p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Link Status
        </p>
        <div
          className={`inline-flex items-center gap-2.5 rounded-md border px-3 py-2 ${
            connected
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-red-500/30 bg-red-500/10"
          }`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              connected ? "animate-pulse bg-emerald-400" : "bg-red-500"
            }`}
          />
          <span
            className={`font-mono text-xs font-bold tracking-wider ${
              connected ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {connected ? "CONNECTED" : "DISCONNECTED"}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800/80 bg-[#0f1524]/60 p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Hardware Specs
        </p>
        <dl className="space-y-2.5 font-mono text-xs">
          <div className="flex justify-between gap-2 border-b border-slate-800/60 pb-2">
            <dt className="text-slate-500">Frequency</dt>
            <dd className="text-slate-200">433.92 MHz</dd>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-800/60 pb-2">
            <dt className="text-slate-500">Sample Rate</dt>
            <dd className="text-slate-200">2.048 MSPS</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Protocol</dt>
            <dd className="text-emerald-400/90">EV1527 (OOK)</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border border-slate-800/80 bg-[#0f1524]/60 p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Signal Threshold
        </p>
        <div className="relative h-3 overflow-hidden rounded-full bg-slate-900">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-slate-600/60"
            style={{ width: `${noiseFloor * 100}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/40"
            style={{ width: `${signalThreshold * 100}%` }}
          />
          <div
            className="absolute top-0 h-full w-0.5 bg-emerald-400"
            style={{ left: `${signalThreshold * 100}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-slate-500">
          <span>Noise ~{noiseFloor}</span>
          <span className="text-emerald-400">Threshold {signalThreshold}</span>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800/80 bg-[#0f1524]/60 p-4">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Session Stats
        </p>
        <p className="font-mono text-3xl font-bold text-white">{uniqueRemoteCount}</p>
        <p className="mt-1 text-xs text-slate-500">Unique remotes tracked</p>
      </div>
    </aside>
  );
}
