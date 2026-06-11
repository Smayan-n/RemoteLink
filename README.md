# RemoteLink

Turn any cheap household radio remote into a programmable wireless controller for your computer.

## What It Does

RemoteLink captures radio signals from standard 433.92 MHz remotes using the EV1527 Protocol (like ceiling fan, garage door, or LED light remotes) using a USB software-defined radio (SDR), decodes them in real time, and maps them to custom computer actions—keyboard shortcuts, macros, multi-button combos, or even virtual keyboard input.

## Quick Start

### Requirements
- Nooelec RTL-SDR (or compatible USB receiver)
- Python 3.7+
- Node.js 18+ (for dashboard)

### Installation

```bash
# Backend decoder
pip install websockets numpy scipy

# Frontend dashboard
cd frontend
npm install
```

### Usage

1. **Start the decoder:**
```bash
cd backend
python main.py
```

2. **Start the dashboard:**
```bash
cd frontend
npm run dev
```

3. **Open browser:** http://localhost:5173

4. **Configure mappings:** Use the dashboard to bind remote buttons to actions (key presses, scripts, combos, or text input)

## How It Works

- **Signal Capture:** SDR reads raw radio waves at 2.048 MHz sample rate
- **Decoding:** Extracts 24-bit EV1527 protocol packets (20-bit remote ID + 4-bit button ID)
- **Smart State Machine:** Distinguishes between taps, long holds, and multi-button sequences
- **Execution:** Triggers mapped macros via pyautogui or WebSocket commands

## Features

✓ Single-button macro execution  
✓ Multi-button combo detection (with timing tolerance)  
✓ Virtual keyboard mapping (11 buttons → 4+ characters each)  
✓ Real-time dashboard UI  
✓ Low-latency WebSocket streaming  

## Limitations

- No simultaneous multi-button support (radio interference)
- 600ms release latency (for reliable button-up detection)
- No built-in error correction

## Project Background

This was built for **CSE 462 Final Project** as a proof-of-concept that simple static radio signals can be made interactive through clever software timing rules and signal processing.

See the full project report in the repository for technical details on RF modulation, signal processing pipeline, and protocol implementation.
