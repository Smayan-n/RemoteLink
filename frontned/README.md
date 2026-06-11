# SDR Remote Frontend

Live dashboard for the EV1527 SDR decoder backend.

## Prerequisites

- Node.js 18+
- Python backend running `sdr-remote.py` (WebSocket on port `5001`)

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Backend

From the project root:

```bash
pip install websockets
python sdr-remote.py
```

The decoder broadcasts JSON payloads:

```json
{ "remote_id": "0101...", "btn_id": "0010" }
```
