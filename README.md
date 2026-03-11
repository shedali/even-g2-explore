# G2 Smart Glasses — Voice Transcription

Real-time speech-to-text for [Even Realities G2](https://www.evenrealities.com/) smart glasses, powered by [Whisper](https://huggingface.co/onnx-community/whisper-tiny.en) running entirely in-browser.

## Features

- **On-device transcription** — Whisper tiny.en runs via WebGPU (or WASM fallback), no server required
- **Streaming results** — Interim transcriptions every 3 seconds while recording
- **Glasses display** — Transcribed text is pushed to the G2 heads-up display
- **Browser fallback** — Works with any browser microphone when glasses aren't connected
- **Tap controls** — Single tap to start/stop recording, double tap to clear display

## Prerequisites

- [Nix](https://nixos.org/download/) with flakes enabled, **or**
- [Bun](https://bun.sh/) ≥ 1.0

## Getting Started

### With Nix (recommended)

```sh
nix develop          # Drops you into a shell with bun + tooling
bun install          # Install JS dependencies
bun run dev          # Start dev server at http://localhost:5173
```

### Without Nix

```sh
bun install
bun run dev
```

### With the simulator

```sh
bun run sim          # Starts Vite + Even Hub simulator
```

### Connecting to real glasses

```sh
bun run qr           # Shows QR code to pair via the Even Hub phone app
```

## Scripts

| Command          | Description                                 |
| ---------------- | ------------------------------------------- |
| `bun run dev`    | Vite dev server on `0.0.0.0:5173`           |
| `bun run sim`    | Dev server + Even Hub simulator             |
| `bun run qr`     | QR code for phone connection                |
| `bun run build`  | Production build → `dist/`                  |
| `bun run pack`   | Build + package `.ehpk` for Even Hub        |
| `bun run check`  | TypeScript type-check (`tsc --noEmit`)      |

## Architecture

```
┌─────────────┐       postMessage        ┌──────────────┐
│  main.ts    │ ◄──────────────────────► │  worker.ts   │
│  (UI/Events)│                          │  (Whisper)   │
└──────┬──────┘                          └──────────────┘
       │
       │ AudioCapture interface
       │
  ┌────┴──────────────────┐
  │                       │
┌─▼──────────────┐  ┌────▼───────────────┐
│ GlassesAudio   │  │ BrowserAudio       │
│ Capture        │  │ Capture            │
│ (Even Hub SDK) │  │ (Web Audio API)    │
└────────────────┘  └────────────────────┘
```

## License

Private — see `package.json`.
