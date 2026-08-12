const scanner = document.getElementById("scanner");
const startButtons = [document.getElementById("startBtn"), document.getElementById("bottomScan")];
const closeScanner = document.getElementById("closeScanner");
const flashBtn = document.getElementById("flashBtn");
const videoView = document.getElementById("videoView");
const experienceVideo = document.getElementById("experienceVideo");
const muteBtn = document.getElementById("muteBtn");
const replayBtn = document.getElementById("replayBtn");
const againBtn = document.getElementById("againBtn");
const scanTitle = document.getElementById("scanTitle");
const scanText = document.getElementById("scanText");
const scanDebug = document.getElementById("scanDebug");
const scannerHint = document.getElementById("scannerHint");
const scene = document.getElementById("mindarScene");

let arSystem = null;
let targetFound = false;
let track = null;
let torchOn = false;
let muted = true;

function toastMsg(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2400);
}

function setText(title, text, debug = "") {
  scanTitle.textContent = title;
  scanText.textContent = text;
  if (debug) scanDebug.textContent = debug;
}

scene.addEventListener("loaded", () => {
  arSystem = scene.systems["mindar-image-system"];
});

scene.addEventListener("arReady", () => {
  setText("SCAN THE FRAME", "Point the rear camera at the printed Star Creation frame.", "MindAR ready • target 01");
  scannerHint.textContent = "Keep the complete artwork visible.";
});

scene.addEventListener("arError", () => {
  setText("CAMERA ERROR", "MindAR could not start the camera.", "Use the HTTPS GitHub Pages URL.");
  toastMsg("Camera could not start.");
});

scene.addEventListener("targetFound", () => {
  if (targetFound) return;
  targetFound = true;
  setText("FRAME DETECTED", "Opening your hidden video…", "✓ Image target found");
  scannerHint.textContent = "Experience unlocked.";

  // Stop the image tracker before showing the video.
  if (arSystem) arSystem.stop();

  setTimeout(() => {
    stopTorch();
    videoView.classList.add("show");
    videoView.setAttribute("aria-hidden", "false");
    experienceVideo.muted = muted;
    experienceVideo.currentTime = 0;
    experienceVideo.play().catch(() => toastMsg("Tap SOUND to start playback."));
  }, 250);
});

scene.addEventListener("targetLost", () => {
  if (!targetFound) {
    scanDebug.textContent = "Target not found yet…";
  }
});

async function getCameraTrack() {
  try {
    const videos = document.querySelectorAll("video");
    for (const v of videos) {
      if (v.srcObject && v.srcObject.getVideoTracks) {
        const tracks = v.srcObject.getVideoTracks();
        if (tracks.length) return tracks[0];
      }
    }
  } catch (_) {}
  return null;
}

async function prepareFlashButton() {
  // MindAR owns the camera. Wait briefly for its camera video to be attached.
  setTimeout(async () => {
    track = await getCameraTrack();
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    flashBtn.style.display = caps.torch ? "grid" : "none";
  }, 1000);
}

async function toggleFlash() {
  if (!track) track = await getCameraTrack();
  const caps = track && track.getCapabilities ? track.getCapabilities() : {};
  if (!caps.torch) {
    toastMsg("Flash control is not available on this browser.");
    return;
  }

  try {
    torchOn = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    flashBtn.classList.toggle("on", torchOn);
    toastMsg(torchOn ? "Flash ON" : "Flash OFF");
  } catch (e) {
    torchOn = false;
    flashBtn.classList.remove("on");
    toastMsg("This phone does not allow browser flash control.");
  }
}

async function stopTorch() {
  if (!track) return;
  try { await track.applyConstraints({ advanced: [{ torch: false }] }); } catch (_) {}
  torchOn = false;
  flashBtn.classList.remove("on");
}

async function openScanner() {
  scanner.classList.add("active");
  scanner.setAttribute("aria-hidden", "false");
  videoView.classList.remove("show");
  videoView.setAttribute("aria-hidden", "true");
  experienceVideo.pause();
  experienceVideo.currentTime = 0;
  targetFound = false;

  if (!arSystem) {
    setText("LOADING SCANNER", "Preparing image recognition…", "MindAR loading");
    return;
  }

  setText("STARTING CAMERA", "Please allow camera access.", "MindAR image target");
  try {
    await arSystem.start();
    await prepareFlashButton();
  } catch (e) {
    console.error(e);
    setText("SCANNER NOT READY", "Camera permission or browser access failed.", "Use HTTPS and allow camera.");
    toastMsg("Could not start scanner.");
  }
}

async function closeAll() {
  stopTorch();
  if (arSystem) {
    try { arSystem.stop(); } catch (_) {}
  }
  experienceVideo.pause();
  experienceVideo.currentTime = 0;
  videoView.classList.remove("show");
  videoView.setAttribute("aria-hidden", "true");
  scanner.classList.remove("active");
  scanner.setAttribute("aria-hidden", "true");
}

async function scanAgain() {
  await closeAll();
  openScanner();
}

startButtons.forEach(button => button.addEventListener("click", openScanner));
closeScanner.addEventListener("click", closeAll);
flashBtn.addEventListener("click", toggleFlash);
againBtn.addEventListener("click", scanAgain);

muteBtn.addEventListener("click", async () => {
  muted = !muted;
  experienceVideo.muted = muted;
  muteBtn.textContent = muted ? "🔇 SOUND" : "🔊 SOUND";
  if (!muted) {
    try { await experienceVideo.play(); } catch (_) {}
  }
});

replayBtn.addEventListener("click", async () => {
  experienceVideo.currentTime = 0;
  try { await experienceVideo.play(); } catch (_) {}
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopTorch();
    if (arSystem && scanner.classList.contains("active")) {
      try { arSystem.stop(); } catch (_) {}
    }
    experienceVideo.pause();
  }
});
