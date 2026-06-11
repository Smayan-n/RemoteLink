import { useMemo } from "react";
import { formatAxisLabel, formatClockMs } from "../lib/combos";
import { binToHex, packetKey, paletteForBtn } from "../lib/format";

const LANE_H = 32;
const AXIS_H = 18;
const PAD = { top: 28, right: 12, bottom: AXIS_H + 6, left: 12 };

function buildLanes(steps, heldButtons, now, includeLive) {
	const laneMap = new Map();

	for (const step of steps ?? []) {
		const key = packetKey(step.remote_id, step.btn_id);
		const end = step.at;
		const start = end - Math.max(0, step.duration_ms ?? 0);
		if (!laneMap.has(key)) {
			laneMap.set(key, {
				key,
				remote_id: step.remote_id,
				btn_id: step.btn_id,
				segments: [],
			});
		}
		laneMap.get(key).segments.push({ start, end, live: false });
	}

	if (includeLive) {
		for (const held of Object.values(heldButtons ?? {})) {
			const key = packetKey(held.remote_id, held.btn_id);
			const start = held.downAt ?? now;
			if (!laneMap.has(key)) {
				laneMap.set(key, {
					key,
					remote_id: held.remote_id,
					btn_id: held.btn_id,
					segments: [],
				});
			}
			laneMap.get(key).segments.push({ start, end: now, live: true });
		}
	}

	return [...laneMap.values()].sort((a, b) => {
		const aStart = a.segments[0]?.start ?? 0;
		const bStart = b.segments[0]?.start ?? 0;
		return aStart - bStart;
	});
}

function axisTicks(spanMs) {
	const interval =
		spanMs <= 2500 ? 500 : spanMs <= 6000 ? 1000 : spanMs <= 15000 ? 2000 : 5000;
	const ticks = [];
	for (let t = 0; t <= spanMs; t += interval) {
		ticks.push(t);
	}
	if (ticks[ticks.length - 1] !== spanMs && spanMs > 0) {
		ticks.push(spanMs);
	}
	return ticks;
}

export default function RecordHoldTimeline({
	steps,
	heldButtons,
	recordingPhase,
	sessionStart,
	now,
	paused = false,
}) {
	const isRecording = recordingPhase === "recording" && !paused;
	const isActive = isRecording || recordingPhase === "naming";

	const lanes = useMemo(
		() => buildLanes(steps, heldButtons, now, isRecording),
		[steps, heldButtons, now, isRecording],
	);

	const t0 = sessionStart ?? null;
	const hasStarted = t0 != null;

	const sessionElapsed = hasStarted ? Math.max(0, now - t0) : 0;
	const lastStep = steps?.[steps.length - 1];
	const heldList = Object.values(heldButtons ?? {});
	const liveHeld = isRecording && heldList.length > 0 ? heldList[heldList.length - 1] : null;
	const holdElapsed = liveHeld ? Math.max(0, now - (liveHeld.downAt ?? now)) : 0;
	const gapElapsed = !liveHeld && lastStep && hasStarted ? Math.max(0, now - lastStep.at) : 0;

	const spanMs = hasStarted ? Math.max(sessionElapsed, 800) : 800;
	const width = 640;
	const laneAreaH = Math.max(1, lanes.length) * LANE_H;
	const height = PAD.top + laneAreaH + PAD.bottom;
	const innerW = width - PAD.left - PAD.right;
	const xForAbs = (absMs) => PAD.left + (Math.max(0, absMs - t0) / spanMs) * innerW;
	const xForOffset = (offsetMs) => PAD.left + (offsetMs / spanMs) * innerW;
	const xFor = hasStarted ? xForAbs : xForOffset;
	const barW = (start, end) => Math.max(2, xFor(end) - xFor(start));
	const axisY = height - AXIS_H;
	const ticks = hasStarted ? axisTicks(spanMs) : [];

	if (!isActive) return null;

	return (
		<div className="rounded-lg border border-violet-500/20 bg-[#0b0f19]/90">
			<div className="flex items-baseline justify-between gap-3 border-b border-slate-800/80 px-3 py-2">
				<div className="font-mono text-sm tabular-nums text-violet-200">
					{hasStarted ? formatClockMs(sessionElapsed) : "0s 000ms"}
				</div>
				<div className="font-mono text-[10px] tabular-nums text-slate-500">
					{paused ? (
						<span className="text-violet-400/80">paused</span>
					) : liveHeld ? (
						<span className="text-emerald-400">hold {formatClockMs(holdElapsed)}</span>
					) : lastStep && hasStarted ? (
						<span>gap {formatClockMs(gapElapsed)}</span>
					) : (
						<span>waiting for first press</span>
					)}
				</div>
			</div>

			{!hasStarted && lanes.length === 0 ? (
				<p className="px-3 py-6 text-center text-xs text-slate-500">
					Press a button — timer and axis start on first press
				</p>
			) : (
				<svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
					{hasStarted &&
						ticks.map((tick) => {
							const x = xFor(t0 + tick);
							return (
								<g key={`tick-${tick}`}>
									<line
										x1={x}
										y1={PAD.top - 4}
										x2={x}
										y2={axisY}
										stroke="rgba(100,116,139,0.15)"
										strokeWidth="1"
									/>
									<text
										x={x}
										y={axisY + 12}
										textAnchor="middle"
										fill="#475569"
										fontSize="8"
										fontFamily="ui-monospace, monospace"
									>
										{formatAxisLabel(tick)}
									</text>
								</g>
							);
						})}

					<line
						x1={PAD.left}
						y1={axisY}
						x2={PAD.left + innerW}
						y2={axisY}
						stroke="rgba(100,116,139,0.35)"
						strokeWidth="1"
					/>

					{lanes.map((lane, laneIdx) => {
						const y = PAD.top + laneIdx * LANE_H + LANE_H / 2;
						const palette = paletteForBtn(lane.btn_id);
						const btnHex = binToHex(lane.btn_id);

						return (
							<g key={lane.key}>
								<text
									x={PAD.left}
									y={y - 14}
									fill="#64748b"
									fontSize="8"
									fontFamily="ui-monospace, monospace"
								>
									0x{btnHex}
								</text>

								<line
									x1={PAD.left}
									y1={y}
									x2={PAD.left + innerW}
									y2={y}
									stroke="rgba(51,65,85,0.5)"
									strokeWidth="1"
								/>

								{lane.segments.map((seg, segIdx) => {
									const durationMs = seg.end - seg.start;
									const barX = xFor(seg.start);
									const w = barW(seg.start, seg.end);
									const labelX = barX + w / 2;

									return (
										<g key={`${lane.key}-${segIdx}`}>
											<rect
												x={barX}
												y={y - 3}
												width={w}
												height={6}
												rx={1}
												fill={palette.base}
												opacity={seg.live ? 0.95 : 0.65}
											/>
											<text
												x={labelX}
												y={y - 8}
												textAnchor="middle"
												fill={seg.live && !paused ? "#34d399" : "#94a3b8"}
												fontSize="8"
												fontFamily="ui-monospace, monospace"
												fontWeight={seg.live && !paused ? "600" : "400"}
											>
												{formatClockMs(durationMs)}
											</text>
										</g>
									);
								})}
							</g>
						);
					})}
				</svg>
			)}
		</div>
	);
}
