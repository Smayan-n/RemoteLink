import { useEffect, useState } from "react";
import { MACRO_ACTION_TYPES, macroActionLabel } from "../lib/macros";
import MediaKeyPicker from "./MediaKeyPicker";

export default function ComboMacroEditor({ combo, onSave, onDelete }) {
	const [isEditing, setIsEditing] = useState(false);
	const [name, setName] = useState(combo.name);
	const [nickname, setNickname] = useState(combo.nickname ?? "");
	const [actionType, setActionType] = useState(combo.action_type ?? "media");
	const [mediaKey, setMediaKey] = useState(combo.media_key ?? "playpause");

	useEffect(() => {
		setName(combo.name);
		setNickname(combo.nickname ?? "");
		setActionType(combo.action_type ?? "media");
		setMediaKey(combo.media_key ?? "playpause");
		setIsEditing(false);
	}, [combo.id, combo.name, combo.nickname, combo.action_type, combo.media_key]);

	const binding = {
		nickname: combo.nickname,
		actionType: combo.action_type,
		mediaKey: combo.media_key,
	};

	const handleSave = () => {
		const trimmedName = name.trim();
		if (!trimmedName || actionType === "none") return;
		onSave({
			id: combo.id,
			name: trimmedName,
			nickname: nickname.trim(),
			actionType,
			mediaKey,
			steps: combo.steps,
		});
		setIsEditing(false);
	};

	const handleCancel = () => {
		setName(combo.name);
		setNickname(combo.nickname ?? "");
		setActionType(combo.action_type ?? "media");
		setMediaKey(combo.media_key ?? "playpause");
		setIsEditing(false);
	};

	if (isEditing) {
		return (
			<div className="space-y-2 rounded-lg border border-violet-500/25 bg-[#0b0f19]/50 p-3">
				<label className="block">
					<span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
						Combo name
					</span>
					<input
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="w-full rounded border border-slate-700 bg-[#0b0f19] px-2 py-1.5 text-xs text-slate-100 focus:border-violet-500/50 focus:outline-none"
					/>
				</label>
				<label className="block">
					<span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
						Macro nickname
					</span>
					<input
						type="text"
						value={nickname}
						onChange={(e) => setNickname(e.target.value)}
						placeholder="Optional label"
						className="w-full rounded border border-slate-700 bg-[#0b0f19] px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none"
					/>
				</label>
				<label className="block">
					<span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
						Macro action
					</span>
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
				</label>
				{actionType === "media" ? <MediaKeyPicker value={mediaKey} onChange={setMediaKey} /> : null}
				<div className="flex gap-2 pt-1">
					<button
						type="button"
						onClick={handleCancel}
						className="flex-1 rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-400 hover:border-slate-500"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={!name.trim()}
						className="flex-1 rounded border border-violet-500/40 bg-violet-500/10 px-2 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-40"
					>
						Save
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex items-start justify-between gap-2">
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-semibold text-slate-200">{combo.name}</p>
				<p className="mt-0.5 text-[10px] text-slate-500">
					{combo.steps.length} steps · {macroActionLabel(binding)}
				</p>
				{combo.nickname?.trim() ? (
					<p className="mt-0.5 truncate text-[10px] text-slate-400">{combo.nickname.trim()}</p>
				) : null}
			</div>
			<div className="flex shrink-0 gap-1.5">
				<button
					type="button"
					onClick={() => setIsEditing(true)}
					className="rounded border border-slate-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-500 hover:border-violet-500/40 hover:text-violet-300"
				>
					Edit
				</button>
				<button
					type="button"
					onClick={() => onDelete(combo.id)}
					className="rounded border border-slate-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-500 hover:border-red-500/40 hover:text-red-300"
				>
					Delete
				</button>
			</div>
		</div>
	);
}
