import { useEffect, useMemo, useRef, useState } from "react";
import { binToHex, remoteDisplayInfo } from "../lib/format";

const STORAGE_KEY = "remoteLink.messageSchemes.v1";
const SHIFT_TOKEN = "__SHIFT__";
const SPACE_TOKEN = "__SPACE__";
const BACKSPACE_TOKEN = "__BACKSPACE__";
const SYMBOLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
const EXTRA_SYMBOLS = [SPACE_TOKEN, BACKSPACE_TOKEN];
const MAPPABLE_COUNT = SYMBOLS.length + EXTRA_SYMBOLS.length;

function emptySlot() {
	return { short: "", long: "" };
}

function createScheme(name = "Scheme 1") {
	return {
		id: crypto.randomUUID(),
		name,
		mappings: {
			normal: {},
			shifted: {},
		},
	};
}

function loadSchemes() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [createScheme()];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed) || parsed.length === 0) return [createScheme()];
		return parsed.map((scheme) => ({
			id: String(scheme.id ?? crypto.randomUUID()),
			name: String(scheme.name ?? "Scheme"),
			mappings: {
				normal: scheme.mappings?.normal ?? {},
				shifted: scheme.mappings?.shifted ?? {},
			},
		}));
	} catch {
		return [createScheme()];
	}
}

function bindingKey(remote_id, btn_id) {
	return `${remote_id}-${btn_id}`;
}

function splitBinding(key) {
	const idx = key.lastIndexOf("-");
	if (idx < 0) return { remote_id: key, btn_id: "" };
	return { remote_id: key.slice(0, idx), btn_id: key.slice(idx + 1) };
}

function decodePressType(durationMs, thresholdMs) {
	return durationMs >= thresholdMs ? "long" : "short";
}

function symbolLabel(value) {
	if (!value) return "Unmapped";
	if (value === SHIFT_TOKEN) return "Shift";
	if (value === SPACE_TOKEN) return "Space";
	if (value === BACKSPACE_TOKEN) return "Backspace";
	return value;
}

function slotDisplay(value) {
	if (!value) return "—";
	if (value === SHIFT_TOKEN) return "⇧";
	if (value === SPACE_TOKEN) return "␣";
	if (value === BACKSPACE_TOKEN) return "⌫";
	return value;
}

function extraSymbolLabel(token) {
	if (token === SPACE_TOKEN) return "␣";
	if (token === BACKSPACE_TOKEN) return "⌫";
	return token;
}

function mappedToText(value) {
	if (value === SPACE_TOKEN) return " ";
	return value;
}

function applyMappedToLiveText(mapped, setLiveText) {
	if (mapped === BACKSPACE_TOKEN) {
		setLiveText((prev) => prev.slice(0, -1));
		return;
	}
	setLiveText((prev) => prev + mappedToText(mapped));
}

function mappedCount(mapping) {
	let count = 0;
	for (const slot of Object.values(mapping ?? {})) {
		if (slot?.short && slot.short !== SHIFT_TOKEN) count += 1;
		if (slot?.long && slot.long !== SHIFT_TOKEN) count += 1;
	}
	return count;
}

function mostRecentHeld(heldButtons) {
	let best = null;
	for (const held of Object.values(heldButtons ?? {})) {
		if (!best || (held.downAt ?? 0) > (best.downAt ?? 0)) best = held;
	}
	return best;
}

function lookupMapped(scheme, layer, key, pressType) {
	return scheme?.mappings?.[layer]?.[key]?.[pressType] ?? "";
}

