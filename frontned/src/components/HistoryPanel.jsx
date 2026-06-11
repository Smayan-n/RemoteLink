import { useEffect, useState } from "react";
import { badgeColorForBtn, binToHex, formatTimeHms, packetKey, remoteDisplayInfo } from "../lib/format";
import { EMPTY_MACRO_BINDING, MACRO_ACTION_TYPES, macroActionLabel } from "../lib/macros";
import MediaKeyPicker from "./MediaKeyPicker";

export default function HistoryPanel({
	combos,
	sortedKeys,
	showFullHistory,
	onToggleHistory,
	onClear,
	connected,
	heldButtons,
	selectedButton,
	macroBindings,
	onSaveMacro,
	onClearSelection,
	remotes,
}) {
	const latestKey = sortedKeys[0] ?? null;
	const latestCombo = latestKey ? combos[latestKey] : null;
	const visibleKeys = showFullHistory ? sortedKeys : sortedKeys.slice(0, 1);

	return (
		<section className="flex h-full max-h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800/80 bg-[#0f1524]/40">
			<div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3">
				<div>
					<h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
						Inspector &amp; History
					</h2>
					<p className="mt-0.5 text-[10px] text-slate-600">
						{sortedKeys.length} unique combo{sortedKeys.length === 1 ? "" : "s"}
					</p>
				</div>
				<div className="flex gap-2">
					{sortedKeys.length > 1 && (
						<button
							type="button"
							onClick={onToggleHistory}
							className="rounded border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:border-slate-500"
						>
							{showFullHistory ? "Collapse" : "Show All"}
						</button>
					)}
					<button
						type="button"
						onClick={onClear}
						className="rounded border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:border-slate-500"
					>
						Clear
					</button>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
				{selectedButton ? (
					<MacroInspector
						selectedButton={selectedButton}
						macroBindings={macroBindings}
						onSaveMacro={onSaveMacro}
						onClearSelection={onClearSelection}
						remotes={remotes}
					/>
				) : (
					<div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/8 p-4 text-center ring-1 ring-emerald-500/15">
						<p className="text-sm font-semibold text-emerald-300">Click a button node on the graph</p>
						<p className="mt-1 text-xs text-slate-300">to configure a macro binding</p>
					</div>
				)}

				<div className="my-3 border-t border-slate-800/80" />

				{!latestCombo ? (
					<div className="rounded-lg border border-dashed border-slate-700/60 bg-[#0b0f19]/50 p-4 text-center text-xs text-slate-600">
						{connected ? "No packets captured yet." : "Waiting for backend connection..."}
					</div>
				) : (
					<div className="space-y-2">
						{visibleKeys.map((key) => {
							const combo = combos[key];
							return (
								<SimpleHistoryCard
									key={key}
									combo={combo}
									remotes={remotes}
									isHeld={Boolean(heldButtons?.[key])}
									isSelected={
										selectedButton != null &&
										packetKey(combo.remote_id, combo.btn_id) ===
											packetKey(selectedButton.remoteId, selectedButton.btnId)
									}
								/>
							);
						})}

						{!showFullHistory && sortedKeys.length > 1 && (
							<p className="pt-1 text-center font-mono text-[10px] text-slate-600">
								+ {sortedKeys.length - 1} hidden combos
							</p>
						)}
					</div>
				)}
			</div>
		</section>
	);
}

