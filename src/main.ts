import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  OsEventTypeList,
} from "@evenrealities/even_hub_sdk";
import type { EvenAppBridge, EvenHubEvent } from "@evenrealities/even_hub_sdk";
import {
  GlassesAudioCapture,
  BrowserAudioCapture,
  type AudioCapture,
} from "./audio";
import type { WorkerResponse } from "./worker";

// --- DOM elements ---
const statusEl = document.getElementById("status")!;
const modelStatusEl = document.getElementById("model-status")!;
const recordBtn = document.getElementById("record-btn") as HTMLButtonElement;
const logEl = document.getElementById("log")!;

function log(msg: string, type: "info" | "event" | "error" = "info") {
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.prepend(entry);
}

// --- Whisper worker ---
const worker = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module",
});

let modelReady = false;

worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
  const msg = e.data;

  if (msg.type === "progress") {
    const pct =
      msg.progress != null ? ` ${Math.round(msg.progress)}%` : "";
    const file = msg.file ? ` ${msg.file}` : "";
    modelStatusEl.textContent = `Model: ${msg.status}${file}${pct}`;
    if (msg.status === "initiate") {
      log(`Loading Whisper model (${msg.file})`, "info");
    }
  } else if (msg.type === "ready") {
    modelReady = true;
    modelStatusEl.textContent = `Model: ready (${msg.device})`;
    recordBtn.disabled = false;
    log(`Whisper model ready (${msg.device})`, "event");
    updateDisplay("Ready - tap to record");
  } else if (msg.type === "result") {
    log(`Transcript: ${msg.text}`, "event");
    updateDisplay(msg.text);
    statusEl.textContent = "Tap to record";
    recordBtn.textContent = "Record";
  } else if (msg.type === "error") {
    log(`Worker error: ${msg.error}`, "error");
    statusEl.textContent = "Error - tap to retry";
    recordBtn.textContent = "Record";
  }
};

// Start model download immediately
worker.postMessage({ type: "load" });

// --- State ---
let bridge: EvenAppBridge | null = null;
let audioCapture: AudioCapture | null = null;
let browserCapture: BrowserAudioCapture | null = null;
let recording = false;

// --- Display ---
function updateDisplay(text: string) {
  if (!bridge) return;
  bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: 1,
      containerName: "main-text",
      content: text,
    }),
  );
}

// --- Recording toggle ---
function startRecording() {
  if (!audioCapture) return;
  recording = true;
  audioCapture.start();
  statusEl.textContent = "Recording...";
  recordBtn.textContent = "Stop";
  recordBtn.classList.add("recording");
  updateDisplay("Recording...");
  log("Recording started", "event");
}

async function stopRecording() {
  if (!audioCapture || !recording) return;
  recording = false;
  recordBtn.textContent = "...";
  recordBtn.classList.remove("recording");
  recordBtn.disabled = true;

  try {
    const audio = await audioCapture.stop();
    const durationSec = audio.length / 16000;
    log(`Captured ${audio.length} samples (${durationSec.toFixed(1)}s)`, "info");

    if (audio.length < 1600) {
      log("Recording too short, ignoring", "error");
      statusEl.textContent = "Too short - try again";
      recordBtn.textContent = "Record";
      recordBtn.disabled = false;
      return;
    }

    statusEl.textContent = "Transcribing...";
    updateDisplay("Transcribing...");

    worker.postMessage({ type: "transcribe", audio }, [audio.buffer]);
    recordBtn.disabled = false;
  } catch (err) {
    log(`Audio decode error: ${err}`, "error");
    statusEl.textContent = "Audio error - try again";
    recordBtn.textContent = "Record";
    recordBtn.disabled = false;
  }
}

function toggleRecording() {
  if (!modelReady) return;
  if (recording) {
    stopRecording();
  } else {
    startRecording();
  }
}

// Browser button
recordBtn.addEventListener("click", toggleRecording);

// --- Main init ---
async function main() {
  log("Starting G2 app...");

  // Try glasses bridge — detect if it's actually connected to Flutter
  let glassesConnected = false;
  try {
    bridge = await waitForEvenAppBridge();
    // Test if the bridge can actually communicate with Flutter
    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 1,
        textObject: [
          new TextContainerProperty({
            xPosition: 0,
            yPosition: 0,
            width: 576,
            height: 288,
            containerID: 1,
            containerName: "main-text",
            content: "Loading Whisper...",
            isEventCapture: 1,
            borderWidth: 0,
            paddingLength: 8,
          }),
        ],
      }),
    );
    // result=0 means success; non-zero or falsy means failure
    glassesConnected = result === 0;
    if (glassesConnected) {
      log(`Glasses connected (result: ${result})`, "event");
    } else {
      log(`Bridge exists but no glasses (result: ${result})`, "info");
    }
  } catch (err) {
    bridge = null;
    log(`Bridge not available: ${err}`, "error");
  }

  if (glassesConnected && bridge) {
    statusEl.textContent = "Connected to glasses";

    // Glasses audio capture
    audioCapture = new GlassesAudioCapture(bridge);

    // Glasses event handling — tap to toggle, double-tap to clear
    bridge.onEvenHubEvent((event: EvenHubEvent) => {
      if (event.audioEvent) return;

      const eventType =
        event.textEvent?.eventType ??
        event.listEvent?.eventType ??
        event.sysEvent?.eventType;

      if (
        eventType === OsEventTypeList.CLICK_EVENT ||
        eventType === undefined
      ) {
        toggleRecording();
      } else if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        updateDisplay("");
        log("Display cleared", "event");
      }
    });

    bridge.onDeviceStatusChanged((status) => {
      log(
        `Device: ${status.connectType}` +
          (status.batteryLevel != null
            ? ` battery=${status.batteryLevel}%`
            : "") +
          (status.isWearing != null ? ` wearing=${status.isWearing}` : ""),
        "event",
      );
    });
  } else {
    // Browser-only: use getUserMedia
    bridge = null;
    statusEl.textContent = "Browser-only mode";
    try {
      browserCapture = new BrowserAudioCapture();
      await browserCapture.init();
      audioCapture = browserCapture;
      log("Browser microphone ready", "event");
    } catch (err) {
      log(`Mic access denied: ${err}`, "error");
      statusEl.textContent = "Mic access denied";
    }
  }

  log("Waiting for Whisper model...");
}

main();
