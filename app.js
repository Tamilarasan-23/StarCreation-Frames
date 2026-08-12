const scanner=document.getElementById("scanner");
const startButtons=[document.getElementById("startBtn"),document.getElementById("bottomScan")];
const closeScanner=document.getElementById("closeScanner"),flashBtn=document.getElementById("flashBtn");
const camera=document.getElementById("camera"),scanTitle=document.getElementById("scanTitle"),scanText=document.getElementById("scanText"),scanDebug=document.getElementById("scanDebug"),scannerHint=document.getElementById("scannerHint");
const videoView=document.getElementById("videoView"),experienceVideo=document.getElementById("experienceVideo"),muteBtn=document.getElementById("muteBtn"),replayBtn=document.getElementById("replayBtn"),againBtn=document.getElementById("againBtn"),toast=document.getElementById("toast");

let stream=null,track=null,running=false,detected=false,model=null,targetEmbedding=null,raf=null,lastInference=0,scanStartedAt=0,consecutiveMatches=0,muted=true,torchOn=false,busy=false,modelReady=false;
const THRESHOLD=.78, REQUIRED=3, MIN_TIME=1200, INTERVAL=500;

function toastMsg(m){toast.textContent=m;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2500)}
function setText(a,b,c=""){scanTitle.textContent=a;scanText.textContent=b;if(c)scanDebug.textContent=c}
function cosine(a,b){let d=0,x=0,y=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];x+=a[i]*a[i];y+=b[i]*b[i]}return(!x||!y)?0:d/(Math.sqrt(x)*Math.sqrt(y))}
function arr(t){return Array.from(t.dataSync())}
async function embed(src){const t=model.infer(src,"conv_preds");const v=arr(t);t.dispose();return v}
function cameraCanvas(){const vw=camera.videoWidth,vh=camera.videoHeight,w=Math.floor(vw*.78),h=Math.floor(vh*.88),sx=Math.floor((vw-w)/2),sy=Math.floor((vh-h)/2);const c=document.createElement("canvas");c.width=480;c.height=480;c.getContext("2d").drawImage(camera,sx,sy,w,h,0,0,480,480);return c}

async function prepareAI(){
 if(modelReady)return;
 setText("LOADING AI","Preparing visual recognition…","TensorFlow.js • MobileNet V2");
 await tf.ready();model=await mobilenet.load({version:2,alpha:1});
 const img=new Image();img.src="assets/target-poster.jpg";await img.decode();
 targetEmbedding=await embed(img);modelReady=true;
 setText("AI READY","Point the rear camera at the registered poster.","✓ Target image loaded");
}

async function openScanner(){
 scanner.classList.add("active");scanner.setAttribute("aria-hidden","false");
 videoView.classList.remove("show");videoView.setAttribute("aria-hidden","true");
 experienceVideo.pause();experienceVideo.currentTime=0;detected=false;consecutiveMatches=0;busy=false;
 try{
  await prepareAI();
  if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera access requires HTTPS or localhost.");
  setText("STARTING CAMERA","Please allow camera access.","AI target ready");
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
  track=stream.getVideoTracks()[0];camera.srcObject=stream;await camera.play();
  const caps=track.getCapabilities?track.getCapabilities():{};
  flashBtn.style.display=caps.torch?"grid":"none";
  setText("SCAN THE FRAME","Point the camera at the same poster image.","AI similarity: waiting…");
  scannerHint.textContent="Keep the complete poster inside the guide.";running=true;scanStartedAt=performance.now();lastInference=0;loop();
 }catch(e){console.error(e);let m=e.name==="NotAllowedError"?"Camera permission was denied. Allow camera access and try again.":e.message||"Unable to start scanner.";setText("SCANNER NOT READY",m,"Use the HTTPS GitHub Pages URL.");toastMsg(m)}
}
async function toggleFlash(){
 if(!track)return;const caps=track.getCapabilities?track.getCapabilities():{};
 if(!caps.torch){toastMsg("Flash control is not available on this camera/browser.");return}
 try{torchOn=!torchOn;await track.applyConstraints({advanced:[{torch:torchOn}]});flashBtn.classList.toggle("on",torchOn);toastMsg(torchOn?"Flash ON":"Flash OFF")}
 catch(e){torchOn=false;flashBtn.classList.remove("on");toastMsg("Browser flash control is unavailable on this phone.")}
}
async function infer(){
 if(!running||detected||busy||!model||camera.readyState<2)return;busy=true;
 try{
  const v=await embed(cameraCanvas()),sim=cosine(targetEmbedding,v),pct=Math.round(Math.max(0,Math.min(1,sim))*100),ok=sim>=THRESHOLD;
  consecutiveMatches=ok?consecutiveMatches+1:0;
  scanDebug.textContent=`AI similarity: ${pct}% • confirm ${consecutiveMatches}/${REQUIRED}`;
  if(ok&&consecutiveMatches>=REQUIRED&&performance.now()-scanStartedAt>=MIN_TIME)triggerExperience();
 }catch(e){console.error(e);scanDebug.textContent="AI retrying…"}finally{busy=false}
}
function loop(){if(!running)return;const n=performance.now();if(n-lastInference>=INTERVAL){lastInference=n;infer()}raf=requestAnimationFrame(loop)}
function stopCamera(){running=false;if(raf)cancelAnimationFrame(raf);raf=null;if(track){try{track.applyConstraints({advanced:[{torch:false}]})}catch(_){}}if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;track=null;torchOn=false;flashBtn.classList.remove("on");camera.srcObject=null}
function triggerExperience(){if(detected)return;detected=true;stopCamera();setText("FRAME DETECTED","Opening your hidden video…","✓ AI image match confirmed");scannerHint.textContent="Experience unlocked.";setTimeout(()=>{videoView.classList.add("show");videoView.setAttribute("aria-hidden","false");experienceVideo.muted=muted;experienceVideo.currentTime=0;experienceVideo.play().catch(()=>toastMsg("Tap SOUND to start playback."))},300)}
function closeAll(){stopCamera();experienceVideo.pause();experienceVideo.currentTime=0;videoView.classList.remove("show");videoView.setAttribute("aria-hidden","true");scanner.classList.remove("active");scanner.setAttribute("aria-hidden","true")}
function scanAgain(){closeAll();openScanner()}
startButtons.forEach(b=>b.addEventListener("click",openScanner));closeScanner.addEventListener("click",closeAll);flashBtn.addEventListener("click",toggleFlash);againBtn.addEventListener("click",scanAgain);
muteBtn.addEventListener("click",async()=>{muted=!muted;experienceVideo.muted=muted;muteBtn.textContent=muted?"🔇 SOUND":"🔊 SOUND";if(!muted)try{await experienceVideo.play()}catch(_){}});
replayBtn.addEventListener("click",async()=>{experienceVideo.currentTime=0;try{await experienceVideo.play()}catch(_){}});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&scanner.classList.contains("active")){stopCamera();experienceVideo.pause()}});
