"""
WebSocket server for RemoteLink.

Handles bidirectional communication with the frontend: broadcasting RF
decode events, receiving macro bindings, and dispatching macro actions.
"""

from __future__ import annotations

import asyncio
import json
import queue
import threading

import websockets

from bindings_store import load_bindings, save_bindings
from combo_matcher import record_button_down, record_button_up
from combo_store import delete_combo, load_combos, upsert_combo
from macros import run_macro

WS_HOST = "localhost"
WS_PORT = 5001

# Outbound message queue -> broadcast worker
_broadcast_queue: queue.Queue = queue.Queue()
_connected_clients: set = set()
_clients_lock = threading.Lock()

# Macro bindings: "remote_id-btn_id" -> {action_type, nickname}
_macro_bindings: dict[str, dict] = {}
_bindings_lock = threading.Lock()


def _binding_key(remote_id: str, btn_id: str) -> str:
    return f"{remote_id}-{btn_id}"


def _enqueue(payload: dict) -> None:
    _broadcast_queue.put(json.dumps(payload))


def emit_packet_event(remote_id: str, btn_id: str) -> None:
    _enqueue({"type": "packet", "remote_id": remote_id, "btn_id": btn_id})


def emit_macro_result(
    remote_id: str,
    btn_id: str,
    action_type: str,
    result: dict,
) -> None:
    _enqueue(
        {
            "type": "macro_result",
            "remote_id": remote_id,
            "btn_id": btn_id,
            "action_type": action_type,
            "ok": result.get("ok", False),
            "message": result.get("message", ""),
        }
    )


def _persist_bindings() -> None:
    with _bindings_lock:
        snapshot = dict(_macro_bindings)
    save_bindings(snapshot)


def _combos_snapshot_payload() -> dict:
    return {"type": "combos_snapshot", "combos": load_combos()}


def _bindings_snapshot_payload() -> dict:
    with _bindings_lock:
        items = []
        for key, binding in _macro_bindings.items():
            dash = key.find("-")
            if dash <= 0:
                continue
            items.append(
                {
                    "remote_id": key[:dash],
                    "btn_id": key[dash + 1 :],
                    "action_type": binding.get("action_type", ""),
                    "nickname": binding.get("nickname", ""),
                    "media_key": binding.get("media_key", ""),
                }
            )
    return {"type": "bindings_snapshot", "bindings": items}


def get_binding(remote_id: str, btn_id: str) -> dict | None:
    with _bindings_lock:
        return _macro_bindings.get(_binding_key(remote_id, btn_id))


def set_binding(
    remote_id: str,
    btn_id: str,
    action_type: str,
    nickname: str,
    media_key: str = "",
) -> None:
    key = _binding_key(remote_id, btn_id)
    with _bindings_lock:
        if action_type == "none":
            _macro_bindings.pop(key, None)
        else:
            _macro_bindings[key] = {
                "action_type": action_type,
                "nickname": nickname,
                "media_key": media_key,
            }
    extra = f", key={media_key}" if action_type == "media" and media_key else ""
    print(f"[Bindings] {key} -> {action_type} ({nickname or '—'}{extra})")
    _persist_bindings()


def sync_bindings(bindings: list) -> None:
    with _bindings_lock:
        _macro_bindings.clear()
        for item in bindings:
            remote_id = str(item.get("remote_id", ""))
            btn_id = str(item.get("btn_id", ""))
            action_type = str(item.get("action_type", "none"))
            nickname = str(item.get("nickname", ""))
            if not remote_id or not btn_id or action_type == "none":
                continue
            _macro_bindings[_binding_key(remote_id, btn_id)] = {
                "action_type": action_type,
                "nickname": nickname,
                "media_key": str(item.get("media_key", "")),
            }
    print(f"[Bindings] Synced {len(_macro_bindings)} macro(s) from frontend")
    _persist_bindings()


def _handle_incoming_message(raw: str) -> None:
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[WS] Ignoring malformed JSON: {raw[:120]}")
        return

    msg_type = msg.get("type")

    if msg_type == "set_binding":
        set_binding(
            str(msg.get("remote_id", "")),
            str(msg.get("btn_id", "")),
            str(msg.get("action_type", "none")),
            str(msg.get("nickname", "")),
            str(msg.get("media_key", "")),
        )
        return

    if msg_type == "sync_bindings":
        sync_bindings(msg.get("bindings") or [])
        return

    if msg_type == "clear_binding":
        set_binding(
            str(msg.get("remote_id", "")),
            str(msg.get("btn_id", "")),
            "none",
            "",
        )
        return

    if msg_type == "save_combo":
        combo = upsert_combo(msg.get("combo") or {})
        if combo:
            print(f"[Combos] Saved {combo['id']} ({combo['name']}, {len(combo['steps'])} steps)")
            _enqueue(_combos_snapshot_payload())
        return

    if msg_type == "delete_combo":
        combo_id = str(msg.get("id", ""))
        if delete_combo(combo_id):
            print(f"[Combos] Deleted {combo_id}")
            _enqueue(_combos_snapshot_payload())
        return

    if msg_type == "test_macro":
        action_type = str(msg.get("action_type", "none"))
        nickname = str(msg.get("nickname", "test"))
        remote_id = str(msg.get("remote_id", "00000000000000000000"))
        btn_id = str(msg.get("btn_id", "0000"))
        media_key = str(msg.get("media_key", ""))
        result = run_macro(
            action_type, nickname, remote_id, btn_id, media_key=media_key
        )
        emit_macro_result(remote_id, btn_id, action_type, result)
        return

    print(f"[WS] Unknown message type: {msg_type}")


