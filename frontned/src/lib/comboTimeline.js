import { packetKey } from "./format";

/** Older recordings stored release-to-release gaps; convert to idle-only gaps. */
export function migrateLegacyComboSteps(steps) {
	return (steps ?? []).map((step, idx) => {
		if (idx === 0) return step;
		const duration = step.duration_ms ?? 0;
		const gap = step.gap_ms ?? 0;
		return { ...step, gap_ms: Math.max(0, gap - duration) };
	});
}

export function normalizeComboSteps(steps, schemaVersion = 1) {
	if (schemaVersion >= 2) return steps ?? [];
	return migrateLegacyComboSteps(steps);
}

/** Build relative timeline positions from saved combo steps (no absolute timestamps). */
export function syntheticTimelineFromSteps(steps) {
	const items = [];
	let cursor = 0;

	for (let i = 0; i < (steps ?? []).length; i++) {
		const step = steps[i];
		if (i > 0) cursor += Math.max(0, step.gap_ms ?? 0);

		const start = cursor;
		const end = cursor + Math.max(0, step.duration_ms ?? 0);
		items.push({
			...step,
			start,
			end,
			at: end,
		});
		cursor = end;
	}

	return items;
}

export function totalSpanMs(timelineSteps, extraMs = 0) {
	if (!timelineSteps?.length) return Math.max(extraMs, 800);
	const last = timelineSteps[timelineSteps.length - 1];
	return Math.max(last.end ?? 0, extraMs, 800);
}

/** Gap regions between sequential steps for axis labels. */
export function gapMarkersFromTimeline(timelineSteps) {
	const markers = [];
	for (let i = 1; i < (timelineSteps ?? []).length; i++) {
		const prev = timelineSteps[i - 1];
		const curr = timelineSteps[i];
		markers.push({
			key: `gap-${i}`,
			start: prev.end,
			end: curr.start,
			gapMs: curr.gap_ms ?? 0,
			mid: (prev.end + curr.start) / 2,
		});
	}
	return markers;
}

/**
 * Ghost overlay uses the same cumulative duration+gap layout as saved combos so
 * bars align on the reference timeline when timing matches.
 */
export function ghostTimelineFromLive(steps, liveHeld, now) {
	const items = syntheticTimelineFromSteps(steps).map((seg) => ({
		...seg,
		live: false,
	}));

	if (!liveHeld) return items;

	const lastEnd = items.length ? items[items.length - 1].end : 0;
	const lastReleaseAt = steps?.[steps.length - 1]?.at;
	const pressAt = liveHeld.serverDownAt ?? liveHeld.clientDownAt;
	const gapBefore =
		items.length > 0 && lastReleaseAt != null && pressAt != null ? Math.max(0, pressAt - lastReleaseAt) : 0;
	const start = items.length === 0 ? 0 : lastEnd + gapBefore;
	const end = start + Math.max(0, now - liveHeld.clientDownAt);

	items.push({
		remote_id: liveHeld.remote_id,
		btn_id: liveHeld.btn_id,
		start,
		end,
		live: true,
	});

	return items;
}

/** Leading edge of ghost attempt on the synthetic timeline (for playhead). */
export function ghostTipMs(steps, liveHeld, now, expectedStepCount = null) {
	const completed = syntheticTimelineFromSteps(steps);
	let tip = completed.length ? completed[completed.length - 1].end : 0;

	if (liveHeld?.clientDownAt != null) {
		const lastReleaseAt = steps?.[steps.length - 1]?.at;
		const pressAt = liveHeld.serverDownAt ?? liveHeld.clientDownAt;
		const gapBefore =
			completed.length > 0 && lastReleaseAt != null && pressAt != null ? Math.max(0, pressAt - lastReleaseAt) : 0;
		const holdStart = completed.length === 0 ? 0 : tip + gapBefore;
		tip = holdStart + Math.max(0, now - liveHeld.clientDownAt);
	} else if (steps?.length > 0 && expectedStepCount != null && steps.length < expectedStepCount) {
		const lastReleaseAt = steps[steps.length - 1]?.at;
		const lastClientAt = steps[steps.length - 1]?.clientAt;
		const anchor = lastClientAt ?? lastReleaseAt;
		if (anchor != null) {
			tip += Math.max(0, now - anchor);
		}
	}

	return tip;
}

