import type { EvenAppBridge, EvenHubEvent } from "@evenrealities/even_hub_sdk";

/** Convert S16LE Uint8Array to Float32Array normalised to [-1, 1]. */
function pcmS16LEtoFloat32(uint8: Uint8Array): Float32Array {
  const int16 = new Int16Array(
    uint8.buffer,
    uint8.byteOffset,
    uint8.length / 2,
  );
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
  return float32;
}

export interface AudioCapture {
  start(): void;
  stop(): Promise<Float32Array>;
}

/**
 * Captures audio from the G2 glasses microphone via the Even Hub bridge.
 * PCM S16LE, 16kHz mono, 40 bytes per 10ms frame.
 */
export class GlassesAudioCapture implements AudioCapture {
  private chunks: Float32Array[] = [];
  private recording = false;
  private unsubscribe: (() => void) | null = null;

  constructor(private bridge: EvenAppBridge) {}

  start() {
    this.chunks = [];
    this.recording = true;

    this.unsubscribe = this.bridge.onEvenHubEvent((event: EvenHubEvent) => {
      if (this.recording && event.audioEvent) {
        this.chunks.push(pcmS16LEtoFloat32(event.audioEvent.audioPcm));
      }
    });

    this.bridge.audioControl(true);
  }

  async stop(): Promise<Float32Array> {
    this.recording = false;
    this.bridge.audioControl(false);
    this.unsubscribe?.();
    this.unsubscribe = null;
    return mergeChunks(this.chunks);
  }
}

/**
 * Captures audio from the browser microphone via MediaRecorder.
 * Decodes and resamples to 16kHz mono for Whisper.
 */
export class BrowserAudioCapture implements AudioCapture {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private blobChunks: Blob[] = [];

  /** Request mic permission (call once on init). */
  async init(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true },
    });
    const track = this.stream.getAudioTracks()[0];
    console.log("[audio] track:", track.label, "state:", track.readyState);
    console.log("[audio] track settings:", JSON.stringify(track.getSettings()));
  }

  start() {
    this.blobChunks = [];
    const track = this.stream!.getAudioTracks()[0];
    console.log("[audio] start — track state:", track.readyState);

    this.recorder = new MediaRecorder(this.stream!);
    console.log("[audio] recorder mimeType:", this.recorder.mimeType);

    this.recorder.ondataavailable = (e) => {
      console.log("[audio] ondataavailable size:", e.data.size);
      if (e.data.size > 0) this.blobChunks.push(e.data);
    };
    this.recorder.start();
    console.log("[audio] recorder state:", this.recorder.state);
  }

  stop(): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state === "inactive") {
        console.log("[audio] stop — recorder inactive or null");
        reject(new Error("Not recording"));
        return;
      }

      this.recorder.onstop = async () => {
        try {
          console.log("[audio] onstop — chunks:", this.blobChunks.length);
          const blob = new Blob(this.blobChunks);
          console.log("[audio] blob size:", blob.size, "type:", blob.type);

          const arrayBuffer = await blob.arrayBuffer();
          console.log("[audio] arrayBuffer bytes:", arrayBuffer.byteLength);

          // Decode at native sample rate, then resample
          const audioCtx = new AudioContext();
          console.log("[audio] decode ctx sampleRate:", audioCtx.sampleRate);

          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          console.log(
            "[audio] decoded — sr:",
            audioBuffer.sampleRate,
            "len:",
            audioBuffer.length,
            "dur:",
            audioBuffer.duration,
            "ch:",
            audioBuffer.numberOfChannels,
          );
          audioCtx.close();

          const raw = audioBuffer.getChannelData(0);

          // Resample to 16kHz
          const srcRate = audioBuffer.sampleRate;
          let float32: Float32Array;
          if (srcRate === 16000) {
            float32 = new Float32Array(raw);
          } else {
            const ratio = 16000 / srcRate;
            const outLen = Math.round(raw.length * ratio);
            float32 = new Float32Array(outLen);
            for (let i = 0; i < outLen; i++) {
              const srcIdx = i / ratio;
              const lo = Math.floor(srcIdx);
              const hi = Math.min(lo + 1, raw.length - 1);
              const frac = srcIdx - lo;
              float32[i] = raw[lo] * (1 - frac) + raw[hi] * frac;
            }
          }

          console.log("[audio] final samples:", float32.length);
          resolve(float32);
        } catch (err) {
          console.error("[audio] decode error:", err);
          reject(err);
        }
      };

      this.recorder.stop();
    });
  }

  dispose() {
    this.recorder?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}
