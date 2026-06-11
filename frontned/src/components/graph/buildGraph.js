// Node dimensions (px) used for collision radii, edge anchoring and fit-zoom.
export const REMOTE_W = 212;
export const REMOTE_H = 104;
export const BUTTON_W = 104;
export const BUTTON_H = 54;

// Minimum gap between remote and button bounding boxes on the ring.
const ORBIT_MARGIN = 32;

// Orbit radius from the remote center — sized so the widest/tallest side of
// each node never overlaps (remote is a wide rectangle, not a circle).
export const RING_RADIUS = Math.max(
	REMOTE_W / 2 + BUTTON_W / 2 + ORBIT_MARGIN,
	REMOTE_H / 2 + BUTTON_H / 2 + ORBIT_MARGIN,
);
// Area each remote cluster reserves so clusters don't overlap.
export const CLUSTER_RADIUS = RING_RADIUS + 72;

export function buttonNodeId(remoteId, btnId) {
	return `btn-${remoteId}-${btnId}`;
}

export function remoteNodeId(remoteId) {
	return `remote-${remoteId}`;
}

export function edgeId(remoteId, btnId) {
	return `edge-${remoteId}-${btnId}`;
}

export function computeStructureSignature(remoteOrder, remotes) {
	const parts = remoteOrder.map((id) => {
		const buttons = [...(remotes[id]?.buttons ?? [])].sort((a, b) => parseInt(a, 2) - parseInt(b, 2));
		return `${id}:${buttons.join(",")}`;
	});
	return parts.join("|");
}

export function countTotalButtons(remoteOrder, remotes) {
	return remoteOrder.reduce((sum, id) => sum + (remotes[id]?.buttons?.length ?? 0), 0);
}

// Nominal layout center the seeds spiral around before forces re-center them.
const SEED_CX = 560;
const SEED_CY = 380;

/**
 * Builds the flat node/link arrays the d3 force simulation consumes.
 * Each remote becomes one "remote" node; its buttons orbit it on a fixed
 * circle (the radial slot is precomputed as `_angle` / `_r`, and `_remote`
 * holds a live reference to the parent node so a custom force can spring the
 * buttons toward their slot every tick — even while the remote is dragged).
 */
export function buildD3Graph({ remotes, remoteOrder }) {
	const nodes = [];
	const links = [];

	remoteOrder.forEach((remoteId, index) => {
		const remote = remotes[remoteId];
		const buttons = [...(remote?.buttons ?? [])].sort((a, b) => parseInt(a, 2) - parseInt(b, 2));

		// Golden-angle spiral seed so remotes start loosely clustered near center.
		const seedAngle = index * 2.39996;
		const seedDist = 70 * Math.sqrt(index);
		const seedX = SEED_CX + Math.cos(seedAngle) * seedDist;
		const seedY = SEED_CY + Math.sin(seedAngle) * seedDist;

		const remoteNode = {
			id: remoteNodeId(remoteId),
			type: "remote",
			remoteId,
			x: seedX,
			y: seedY,
		};
		nodes.push(remoteNode);

		buttons.forEach((btnId, btnIndex) => {
			const angle = (2 * Math.PI * btnIndex) / Math.max(buttons.length, 1) - Math.PI / 2;
			nodes.push({
				id: buttonNodeId(remoteId, btnId),
				type: "button",
				remoteId,
				btnId,
				x: seedX + Math.cos(angle) * RING_RADIUS,
				y: seedY + Math.sin(angle) * RING_RADIUS,
				_remote: remoteNode,
				_angle: angle,
				_r: RING_RADIUS,
			});

			links.push({
				id: edgeId(remoteId, btnId),
				source: remoteNodeId(remoteId),
				target: buttonNodeId(remoteId, btnId),
				remoteId,
				btnId,
			});
		});
	});

	return { nodes, links };
}
