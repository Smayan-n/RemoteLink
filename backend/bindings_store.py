"""
Persistent macro binding storage (CSV).

Bindings are keyed remote_id-btn_id in memory; the CSV is rewritten on each
save so the file always reflects the full current set.
"""

from __future__ import annotations

import csv
from pathlib import Path

BINDINGS_CSV = Path(__file__).resolve().parent / "macro_bindings.csv"

FIELDNAMES = ("remote_id", "btn_id", "action_type", "nickname", "media_key")


def _split_key(key: str) -> tuple[str, str] | None:
    dash = key.find("-")
    if dash <= 0:
        return None
    return key[:dash], key[dash + 1 :]


def load_bindings() -> dict[str, dict]:
    """Load all bindings from CSV. Returns {remote_id-btn_id: binding_dict}."""
    if not BINDINGS_CSV.exists():
        return {}

    bindings: dict[str, dict] = {}
    with BINDINGS_CSV.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            remote_id = (row.get("remote_id") or "").strip()
            btn_id = (row.get("btn_id") or "").strip()
            action_type = (row.get("action_type") or "none").strip()
            if not remote_id or not btn_id or action_type == "none":
                continue
            key = f"{remote_id}-{btn_id}"
            bindings[key] = {
                "action_type": action_type,
                "nickname": (row.get("nickname") or "").strip(),
                "media_key": (row.get("media_key") or "").strip(),
            }
    return bindings


def save_bindings(bindings: dict[str, dict]) -> None:
    """Write all in-memory bindings to CSV (full replace)."""
    rows: list[dict[str, str]] = []
    for key in sorted(bindings):
        parts = _split_key(key)
        if not parts:
            continue
        remote_id, btn_id = parts
        binding = bindings[key]
        rows.append(
            {
                "remote_id": remote_id,
                "btn_id": btn_id,
                "action_type": binding.get("action_type", ""),
                "nickname": binding.get("nickname", ""),
                "media_key": binding.get("media_key", ""),
            }
        )

    BINDINGS_CSV.parent.mkdir(parents=True, exist_ok=True)
    with BINDINGS_CSV.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)
