import { useEffect, useMemo, useState } from "react";
import { formatAxisLabel, formatClockMs } from "../lib/combos";
import { binToHex, packetKey, paletteForBtn, remoteDisplayInfo } from "../lib/format";
import { MACRO_ACTION_TYPES, macroDisplayName } from "../lib/macros";
import ComboMacroEditor from "./ComboMacroEditor";
import ComboTimelineChart from "./ComboTimelineChart";
import MediaKeyPicker from "./MediaKeyPicker";
import RecordHoldTimeline from "./RecordHoldTimeline";

const WINDOW_MS = 15000;
const TICK_MS = 50;
const AXIS_H = 20;
const BASELINE_COLOR = "rgba(52, 211, 153, 0.55)";
const MAIN_AXIS_TICKS_MS = [0, 3000, 6000, 9000, 12000, 15000];
const MIN_LABEL_WIDTH_PX = 28;
const DURATION_LABEL_FONT_SIZE = 13;

function toMs(ts) {
	if (typeof ts !== "number" || Number.isNaN(ts)) return Date.now();
	return ts > 1e12 ? ts : ts * 1000;
}

function squareSegmentPath(xStart, xEnd, yZero, yOne) {
	return `M ${xStart} ${yZero} L ${xStart} ${yOne} L ${xEnd} ${yOne} L ${xEnd} ${yZero}`;
}

