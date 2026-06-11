import { memo } from "react";
import { BUTTON_H, BUTTON_W } from "./buildGraph";

function ButtonNode({
  btnHex,
  btnId,
  palette,
  macroName,
  active,
  flashId,
  selected,
  onSelect,
}) {
  const title = macroName
    ? `Button 0x${btnHex} · ${macroName}`
    : `Button 0x${btnHex} · ${btnId}`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      className="relative flex flex-col items-center justify-center rounded-lg border px-1 font-mono leading-none shadow-md"
      style={{
        width: BUTTON_W,
        height: BUTTON_H,
        background: active ? palette.base : palette.soft,
        borderColor: selected ? "#34d399" : palette.border,
        boxShadow: active
          ? `0 0 18px 3px ${palette.base}`
          : selected
            ? "0 0 0 2px rgba(52,211,153,0.55)"
            : macroName
              ? `0 0 0 1px ${palette.border}`
              : "0 1px 4px rgba(0,0,0,0.4)",
        color: active ? "#0b0f19" : palette.text,
      }}
      title={title}
    >
      {active && flashId != null ? (
        <span
          key={`ping-${flashId}`}
          className="d3-ping"
          style={{
            width: BUTTON_W,
            height: BUTTON_H,
            border: `2px solid ${palette.base}`,
          }}
        />
      ) : null}
      <span
        key={flashId != null ? `label-${flashId}` : "label-idle"}
        className={`relative flex w-full flex-col items-center${flashId != null ? " btn-press-pop" : ""}`}
      >
        <span className="text-sm font-bold tracking-wide">0x{btnHex}</span>
        {macroName ? (
          <span className="mt-1 max-w-full truncate px-0.5 text-[11px] font-semibold leading-tight opacity-90">
            {macroName}
          </span>
        ) : (
          <span className="mt-1 text-[10px] uppercase tracking-[0.14em] opacity-70">
            button
          </span>
        )}
      </span>
    </button>
  );
}

export default memo(ButtonNode);
