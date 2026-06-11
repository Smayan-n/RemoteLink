"""
Match live button_up sequences against saved combo macros.
"""

from __future__ import annotations

from combo_store import load_combos

# Tolerance is max(floor_ms, expected * ratio) so longer holds/gaps get wider windows.
DURATION_TOLERANCE_MS = 400
GAP_TOLERANCE_MS = 400
DURATION_TOLERANCE_RATIO = 0.45
GAP_TOLERANCE_RATIO = 0.45
BUFFER_MAX_AGE_SEC = 30.0
MAX_BUFFER_STEPS = 24

# Rolling buffer of completed presses (newest last); cleared on a successful match.
_recent_steps: list[dict] = []
# Timestamp of the previous button_up; drives inter-press gap for the next step.
_last_release_at: float | None = None
# button_down times keyed by (remote_id, btn_id) for hold length and gap math.
_pending_down_at: dict[tuple[str, str], float] = {}


def _tolerance_ms(actual: int, expected: int, floor_ms: int, ratio: float) -> int:
    # Zero-length expected steps still need a minimum window for noisy input.
    if expected <= 0:
        return max(floor_ms, 200)
    return max(floor_ms, int(expected * ratio))


def _within_tolerance(actual: int, expected: int, floor_ms: int, ratio: float) -> bool:
    tol = _tolerance_ms(actual, expected, floor_ms, ratio)
    return abs(actual - expected) <= tol


def _step_matches(
    actual: dict,
    expected: dict,
    *,
    is_first: bool,
    actual_gap_ms: int | None = None,
) -> tuple[bool, str]:
    if actual["remote_id"] != expected["remote_id"]:
        return False, "remote"
    if actual["btn_id"] != expected["btn_id"]:
        return False, "button"
    if not _within_tolerance(
        actual["duration_ms"],
        expected["duration_ms"],
        DURATION_TOLERANCE_MS,
        DURATION_TOLERANCE_RATIO,
    ):
        return (
            False,
            f"hold {actual['duration_ms']}ms vs {expected['duration_ms']}ms",
        )
    # First step has no preceding gap in the combo definition.
    if is_first:
        return True, "ok"
    gap = actual_gap_ms if actual_gap_ms is not None else actual["gap_ms"]
    if not _within_tolerance(
        gap,
        expected["gap_ms"],
        GAP_TOLERANCE_MS,
        GAP_TOLERANCE_RATIO,
    ):
        return False, f"gap {gap}ms vs {expected['gap_ms']}ms"
    return True, "ok"


def _matches_combo(recent: list[dict], expected_steps: list[dict]) -> bool:
    """True when the suffix of recent steps matches expected_steps."""
    n = len(expected_steps)
    if len(recent) < n:
        return False
    tail = recent[-n:]
    for idx, (actual, expected) in enumerate(zip(tail, expected_steps)):
        actual_gap_ms = None
        if idx > 0:
            # Gap is idle time from prior release to this press-down.
            actual_gap_ms = max(
                0,
                int((actual["down_at"] - tail[idx - 1]["at"]) * 1000),
            )
        ok, _reason = _step_matches(
            actual,
            expected,
            is_first=idx == 0,
            actual_gap_ms=actual_gap_ms,
        )
        if not ok:
            return False
    return True


def _combo_failure_reason(recent: list[dict], expected_steps: list[dict]) -> str | None:
    """Like _matches_combo, but returns the first mismatch reason for debugging."""
    n = len(expected_steps)
    if len(recent) < n:
        return None
    tail = recent[-n:]
    for idx, (actual, expected) in enumerate(zip(tail, expected_steps)):
        actual_gap_ms = None
        if idx > 0:
            actual_gap_ms = max(
                0,
                int((actual["down_at"] - tail[idx - 1]["at"]) * 1000),
            )
        ok, reason = _step_matches(
            actual,
            expected,
            is_first=idx == 0,
            actual_gap_ms=actual_gap_ms,
        )
        if not ok:
            return f"step {idx + 1}: {reason}"
    return None


def _prune_buffer(now: float) -> None:
    global _recent_steps
    _recent_steps = [
        step for step in _recent_steps if now - step["at"] <= BUFFER_MAX_AGE_SEC
    ][-MAX_BUFFER_STEPS:]


def record_button_down(remote_id: str, btn_id: str, at: float) -> None:
    """Remember press-down time so the next step's gap is release→press idle time."""
    _pending_down_at[(remote_id, btn_id)] = at


def record_button_up(
    remote_id: str,
    btn_id: str,
    at: float,
    duration_sec: float,
) -> dict | None:
    """
    Append a completed press to the rolling buffer and return a matched combo, if any.
    """
    global _last_release_at

    duration_ms = max(0, int(duration_sec * 1000))
    # Fall back to duration-derived down time if we missed the down event.
    down_at = _pending_down_at.pop((remote_id, btn_id), at - duration_sec)
    if _last_release_at is None:
        gap_ms = 0
    else:
        gap_ms = max(0, int((down_at - _last_release_at) * 1000))
    _last_release_at = at

    _recent_steps.append(
        {
            "remote_id": remote_id,
            "btn_id": btn_id,
            "duration_ms": duration_ms,
            "gap_ms": gap_ms,
            "down_at": down_at,
            "at": at,
        }
    )
    _prune_buffer(at)

    combos = load_combos()
    for combo in combos:
        steps = combo.get("steps") or []
        if len(steps) < 2:
            continue
        if _matches_combo(_recent_steps, steps):
            # Reset so the same combo cannot fire twice from leftover steps.
            _recent_steps.clear()
            _last_release_at = None
            return combo

    # Log one near-miss per up event when buttons matched but timing did not.
    if combos:
        for combo in combos:
            steps = combo.get("steps") or []
            if len(steps) < 2 or len(_recent_steps) < len(steps):
                continue
            reason = _combo_failure_reason(_recent_steps, steps)
            if reason:
                buttons_ok = all(
                    a["remote_id"] == e["remote_id"] and a["btn_id"] == e["btn_id"]
                    for a, e in zip(_recent_steps[-len(steps) :], steps)
                )
                if buttons_ok:
                    print(
                        f"[Combos] Near miss {combo.get('name')} ({combo.get('id')}): {reason}"
                    )
                    break

    return None


def reset_buffer() -> None:
    """Clear matcher state (e.g. after reloading combos or disconnect)."""
    global _recent_steps, _last_release_at
    _recent_steps = []
    _last_release_at = None
    _pending_down_at.clear()
