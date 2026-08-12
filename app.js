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
let refDescriptors = null;
let refKeypoints = null;
let detector = null;
let matcher = null;
let lastDetect = 0;
let raf = null;
let muted = true;
let detectorName = "";

const MIN_MATCHES = 4;
const DETECT_INTERVAL = 300;

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

function waitForCV() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (window.cv && cv.Mat) return resolve();
      if (Date.now() - started > 20000) {
        reject(new Error("OpenCV.js did not load. Check internet access."));
        return;
      }
      setTimeout(check, 120);
    };
    check();
  });
}

async function prepareReference() {
  await waitForCV();

  const img = new Image();
  img.src = "assets/target-poster.jpg";
  await img.decode();

  const maxSide = 1000;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.equalizeHist(gray, gray);

  // Prefer SIFT when available because it is substantially more tolerant
  // of scaling, lighting and screen/print differences.
  if (cv.SIFT && typeof cv.SIFT.create === "function") {
    detector = cv.SIFT.create(1200);
    detectorName = "SIFT";
    refKeypoints = new cv.KeyPointVector();
    refDescriptors = new cv.Mat();
    detector.detectAndCompute(gray, new cv.Mat(), refKeypoints, refDescriptors);
    matcher = new cv.BFMatcher(cv.NORM_L2, false);
  } else {
    detector = new cv.ORB(2200);
    detectorName = "ORB";
    refKeypoints = new cv.KeyPointVector();
    refDescriptors = new cv.Mat();
    detector.detectAndCompute(gray, new cv.Mat(), refKeypoints, refDescriptors);
    matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
  }

  src.delete();
  gray.delete();

  if (!refDescriptors || refDescriptors.empty() || refDescriptors.rows < 8) {
    throw new Error(`Reference image produced too few ${detectorName} features.`);
  }

  return refDescriptors.rows;
}

async function openScanner() {
  scanner.classList.add("active");
  scanner.setAttribute("aria-hidden", "false");
  videoView.classList.remove("show");
  videoView.setAttribute("aria-hidden", "true");
  detected = false;

  setText("STARTING CAMERA", "Preparing image recognition…", "Loading reference image…");

  try {
    const features = await prepareReference();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access requires HTTPS or localhost.");
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    camera.srcObject = stream;
    await camera.play();

    setText(
      "SCAN THE FRAME",
      "Point the rear camera at the same poster image.",
      `${detectorName} ready • ${features} reference features`
    );
    scannerHint.textContent = "Move closer and keep the whole poster visible.";
    running = true;
    loop();
  } catch (error) {
    console.error(error);
    let message = error.message;
    if (error.name === "NotAllowedError") {
      message = "Camera permission was denied. Allow camera access and try again.";
    }
    setText("SCAN NOT READY", message, "Open the HTTPS site and try again.");
    toastMsg(message);
  }
}

function countGoodMatches(frameGray) {
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();

  detector.detectAndCompute(frameGray, new cv.Mat(), keypoints, descriptors);

  let good = 0;
  let total = 0;

  if (!descriptors.empty()) {
    const knn = new cv.DMatchVectorVector();
    matcher.knnMatch(refDescriptors, descriptors, knn, 2);

    total = knn.size();

    for (let i = 0; i < knn.size(); i++) {
      const pair = knn.get(i);

      if (pair.size() >= 2) {
        const a = pair.get(0);
        const b = pair.get(1);

        // Ratio test: tolerant enough for screen/print changes.
        const ratio = detectorName === "SIFT" ? 0.78 : 0.82;
        if (a.distance < ratio * b.distance) good++;

      }

      if (pair && typeof pair.delete === "function") pair.delete();
    }

    knn.delete();
  }

  if (keypoints && typeof keypoints.delete === "function") keypoints.delete();
  if (descriptors && typeof descriptors.delete === "function") descriptors.delete();

  return { good, total };
}

function detect() {
  if (!running || detected || camera.readyState < 2) return;

  try {
    const width = 720;
    const height = Math.round(width * camera.videoHeight / camera.videoWidth);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(camera, 0, 0, width, height);

    const frame = cv.imread(canvas);
    const gray = new cv.Mat();

    cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
    cv.equalizeHist(gray, gray);

    const result = countGoodMatches(gray);

    // Always expose the live number so we can diagnose real-world scanning.
    scanDebug.textContent =
      `${detectorName}: ${result.good} good matches / ${result.total} candidates • need 4`;

    if (result.good >= MIN_MATCHES) {
      triggerExperience();
    }

    if (frame && typeof frame.delete === "function") frame.delete();
    if (gray && typeof gray.delete === "function") gray.delete();
  } catch (error) {
    console.error("Detection pass failed:", error);
    scanDebug.textContent = `Detection error: ${error.message}`;
  }
}

function loop() {
  if (!running) return;

  const now = performance.now();
  if (now - lastDetect >= DETECT_INTERVAL) {
    lastDetect = now;
    detect();
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
  detected = true;
  stopCamera();

  setText("FRAME DETECTED", "Opening your hidden video…", "✓ Poster recognized");
  scannerHint.textContent = "Experience unlocked.";

  setTimeout(() => {
    videoView.classList.add("show");
    videoView.setAttribute("aria-hidden", "false");

    experienceVideo.muted = muted;
    experienceVideo.currentTime = 0;

    experienceVideo.play().catch(() => {
      toastMsg("Tap SOUND or the video to start playback.");
    });
  }, 350);
}

function closeAll() {
  stopCamera();
  experienceVideo.pause();
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
