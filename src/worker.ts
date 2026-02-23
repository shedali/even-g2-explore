import {
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;

export type WorkerRequest =
  | { type: "load" }
  | { type: "transcribe"; audio: Float32Array };

export type WorkerResponse =
  | { type: "progress"; status: string; file?: string; progress?: number }
  | { type: "ready"; device: string }
  | { type: "result"; text: string }
  | { type: "error"; error: string };

async function detectDevice(): Promise<"webgpu" | "wasm"> {
  if ("gpu" in navigator) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (adapter) return "webgpu";
    } catch {
      // WebGPU not usable
    }
  }
  return "wasm";
}

async function loadModel() {
  const device = await detectDevice();

  self.postMessage({
    type: "progress",
    status: "initiate",
    file: `device: ${device}`,
  } satisfies WorkerResponse);

  // Cast needed: pipeline() overloads produce a union too complex for TS
  const create = pipeline as (
    task: string,
    model: string,
    options: Record<string, unknown>,
  ) => Promise<AutomaticSpeechRecognitionPipeline>;

  transcriber = await create(
    "automatic-speech-recognition",
    "onnx-community/whisper-tiny.en",
    {
      device,
      dtype: device === "webgpu" ? "fp32" : "q8",
      progress_callback: (p: Record<string, unknown>) => {
        self.postMessage({
          type: "progress",
          status: String(p.status ?? ""),
          file: p.file != null ? String(p.file) : undefined,
          progress: typeof p.progress === "number" ? p.progress : undefined,
        } satisfies WorkerResponse);
      },
    },
  );

  self.postMessage({ type: "ready", device } satisfies WorkerResponse);
}

async function transcribe(audio: Float32Array) {
  if (!transcriber) {
    self.postMessage({
      type: "error",
      error: "Model not loaded",
    } satisfies WorkerResponse);
    return;
  }

  const result = await transcriber(audio);
  const text = Array.isArray(result) ? result[0].text : result.text;
  self.postMessage({
    type: "result",
    text: text.trim(),
  } satisfies WorkerResponse);
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { type } = e.data;

  if (type === "load") {
    try {
      await loadModel();
    } catch (err) {
      self.postMessage({
        type: "error",
        error: `Model load failed: ${err}`,
      } satisfies WorkerResponse);
    }
  } else if (type === "transcribe") {
    try {
      await transcribe(e.data.audio);
    } catch (err) {
      self.postMessage({
        type: "error",
        error: `Transcription failed: ${err}`,
      } satisfies WorkerResponse);
    }
  }
};