function LivePressDisplay({ held, release, thresholdMs, shiftArmed, scheme, now }) {
	const isDown = Boolean(held);
	const remote_id = held?.remote_id ?? release?.remote_id;
	const btn_id = held?.btn_id ?? release?.btn_id;
	const key = remote_id && btn_id ? bindingKey(remote_id, btn_id) : null;

	if (!isDown && !release) {
		return <p className="text-xs text-slate-500">Press a remote button…</p>;
	}

	const elapsedMs = isDown
		? Math.max(0, now - (held.downAt ?? now))
		: Math.max(0, release.duration_ms ?? 0);
	const pressType = decodePressType(elapsedMs, thresholdMs);
	const layer = (isDown ? shiftArmed : release.shiftWasActive) ? "shifted" : "normal";
	const mapped = key ? lookupMapped(scheme, layer, key, pressType) : "";
	const fillPct = Math.min(100, (elapsedMs / thresholdMs) * 100);
	const isLong = pressType === "long";

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-2">
				<p className="font-mono text-sm text-emerald-300">0x{binToHex(btn_id)}</p>
				<span
					className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
						isDown
							? "animate-pulse border border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
							: "border border-slate-600 bg-slate-800 text-slate-400"
					}`}
				>
					{isDown ? "Down" : "Released"}
				</span>
			</div>

			<div>
				<div className="mb-1 flex items-baseline justify-between text-[10px]">
					<span className={isLong ? "font-semibold text-amber-300" : "font-semibold text-violet-300"}>
						{pressType}
					</span>
					<span className="font-mono tabular-nums text-slate-500">
						{Math.round(elapsedMs)}ms / {thresholdMs}ms
					</span>
				</div>
				<div className="h-3 overflow-hidden rounded-full bg-slate-800 ring-1 ring-slate-700/80">
					<div
						className={`h-full rounded-full transition-[width] duration-75 ${
							isLong ? "bg-amber-400" : "bg-violet-400"
						}`}
						style={{ width: `${fillPct}%` }}
					/>
				</div>
				<div className="mt-1 flex justify-between text-[9px] text-slate-600">
					<span>short</span>
					<span>threshold</span>
					<span>long</span>
				</div>
			</div>

			<div className="flex items-center justify-between rounded border border-slate-700/80 bg-slate-900/50 px-2.5 py-2">
				<span className="text-[10px] uppercase tracking-wider text-slate-500">
					{layer}
					{isDown && shiftArmed ? " · shift armed" : ""}
				</span>
				<span className="font-mono text-lg font-bold text-cyan-300">
					{mapped ? symbolLabel(mapped) : "—"}
				</span>
			</div>
		</div>
	);
}

export default function MessagesPanel({ remotes, heldButtons, messagePressEvent }) {
	const [schemes, setSchemes] = useState(() => loadSchemes());
	const [selectedSchemeId, setSelectedSchemeId] = useState(() => loadSchemes()[0].id);
	const [activeLayer, setActiveLayer] = useState("normal");
	const [panelMode, setPanelMode] = useState("assignment");
	const [thresholdMs, setThresholdMs] = useState(1000);
	const [liveEnabled, setLiveEnabled] = useState(true);
	const [liveText, setLiveText] = useState("");
	const [shiftArmed, setShiftArmed] = useState(false);
	const [lastPressKey, setLastPressKey] = useState(null);
	const [mappingTarget, setMappingTarget] = useState(null);
	const [lastRelease, setLastRelease] = useState(null);
	const [decodeTick, setDecodeTick] = useState(() => Date.now());
	const lastHandledEventIdRef = useRef(null);

	const activeHeld = useMemo(() => mostRecentHeld(heldButtons), [heldButtons]);

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(schemes));
	}, [schemes]);

	useEffect(() => {
		if (!schemes.some((s) => s.id === selectedSchemeId)) {
			setSelectedSchemeId(schemes[0]?.id ?? "");
		}
	}, [schemes, selectedSchemeId]);

	useEffect(() => {
		if (panelMode !== "decoding" || !activeHeld) return;
		let frame;
		const loop = () => {
			setDecodeTick(Date.now());
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(frame);
	}, [panelMode, activeHeld]);

	const scheme = useMemo(
		() => schemes.find((s) => s.id === selectedSchemeId) ?? null,
		[schemes, selectedSchemeId],
	);

	const updateScheme = (updater) => {
		setSchemes((prev) =>
			prev.map((item) => (item.id === selectedSchemeId ? updater(item) : item)),
		);
	};

	const ensureSlot = (targetScheme, layer, key) => {
		const slot = targetScheme.mappings[layer][key];
		if (slot?.short != null && slot?.long != null) return targetScheme;
		return {
			...targetScheme,
			mappings: {
				...targetScheme.mappings,
				[layer]: {
					...targetScheme.mappings[layer],
					[key]: { ...(slot ?? {}), ...emptySlot(), ...(slot ?? {}) },
				},
			},
		};
	};

	const assignValue = (layer, key, pressType, value) => {
		updateScheme((current) => {
			let next = ensureSlot(current, "normal", key);
			next = ensureSlot(next, "shifted", key);

			const normalized = value;
			const normal = { ...next.mappings.normal };
			const shifted = { ...next.mappings.shifted };

			if (normalized && normalized !== SHIFT_TOKEN) {
				for (const map of [normal, shifted]) {
					for (const k of Object.keys(map)) {
						const slot = { ...(map[k] ?? emptySlot()) };
						if (slot.short === normalized) slot.short = "";
						if (slot.long === normalized) slot.long = "";
						map[k] = slot;
					}
				}
			}

			const targetMap = layer === "shifted" ? shifted : normal;
			const slot = { ...(targetMap[key] ?? emptySlot()) };
			slot[pressType] = normalized;
			targetMap[key] = slot;

			next = {
				...next,
				mappings: {
					normal,
					shifted,
				},
			};
			return next;
		});
	};

	const addScheme = () => {
		setSchemes((prev) => {
			const next = [...prev, createScheme(`Scheme ${prev.length + 1}`)];
			setSelectedSchemeId(next[next.length - 1].id);
			return next;
		});
		setLiveText("");
		setShiftArmed(false);
	};

	const deleteScheme = () => {
		if (!scheme || schemes.length <= 1) return;
		setSchemes((prev) => prev.filter((s) => s.id !== selectedSchemeId));
	};

	const setSchemeName = (name) => {
		updateScheme((current) => ({ ...current, name }));
	};

	const symbolFromKeyboard = (key) => {
		if (key === "Shift") return SHIFT_TOKEN;
		if (key === " " || key === "Spacebar") return SPACE_TOKEN;
		if (key === "Backspace") return BACKSPACE_TOKEN;
		if (key.length === 1 && /^[a-z0-9]$/i.test(key)) return key.toUpperCase();
		return null;
	};

	useEffect(() => {
		if (!messagePressEvent || !scheme) return;
		if (messagePressEvent.id === lastHandledEventIdRef.current) return;
		lastHandledEventIdRef.current = messagePressEvent.id;
		const key = bindingKey(messagePressEvent.remote_id, messagePressEvent.btn_id);
		setLastPressKey(key);

		updateScheme((current) => {
			let next = ensureSlot(current, "normal", key);
			next = ensureSlot(next, "shifted", key);
			return next;
		});

		const shiftBefore = shiftArmed;
		const layer = shiftBefore ? "shifted" : "normal";
		const pressType = decodePressType(messagePressEvent.duration_ms, thresholdMs);
		const mapped = scheme.mappings[layer]?.[key]?.[pressType] ?? "";
		setLastRelease({
			remote_id: messagePressEvent.remote_id,
			btn_id: messagePressEvent.btn_id,
			pressType,
			duration_ms: messagePressEvent.duration_ms,
			shiftWasActive: shiftBefore,
			layer,
			mapped: mapped || null,
		});

		if (!liveEnabled) return;

		if (mapped === SHIFT_TOKEN) {
			setShiftArmed(true);
			return;
		}

		if (mapped) {
			applyMappedToLiveText(mapped, setLiveText);
		}
		if (shiftArmed) setShiftArmed(false);
	}, [liveEnabled, messagePressEvent, scheme, shiftArmed, thresholdMs]);

	useEffect(() => {
		if (!mappingTarget) return;
		const onKeyDown = (e) => {
			if (e.key === "Escape") {
				setMappingTarget(null);
				return;
			}
			if (e.key === "Delete") {
				e.preventDefault();
				assignValue(activeLayer, mappingTarget.key, mappingTarget.pressType, "");
				setMappingTarget(null);
				return;
			}
			const symbol = symbolFromKeyboard(e.key);
			if (!symbol) return;
			e.preventDefault();
			assignValue(activeLayer, mappingTarget.key, mappingTarget.pressType, symbol);
			setMappingTarget(null);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [activeLayer, mappingTarget]);

	const layerMap = scheme?.mappings?.[activeLayer] ?? {};
	const pressEntries = useMemo(() => {
		if (!scheme) return [];
		const keys = new Set([
			...Object.keys(scheme.mappings.normal ?? {}),
			...Object.keys(scheme.mappings.shifted ?? {}),
		]);
		return [...keys].map((key) => {
			const { remote_id, btn_id } = splitBinding(key);
			return {
				key,
				remote_id,
				btn_id,
				normal: scheme.mappings.normal?.[key] ?? emptySlot(),
				shifted: scheme.mappings.shifted?.[key] ?? emptySlot(),
			};
		});
	}, [scheme]);

	const symbolAssignments = useMemo(() => {
		const out = {};
		if (!scheme) return out;
		for (const symbol of SYMBOLS) out[symbol] = { normal: false, shifted: false };
		for (const token of EXTRA_SYMBOLS) out[token] = { normal: false, shifted: false };
		for (const [layerName, map] of Object.entries(scheme.mappings ?? {})) {
			for (const slot of Object.values(map ?? {})) {
				for (const v of [slot?.short, slot?.long]) {
					if (!v || v === SHIFT_TOKEN || !out[v]) continue;
					out[v][layerName] = true;
				}
			}
		}
		return out;
	}, [scheme]);

	const totalMappedSymbols = useMemo(() => {
		let count = 0;
		for (const symbol of [...SYMBOLS, ...EXTRA_SYMBOLS]) {
			const info = symbolAssignments[symbol];
			if (info?.normal || info?.shifted) count += 1;
		}
		return count;
	}, [symbolAssignments]);

	return (
		<section className="rounded-xl border border-slate-800/80 bg-[#0b0f19]/70 p-4">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/70 pb-3">
				<div>
					<p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Messages</p>
					<p className="text-[11px] text-slate-400">
						Map symbols to short/long presses and decode live text.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<select
						value={selectedSchemeId}
						onChange={(e) => setSelectedSchemeId(e.target.value)}
						className="rounded border border-slate-700 bg-[#0b0f19] px-2 py-1.5 text-xs"
					>
						{schemes.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</select>
					<button
						type="button"
						onClick={addScheme}
						className="rounded border border-emerald-500/35 bg-emerald-500/10 px-2 py-1.5 text-xs font-semibold text-emerald-300"
					>
						New scheme
					</button>
					<button
						type="button"
						onClick={deleteScheme}
						disabled={schemes.length <= 1}
						className="rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-400 disabled:opacity-40"
					>
						Delete
					</button>
				</div>
			</div>

			{scheme ? (
				<div className="mt-3 grid gap-4 lg:grid-cols-[1.05fr_1.95fr]">
					<div className="space-y-3">
						<label className="block">
							<span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
								Scheme name
							</span>
							<input
								value={scheme.name}
								onChange={(e) => setSchemeName(e.target.value)}
								className="w-full rounded border border-slate-700 bg-[#0b0f19] px-2 py-1.5 text-xs"
							/>
						</label>

						<div className="rounded border border-slate-800 bg-[#0e1422] p-2.5">
							<div className="mb-2 flex items-center justify-between">
								<p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
									Mapping layer
								</p>
								<p className="text-[10px] text-slate-500">
									{activeLayer === "normal" ? "Default" : "Shifted"}
								</p>
							</div>
							<div className="inline-flex rounded border border-slate-700 p-0.5">
								<button
									type="button"
									onClick={() => setActiveLayer("normal")}
									className={`rounded px-2 py-1 text-[10px] font-semibold ${
										activeLayer === "normal"
											? "bg-emerald-500/15 text-emerald-300"
											: "text-slate-400"
									}`}
								>
									Normal
								</button>
								<button
									type="button"
									onClick={() => setActiveLayer("shifted")}
									className={`rounded px-2 py-1 text-[10px] font-semibold ${
										activeLayer === "shifted"
											? "bg-violet-500/15 text-violet-300"
											: "text-slate-400"
									}`}
								>
									Shifted
								</button>
							</div>
						</div>

						<div className="rounded border border-slate-800 bg-[#0e1422] p-2.5">
							<div className="mb-2 flex items-center justify-between">
								<p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
									Symbol coverage
								</p>
								<p className="text-[10px] text-slate-500">
									{totalMappedSymbols}/{MAPPABLE_COUNT} mapped
								</p>
							</div>
							<div className="flex flex-wrap gap-1">
								{[...SYMBOLS, ...EXTRA_SYMBOLS].map((symbol) => {
									const info = symbolAssignments[symbol] ?? { normal: false, shifted: false };
									const mapped = info.normal || info.shifted;
									const label = EXTRA_SYMBOLS.includes(symbol)
										? extraSymbolLabel(symbol)
										: symbol;
									return (
										<span
											key={symbol}
											className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
												info.normal && info.shifted
													? "border-cyan-500/35 bg-cyan-500/10 text-cyan-300"
													: info.shifted
														? "border-violet-500/35 bg-violet-500/10 text-violet-300"
														: info.normal
															? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
															: "border-slate-700 text-slate-500"
											}`}
										>
											{label}
											{mapped ? (
												<span className="ml-1 text-[8px] opacity-80">
													{info.normal && info.shifted
														? "N+S"
														: info.shifted
															? "S"
															: "N"}
												</span>
											) : null}
										</span>
									);
								})}
							</div>
						</div>

					</div>

					<div className="rounded border border-slate-800 bg-[#0e1422] p-3">
						<div className="mb-3 flex items-center justify-between">
							<div>
								<p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
									{panelMode === "assignment" ? "Button mappings" : "Decoding"}
								</p>
								<p className="text-[10px] text-slate-500">
									{panelMode === "assignment"
										? "Press remote buttons to add cards. Click Short/Long, then type A-Z or 0-9."
										: "Live decode stream from the current scheme."}
								</p>
							</div>
							<div className="inline-flex rounded border border-slate-700 p-0.5">
								<button
									type="button"
									onClick={() => setPanelMode("assignment")}
									className={`rounded px-2 py-1 text-[10px] font-semibold ${
										panelMode === "assignment"
											? "bg-emerald-500/15 text-emerald-300"
											: "text-slate-400"
									}`}
								>
									Assignment
								</button>
								<button
									type="button"
									onClick={() => setPanelMode("decoding")}
									className={`rounded px-2 py-1 text-[10px] font-semibold ${
										panelMode === "decoding"
											? "bg-emerald-500/15 text-emerald-300"
											: "text-slate-400"
									}`}
								>
									Decoding
								</button>
							</div>
						</div>

						{panelMode === "assignment" ? (
							<>
								<div className="mb-2 rounded border border-slate-800 bg-[#0b0f19]/80 px-2 py-1.5 text-[10px] text-slate-500">
									{mappingTarget
										? "Typing mode: A-Z / 0-9, Spacebar for space, Backspace for backspace, Shift for shift-function, Delete to clear, Esc to cancel."
										: "Compact cards in a scrollable grid. Each symbol can be assigned only once across normal+shifted."}
								</div>
								<div className="max-h-[470px] overflow-y-auto pr-1">
									<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
										{pressEntries.length === 0 ? (
											<div className="col-span-full rounded border border-dashed border-slate-700 px-3 py-6 text-center text-[11px] text-slate-500">
												No button presses seen yet for this scheme.
											</div>
										) : (
											pressEntries.map((entry) => {
												const slot = activeLayer === "normal" ? entry.normal : entry.shifted;
												const isLast = entry.key === lastPressKey;
												const shortSelected =
													mappingTarget?.key === entry.key &&
													mappingTarget?.pressType === "short";
												const longSelected =
													mappingTarget?.key === entry.key &&
													mappingTarget?.pressType === "long";
												return (
													<div
														key={entry.key}
														className={`rounded-lg border p-2 shadow-[0_0_0_1px_rgba(0,0,0,0.15)] ${
															isLast
																? "border-emerald-400/70 bg-emerald-500/10"
																: "border-slate-600/90 bg-slate-900/80"
														}`}
													>
														<p className="mb-1 truncate font-mono text-[10px] text-slate-300">
															0x{binToHex(entry.btn_id)}
														</p>
														<div className="grid grid-cols-2 gap-1.5">
															<button
																type="button"
																onClick={() =>
																	setMappingTarget({ key: entry.key, pressType: "short" })
																}
																className={`rounded-md border px-2 py-2 text-left ${
																	shortSelected
																		? "border-emerald-400 bg-emerald-500/20"
																		: "border-slate-600 bg-slate-800/90 hover:border-slate-400"
																}`}
															>
																<p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
																	Short
																</p>
																<p className="mt-0.5 font-mono text-base font-bold text-slate-100">
																	{slotDisplay(slot.short)}
																</p>
															</button>
															<button
																type="button"
																onClick={() =>
																	setMappingTarget({ key: entry.key, pressType: "long" })
																}
																className={`rounded-md border px-2 py-2 text-left ${
																	longSelected
																		? "border-emerald-400 bg-emerald-500/20"
																		: "border-slate-600 bg-slate-800/90 hover:border-slate-400"
																}`}
															>
																<p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
																	Long
																</p>
																<p className="mt-0.5 font-mono text-base font-bold text-slate-100">
																	{slotDisplay(slot.long)}
																</p>
															</button>
														</div>
													</div>
												);
											})
										)}
									</div>
								</div>
							</>
						) : (
							<div className="space-y-2">
								<div className="rounded border border-slate-700 bg-[#0b0f19] p-3">
									<div className="mb-2 flex items-center justify-between">
										<p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
											Short / long threshold
										</p>
										<button
											type="button"
											onClick={() => setLiveEnabled((v) => !v)}
											className={`rounded px-2 py-1 text-[10px] font-semibold ${
												liveEnabled
													? "border border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
													: "border border-slate-700 text-slate-400"
											}`}
										>
											{liveEnabled ? "Listening" : "Paused"}
										</button>
									</div>
									<label className="mb-2 block text-[10px] text-slate-500">{thresholdMs}ms</label>
									<input
										type="range"
										min={250}
										max={1200}
										step={25}
										value={thresholdMs}
										onChange={(e) => setThresholdMs(Number(e.target.value))}
										className="w-full accent-emerald-400"
									/>
								</div>
								<div className="rounded border border-slate-700 bg-[#0b0f19] p-3">
									<p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">
										Live press
									</p>
									<LivePressDisplay
										held={activeHeld}
										release={activeHeld ? null : lastRelease}
										thresholdMs={thresholdMs}
										shiftArmed={shiftArmed}
										scheme={scheme}
										now={decodeTick}
									/>
								</div>
								<div className="rounded border border-slate-700 bg-[#0b0f19] p-3">
									<p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
										Shift status
									</p>
									<p
										className={`font-mono text-sm font-semibold ${
											shiftArmed ? "text-amber-300" : "text-slate-400"
										}`}
									>
										{shiftArmed ? "SHIFT ARMED" : "SHIFT OFF"}
									</p>
								</div>
								<div className="rounded border border-slate-700 bg-[#0b0f19] p-3">
									<p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
										Decoded text
									</p>
									<p className="min-h-[24px] break-all font-mono text-sm text-slate-100">
										{liveText || "—"}
									</p>
									<div className="mt-2 flex gap-2">
										<button
											type="button"
											onClick={() => setLiveText((prev) => prev.slice(0, -1))}
											className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-400"
										>
											Backspace
										</button>
										<button
											type="button"
											onClick={() => {
												setLiveText("");
												setShiftArmed(false);
											}}
											className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-400"
										>
											Clear
										</button>
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			) : null}
		</section>
	);
}
