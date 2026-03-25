# Strokelink

> Real-time P2P collaborative whiteboard powered by WebRTC — zero server-side processing of drawing data.

![Strokelink Lobby](https://img.shields.io/badge/status-working-brightgreen) ![WebRTC](https://img.shields.io/badge/protocol-WebRTC-blue) ![React](https://img.shields.io/badge/frontend-React-61dafb) ![Socket.io](https://img.shields.io/badge/signaling-Socket.io-black)

## Overview

Strokelink lets two users draw on a shared canvas in real time. All drawing data flows **directly between browsers** via WebRTC's `RTCDataChannel` — the server is only used for the initial handshake (offer/answer/ICE exchange via Socket.io).

### Key Features

- **Peer-to-peer drawing** — ultra-low latency, no server bottleneck
- **Room system** — create a room, share the 6-character ID, and start drawing
- **Multi-color support** — each user draws in a different color; pick any color via the toolbar
- **Adjustable brush size** — 1–20px range slider
- **Resolution-independent** — coordinates are normalized (0→1), so the canvas scales across different screen sizes
- **Smooth rendering** — remote strokes are batched via `requestAnimationFrame`
- **Touch support** — works on tablets and touch-enabled devices
- **Copy to clipboard** — one-click copy for Room IDs

## Architecture

```
┌──────────────┐          Signaling           ┌──────────────┐
│   Browser A  │ ◄──── (Socket.io) ────►      │   Browser B  │
│              │    offer/answer/ICE only      │              │
│   React UI   │                              │   React UI   │
│   Canvas     │ ◄═══ RTCDataChannel ═══►     │   Canvas     │
│              │    drawing packets (P2P)      │              │
└──────────────┘                              └──────────────┘
                       ┌─────────┐
                       │ Server  │
                       │ :3001   │
                       │ Express │
                       │ Socket  │
                       └─────────┘
                    (signaling only)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 (Vite) |
| Canvas | HTML5 Canvas 2D API |
| P2P Protocol | WebRTC RTCDataChannel (`ordered: true`) |
| Signaling | Node.js + Express + Socket.io |
| Styling | Vanilla CSS (dark theme, glassmorphism) |

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9

### Installation

```bash
# Clone the repo
git clone <your-repo-url>
cd lightspeed-whiteboard

# Install frontend dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..
```

### Running

Open **two terminals**:

```bash
# Terminal 1 — Start the signaling server
cd server
node index.js
# ⚡ Signaling server running on http://localhost:3001
```

```bash
# Terminal 2 — Start the Vite dev server
npm run dev
# → http://localhost:5173
```

### Usage

1. Open `http://localhost:5173` in **two browser tabs**
2. **Tab 1**: Click **Create New Room** → copy the 6-character Room ID
3. **Tab 2**: Paste the Room ID → click **Join**
4. Draw in either tab — strokes appear in both tabs in real time

## Project Structure

```
├── server/
│   ├── index.js            # Express + Socket.io signaling server
│   └── package.json
├── src/
│   ├── App.jsx             # Root: lobby ↔ whiteboard state machine
│   ├── main.jsx            # Vite entry point
│   ├── index.css           # Design system & styles
│   ├── components/
│   │   ├── Lobby.jsx       # Create/join room UI
│   │   └── Whiteboard.jsx  # Canvas + toolbar + drawing logic
│   └── lib/
│       └── WebRTCManager.js # RTCPeerConnection + DataChannel wrapper
├── index.html
├── package.json
└── vite.config.js
```

## How It Works

### Signaling Flow (Socket.io)

1. **User A** creates a room → server stores the room
2. **User B** joins with the Room ID → server notifies User A
3. **User A** creates an RTCPeerConnection, generates an SDP offer, sends it via Socket.io
4. **User B** receives the offer, creates an answer, sends it back
5. ICE candidates are exchanged via Socket.io
6. Once connected, Socket.io is no longer used for data

### Drawing Flow (RTCDataChannel)

1. Mouse/touch events capture `{x, y}` coordinates
2. Coordinates are **normalized** to `0–1` range (resolution-independent)
3. Packets `{type, x, y, color, size}` are sent via the DataChannel
4. Remote peer receives packets → queues them → renders via `requestAnimationFrame`

### Packet Types

| Type | Description |
|------|-------------|
| `start` | Pen down — begin a new stroke |
| `draw` | Pen move — continue the stroke |
| `end` | Pen up — finish the stroke |
| `clear` | Clear the entire canvas |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| Server port | `3001` | Set via `PORT` env variable |
| Vite dev port | `5173` | Set in `vite.config.js` |
| STUN servers | Google STUN | Configured in `WebRTCManager.js` |
| Max room size | 2 | Hardcoded for 1:1 collaboration |

## License

MIT
