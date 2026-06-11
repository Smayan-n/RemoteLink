import { useMemo } from "react";
import { formatAxisLabel, formatClockMs, formatDurationMs } from "../lib/combos";
import {
	axisTicks,
	buildLanesFromSegments,
	gapMarkersFromTimeline,
	ghostTimelineFromLive,
	ghostTipMs,
	syntheticTimelineFromSteps,
} from "../lib/comboTimeline";
import { binToHex, paletteForBtn, remoteDisplayInfo } from "../lib/format";

const LANE_H = 34;
const AXIS_H = 18;
const PAD = { top: 30, right: 12, bottom: AXIS_H + 6, left: 12 };
const GHOST_COLOR = "rgba(148, 163, 184, 0.55)";
const GHOST_LIVE_COLOR = "rgba(248, 250, 252, 0.98)";
const GHOST_LIVE_STROKE = "rgba(226, 232, 240, 1)";

function renderSegments({ segments, lane, y, xFor, barW, variant, palette, paused }) {
	const isGhost = variant === "ghost";

	return segments.map((seg, segIdx) => {
		const durationMs = Math.max(0, seg.end - seg.start);
		const barX = xFor(seg.start);
		const w = barW(seg.start, seg.end);
		const labelX = barX + w / 2;
		const showLabel = w >= 24;

		const isLiveGhost = isGhost && seg.live && !paused;

		return (
			<g key={`${variant}-${lane.key}-${segIdx}`}>
				<rect
					x={barX}
					y={y - (isLiveGhost ? 7 : isGhost ? 4 : 3)}
					width={w}
					height={isLiveGhost ? 14 : isGhost ? 7 : 6}
					rx={isLiveGhost ? 2 : 1}
					fill={isGhost ? (seg.live ? GHOST_LIVE_COLOR : GHOST_COLOR) : palette.base}
					stroke={isLiveGhost ? GHOST_LIVE_STROKE : "none"}
					strokeWidth={isLiveGhost ? 1.5 : 0}
					opacity={isGhost ? (isLiveGhost ? 1 : 0.55) : 0.7}
				/>
				{showLabel ? (
					<text
						x={labelX}
						y={y - (isLiveGhost ? 14 : isGhost ? 12 : 8)}
						textAnchor="middle"
						fill={isLiveGhost ? "#f8fafc" : isGhost ? "#94a3b8" : "#94a3b8"}
						fontSize={isLiveGhost ? "9" : "8"}
						fontFamily="ui-monospace, monospace"
						fontWeight={isLiveGhost ? "700" : seg.live && !paused ? "600" : "400"}
					>
						{formatClockMs(durationMs)}
					</text>
				) : null}
			</g>
		);
	});
}

function MergedLaneGroup({ lanes, innerW, padLeft, xFor, barW, remotes, ghostActive }) {
	return lanes.map((lane, laneIdx) => {
		const y = PAD.top + laneIdx * LANE_H + LANE_H / 2;
		const palette = paletteForBtn(lane.btn_id);
		const remote = remoteDisplayInfo(lane.remote_id, remotes?.[lane.remote_id]);
		const btnHex = binToHex(lane.btn_id);

		return (
			<g key={lane.key}>
				<text
					x={PAD.left}
					y={y - 16}
					fill="#94a3b8"
					fontSize="8"
					fontFamily="ui-monospace, monospace"
				>
					{remote.title} · 0x{btnHex}
				</text>

				<line
					x1={padLeft}
					y1={y}
					x2={padLeft + innerW}
					y2={y}
					stroke="rgba(51,65,85,0.5)"
					strokeWidth="1"
				/>

				{renderSegments({
					segments: lane.saved,
					lane,
					y,
					xFor,
					barW,
					variant: "saved",
					palette,
				})}

				{ghostActive
					? renderSegments({
							segments: lane.ghost,
							lane,
							y,
							xFor,
							barW,
							variant: "ghost",
							palette,
						})
					: null}
			</g>
		);
	});
}

