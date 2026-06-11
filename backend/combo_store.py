"""
Persistent combo (sequence) macro storage (JSON).

Each combo stores ordered steps with per-press duration and inter-step gaps,
plus the macro to run when the sequence is matched on button_up events.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

COMBOS_JSON = Path(__file__).resolve().parent / "combo_bindings.json"


def _empty_store() -> dict:
    return {"combos": []}


def load_combos() -> list[dict]:
    """Load all saved combos from disk."""
    if not COMBOS_JSON.exists():
        return []

    try:
        with COMBOS_JSON.open(encoding="utf-8") as fh:
            data = json.load(fh)
    except (json.JSONDecodeError, OSError):
        return []

    combos = data.get("combos")
    if not isinstance(combos, list):
        return []

    normalized = []
    for combo in combos:
        if not isinstance(combo, dict):
            continue
        steps = combo.get("steps") or []
        if int(combo.get("schema_version", 1)) < 2 and isinstance(steps, list):
            combo = {
                **combo,
                "steps": _migrate_legacy_gaps(steps),
                "schema_version": 2,
            }
        normalized.append(combo)
    return normalized


def save_combos(combos: list[dict]) -> None:
    """Write all combos to disk (full replace)."""
    COMBOS_JSON.parent.mkdir(parents=True, exist_ok=True)
    with COMBOS_JSON.open("w", encoding="utf-8") as fh:
        json.dump({"combos": combos}, fh, indent=2)


def _migrate_legacy_gaps(steps: list[dict]) -> list[dict]:
    """
    Older recordings stored gap_ms as release-to-release (idle + next hold).
    Convert to idle-only gap before each press.
    """
    migrated = []
    for idx, step in enumerate(steps):
        gap_ms = step.get("gap_ms", 0)
        if idx > 0:
            gap_ms = max(0, int(gap_ms) - int(step.get("duration_ms", 0)))
        migrated.append({**step, "gap_ms": gap_ms})
    return migrated


def normalize_step(step: dict) -> dict | None:
    remote_id = str(step.get("remote_id", "")).strip()
    btn_id = str(step.get("btn_id", "")).strip()
    if not remote_id or not btn_id:
        return None

    try:
        duration_ms = int(step.get("duration_ms", 0))
    except (TypeError, ValueError):
        duration_ms = 0
    try:
        gap_ms = int(step.get("gap_ms", 0))
    except (TypeError, ValueError):
        gap_ms = 0

    return {
        "remote_id": remote_id,
        "btn_id": btn_id,
        "duration_ms": max(0, duration_ms),
        "gap_ms": max(0, gap_ms),
    }


def normalize_combo(combo: dict) -> dict | None:
    name = str(combo.get("name", "")).strip()
    steps_raw = combo.get("steps") or []
    if not name or not isinstance(steps_raw, list) or len(steps_raw) < 2:
        return None

    steps = []
    for raw in steps_raw:
        step = normalize_step(raw)
        if step:
            steps.append(step)
    if len(steps) < 2:
        return None

    action_type = str(combo.get("action_type", "none")).strip()
    if action_type == "none":
        return None

    combo_id = str(combo.get("id", "")).strip() or str(uuid.uuid4())

    return {
        "id": combo_id,
        "name": name,
        "steps": steps,
        "schema_version": 2,
        "action_type": action_type,
        "nickname": str(combo.get("nickname", "")).strip(),
        "media_key": str(combo.get("media_key", "")).strip(),
    }


def upsert_combo(combo: dict) -> dict | None:
    normalized = normalize_combo(combo)
    if not normalized:
        return None

    combos = load_combos()
    idx = next(
        (i for i, c in enumerate(combos) if c.get("id") == normalized["id"]),
        None,
    )
    if idx is None:
        combos.append(normalized)
    else:
        combos[idx] = normalized
    save_combos(combos)
    return normalized


def delete_combo(combo_id: str) -> bool:
    combo_id = str(combo_id).strip()
    if not combo_id:
        return False

    combos = load_combos()
    new_combos = [c for c in combos if c.get("id") != combo_id]
    if len(new_combos) == len(combos):
        return False
    save_combos(new_combos)
    return True
