"""
Macro action handlers for RemoteLink.

Each macro type maps to one function. Called by the backend when a bound
button press is decoded over RF.
"""

from __future__ import annotations

import logging
import subprocess
import sys
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("remotelink.macros")

# Optional scripts folder: place .py or .bat files named after the binding nickname.
SCRIPTS_DIR = Path(__file__).resolve().parent / "macro_scripts"


def _result(ok: bool, message: str) -> dict:
    return {"ok": ok, "message": message}


def macro_notify(nickname: str, remote_id: str, btn_id: str) -> dict:
    """Show a desktop notification."""
    title = nickname or "RemoteLink"
    body = f"Remote {remote_id[:8]}… · button {btn_id}"

    try:
        from plyer import notification

        notification.notify(title=title, message=body, app_name="RemoteLink", timeout=4)
        return _result(True, f"Notification shown: {title}")
    except Exception as exc:
        logger.warning("plyer notify failed (%s), falling back to console", exc)
        print(f"[NOTIFY] {title}: {body}")
        return _result(True, f"Notification fallback (console): {title}")


def macro_log(nickname: str, remote_id: str, btn_id: str) -> dict:
    """Log the trigger to the backend console."""
    label = nickname or "(no nickname)"
    line = f"[MACRO:log] {label} — remote={remote_id} btn={btn_id}"
    print(line)
    logger.info(line)
    return _result(True, line)


VALID_MEDIA_KEYS = frozenset(
    {
        "volumeup",
        "volumedown",
        "volumemute",
        "playpause",
        "nexttrack",
        "prevtrack",
    }
)

MEDIA_LABELS = {
    "volumeup": "Volume up",
    "volumedown": "Volume down",
    "volumemute": "Mute",
    "playpause": "Play / pause",
    "nexttrack": "Next track",
    "prevtrack": "Previous track",
}


def macro_media(
    nickname: str,
    remote_id: str,
    btn_id: str,
    media_key: str = "playpause",
) -> dict:
    """Press a global media/volume key via pyautogui."""
    key = (media_key or "playpause").lower()
    if key not in VALID_MEDIA_KEYS:
        return _result(False, f"Unknown media key: {media_key}")

    label = MEDIA_LABELS.get(key, key)
    try:
        import pyautogui

        pyautogui.FAILSAFE = True
        pyautogui.press(key)
        print(f"[MACRO:media] {label} ({key})")
        return _result(True, f"{label} sent")
    except Exception as exc:
        logger.exception("Media key %s failed", key)
        return _result(False, str(exc))


SCREENSHOTS_DIR = Path(__file__).resolve().parent / "screenshots"


def macro_screenshot(nickname: str, remote_id: str, btn_id: str) -> dict:
    """Capture the primary display and save a PNG under screenshots/."""
    try:
        import pyautogui

        SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        prefix = (
            "".join(
                c for c in (nickname or "screenshot") if c.isalnum() or c in ("-", "_")
            ).strip()
            or "screenshot"
        )
        path = SCREENSHOTS_DIR / f"{prefix}_{ts}.png"

        pyautogui.screenshot(str(path))
        print(f"[MACRO:screenshot] Saved {path}")
        return _result(True, f"Saved {path.name}")
    except Exception as exc:
        logger.exception("Screenshot failed")
        return _result(False, str(exc))


def macro_script(nickname: str, remote_id: str, btn_id: str) -> dict:
    """Run a script from macro_scripts/ named after the binding nickname."""
    if not nickname:
        return _result(
            False, "Script macro requires a nickname (used as script filename)"
        )

    safe_name = "".join(c for c in nickname if c.isalnum() or c in ("-", "_")).strip()
    if not safe_name:
        return _result(False, "Nickname has no usable characters for a script name")

    for ext in (".py", ".bat", ".cmd", ".ps1"):
        script_path = SCRIPTS_DIR / f"{safe_name}{ext}"
        if script_path.exists():
            try:
                if ext == ".py":
                    print(
                        f"[MACRO:script] Running {script_path.name} "
                        f"(remote={remote_id} btn={btn_id})"
                    )
                    proc = subprocess.run(
                        [sys.executable, str(script_path), remote_id, btn_id],
                        capture_output=True,
                        text=True,
                        timeout=30,
                        check=False,
                    )
                    out = (proc.stdout or proc.stderr or "").strip()
                    ok = proc.returncode == 0
                    if out:
                        print(f"[MACRO:script] {out}")
                    elif not ok:
                        print(f"[MACRO:script] exited {proc.returncode}")
                    return _result(ok, out or f"Script exited {proc.returncode}")
                proc = subprocess.run(
                    [str(script_path), remote_id, btn_id],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    shell=True,
                    check=False,
                )
                out = (proc.stdout or proc.stderr or "").strip()
                ok = proc.returncode == 0
                return _result(ok, out or f"Script exited {proc.returncode}")
            except subprocess.TimeoutExpired:
                return _result(False, f"Script timed out: {script_path.name}")
            except Exception as exc:
                return _result(False, f"Script error: {exc}")

    SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    return _result(
        False,
        f"No script found for '{safe_name}' in {SCRIPTS_DIR}",
    )


MACRO_HANDLERS = {
    "none": None,
    "notify": macro_notify,
    "log": macro_log,
    "screenshot": macro_screenshot,
    "script": macro_script,
}


def run_macro(
    action_type: str,
    nickname: str,
    remote_id: str,
    btn_id: str,
    media_key: str = "",
) -> dict:
    """Dispatch a macro by action_type. Returns {ok, message}."""
    if action_type == "none":
        return _result(True, "No macro configured")

    if action_type == "media":
        try:
            return macro_media(
                nickname or "",
                remote_id,
                btn_id,
                media_key or "playpause",
            )
        except Exception as exc:
            logger.exception("Macro media failed")
            return _result(False, str(exc))

    handler = MACRO_HANDLERS.get(action_type)
    if handler is None:
        return _result(False, f"Unknown macro type: {action_type}")

    try:
        return handler(nickname or "", remote_id, btn_id)
    except Exception as exc:
        logger.exception("Macro %s failed", action_type)
        return _result(False, str(exc))