export function buildLanesFromSegments(segments, { liveHeld = [], now = Date.now(), sessionStart = 0 } = {}) {
	const laneMap = new Map();

	for (const seg of segments ?? []) {
		const key = packetKey(seg.remote_id, seg.btn_id);
		if (!laneMap.has(key)) {
			laneMap.set(key, {
				key,
				remote_id: seg.remote_id,
				btn_id: seg.btn_id,
				segments: [],
			});
		}
		laneMap.get(key).segments.push({
			start: seg.start,
			end: seg.end,
			live: false,
			gap_ms: seg.gap_ms,
		});
	}

	for (const held of liveHeld) {
		const key = packetKey(held.remote_id, held.btn_id);
		const start = (held.downAt ?? now) - sessionStart;
		const end = now - sessionStart;
		if (!laneMap.has(key)) {
			laneMap.set(key, {
				key,
				remote_id: held.remote_id,
				btn_id: held.btn_id,
				segments: [],
			});
		}
		laneMap.get(key).segments.push({ start, end, live: true });
	}

	return [...laneMap.values()].sort((a, b) => {
		const aStart = a.segments[0]?.start ?? 0;
		const bStart = b.segments[0]?.start ?? 0;
		return aStart - bStart;
	});
}

export function axisTicks(spanMs) {
	const interval = spanMs <= 2500 ? 500 : spanMs <= 6000 ? 1000 : spanMs <= 15000 ? 2000 : 5000;
	const ticks = [];
	for (let t = 0; t <= spanMs; t += interval) {
		ticks.push(t);
	}
	if (ticks[ticks.length - 1] !== spanMs && spanMs > 0) {
		ticks.push(spanMs);
	}
	return ticks;
}

export function stepButtonMatches(step, remote_id, btn_id) {
	return step?.remote_id === remote_id && step?.btn_id === btn_id;
}

export const DURATION_TOLERANCE_MS = 400;
export const GAP_TOLERANCE_MS = 400;
export const DURATION_TOLERANCE_RATIO = 0.45;
export const GAP_TOLERANCE_RATIO = 0.45;

function toleranceMs(expected, floorMs, ratio) {
	if (expected <= 0) return Math.max(floorMs, 200);
	return Math.max(floorMs, Math.floor(expected * ratio));
}

function withinTolerance(actual, expected, floorMs, ratio) {
	return Math.abs(actual - expected) <= toleranceMs(expected, floorMs, ratio);
}

export function stepMatchesWithTolerance(actual, expected, { isFirst = false, actualGapMs = null } = {}) {
	if (!stepButtonMatches(expected, actual.remote_id, actual.btn_id)) return false;
	if (
		!withinTolerance(
			actual.duration_ms ?? 0,
			expected.duration_ms ?? 0,
			DURATION_TOLERANCE_MS,
			DURATION_TOLERANCE_RATIO,
		)
	) {
		return false;
	}
	if (isFirst) return true;
	const gap = actualGapMs ?? actual.gap_ms ?? 0;
	return withinTolerance(gap, expected.gap_ms ?? 0, GAP_TOLERANCE_MS, GAP_TOLERANCE_RATIO);
}

/** Mirror backend suffix match — buttons + hold/gap tolerances. */
export function matchesComboSequence(actualSteps, expectedSteps) {
	const n = expectedSteps?.length ?? 0;
	if (!n || (actualSteps?.length ?? 0) < n) return false;

	const tail = actualSteps.slice(-n);
	return tail.every((actual, idx) => {
		const actualGapMs =
			idx > 0 && actual.down_at != null ? Math.max(0, Math.round(actual.down_at - tail[idx - 1].at)) : 0;
		return stepMatchesWithTolerance(actual, expectedSteps[idx], {
			isFirst: idx === 0,
			actualGapMs,
		});
	});
}
