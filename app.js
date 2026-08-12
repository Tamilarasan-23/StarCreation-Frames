const scanner = document.getElementById("scanner");
const startButtons = [document.getElementById("startBtn"), document.getElementById("bottomScan")];
const closeScanner = document.getElementById("closeScanner");
const camera = document.getElementById("camera");
const scanTitle = document.getElementById("scanTitle");
const scanText = document.getElementById("scanText");
const scanDebug = document.getElementById("scanDebug");
const scannerHint = document.getElementById("scannerHint");
const videoView = document.getElementById("videoView");
const experienceVideo = document.getElementById("experienceVideo");
const muteBtn = document.getElementById("muteBtn");
const replayBtn = document.getElementById("replayBtn");
const againBtn = document.getElementById("againBtn");
const toast = document.getElementById("toast");

let stream = null;
let running = false;
let detected = false;
let model = null;
let targetEmbedding = null;
let lastInference = 0;
let raf = null;
let muted = true;
let consecutiveMatches = 0;
let scanStartedAt = 0;
let modelReady = false;

const SIMILARITY_THRESHOLD = 0.84;
const REQUIRED_CONSECUTIVE = 3;
const MIN_SCAN_TIME = 1200;
const INFERENCE_INTERVAL = 650;

function toastMsg(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function setText(title, text, debug = "") {
  scanTitle.textContent = title;
  scanText.textContent = text;
  if (debug) scanDebug.textContent = debug;
}

function cosineSimilarity(a, b) {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return (!aa || !bb) ? 0 : dot / (Math.sqrt(aa) * Math.sqrt(bb));
}

function tensorToArray(tensor) {
  return Array.from(tensor.dataSync());
}

async function imageEmbedding(source) {
  const activation = model.infer(source, "conv_preds");
  const values = tensorToArray(activation);
  activation.dispose();
  return values;
}

function cropCameraFrame() {
  const vw = camera.videoWidth;
  const vh = camera.videoHeight;
  const cropW = Math.floor(vw * 0.78);
  const cropH = Math.floor(vh * 0.88);
  const sx = Math.floor((vw - cropW) / 2);
  const sy = Math.floor((vh - cropH) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 480;
  canvas.getContext("2d").drawImage(camera, sx, sy, cropW, cropH, 0, 0, 480, 480);
  return canvas;
}

async function prepareAI() {
  if (modelReady) return;

  setText("LOADING AI", "Preparing the visual recognition model…", "TensorFlow.js • MobileNet V2");
  await tf.ready();

  model = await mobilenet.load({ version: 2, alpha: 1.0 });

  const target = new Image();
  target.src = "assets/target-poster.jpg";
  await target.decode();

  targetEmbedding = await imageEmbedding(target);
  modelReady = true;

  setText("AI READY", "Point the rear camera at the registered poster.", "MobileNet visual fingerprint loaded");
}

async function openScanner() {
  scanner.classList.add("active");
  scanner.setAttribute("aria-hidden", "false");
  videoView.classList.remove("show");
  videoView.setAttribute("aria-hidden", "true");

  experienceVideo.pause();
  experienceVideo.currentTime = 0;

  detected = false;
  consecutiveMatches = 0;
  scanStartedAt = 0;

  try {
    await prepareAI();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access requires HTTPS or localhost.");
    }

    setText("STARTING CAMERA", "Please allow camera access.", "AI model ready");

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });

    camera.srcObject = stream;
    await camera.play();

    setText("SCAN THE FRAME", "Point the camera at the same poster image.", "AI similarity: waiting…");
    scannerHint.textContent = "Keep the poster inside the guide.";
    running = true;
    scanStartedAt = performance.now();
    consecutiveMatches = 0;
    loop();
  } catch (error) {
    console.error(error);
    let message = error.message || "Unable to start scanner.";
    if (error.name === "NotAllowedError") message = "Camera permission was denied. Allow camera access and try again.";
    setText("SCANNER NOT READY", message, "Check the HTTPS GitHub Pages URL.");
    toastMsg(message);
  }
}

async function runAIInference() {
  if (!running || detected || camera.readyState < 2 || !model) return;

  const canvas = cropCameraFrame();

  try {
    const currentEmbedding = await imageEmbedding(canvas);
    const similarity = cosineSimilarity(targetEmbedding, currentEmbedding);
    const percent = Math.max(0, Math.min(100, Math.round(similarity * 100)));
    const isMatch = similarity >= SIMILARITY_THRESHOLD;

    consecutiveMatches = isMatch ? consecutiveMatches + 1 : 0;

    scanDebug.textContent =
      `AI similarity: ${percent}% • confirm ${consecutiveMatches}/${REQUIRED_CONSECUTIVE}`;

    if (isMatch &&
        consecutiveMatches >= REQUIRED_CONSECUTIVE &&
        performance.now() - scanStartedAt >= MIN_SCAN_TIME) {
      triggerExperience();
    }
  } catch (error) {
    console.error("AI inference error:", error);
    scanDebug.textContent = "AI inference error — retrying…";
  }
}

function loop() {
  if (!running) return;
  const now = performance.now();
  if (now - lastInference >= INFERENCE_INTERVAL) {
    lastInference = now;
    runAIInference();
  }
  raf = requestAnimationFrame(loop);
}

function stopCamera() {
  running = false;
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  camera.srcObject = null;
}

function triggerExperience() {
  if (detected) return;
  detected = true;
  stopCamera();
  setText("FRAME DETECTED", "Opening your hidden video…", "✓ AI image match confirmed");
  scannerHint.textContent = "Experience unlocked.";

  setTimeout(() => {
    videoView.classList.add("show");
    videoView.setAttribute("aria-hidden", "false");
    experienceVideo.muted = muted;
    experienceVideo.currentTime = 0;
    experienceVideo.play().catch(() => toastMsg("Tap SOUND or the video to start playback."));
  }, 350);
}

function closeAll() {
  stopCamera();
  experienceVideo.pause();
  experienceVideo.currentTime = 0;
  videoView.classList.remove("show");
  videoView.setAttribute("aria-hidden", "true");
  scanner.classList.remove("active");
  scanner.setAttribute("aria-hidden", "true");
}

function scanAgain() {
  experienceVideo.pause();
  experienceVideo.currentTime = 0;
  videoView.classList.remove("show");
  videoView.setAttribute("aria-hidden", "true");
  openScanner();
}

startButtons.forEach(btn => btn.addEventListener("click", openScanner));
closeScanner.addEventListener("click", closeAll);
againBtn.addEventListener("click", scanAgain);

muteBtn.addEventListener("click", async () => {
  muted = !muted;
  experienceVideo.muted = muted;
  muteBtn.textContent = muted ? "🔇 SOUND" : "🔊 SOUND";
  if (!muted) {
    try { await experienceVideo.play(); } catch (e) {}
  }
});

replayBtn.addEventListener("click", async () => {
  experienceVideo.currentTime = 0;
  try { await experienceVideo.play(); } catch (e) {}
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && scanner.classList.contains("active")) {
    stopCamera();
    experienceVideo.pause();
  }
});
