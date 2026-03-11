# CLAUDE.md — Agent Instructions

## Project

G2 Smart Glasses App — real-time voice transcription for Even Realities G2 smart glasses using Whisper AI. Falls back to browser microphone when glasses are not connected.

## Tech Stack

- **Runtime / Package Manager:** Bun
- **Build:** Vite 6
- **Language:** TypeScript 5 (strict mode)
- **AI Model:** Whisper tiny.en via `@huggingface/transformers`
- **Hardware SDK:** `@evenrealities/even_hub_sdk`
- **Dev Environment:** Nix flakes

## Common Commands

```sh
nix develop              # Enter dev shell (provides bun + typescript-language-server)
bun install              # Install dependencies
bun run dev              # Vite dev server on 0.0.0.0:5173
bun run sim              # Dev server + Even Hub simulator
bun run build            # Production build (outputs to dist/)
bun run check            # TypeScript type-check (tsc --noEmit)
bun run pack             # Build + package .ehpk for Even Hub
bun run qr               # Generate QR code for phone connection
```

## Project Structure

```
src/
  main.ts    — App entry: DOM, worker comms, glasses events, recording toggle
  audio.ts   — AudioCapture interface + GlassesAudioCapture / BrowserAudioCapture
  worker.ts  — Web Worker: loads Whisper model, runs transcription
scripts/
  start-sim.mjs — Launches Vite + Even Hub simulator together
```

## Code Conventions

- TypeScript strict mode — do not disable strict checks
- ES2022 target with bundler module resolution
- Use `satisfies` for type-safe message passing (see worker.ts)
- Audio format: PCM S16LE, 16 kHz mono (resampled from browser native rate)
- Keep dependencies minimal — this runs on constrained hardware

## Architecture Notes

- `main.ts` creates a Web Worker (`worker.ts`) that loads the Whisper model on startup
- Streaming transcription sends audio chunks every 3 seconds during recording
- Final transcription is sent when recording stops (message without `id` field)
- The `AudioCapture` interface abstracts glasses vs browser microphone
- Display updates go to glasses via `TextContainerUpgrade` when connected

## Do Not

- Add Node.js-specific APIs to `src/` — this runs in the browser
- Use `npm` or `npx` — use `bun` and `bunx` exclusively
- Pin Even Realities SDK versions — they use `latest` intentionally
- Add heavy dependencies — the app must load quickly on mobile/glasses