export default function ComboTimelineChart({
	steps,
	remotes,
	ghost,
	now,
	className = "",
}) {
	const savedTimeline = useMemo(() => syntheticTimelineFromSteps(steps), [steps]);
	const gapMarkers = useMemo(() => gapMarkersFromTimeline(savedTimeline), [savedTimeline]);

	const ghostActive = ghost?.active;
	const savedTotalMs = savedTimeline.at(-1)?.end ?? 0;
	const ghostLiveSteps = ghostActive
		? ghostTimelineFromLive(ghost.steps, ghost.liveHeld, now)
		: [];

	const ghostTip = ghostActive
		? ghostTipMs(ghost.steps, ghost.liveHeld, now, steps.length)
		: 0;

	const savedLanes = useMemo(
		() => buildLanesFromSegments(savedTimeline),
		[savedTimeline],
	);

	const ghostLanes = useMemo(() => {
		if (!ghostActive) return [];
		return buildLanesFromSegments(ghostLiveSteps);
	}, [ghostActive, ghostLiveSteps]);

	const mergedLanes = useMemo(() => {
		const map = new Map();
		for (const lane of savedLanes) {
			map.set(lane.key, {
				key: lane.key,
				remote_id: lane.remote_id,
				btn_id: lane.btn_id,
				saved: lane.segments,
				ghost: [],
			});
		}
		for (const lane of ghostLanes) {
			const existing = map.get(lane.key);
			if (existing) {
				existing.ghost = lane.segments;
			} else {
				map.set(lane.key, {
					key: lane.key,
					remote_id: lane.remote_id,
					btn_id: lane.btn_id,
					saved: [],
					ghost: lane.segments,
				});
			}
		}
		return [...map.values()].sort((a, b) => {
			const aStart = a.saved[0]?.start ?? a.ghost[0]?.start ?? 0;
			const bStart = b.saved[0]?.start ?? b.ghost[0]?.start ?? 0;
			return aStart - bStart;
		});
	}, [savedLanes, ghostLanes]);

	const laneCount = Math.max(mergedLanes.length, 1);
	const spanMs = ghostActive
		? Math.max(savedTotalMs, ghostTip, 800)
		: Math.max(savedTotalMs, 800);
	const width = 640;
	const height = PAD.top + laneCount * LANE_H + PAD.bottom;
	const innerW = width - PAD.left - PAD.right;
	const xFor = (offsetMs) => PAD.left + (Math.max(0, offsetMs) / spanMs) * innerW;
	const barW = (start, end) => Math.max(2, xFor(end) - xFor(start));
	const axisY = height - AXIS_H;
	const ticks = axisTicks(spanMs);

	const playheadX = ghostActive ? xFor(ghostTip) : null;

	return (
		<div className={`rounded-lg border border-slate-800/80 bg-[#0b0f19]/70 ${className}`}>
			{ghostActive ? (
				<div className="flex items-center justify-between border-b border-slate-800/80 px-3 py-1.5">
					<span className="font-mono text-[10px] tabular-nums text-slate-400">
						{formatClockMs(ghostTip)}
					</span>
					<span
						className={`text-[9px] font-semibold uppercase tracking-wider ${
							ghost.status === "complete"
								? "text-emerald-400"
								: ghost.status === "failed"
									? "text-red-400"
									: ghost.status === "timing_mismatch"
										? "text-amber-400"
										: ghost.status === "awaiting"
											? "text-violet-300"
											: "text-slate-500"
						}`}
					>
						{ghost.status === "complete"
							? "macro triggered"
							: ghost.status === "failed"
								? "wrong button"
								: ghost.status === "timing_mismatch"
									? "timing off — match hold/gaps"
									: ghost.status === "awaiting"
										? "confirming…"
										: `attempt · ${ghost.steps.length}/${steps.length}`}
					</span>
				</div>
			) : null}

			<svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
				{ticks.map((tick) => {
					const x = xFor(tick);
					return (
						<g key={`tick-${tick}`}>
							<line
								x1={x}
								y1={PAD.top - 4}
								x2={x}
								y2={axisY}
								stroke="rgba(100,116,139,0.12)"
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

				{gapMarkers.map((gap) => {
					const x1 = xFor(gap.start);
					const x2 = xFor(gap.end);
					if (x2 - x1 < 8) return null;
					return (
						<g key={gap.key}>
							<line
								x1={x1}
								y1={PAD.top - 2}
								x2={x2}
								y2={PAD.top - 2}
								stroke="rgba(167,139,250,0.35)"
								strokeWidth="1"
								strokeDasharray="3 2"
							/>
							<text
								x={xFor(gap.mid)}
								y={PAD.top - 6}
								textAnchor="middle"
								fill="rgba(167,139,250,0.75)"
								fontSize="7"
								fontFamily="ui-monospace, monospace"
							>
								gap {formatDurationMs(gap.gapMs)}
							</text>
						</g>
					);
				})}

				<MergedLaneGroup
					lanes={mergedLanes}
					innerW={innerW}
					padLeft={PAD.left}
					xFor={xFor}
					barW={barW}
					remotes={remotes}
					ghostActive={ghostActive}
				/>

				{ghostActive && playheadX != null ? (
					<line
						x1={playheadX}
						y1={PAD.top - 6}
						x2={playheadX}
						y2={axisY}
						stroke="rgba(148,163,184,0.65)"
						strokeWidth="1.5"
						strokeDasharray="4 3"
					/>
				) : null}
			</svg>
		</div>
	);
}
