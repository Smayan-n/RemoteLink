import { useCallback, useEffect, useRef, useState } from "react";
import HistoryPanel from "./components/HistoryPanel";
import MainNodeGraph from "./components/MainNodeGraph";
import MessagesPanel from "./components/MessagesPanel";
import PressTimelineGraph from "./components/PressTimelineGraph";
import {
	matchesComboSequence,
	normalizeComboSteps,
	stepButtonMatches,
} from "./lib/comboTimeline";
import { packetKey } from "./lib/format";
import { macroDisplayName } from "./lib/macros";

const WS_URL = "ws://localhost:5001";
const MAX_TIMESTAMPS = 100;
const TIMELINE_RETENTION_MS = 60000;

function toEventMs(ts) {
	if (typeof ts !== "number" || Number.isNaN(ts)) return Date.now();
	return ts > 1e12 ? ts : ts * 1000;
}

function pruneSegments(segments, cutoffMs) {
	return (segments ?? []).filter((seg) => (seg.end ?? Date.now()) >= cutoffMs);
}

export default function DashboardApp() {
	const [connected, setConnected] = useState(false);
	const [combos, setCombos] = useState({});
	const [sortedKeys, setSortedKeys] = useState([]);
	const [showFullHistory, setShowFullHistory] = useState(false);
	const [remotes, setRemotes] = useState({});
	const [remoteOrder, setRemoteOrder] = useState([]);
	const [draftNames, setDraftNames] = useState({});
	const [heldButtons, setHeldButtons] = useState({});
	const [zoomPress, setZoomPress] = useState(null);
	const [macroBindings, setMacroBindings] = useState({});
	const [selectedButton, setSelectedButton] = useState(null);
	const [mainView, setMainView] = useState("graph");
	const [pressTracks, setPressTracks] = useState({});
	const [savedCombos, setSavedCombos] = useState([]);
	const [recordingPhase, setRecordingPhase] = useState("idle");
	const [recordSteps, setRecordSteps] = useState([]);
	const [recordSessionStart, setRecordSessionStart] = useState(null);
	const [ghostMatches, setGhostMatches] = useState({});
	const [messagePressEvent, setMessagePressEvent] = useState(null);

	const wsRef = useRef(null);
	const reconnectTimer = useRef(null);
	const aliveRef = useRef(true);
	const macroBindingsRef = useRef(macroBindings);
	const recordingPhaseRef = useRef(recordingPhase);
	const savedCombosRef = useRef(savedCombos);
	const ghostMatchesRef = useRef(ghostMatches);
	const heldButtonsRef = useRef(heldButtons);
	const lastRecordEndMsRef = useRef(null);
	const ghostLastEndMsRef = useRef({});
	const ghostResetTimersRef = useRef({});

	useEffect(() => {
		macroBindingsRef.current = macroBindings;
	}, [macroBindings]);

	useEffect(() => {
		recordingPhaseRef.current = recordingPhase;
	}, [recordingPhase]);

	useEffect(() => {
		savedCombosRef.current = savedCombos;
	}, [savedCombos]);

	useEffect(() => {
		ghostMatchesRef.current = ghostMatches;
	}, [ghostMatches]);

	useEffect(() => {
		heldButtonsRef.current = heldButtons;
	}, [heldButtons]);

	const clearGhostTimer = useCallback((comboId) => {
		const timer = ghostResetTimersRef.current[comboId];
		if (timer) {
			clearTimeout(timer);
			delete ghostResetTimersRef.current[comboId];
		}
	}, []);

	const clearAllGhostTimers = useCallback(() => {
		for (const comboId of Object.keys(ghostResetTimersRef.current)) {
			clearTimeout(ghostResetTimersRef.current[comboId]);
		}
		ghostResetTimersRef.current = {};
	}, []);

	const dismissGhost = useCallback(
		(comboId) => {
			clearGhostTimer(comboId);
			setGhostMatches((prev) => {
				if (!prev[comboId]) return prev;
				const next = { ...prev };
				delete next[comboId];
				delete ghostLastEndMsRef.current[comboId];
				ghostMatchesRef.current = next;
				return next;
			});
		},
		[clearGhostTimer],
	);

	const scheduleGhostDismiss = useCallback(
		(comboId, delayMs = 2500) => {
			clearGhostTimer(comboId);
			ghostResetTimersRef.current[comboId] = setTimeout(() => {
				delete ghostResetTimersRef.current[comboId];
				dismissGhost(comboId);
			}, delayMs);
		},
		[clearGhostTimer, dismissGhost],
	);

	const scheduleGhostAwaitingTimeout = useCallback(
		(comboId) => {
			clearGhostTimer(comboId);
			ghostResetTimersRef.current[comboId] = setTimeout(() => {
				delete ghostResetTimersRef.current[comboId];
				setGhostMatches((prev) => {
					const ghost = prev[comboId];
					if (!ghost || ghost.status !== "awaiting") return prev;
					const next = {
						...prev,
						[comboId]: { ...ghost, status: "timing_mismatch" },
					};
					ghostMatchesRef.current = next;
					return next;
				});
				scheduleGhostDismiss(comboId, 3000);
			}, 3500);
		},
		[clearGhostTimer, scheduleGhostDismiss],
	);

	const makeGhostLiveHeld = useCallback((remote_id, btn_id, serverDownAt) => {
		const now = Date.now();
		return {
			remote_id,
			btn_id,
			clientDownAt: now,
			serverDownAt,
		};
	}, []);

	const startGhostMatches = useCallback(
		(combos, firstPress) => {
			clearAllGhostTimers();
			const now = Date.now();
			const next = {};
			const lastEnds = {};
			for (const combo of combos) {
				next[combo.id] = {
					comboId: combo.id,
					sessionStart: now,
					steps: [],
					liveHeld: firstPress
						? makeGhostLiveHeld(
								firstPress.remote_id,
								firstPress.btn_id,
								firstPress.serverDownAt,
							)
						: null,
					status: "active",
				};
				lastEnds[combo.id] = null;
			}
			ghostLastEndMsRef.current = lastEnds;
			ghostMatchesRef.current = next;
			setGhostMatches(next);
		},
		[makeGhostLiveHeld],
	);

	const sendWs = useCallback((payload) => {
		const ws = wsRef.current;
		if (ws?.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(payload));
		}
	}, []);

	const clearLog = useCallback(() => {
		setCombos({});
		setSortedKeys([]);
		setShowFullHistory(false);
		setHeldButtons({});
		setZoomPress(null);
		setPressTracks({});
	}, []);

	const registerRemote = useCallback(
		(remote_id) => {
			const name = (draftNames[remote_id] ?? "").trim();
			if (!name) return;
			setRemotes((prev) => ({
				...prev,
				[remote_id]: { ...prev[remote_id], registered: true, name },
			}));
			console.log(`[Registry] Registered remote 0x${remote_id} as "${name}"`);
		},
		[draftNames],
	);

	const renameRemote = useCallback((remote_id, name) => {
		const trimmed = name.trim();
		if (!trimmed) return;
		setRemotes((prev) => ({
			...prev,
			[remote_id]: { ...prev[remote_id], registered: true, name: trimmed },
		}));
	}, []);

	const saveMacroBinding = useCallback(
		(remoteId, btnId, binding) => {
			const key = packetKey(remoteId, btnId);
			const nickname = binding.nickname.trim();
			const actionType = binding.actionType;
			const mediaKey = binding.mediaKey ?? "playpause";

			setMacroBindings((prev) => {
				if (actionType === "none") {
					if (!prev[key]) return prev;
					const next = { ...prev };
					delete next[key];
					return next;
				}
				return {
					...prev,
					[key]: { nickname, actionType, mediaKey },
				};
			});

			sendWs({
				type: "set_binding",
				remote_id: remoteId,
				btn_id: btnId,
				action_type: actionType,
				nickname,
				media_key: mediaKey,
			});
		},
		[sendWs],
	);

	const ingestMacroResult = useCallback((payload) => {
		const remote_id = String(payload.remote_id ?? "");
		const btn_id = String(payload.btn_id ?? "");
		if (!remote_id || !btn_id) return;

		const key = packetKey(remote_id, btn_id);
		setCombos((prev) => {
			const existing = prev[key];
			if (!existing) return prev;
			return {
				...prev,
				[key]: {
					...existing,
					lastMacro: {
						...existing.lastMacro,
						status: payload.ok ? "ok" : "fail",
						at: Date.now(),
					},
				},
			};
		});
	}, []);

	const ensureRemoteButton = useCallback((remote_id, btn_id) => {
		setRemotes((prev) => {
			const existing = prev[remote_id];
			const buttons = new Set(existing?.buttons ?? []);
			buttons.add(btn_id);
			return {
				...prev,
				[remote_id]: {
					registered: existing?.registered ?? false,
					name: existing?.name ?? "",
					buttons: [...buttons],
				},
			};
		});
		setRemoteOrder((prev) => (prev.includes(remote_id) ? prev : [...prev, remote_id]));
	}, []);

	const ingestButtonDown = useCallback((payload) => {
		const remote_id = String(payload.remote_id ?? "");
		const btn_id = String(payload.btn_id ?? "");
		if (!remote_id || !btn_id) return;

		const atMs = toEventMs(Number(payload.at));
		const key = packetKey(remote_id, btn_id);
		const cutoff = Date.now() - TIMELINE_RETENTION_MS;

		ensureRemoteButton(remote_id, btn_id);

		if (recordingPhaseRef.current === "recording") {
			setRecordSessionStart((prev) => prev ?? atMs);
		} else if (recordingPhaseRef.current === "idle") {
			const ghosts = ghostMatchesRef.current;
			const activeGhosts = Object.values(ghosts).filter((g) => g.status === "active");
			const liveHeld = makeGhostLiveHeld(remote_id, btn_id, atMs);

			if (activeGhosts.length > 0) {
				const next = { ...ghosts };
				for (const comboId of Object.keys(next)) {
					if (next[comboId].status === "active") {
						next[comboId] = { ...next[comboId], liveHeld };
					}
				}
				ghostMatchesRef.current = next;
				setGhostMatches(next);
			} else {
				const starters = savedCombosRef.current.filter(
					(c) => c.steps?.[0] && stepButtonMatches(c.steps[0], remote_id, btn_id),
				);
				if (starters.length > 0) {
					startGhostMatches(starters, { remote_id, btn_id, serverDownAt: atMs });
				}
			}
		}

		setHeldButtons((prev) => ({
			...prev,
			[key]: { remote_id, btn_id, downAt: atMs },
		}));
		setZoomPress({ remote_id, btn_id, at: atMs });

		setPressTracks((prev) => {
			const existing = prev[key];
			const existingSegments = pruneSegments(existing?.segments ?? [], cutoff);
			const hasOpen = existingSegments.length && existingSegments[existingSegments.length - 1].end == null;

			const nextSegments = hasOpen
				? existingSegments
				: [...existingSegments, { start: atMs, end: null }];

			return {
				...prev,
				[key]: {
					remote_id,
					btn_id,
					last_at: atMs,
					segments: nextSegments,
				},
			};
		});
	}, [ensureRemoteButton, makeGhostLiveHeld, startGhostMatches]);

	const appendRecordStep = useCallback((remote_id, btn_id, atMs, durationMs, downAtMs) => {
		const gapMs =
			lastRecordEndMsRef.current == null
				? 0
				: Math.max(0, Math.round(downAtMs - lastRecordEndMsRef.current));

		setRecordSteps((prev) => [
			...prev,
			{
				remote_id,
				btn_id,
				duration_ms: Math.max(0, Math.round(durationMs)),
				gap_ms: gapMs,
				down_at: downAtMs,
				at: atMs,
			},
		]);
		lastRecordEndMsRef.current = atMs;
	}, []);

	const ingestButtonUp = useCallback((payload) => {
		const remote_id = String(payload.remote_id ?? "");
		const btn_id = String(payload.btn_id ?? "");
		if (!remote_id || !btn_id) return;

		const atMs = toEventMs(Number(payload.at));
		const durationRaw = Number(payload.duration ?? 0);
		const durationMs = Number.isFinite(durationRaw)
			? (durationRaw > 1000 ? durationRaw : durationRaw * 1000)
			: 0;
		const key = packetKey(remote_id, btn_id);
		const cutoff = Date.now() - TIMELINE_RETENTION_MS;

		const held = heldButtonsRef.current[key];
		const downAtMs = held?.downAt ?? Math.max(0, atMs - durationMs);

		if (recordingPhaseRef.current === "recording") {
			appendRecordStep(remote_id, btn_id, atMs, durationMs, downAtMs);
		} else if (recordingPhaseRef.current === "idle") {
			const prev = ghostMatchesRef.current;
			const activeIds = Object.keys(prev).filter((id) => prev[id]?.status === "active");
			if (activeIds.length > 0) {
				const next = { ...prev };
				for (const comboId of activeIds) {
					const ghost = next[comboId];
					const combo = savedCombosRef.current.find((c) => c.id === comboId);
					const stepIndex = ghost.steps.length;
					const expected = combo?.steps?.[stepIndex];

					if (!combo || !expected || !stepButtonMatches(expected, remote_id, btn_id)) {
						next[comboId] = { ...ghost, status: "failed", liveHeld: null };
						scheduleGhostDismiss(comboId, 2000);
						continue;
					}

					const lastEnd = ghostLastEndMsRef.current[comboId];
					const gapMs =
						lastEnd == null ? 0 : Math.max(0, Math.round(downAtMs - lastEnd));
					const clientAt = Date.now();
					const nextSteps = [
						...ghost.steps,
						{
							remote_id,
							btn_id,
							duration_ms: Math.max(0, Math.round(durationMs)),
							gap_ms: gapMs,
							down_at: downAtMs,
							at: atMs,
							clientAt,
						},
					];
					ghostLastEndMsRef.current[comboId] = atMs;

					if (nextSteps.length === combo.steps.length) {
						if (matchesComboSequence(nextSteps, combo.steps)) {
							next[comboId] = {
								...ghost,
								steps: nextSteps,
								liveHeld: null,
								status: "awaiting",
							};
							scheduleGhostAwaitingTimeout(comboId);
						} else {
							next[comboId] = {
								...ghost,
								steps: nextSteps,
								liveHeld: null,
								status: "timing_mismatch",
							};
							scheduleGhostDismiss(comboId, 3000);
						}
					} else {
						next[comboId] = {
							...ghost,
							steps: nextSteps,
							liveHeld: null,
						};
					}
				}

				ghostMatchesRef.current = next;
				setGhostMatches(next);
			}
		}

		setHeldButtons((prev) => {
			if (!prev[key]) return prev;
			const next = { ...prev };
			delete next[key];
			return next;
		});

		setPressTracks((prev) => {
			const existing = prev[key];
			const existingSegments = pruneSegments(existing?.segments ?? [], cutoff);
			const segments = [...existingSegments];
			const last = segments[segments.length - 1];
			if (last && last.end == null) {
				last.end = atMs;
			} else {
				segments.push({
					start: Math.max(cutoff, atMs - Math.max(0, durationMs)),
					end: atMs,
				});
			}

			return {
				...prev,
				[key]: {
					remote_id,
					btn_id,
					last_at: atMs,
					segments: pruneSegments(segments, cutoff),
				},
			};
		});
		setMessagePressEvent({
			id: `${remote_id}-${btn_id}-${atMs}`,
			remote_id,
			btn_id,
			duration_ms: Math.max(0, Math.round(durationMs)),
			at: atMs,
		});
	}, [
		appendRecordStep,
		scheduleGhostAwaitingTimeout,
		scheduleGhostDismiss,
	]);

	const startComboRecording = useCallback(() => {
		setRecordSteps([]);
		lastRecordEndMsRef.current = null;
		setRecordSessionStart(null);
		setRecordingPhase("recording");
	}, []);

	const cancelComboRecording = useCallback(() => {
		setRecordSteps([]);
		lastRecordEndMsRef.current = null;
		setRecordSessionStart(null);
		setRecordingPhase("idle");
		clearAllGhostTimers();
		setGhostMatches({});
		ghostLastEndMsRef.current = {};
		ghostMatchesRef.current = {};
	}, [clearAllGhostTimers]);

	const undoRecordStep = useCallback(() => {
		setRecordSteps((prev) => {
			const next = prev.slice(0, -1);
			const last = next[next.length - 1];
			lastRecordEndMsRef.current = last?.at ?? null;
			return next;
		});
	}, []);

	const finishComboRecording = useCallback(() => {
		setRecordingPhase("naming");
	}, []);

	const saveCombo = useCallback(
		({ name, steps, nickname, actionType, mediaKey }) => {
			const payload = {
				type: "save_combo",
				combo: {
					id: crypto.randomUUID(),
					name,
					schema_version: 2,
					steps: steps.map(({ remote_id, btn_id, duration_ms, gap_ms }) => ({
						remote_id,
						btn_id,
						duration_ms,
						gap_ms,
					})),
					action_type: actionType,
					nickname,
					media_key: mediaKey,
				},
			};
			sendWs(payload);
			setRecordSteps([]);
			lastRecordEndMsRef.current = null;
			setRecordSessionStart(null);
			setRecordingPhase("idle");
		},
		[sendWs],
	);

	const updateCombo = useCallback(
		({ id, name, steps, nickname, actionType, mediaKey }) => {
			sendWs({
				type: "save_combo",
				combo: {
					id,
					name,
					schema_version: 2,
					steps: steps.map(({ remote_id, btn_id, duration_ms, gap_ms }) => ({
						remote_id,
						btn_id,
						duration_ms,
						gap_ms,
					})),
					action_type: actionType,
					nickname,
					media_key: mediaKey,
				},
			});
		},
		[sendWs],
	);

	const deleteCombo = useCallback(
		(id) => {
			sendWs({ type: "delete_combo", id });
		},
		[sendWs],
	);

	const handleMainViewChange = useCallback(
		(view) => {
			setMainView(view);
			if (view !== "timeline") {
				cancelComboRecording();
			}
		},
		[cancelComboRecording],
	);

	const ingestPacket = useCallback((remote_id, btn_id) => {
		setSelectedButton((prev) => {
			if (prev?.remoteId === remote_id && prev?.btnId === btn_id) {
				return prev;
			}
			return { remoteId: remote_id, btnId: btn_id };
		});

		const now = Date.now();
		const key = packetKey(remote_id, btn_id);
		const binding = macroBindingsRef.current[key];
		const hasMacro = binding?.actionType && binding.actionType !== "none";
		const lastMacro = hasMacro ? { status: "pending", name: macroDisplayName(binding) } : { status: "none" };

		setCombos((prev) => {
			const existing = prev[key];
			const timestamps = existing ? [now, ...existing.timestamps].slice(0, MAX_TIMESTAMPS) : [now];
			return {
				...prev,
				[key]: { remote_id, btn_id, timestamps, lastAt: now, lastMacro },
			};
		});

		setSortedKeys((prev) => [key, ...prev.filter((k) => k !== key)]);

		setRemotes((prev) => {
			const existing = prev[remote_id];
			const buttons = new Set(existing?.buttons ?? []);
			const hadButton = buttons.has(btn_id);
			buttons.add(btn_id);
			return {
				...prev,
				[remote_id]: {
					registered: existing?.registered ?? false,
					name: existing?.name ?? "",
					buttons: [...buttons],
				},
			};
		});

		setRemoteOrder((prev) => (prev.includes(remote_id) ? prev : [...prev, remote_id]));
	}, []);

	useEffect(() => {
		aliveRef.current = true;

		function connect() {
			if (!aliveRef.current) return;
			const ws = new WebSocket(WS_URL);
			wsRef.current = ws;

			ws.onopen = () => {
				if (!aliveRef.current) return;
				setConnected(true);
			};
			ws.onclose = () => {
				if (!aliveRef.current) return;
				setConnected(false);
				reconnectTimer.current = setTimeout(connect, 2000);
			};
			ws.onerror = () => ws.close();

			ws.onmessage = (message) => {
				if (!aliveRef.current) return;
				try {
					const payload = JSON.parse(message.data);
					const msgType = payload.type ?? (payload.remote_id && payload.btn_id ? "packet" : null);

					if (msgType === "packet") {
						const remote_id = String(payload.remote_id ?? "");
						const btn_id = String(payload.btn_id ?? "");
						if (!remote_id || !btn_id) return;
						ingestPacket(remote_id, btn_id);
						return;
					}

					if (msgType === "macro_result") {
						ingestMacroResult(payload);
						return;
					}

					if (msgType === "bindings_snapshot") {
						const items = payload.bindings ?? [];
						const next = {};
						for (const item of items) {
							const remote_id = String(item.remote_id ?? "");
							const btn_id = String(item.btn_id ?? "");
							if (!remote_id || !btn_id) continue;
							const key = packetKey(remote_id, btn_id);
							next[key] = {
								nickname: String(item.nickname ?? ""),
								actionType: String(item.action_type ?? "none"),
								mediaKey: String(item.media_key ?? "playpause"),
							};
						}
						setMacroBindings(next);
						return;
					}

					if (msgType === "button_down") {
						ingestButtonDown(payload);
						return;
					}

					if (msgType === "button_up") {
						ingestButtonUp(payload);
						return;
					}

					if (msgType === "combos_snapshot") {
						const items = payload.combos ?? [];
						setSavedCombos(
							items.map((c) => ({
								id: String(c.id ?? ""),
								name: String(c.name ?? ""),
								steps: normalizeComboSteps(
									(c.steps ?? []).map((s) => ({
										remote_id: String(s.remote_id ?? ""),
										btn_id: String(s.btn_id ?? ""),
										duration_ms: Number(s.duration_ms ?? 0),
										gap_ms: Number(s.gap_ms ?? 0),
									})),
									Number(c.schema_version ?? 1),
								),
								action_type: String(c.action_type ?? "none"),
								nickname: String(c.nickname ?? ""),
								media_key: String(c.media_key ?? "playpause"),
							})),
						);
						return;
					}

					if (msgType === "combo_triggered") {
						const comboId = String(payload.combo_id ?? "");
						if (comboId) {
							clearGhostTimer(comboId);
							setGhostMatches((prev) => {
								const existing = prev[comboId];
								const next = {
									...prev,
									[comboId]: {
										comboId,
										sessionStart: existing?.sessionStart ?? Date.now(),
										steps: existing?.steps ?? [],
										liveHeld: null,
										status: "complete",
									},
								};
								ghostMatchesRef.current = next;
								return next;
							});
							scheduleGhostDismiss(comboId, 2500);
						}
						return;
					}
				} catch {
					// ignore malformed payloads
				}
			};
		}

		connect();
		return () => {
			aliveRef.current = false;
			if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
			wsRef.current?.close();
			wsRef.current = null;
		};
	}, [
		ingestPacket,
		ingestMacroResult,
		ingestButtonDown,
		ingestButtonUp,
		clearGhostTimer,
		scheduleGhostDismiss,
	]);

	const registeredCount = Object.values(remotes).filter((r) => r.registered).length;

	return (
		<div className="flex h-screen flex-col bg-[#0b0f19] text-slate-100">
			<header className="shrink-0 border-b border-slate-800/80 bg-[#0b0f19]/95 px-4 py-2.5 backdrop-blur sm:px-5">
				<div className="flex items-center justify-between gap-4">
					<h1 className="font-mono text-xl font-bold tracking-tight text-neon-emerald sm:text-2xl">
						RemoteLink
					</h1>

					<div className="flex items-center gap-2">
						<ViewToggle view={mainView} onChange={handleMainViewChange} />
						<div
							className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 ${
								connected ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"
							}`}
						>
							<span
								className={`h-2 w-2 rounded-full ${
									connected
										? "animate-pulse bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
										: "bg-red-500"
								}`}
							/>
							<span
								className={`font-mono text-[11px] font-bold uppercase tracking-wider ${
									connected ? "text-emerald-400" : "text-red-400"
								}`}
							>
								{connected ? "Connected" : "Disconnected"}
							</span>
						</div>
					</div>
				</div>
			</header>

			<main className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[3fr_1fr] lg:gap-5 lg:p-5">
				{mainView === "graph" ? (
					<MainNodeGraph
						remotes={remotes}
						remoteOrder={remoteOrder}
						heldButtons={heldButtons}
						zoomPress={zoomPress}
						draftNames={draftNames}
						setDraftNames={setDraftNames}
						onRegister={registerRemote}
						onRenameRemote={renameRemote}
						selectedButton={selectedButton}
						onSelectButton={setSelectedButton}
						macroBindings={macroBindings}
						connected={connected}
					/>
				) : mainView === "timeline" ? (
					<PressTimelineGraph
						tracks={pressTracks}
						remotes={remotes}
						connected={connected}
						macroBindings={macroBindings}
						heldButtons={heldButtons}
						recordingPhase={recordingPhase}
						recordSteps={recordSteps}
						recordSessionStart={recordSessionStart}
						onStartRecording={startComboRecording}
						onCancelRecording={cancelComboRecording}
						onUndoStep={undoRecordStep}
						onFinishRecording={finishComboRecording}
						onSaveCombo={saveCombo}
						onUpdateCombo={updateCombo}
						onDeleteCombo={deleteCombo}
						savedCombos={savedCombos}
						ghostMatches={ghostMatches}
					/>
				) : (
					<MessagesPanel
						remotes={remotes}
						heldButtons={heldButtons}
						messagePressEvent={messagePressEvent}
					/>
				)}

				<HistoryPanel
					combos={combos}
					sortedKeys={sortedKeys}
					showFullHistory={showFullHistory}
					onToggleHistory={() => setShowFullHistory((v) => !v)}
					onClear={clearLog}
					connected={connected}
					heldButtons={heldButtons}
					selectedButton={selectedButton}
					macroBindings={macroBindings}
					onSaveMacro={saveMacroBinding}
					onClearSelection={() => setSelectedButton(null)}
					remotes={remotes}
				/>
			</main>

			<footer className="border-t border-slate-800/60 px-4 py-2 text-center font-mono text-[10px] text-slate-600">
				{registeredCount} of {remoteOrder.length} remotes registered
			</footer>
		</div>
	);
}

function ViewToggle({ view, onChange }) {
	return (
		<div className="inline-flex rounded-md border border-slate-700 bg-slate-900/70 p-0.5">
			<button
				type="button"
				onClick={() => onChange("graph")}
				className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
					view === "graph"
						? "bg-emerald-500/15 text-emerald-300"
						: "text-slate-400 hover:text-slate-200"
				}`}
			>
				Graph
			</button>
			<button
				type="button"
				onClick={() => onChange("timeline")}
				className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
					view === "timeline"
						? "bg-emerald-500/15 text-emerald-300"
						: "text-slate-400 hover:text-slate-200"
				}`}
			>
				Timeline
			</button>
			<button
				type="button"
				onClick={() => onChange("messages")}
				className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
					view === "messages"
						? "bg-emerald-500/15 text-emerald-300"
						: "text-slate-400 hover:text-slate-200"
				}`}
			>
				Messages
			</button>
		</div>
	);
}
