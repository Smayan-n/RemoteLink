import { memo, useEffect, useState } from "react";
import { binToHex } from "../../lib/format";
import { REMOTE_H, REMOTE_W } from "./buildGraph";

function RemoteNode({
  remoteId,
  registered,
  name,
  draftName,
  buttonCount,
  accent,
  firing,
  onDraftChange,
  onRegister,
  onRenameRemote,
}) {
  const remoteHex = binToHex(remoteId);
  const isPending = !registered;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(name ?? "");

  useEffect(() => {
    if (!isEditing) setEditValue(name ?? "");
  }, [name, isEditing]);

  const startEditing = () => {
    setEditValue(name ?? "");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEditValue(name ?? "");
    setIsEditing(false);
  };

  const saveEditing = () => {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    onRenameRemote?.(remoteId, trimmed);
    setIsEditing(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEditing();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditing();
    }
  };

  return (
    <div
      className="d3-node-handle relative rounded-xl border bg-[#0e1422]/95 shadow-xl backdrop-blur-sm"
      style={{
        width: REMOTE_W,
        minHeight: REMOTE_H,
        borderColor: isPending ? "rgba(251, 191, 36, 0.45)" : accent.border,
        boxShadow: firing
          ? `0 0 26px 4px ${accent.base}`
          : "0 8px 24px rgba(0,0,0,0.45)",
        transition: "box-shadow 0.25s ease",
      }}
    >
      <div
        className="flex items-center gap-2 rounded-t-xl border-b px-3 py-2"
        style={{
          borderColor: "rgba(148,163,184,0.12)",
          background: accent.soft,
        }}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            background: accent.base,
            boxShadow: `0 0 8px ${accent.base}`,
          }}
        />
        <div className="min-w-0">
          <p className="text-[8px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Remote
          </p>
          <p
            className="font-mono text-sm font-bold leading-tight"
            style={{ color: accent.base }}
          >
            0x{remoteHex}
          </p>
        </div>
        <span className="ml-auto rounded border border-slate-700/70 bg-slate-900/60 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
          {buttonCount} btn{buttonCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="px-3 py-2.5">
        {isPending ? (
          <div className="space-y-1.5">
            <input
              type="text"
              placeholder="Name this remote…"
              value={draftName ?? ""}
              onChange={(e) => onDraftChange?.(remoteId, e.target.value)}
              className="nodrag w-full rounded border border-slate-700 bg-[#0b0f19] px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => onRegister?.(remoteId)}
              disabled={!draftName?.trim()}
              className="nodrag w-full rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
            >
              Register
            </button>
          </div>
        ) : isEditing ? (
          <div className="space-y-1.5">
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              autoFocus
              className="nodrag w-full rounded border border-slate-700 bg-[#0b0f19] px-2 py-1.5 text-center text-xs text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
            />
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={saveEditing}
                disabled={!editValue.trim()}
                className="nodrag flex-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                className="nodrag flex-1 rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-[10px] font-semibold text-slate-400 hover:border-slate-500 hover:text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <p
              className="w-full truncate text-center text-sm font-semibold text-emerald-300"
              title={name}
            >
              {name || "—"}
            </p>
            <button
              type="button"
              onClick={startEditing}
              className="nodrag text-[10px] font-medium text-slate-500 transition-colors hover:text-emerald-400"
            >
              Edit name
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(RemoteNode);
