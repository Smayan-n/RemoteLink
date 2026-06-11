import { binToHex } from "./format";
import { macroDisplayName } from "./macros";

/** Format duration as seconds + ms (e.g. "1s 234ms"). */
export function formatClockMs(ms) {
	if (ms == null || Number.isNaN(ms)) return "—";
	const clamped = Math.max(0, Math.round(ms));
	const s = Math.floor(clamped / 1000);
	const remainder = clamped % 1000;
	return `${s}s ${remainder.toString().padStart(3, "0")}ms`;
}

/** Format x-axis offset from window start. */
export function formatAxisLabel(msFromStart) {
	if (msFromStart == null || Number.isNaN(msFromStart)) return "—";
	const clamped = Math.max(0, Math.round(msFromStart));
	const s = Math.floor(clamped / 1000);
	const remainder = clamped % 1000;
	if (s === 0 && remainder === 0) return "0s";
	if (s === 0) return `${remainder}ms`;
	if (remainder === 0) return `${s}s`;
	return `${s}s ${remainder.toString().padStart(3, "0")}ms`;
}

/** Format hold duration for display (ms → human string). */
export function formatDurationMs(ms) {
	if (ms == null || Number.isNaN(ms)) return "—";
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(2)}s`;
}

/** One line label for a recorded combo step. */
export function comboStepLabel(step, remotes) {
	const remote = remotes?.[step.remote_id];
	const remoteName =
		remote?.registered && remote?.name?.trim()
			? remote.name.trim()
			: `0x${binToHex(step.remote_id)}`;
	const btnHex = binToHex(step.btn_id);
	return `${remoteName} · 0x${btnHex}`;
}

/** Summary of a saved combo's macro binding. */
export function comboMacroLabel(combo) {
	return macroDisplayName({
		nickname: combo.nickname,
		actionType: combo.action_type,
		mediaKey: combo.media_key,
	});
}
