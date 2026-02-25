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
  /** Returns the current accumulated audio buffer without stopping recording. */
  getAudio(): Promise<Float32Array>;
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

  async getAudio(): Promise<Float32Array> {
    return mergeChunks(this.chunks);
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
 * Captures audio from the browser microphone via AudioContext + ScriptProcessorNode.
 * Collects raw PCM so we can read the buffer mid-recording for streaming transcription.
 * Resamples to 16kHz mono for Whisper.
 */
export class BrowserAudioCapture implements AudioCapture {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private nativeSampleRate = 48000;

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
    this.chunks = [];

    // Create AudioContext inside start() — called from user gesture, avoids suspension
    this.audioCtx = new AudioContext();
    this.nativeSampleRate = this.audioCtx.sampleRate;
    console.log("[audio] start — native sampleRate:", this.nativeSampleRate);

    this.sourceNode = this.audioCtx.createMediaStreamSource(this.stream!);
    // bufferSize 4096 is a good balance between latency and performance
    this.processorNode = this.audioCtx.createScriptProcessor(4096, 1, 1);

    this.processorNode.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      // Copy — the buffer is reused by the browser
      this.chunks.push(new Float32Array(input));
    };

    this.sourceNode.connect(this.processorNode);
    // ScriptProcessorNode must be connected to destination to fire events
    this.processorNode.connect(this.audioCtx.destination);

    console.log("[audio] recording started");
  }

  async getAudio(): Promise<Float32Array> {
    return this.resample(mergeChunks(this.chunks));
  }

  async stop(): Promise<Float32Array> {
    this.processorNode?.disconnect();
    this.sourceNode?.disconnect();
    this.processorNode = null;
    this.sourceNode = null;

    const audio = this.resample(mergeChunks(this.chunks));

    this.audioCtx?.close();
    this.audioCtx = null;

    console.log("[audio] final samples:", audio.length);
    return audio;
  }

  /** Resample from native sample rate to 16kHz for Whisper. */
  private resample(raw: Float32Array): Float32Array {
    if (this.nativeSampleRate === 16000) return new Float32Array(raw);
    const ratio = 16000 / this.nativeSampleRate;
    const outLen = Math.round(raw.length * ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const srcIdx = i / ratio;
      const lo = Math.floor(srcIdx);
      const hi = Math.min(lo + 1, raw.length - 1);
      const frac = srcIdx - lo;
      out[i] = raw[lo] * (1 - frac) + raw[hi] * frac;
    }
    return out;
  }

  dispose() {
    this.processorNode?.disconnect();
    this.sourceNode?.disconnect();
    this.audioCtx?.close();
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