export default function PressTimelineGraph({
	tracks,
	remotes,
	connected,
	macroBindings,
	heldButtons,
	recordingPhase,
	recordSteps,
	recordSessionStart,
	onStartRecording,
	onCancelRecording,
	onUndoStep,
	onFinishRecording,
	onSaveCombo,
	onUpdateCombo,
	onDeleteCombo,
	savedCombos,
	ghostMatches,
}) {
	const [now, setNow] = useState(Date.now());
	const [recordFrozenAt, setRecordFrozenAt] = useState(null);
	const [comboName, setComboName] = useState("");
	const [nickname, setNickname] = useState("");
	const [actionType, setActionType] = useState("media");
	const [mediaKey, setMediaKey] = useState("playpause");
	const [savedCombosOpen, setSavedCombosOpen] = useState(false);

	const isRecording = recordingPhase === "recording";
	const isNaming = recordingPhase === "naming";
	const showRecorder = isRecording || isNaming;
	const recordNow = isNaming && recordFrozenAt != null ? recordFrozenAt : now;

	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), TICK_MS);
		return () => clearInterval(t);
	}, []);

	useEffect(() => {
		if (recordingPhase === "idle") {
			setRecordFrozenAt(null);
		}
	}, [recordingPhase]);

	const entries = useMemo(() => {
		return Object.values(tracks || {}).sort((a, b) => (b.last_at ?? 0) - (a.last_at ?? 0));
	}, [tracks]);

	const viewStart = now - WINDOW_MS;
	const width = 1000;
	const height = 300;
	const pad = { top: 36, right: 12, bottom: AXIS_H + 10, left: 12 };
	const innerW = width - pad.left - pad.right;
	const innerH = height - pad.top - pad.bottom;
	const yCenter = pad.top + innerH / 2;
	const pulseHalf = Math.min(80, innerH * 0.34);
	const yZero = yCenter;
	const yOne = yCenter - pulseHalf;
	const axisY = height - AXIS_H;
	const xFor = (ts) => pad.left + ((ts - viewStart) / WINDOW_MS) * innerW;
	const xForOffset = (offsetMs) => pad.left + (offsetMs / WINDOW_MS) * innerW;

	const { plotted, visibleLegend } = useMemo(() => {
		const pulseItems = [];
		const legendItems = [];

		for (const track of entries) {
			const remote = remoteDisplayInfo(track.remote_id, remotes?.[track.remote_id]);
			const palette = paletteForBtn(track.btn_id);
			const trackKey = packetKey(track.remote_id, track.btn_id);
			const isHeld = (track.segments ?? []).some((seg) => seg.end == null);
			const binding = macroBindings?.[trackKey];
			const macroName = binding?.actionType && binding.actionType !== "none" ? macroDisplayName(binding) : null;

			let visibleCount = 0;
			(track.segments ?? []).forEach((raw, segIdx) => {
				const segStart = toMs(raw.start);
				const segEnd = toMs(raw.end ?? now);
				if (segEnd < viewStart || segStart > now) return;

				const visStart = Math.max(segStart, viewStart);
				const visEnd = Math.min(segEnd, now);
				const isLive = raw.end == null;

				visibleCount += 1;
				pulseItems.push({
					key: `${trackKey}-${segIdx}`,
					seg: { start: visStart, end: visEnd },
					palette,
					durationMs: Math.max(0, segEnd - segStart),
					isLive,
				});
			});

			if (!visibleCount) continue;

			legendItems.push({
				key: trackKey,
				remote,
				btnHex: binToHex(track.btn_id),
				palette,
				isHeld,
				macroName,
				lastAt: track.last_at ?? 0,
			});
		}

		pulseItems.sort((a, b) => a.seg.start - b.seg.start);
		legendItems.sort((a, b) => b.lastAt - a.lastAt);

		return { plotted: pulseItems, visibleLegend: legendItems };
	}, [entries, remotes, macroBindings, viewStart, now]);

	const handleBeginSave = () => {
		if (recordSteps.length < 2) return;
		setRecordFrozenAt(Date.now());
		setComboName("");
		setNickname("");
		setActionType("media");
		setMediaKey("playpause");
		onFinishRecording();
	};

	const handleSave = () => {
		const name = comboName.trim();
		if (!name || recordSteps.length < 2 || actionType === "none") return;
		onSaveCombo({
			name,
			steps: recordSteps,
			nickname: nickname.trim(),
			actionType,
			mediaKey,
		});
		setComboName("");
		setNickname("");
		setActionType("media");
		setMediaKey("playpause");
	};

	const statusHint = !connected
		? "Backend offline"
		: visibleLegend.length === 0 && !isRecording
			? "Waiting for button presses"
			: null;

	return (
		<section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800/80 bg-[#0f1524]/40">
			<div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-3">
				<div>
					<h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
						Button Hold Timeline
					</h2>
					<p className="mt-0.5 text-[10px] text-slate-600">
						Last 15s · y=0 release baseline · y=1 while held
						{statusHint ? <span className="text-slate-500"> · {statusHint}</span> : null}
					</p>
				</div>
				{!showRecorder ? (
					<button
						type="button"
						onClick={onStartRecording}
						disabled={!connected}
						className="shrink-0 rounded border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300 hover:bg-violet-500/20 disabled:opacity-40"
					>
						Record combo
					</button>
				) : (
					<div className="flex items-center gap-2">
						<span className={`h-2 w-2 rounded-full bg-violet-400 ${isRecording ? "animate-pulse" : ""}`} />
						<span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
							{isNaming ? "Paused · name combo" : "Recording"}
						</span>
					</div>
				)}
			</div>

			<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
				{showRecorder && (
					<div className="shrink-0 space-y-2">
						<RecordHoldTimeline
							steps={recordSteps}
							heldButtons={heldButtons}
							recordingPhase={recordingPhase}
							sessionStart={recordSessionStart}
							now={recordNow}
							paused={isNaming}
						/>

						{isNaming ? (
							<div className="space-y-2 rounded-lg border border-slate-800/80 bg-[#0e1422] p-3">
								<p className="text-xs text-slate-400">
									{recordSteps.length} steps — name and assign macro
								</p>
								<input
									type="text"
									value={comboName}
									onChange={(e) => setComboName(e.target.value)}
									placeholder="Combo name"
									className="w-full rounded border border-slate-700 bg-[#0b0f19] px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none"
								/>
								<input
									type="text"
									value={nickname}
									onChange={(e) => setNickname(e.target.value)}
									placeholder="Macro nickname (optional)"
									className="w-full rounded border border-slate-700 bg-[#0b0f19] px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none"
								/>
								<select
									value={actionType}
									onChange={(e) => setActionType(e.target.value)}
									className="w-full rounded border border-slate-700 bg-[#0b0f19] px-2 py-1.5 text-xs text-slate-100 focus:border-violet-500/50 focus:outline-none"
								>
									{MACRO_ACTION_TYPES.filter((o) => o.value !== "none").map((opt) => (
										<option key={opt.value} value={opt.value}>
											{opt.label}
										</option>
									))}
								</select>
								{actionType === "media" ? (
									<MediaKeyPicker value={mediaKey} onChange={setMediaKey} />
								) : null}
								<div className="flex gap-2 pt-1">
									<button
										type="button"
										onClick={onCancelRecording}
										className="flex-1 rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-400 hover:border-slate-500"
									>
										Cancel
									</button>
									<button
										type="button"
										onClick={handleSave}
										disabled={!comboName.trim()}
										className="flex-1 rounded border border-violet-500/40 bg-violet-500/10 px-2 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-40"
									>
										Save
									</button>
								</div>
							</div>
						) : (
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={onUndoStep}
									disabled={recordSteps.length === 0}
									className="rounded border border-slate-700 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500 hover:border-slate-500 disabled:opacity-40"
								>
									Undo
								</button>
								<button
									type="button"
									onClick={onCancelRecording}
									className="rounded border border-slate-700 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500 hover:border-slate-500"
								>
									Cancel
								</button>
								<button
									type="button"
									onClick={handleBeginSave}
									disabled={recordSteps.length < 2}
									className="ml-auto rounded border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-300 hover:bg-violet-500/20 disabled:opacity-40"
								>
									Done · {recordSteps.length}
								</button>
							</div>
						)}
					</div>
				)}

				<div className="min-h-[200px] flex-1 overflow-hidden rounded border border-slate-800 bg-[#0b0f19]/70">
					<svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
						{MAIN_AXIS_TICKS_MS.map((offsetMs) => {
							const x = xForOffset(offsetMs);
							return (
								<g key={`axis-${offsetMs}`}>
									<line
										x1={x}
										y1={pad.top - 4}
										x2={x}
										y2={axisY}
										stroke="rgba(100,116,139,0.18)"
										strokeWidth="1"
									/>
									<text
										x={x}
										y={axisY + 14}
										textAnchor="middle"
										fill="#475569"
										fontSize="8"
										fontFamily="ui-monospace, monospace"
									>
										{formatAxisLabel(offsetMs)}
									</text>
								</g>
							);
						})}

						<line
							x1={pad.left}
							y1={axisY}
							x2={pad.left + innerW}
							y2={axisY}
							stroke="rgba(100,116,139,0.35)"
							strokeWidth="1"
						/>

						<line
							x1={pad.left}
							y1={yZero}
							x2={pad.left + innerW}
							y2={yZero}
							stroke={BASELINE_COLOR}
							strokeWidth="1.5"
						/>

						{plotted.map((item) => {
							const x1 = xFor(item.seg.start);
							const x2 = xFor(item.seg.end);
							const barWidth = x2 - x1;
							const showLabel = barWidth >= MIN_LABEL_WIDTH_PX;

							return (
								<g key={item.key}>
									<path
										d={squareSegmentPath(x1, x2, yZero, yOne)}
										fill="none"
										stroke={item.palette.base}
										strokeWidth="2"
										strokeLinejoin="miter"
										strokeLinecap="square"
									/>
									{showLabel ? (
										<text
											x={(x1 + x2) / 2}
											y={yOne - 8}
											textAnchor="middle"
											fill={item.isLive ? "#34d399" : "#cbd5e1"}
											fontSize={DURATION_LABEL_FONT_SIZE}
											fontFamily="ui-monospace, monospace"
											fontWeight={item.isLive ? "700" : "500"}
										>
											{formatClockMs(item.durationMs)}
										</text>
									) : null}
								</g>
							);
						})}
					</svg>
				</div>

				{visibleLegend.length > 0 ? (
					<div className="shrink-0 rounded-lg border border-slate-800/90 bg-[#0b0f19]/80 px-2.5 py-2">
						<p className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-slate-500">
							Active in window
						</p>
						<div className="flex flex-wrap gap-1.5">
							{visibleLegend.map((item) => (
								<div
									key={item.key}
									className="flex items-center gap-2 rounded-md border px-2 py-1.5"
									style={{
										borderColor: item.palette.border,
										backgroundColor: item.palette.soft,
									}}
								>
									<span
										className="h-2 w-6 shrink-0 rounded-sm"
										style={{ backgroundColor: item.palette.base }}
									/>
									<div className="min-w-0">
										<p className="max-w-[140px] truncate text-[11px] font-medium text-slate-200">
											{item.remote.title}
										</p>
										<p className="font-mono text-[9px] text-slate-500">0x{item.btnHex}</p>
										{item.macroName ? (
											<p className="mt-0.5 max-w-[160px] truncate text-[9px] font-medium text-slate-300">
												{item.macroName}
											</p>
										) : null}
									</div>
									{item.isHeld ? (
										<span className="shrink-0 rounded border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-emerald-300">
											Held
										</span>
									) : null}
								</div>
							))}
						</div>
					</div>
				) : null}

				{savedCombos.length > 0 ? (
					<div className="shrink-0 rounded-lg border border-slate-800/90 bg-[#0b0f19]/60 p-3">
						<button
							type="button"
							onClick={() => setSavedCombosOpen((v) => !v)}
							className="flex w-full items-center justify-between gap-2 text-left"
						>
							<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
								Saved combos ({savedCombos.length})
							</span>
							<span className="font-mono text-[10px] text-slate-600">{savedCombosOpen ? "−" : "+"}</span>
						</button>
						{savedCombosOpen ? (
							<div className="mt-2 space-y-2">
								{savedCombos.map((combo) => {
									const ghostState = ghostMatches?.[combo.id];
									const isGhostTarget = Boolean(ghostState);
									const ghost =
										isGhostTarget && ghostState
											? {
													active: [
														"active",
														"awaiting",
														"complete",
														"failed",
														"timing_mismatch",
													].includes(ghostState.status),
													sessionStart: ghostState.sessionStart,
													steps: ghostState.steps,
													status: ghostState.status,
													liveHeld: ghostState.liveHeld,
												}
											: null;

									return (
										<article
											key={combo.id}
											className={`rounded border bg-[#0e1422] p-2.5 ${
												isGhostTarget && ghostState?.status === "active"
													? "border-slate-500/50 ring-1 ring-slate-500/20"
													: isGhostTarget && ghostState?.status === "awaiting"
														? "border-violet-500/40 ring-1 ring-violet-500/20"
														: isGhostTarget && ghostState?.status === "complete"
															? "border-emerald-500/40 ring-1 ring-emerald-500/20"
															: isGhostTarget &&
																  (ghostState?.status === "failed" ||
																		ghostState?.status === "timing_mismatch")
																? "border-red-500/35 ring-1 ring-red-500/15"
																: "border-slate-800"
											}`}
										>
											<ComboMacroEditor
												combo={combo}
												onSave={onUpdateCombo}
												onDelete={onDeleteCombo}
											/>
											<div className="mt-2 border-t border-slate-800/80 pt-2">
												<ComboTimelineChart
													steps={combo.steps}
													remotes={remotes}
													ghost={ghost}
													now={now}
												/>
											</div>
										</article>
									);
								})}
							</div>
						) : null}
					</div>
				) : null}
			</div>
		</section>
	);
}
