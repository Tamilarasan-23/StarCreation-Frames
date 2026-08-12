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
let orb = null;
let matcher = null;
let lastDetect = 0;
let raf = null;
let muted = true;

const MIN_MATCHES = 7;
const DETECT_INTERVAL = 260;

function toastMsg(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2400);
}

function setText(title, text, debug = "") {
  scanTitle.textContent = title;
  scanText.textContent = text;
  scanDebug.textContent = debug;
}

function waitForCV() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (window.cv && cv.Mat && cv.ORB) return resolve();
      if (Date.now() - started > 20000) {
        return reject(new Error("Image recognition library could not load. Check internet access."));
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

  const maxSide = 900;
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

  orb = new cv.ORB(1800);
  refKeypoints = new cv.KeyPointVector();
  refDescriptors = new cv.Mat();
  orb.detectAndCompute(gray, new cv.Mat(), refKeypoints, refDescriptors);

  src.delete();
  gray.delete();

  if (refDescriptors.empty() || refDescriptors.rows < 8) {
    throw new Error("The reference image has too few recognizable features.");
  }

  matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
  return refDescriptors.rows;
}

async function openScanner() {
  scanner.classList.add("active");
  scanner.setAttribute("aria-hidden", "false");
  videoView.classList.remove("show");
  videoView.setAttribute("aria-hidden", "true");
  detected = false;

  setText("STARTING CAMERA", "Please allow camera access.", "Loading image recognition…");

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
      "Point the rear camera at the printed frame.",
      `Reference loaded • ${features} visual features`
    );
    scannerHint.textContent = "Move closer until the artwork fills the guide.";
    running = true;
    loop();
  } catch (error) {
    console.error(error);
    let message = error.message;
    if (error.name === "NotAllowedError") {
      message = "Camera permission was denied. Allow camera access and try again.";
    }
    setText("CAMERA NOT READY", message, "Use the HTTPS GitHub Pages URL.");
    toastMsg(message);
  }
}

function detect() {
  if (!running || detected || camera.readyState < 2) return;

  const width = 640;
  const height = Math.round(width * camera.videoHeight / camera.videoWidth);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(camera, 0, 0, width, height);

  const frame = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
  cv.equalizeHist(gray, gray);

  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  orb.detectAndCompute(gray, new cv.Mat(), keypoints, descriptors);

  let good = 0;

  if (!descriptors.empty()) {
    const knn = new cv.DMatchVectorVector();
    matcher.knnMatch(refDescriptors, descriptors, knn, 2);

    for (let i = 0; i < knn.size(); i++) {
      const pair = knn.get(i);
      if (pair.size() >= 2) {
        const a = pair.get(0);
        const b = pair.get(1);
        if (a.distance < 0.82 * b.distance) good++;
        a.delete();
        b.delete();
      }
      pair.delete();
    }
    knn.delete();
  }

  scanDebug.textContent = `Image match: ${good} visual points`;
  if (good >= MIN_MATCHES) triggerExperience();

  frame.delete();
  gray.delete();
  keypoints.delete();
  descriptors.delete();
}

function loop() {
  if (!running) return;
  const now = performance.now();
  if (now - lastDetect > DETECT_INTERVAL) {
    lastDetect = now;
    try { detect(); } catch (e) { console.error(e); }
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

  setText("FRAME DETECTED", "Opening your hidden video…", "Experience unlocked");
  scannerHint.textContent = "Frame recognized.";

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