def _dispatch_macro(
    remote_id: str,
    btn_id: str,
    action_type: str,
    nickname: str,
    media_key: str = "",
) -> None:
    result = run_macro(action_type, nickname, remote_id, btn_id, media_key=media_key)
    # Handlers print their own lines for media/script; log the rest here.
    if action_type not in ("media", "screenshot", "script"):
        label = nickname or action_type
        status = "ok" if result.get("ok") else "fail"
        print(f"[MACRO:{action_type}] {label} ({status})")
    emit_macro_result(remote_id, btn_id, action_type, result)


def _execute_bound_macro(remote_id: str, btn_id: str) -> None:
    binding = get_binding(remote_id, btn_id)
    if not binding:
        return

    action_type = binding.get("action_type", "none")
    if action_type == "none":
        return

    nickname = binding.get("nickname", "")
    media_key = binding.get("media_key", "")

    # Script + ss macros block on subprocess.run — run off the SDR decode thread.
    if action_type == "script" or action_type == "screenshot":
        threading.Thread(
            target=_dispatch_macro,
            args=(remote_id, btn_id, action_type, nickname, media_key),
            daemon=True,
        ).start()
        return

    _dispatch_macro(remote_id, btn_id, action_type, nickname, media_key)


def emit_btn_press_event(
    event_type: str,
    remote_id: str,
    btn_id: str,
    at: float,
    duration: float,
) -> None:
    _enqueue(
        {
            "type": event_type,
            "remote_id": remote_id,
            "btn_id": btn_id,
            "at": at,
            "duration": duration,
        }
    )


def notify_button_down(
    remote_id: str,
    btn_id: str,
    at: float,
    duration: float = 0.0,
) -> None:
    record_button_down(remote_id, btn_id, at)
    emit_btn_press_event("button_down", remote_id, btn_id, at, duration)


def _dispatch_combo_macro(combo: dict, remote_id: str, btn_id: str) -> None:
    action_type = str(combo.get("action_type", "none"))
    if action_type == "none":
        return

    nickname = str(combo.get("nickname", ""))
    media_key = str(combo.get("media_key", ""))
    combo_name = str(combo.get("name", ""))
    combo_id = str(combo.get("id", ""))

    print(f"[Combos] Matched {combo_name} ({combo_id})")
    _enqueue(
        {
            "type": "combo_triggered",
            "combo_id": combo_id,
            "combo_name": combo_name,
            "remote_id": remote_id,
            "btn_id": btn_id,
        }
    )

    if action_type in ("script", "screenshot"):
        threading.Thread(
            target=_dispatch_macro,
            args=(remote_id, btn_id, action_type, nickname, media_key),
            daemon=True,
        ).start()
        return

    _dispatch_macro(remote_id, btn_id, action_type, nickname, media_key)


def notify_button_up(
    remote_id: str,
    btn_id: str,
    at: float,
    duration: float,
) -> None:
    emit_btn_press_event("button_up", remote_id, btn_id, at, duration)
    combo = record_button_up(remote_id, btn_id, at, duration)
    if combo:
        _dispatch_combo_macro(combo, remote_id, btn_id)


def handle_packet(remote_id: str, btn_id: str) -> None:
    """Broadcast a decode event to clients and run any bound macro."""
    emit_packet_event(remote_id, btn_id)
    _execute_bound_macro(remote_id, btn_id)


async def _ws_handler(websocket):
    with _clients_lock:
        _connected_clients.add(websocket)
    print("[WS] Client connected")
    try:
        await websocket.send(json.dumps(_bindings_snapshot_payload()))
        await websocket.send(json.dumps(_combos_snapshot_payload()))
    except Exception:
        pass
    try:
        async for message in websocket:
            await asyncio.to_thread(_handle_incoming_message, message)
    finally:
        with _clients_lock:
            _connected_clients.discard(websocket)
        print("[WS] Client disconnected")


async def _broadcast_worker():
    while True:
        try:
            message = await asyncio.to_thread(_broadcast_queue.get, True, 0.05)
        except queue.Empty:
            await asyncio.sleep(0.02)
            continue

        with _clients_lock:
            clients = list(_connected_clients)

        if not clients:
            continue

        dead = []
        for client in clients:
            try:
                await client.send(message)
            except Exception:
                dead.append(client)

        if dead:
            with _clients_lock:
                for client in dead:
                    _connected_clients.discard(client)


async def _run_ws_server(host: str, port: int):
    async with websockets.serve(_ws_handler, host, port):
        print(f"WebSocket server listening on ws://{host}:{port}")
        await _broadcast_worker()


def start_ws_server(host: str = WS_HOST, port: int = WS_PORT) -> None:
    """Start the WebSocket server on a background daemon thread."""
    global _macro_bindings
    loaded = load_bindings()
    with _bindings_lock:
        _macro_bindings = loaded
    if loaded:
        print(f"[Bindings] Loaded {len(loaded)} macro(s) from disk")
    else:
        print("[Bindings] No saved macros on disk")

    combos = load_combos()
    if combos:
        print(f"[Combos] Loaded {len(combos)} combo(s) from disk")
    else:
        print("[Combos] No saved combos on disk")

    def _run():
        asyncio.run(_run_ws_server(host, port))

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