function MacroInspector({ selectedButton, macroBindings, onSaveMacro, onClearSelection, remotes }) {
	const { remoteId, btnId } = selectedButton;
	const bindingKey = packetKey(remoteId, btnId);
	const saved = macroBindings[bindingKey] ?? EMPTY_MACRO_BINDING;

	const hasSavedMacro = saved.actionType !== "none";
	const [isEditing, setIsEditing] = useState(!hasSavedMacro);
	const [nickname, setNickname] = useState(saved.nickname);
	const [actionType, setActionType] = useState(saved.actionType);
	const [mediaKey, setMediaKey] = useState(saved.mediaKey ?? "playpause");

	useEffect(() => {
		setNickname(saved.nickname);
		setActionType(saved.actionType);
		setMediaKey(saved.mediaKey ?? "playpause");
		setIsEditing(saved.actionType === "none");
	}, [bindingKey, saved.nickname, saved.actionType, saved.mediaKey]);

	const remote = remoteDisplayInfo(remoteId, remotes[remoteId]);
	const btnHex = binToHex(btnId);
	const badgeClass = badgeColorForBtn(btnId);

	const handleSave = () => {
		onSaveMacro(remoteId, btnId, { nickname, actionType, mediaKey });
		setIsEditing(false);
	};

	const handleEdit = () => {
		setNickname(saved.nickname);
		setActionType(saved.actionType);
		setMediaKey(saved.mediaKey ?? "playpause");
		setIsEditing(true);
	};

	return (
		<div className="mb-3 rounded-lg border border-emerald-500/30 bg-[#0e1422] p-3 ring-1 ring-emerald-500/10">
			<div className="mb-3 flex items-start justify-between gap-2">
				<div>
					<p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-500/80">
						Macro Binding
					</p>
					<p className="mt-1 text-sm font-semibold text-emerald-300">{remote.title}</p>
					{remote.isNamed ? (
						<p className="mt-0.5 font-mono text-[10px] text-slate-500">ID {remote.idLabel}</p>
					) : null}
					<p className="mt-1 font-mono text-xs text-slate-400">Button 0x{btnHex}</p>
				</div>
				<button
					type="button"
					onClick={onClearSelection}
					className="shrink-0 rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-500 hover:text-slate-300"
				>
					Close
				</button>
			</div>

			{isEditing ? (
				<>
					<label className="mb-2 block">
						<span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
							{actionType === "script" ? "Script filename" : "Nickname"}
						</span>
						<input
							type="text"
							value={nickname}
							onChange={(e) => setNickname(e.target.value)}
							placeholder={
								actionType === "script"
									? "e.g. example (→ macro_scripts/example.py)"
									: "e.g. Front door chime"
							}
							className="w-full rounded border border-slate-700 bg-[#0b0f19] px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
						/>
						{actionType === "script" ? (
							<p className="mt-1.5 rounded border border-amber-500/25 bg-amber-500/5 px-2 py-1.5 text-[10px] leading-relaxed text-amber-200/90">
								Put your <span className="font-mono">.py</span> file in{" "}
								<span className="font-mono text-amber-100">sdr-remote-backend/macro_scripts/</span> and
								enter its name here <strong>without</strong> the extension. Nickname{" "}
								<span className="font-mono">example</span> runs{" "}
								<span className="font-mono">macro_scripts/example.py</span>.
							</p>
						) : null}
					</label>

					<label className="mb-3 block">
						<span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
							System macro
						</span>
						<select
							value={actionType}
							onChange={(e) => setActionType(e.target.value)}
							className="w-full rounded border border-slate-700 bg-[#0b0f19] px-2 py-1.5 text-xs text-slate-100 focus:border-emerald-500/50 focus:outline-none"
						>
							{MACRO_ACTION_TYPES.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{opt.label}
								</option>
							))}
						</select>
					</label>

					{actionType === "media" ? <MediaKeyPicker value={mediaKey} onChange={setMediaKey} /> : null}

					<div className="mt-3 flex gap-2">
						{hasSavedMacro ? (
							<button
								type="button"
								onClick={() => setIsEditing(false)}
								className="flex-1 rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs font-semibold text-slate-400 hover:border-slate-500 hover:text-slate-300"
							>
								Cancel
							</button>
						) : null}
						<button
							type="button"
							onClick={handleSave}
							className={`flex-1 rounded border px-2 py-1.5 text-xs font-semibold ${
								actionType === "none"
									? "border-slate-600 bg-slate-900/60 text-slate-300 hover:border-slate-500 hover:text-slate-100"
									: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
							}`}
						>
							{actionType === "none" ? "Clear macro" : "Save macro"}
						</button>
					</div>
				</>
			) : (
				<div className="space-y-3 rounded-lg border border-slate-800/80 bg-[#0b0f19]/50 p-3">
					<div>
						<p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Name</p>
						<p className="mt-0.5 text-sm text-slate-200">{saved.nickname?.trim() || "—"}</p>
					</div>
					<div>
						<p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Action</p>
						<p className="mt-0.5 text-sm font-medium text-emerald-300">{macroActionLabel(saved)}</p>
					</div>
					<button
						type="button"
						onClick={handleEdit}
						className="w-full rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs font-semibold text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300"
					>
						Edit
					</button>
				</div>
			)}
		</div>
	);
}

function MacroStatusLine({ macro }) {
	if (!macro || macro.status === "none") {
		return <p className="mt-1 font-mono text-[10px] text-slate-600">No macro bound</p>;
	}

	if (macro.status === "pending") {
		return null;
	}

	if (macro.status === "ok") {
		return <p className="mt-1 font-mono text-[10px] text-emerald-400">✓ {macro.name} triggered</p>;
	}

	return <p className="mt-1 font-mono text-[10px] text-red-400">✗ {macro.name} failed</p>;
}

function SimpleHistoryCard({ combo, remotes, isHeld, isSelected }) {
	const [timestampsOpen, setTimestampsOpen] = useState(false);
	const remote = remoteDisplayInfo(combo.remote_id, remotes[combo.remote_id]);
	const btnHex = binToHex(combo.btn_id);
	const badgeClass = badgeColorForBtn(combo.btn_id);

	return (
		<article
			className={`rounded border bg-[#0e1422] p-3 ${
				isSelected ? "border-emerald-500/40 ring-1 ring-emerald-500/20" : "border-slate-800/80"
			} ${isHeld ? "card-held" : ""}`}
		>
			<div className="flex items-center justify-between gap-2">
				<div>
					<p className="text-sm font-semibold text-slate-200">{remote.title}</p>
					{remote.isNamed ? (
						<p className="font-mono text-[10px] text-slate-500">ID {remote.idLabel}</p>
					) : null}
					<p className="mt-0.5 font-mono text-xs text-slate-400">Button 0x{btnHex}</p>
					<p className="font-mono text-[10px] text-slate-500">
						Last: {formatTimeHms(new Date(combo.lastAt))}
					</p>
					<MacroStatusLine macro={combo.lastMacro} />
				</div>
				<span className={`rounded border px-2 py-0.5 font-mono text-[10px] ${badgeClass}`}>
					{combo.timestamps.length}x
				</span>
			</div>

			<button
				type="button"
				onClick={() => setTimestampsOpen((v) => !v)}
				className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
			>
				{timestampsOpen ? "Hide timestamps" : "Show timestamps"}
			</button>

			{timestampsOpen && (
				<ul className="mt-2 max-h-36 space-y-1 overflow-y-auto border-t border-slate-800/60 pt-2">
					{[...combo.timestamps].slice(0, 20).map((ts, i) => (
						<li key={`${ts}-${i}`} className="font-mono text-[10px] text-slate-400">
							{formatTimeHms(new Date(ts))}
						</li>
					))}
				</ul>
			)}
		</article>
	);
}
