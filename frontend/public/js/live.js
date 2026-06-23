const STREAM_URL = "http://localhost:5001/video";
let isStreaming = false;
let currentImage = null;

const videoWrapper = document.getElementById('video-wrapper');
const statusText = document.getElementById('stream-status-text');
const statusIcon = document.getElementById('status-icon');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const reloadBtn = document.getElementById('reloadBtn');

function updateStatus(isLive) {
  if (isLive) {
    statusText.textContent = 'LIVE';
    statusText.style.color = '#10b981';
    statusIcon.style.color = '#10b981';
    statusIcon.className = 'fas fa-circle';
  } else {
    statusText.textContent = 'OFF';
    statusText.style.color = '#ef4444';
    statusIcon.style.color = '#ef4444';
    statusIcon.className = 'far fa-circle';
  }
}

function createImage() {
  const img = document.createElement('img');
  img.id = 'live-stream';
  img.alt = 'Camera feed';
  return img;
}

function showPlaceholder(message, subMessage = '') {
  videoWrapper.innerHTML = `
    <div class="placeholder">
      <i class="fas fa-camera"></i>
      <div>${message}</div>
      <div class="placeholder-sub">${subMessage}</div>
    </div>
  `;
}

function startStream() {
  if (isStreaming) return;
  
  showPlaceholder('Connecting to camera...', 'Please wait');
  
  const img = createImage();
  currentImage = img;
  
  img.onload = () => {
    videoWrapper.innerHTML = '';
    videoWrapper.appendChild(img);
    isStreaming = true;
    updateStatus(true);
  };
  
  img.onerror = () => {
    showPlaceholder(
      'Cannot connect to camera',
      'Make sure Droidcam is running on port 4747'
    );
    isStreaming = false;
    updateStatus(false);
    currentImage = null;
  };
  
  img.src = STREAM_URL;
}

function stopStream() {
  if (!isStreaming) return;
  
  if (currentImage) {
    currentImage.src = '';
    currentImage = null;
  }
  
  showPlaceholder(
    'Camera is OFF',
    'Click START to begin streaming'
  );
  
  isStreaming = false;
  updateStatus(false);
}

function reloadStream() {
  if (isStreaming && currentImage) {
    const currentSrc = currentImage.src.split('?')[0];
    currentImage.src = currentSrc + '?' + Date.now();
  } else if (!isStreaming) {
    startStream();
  }
}

startBtn.addEventListener('click', startStream);
stopBtn.addEventListener('click', stopStream);
reloadBtn.addEventListener('click', reloadStream);

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');
  window.location.href = '/';
});

// Initialize - OFF by default (saves CPU/GPU)
updateStatus(false);