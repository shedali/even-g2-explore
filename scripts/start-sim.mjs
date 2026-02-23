import { spawn } from "node:child_process";

const DEV_URL = "http://localhost:5173";

// Start Vite dev server
const vite = spawn("bunx", ["vite", "--host", "0.0.0.0", "--port", "5173"], {
  stdio: "inherit",
  env: { ...process.env },
});

// Wait for Vite to be ready, then launch simulator
async function waitForServer(url, retries = 30, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      await fetch(url);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(`Server at ${url} did not start in time`);
}

waitForServer(DEV_URL).then(() => {
  console.log(`\nDev server ready at ${DEV_URL}`);
  console.log("Starting Even Hub Simulator...\n");

  const sim = spawn("bunx", ["evenhub-simulator", DEV_URL], {
    stdio: "inherit",
    env: { ...process.env },
  });

  sim.on("error", (err) => {
    console.error("Failed to start simulator:", err.message);
  });
});

vite.on("close", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  vite.kill("SIGINT");
  process.exit(0);
});
