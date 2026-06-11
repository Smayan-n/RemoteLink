import { useState } from "react";
import GraphCanvas from "./graph/GraphCanvas";
import RadarIcon from "./RadarIcon";

export default function MainNodeGraph({
	remotes,
	remoteOrder,
	heldButtons,
	zoomPress,
	draftNames,
	setDraftNames,
	onRegister,
	onRenameRemote,
	selectedButton,
	onSelectButton,
	macroBindings,
	connected,
}) {
	const [autoZoom, setAutoZoom] = useState(true);
	const hasRemotes = remoteOrder.length > 0;

	return (
		<section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800/80 bg-[#0f1524]/40">
			<div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-3">
				<div>
					<h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
						Remote Node Graph
					</h2>
					<p className="mt-0.5 text-[10px] text-slate-600">
						drag nodes · scroll to zoom · drag canvas to pan
					</p>
				</div>

				<AutoZoomToggle enabled={autoZoom} onToggle={() => setAutoZoom((v) => !v)} />
			</div>

			<div className="graph-stage relative min-h-0 flex-1">
				{hasRemotes ? (
					<GraphCanvas
						remotes={remotes}
						remoteOrder={remoteOrder}
						heldButtons={heldButtons}
						zoomPress={zoomPress}
						draftNames={draftNames}
						setDraftNames={setDraftNames}
						onRegister={onRegister}
						onRenameRemote={onRenameRemote}
						selectedButton={selectedButton}
						onSelectButton={onSelectButton}
						macroBindings={macroBindings}
						autoZoom={autoZoom}
					/>
				) : (
					<div className="flex h-full flex-col items-center justify-center p-8 text-center">
						<div className="mb-4 text-emerald-500/40">
							<RadarIcon />
						</div>
						<p className="font-mono text-sm text-slate-500">Awaiting Sub-GHz transmission...</p>
						<p className="mt-2 text-xs text-slate-600">
							{connected
								? "Incoming remotes will appear as draggable graph nodes."
								: "Backend offline — start sdr-remote.py"}
						</p>
					</div>
				)}
			</div>
		</section>
	);
}

function AutoZoomToggle({ enabled, onToggle }) {
	return (
		<button
			type="button"
			onClick={onToggle}
			className={`flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
				enabled
					? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
					: "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-500"
			}`}
			title="Auto-zoom to a remote/button when it transmits"
		>
			<span
				className={`relative h-3.5 w-6 rounded-full transition-colors ${
					enabled ? "bg-emerald-500/70" : "bg-slate-700"
				}`}
			>
				<span
					className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${
						enabled ? "left-3" : "left-0.5"
					}`}
				/>
			</span>
			Auto-zoom on trigger
		</button>
	);
}
