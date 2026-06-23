const API_BASE = '/api/traffic';

const modeFixedBtn = document.getElementById('mode-fixed');
const modeDynamicBtn = document.getElementById('mode-dynamic');
const currentModeLabel = document.getElementById('current-mode-label');
const fixedTimingsPanel = document.getElementById('fixed-timings-panel');
const saveTimingsBtn = document.getElementById('save-timings');
const saveMessageSpan = document.getElementById('save-message');

const northGreen = document.getElementById('northGreen');
const northYellow = document.getElementById('northYellow');
const eastGreen = document.getElementById('eastGreen');
const eastYellow = document.getElementById('eastYellow');
const southGreen = document.getElementById('southGreen');
const southYellow = document.getElementById('southYellow');
const westGreen = document.getElementById('westGreen');
const westYellow = document.getElementById('westYellow');
const pedGreen = document.getElementById('pedGreen');
const pedYellow = document.getElementById('pedYellow');

function showMessage(msg, isError = false) {
  saveMessageSpan.textContent = msg;
  saveMessageSpan.className = 'save-message' + (isError ? ' error' : '');
  setTimeout(() => {
    if (saveMessageSpan.textContent === msg) saveMessageSpan.textContent = '';
  }, 3000);
}

async function loadConfig() {
  try {
    const res = await fetch(`${API_BASE}/config`);
    const data = await res.json();
    if (data.success) {
      const mode = data.config.mode;
      currentModeLabel.textContent = mode === 'FIXED' ? 'Fixed Cycle' : 'Dynamic (AI Powered)';
      if (mode === 'FIXED') {
        modeFixedBtn.classList.add('active');
        modeDynamicBtn.classList.remove('active');
        fixedTimingsPanel.style.display = 'block';
        const fc = data.config.fixedCycle;
        northGreen.value = fc.northGreen;
        northYellow.value = fc.northYellow;
        eastGreen.value = fc.eastGreen;
        eastYellow.value = fc.eastYellow;
        southGreen.value = fc.southGreen;
        southYellow.value = fc.southYellow;
        westGreen.value = fc.westGreen;
        westYellow.value = fc.westYellow;
        pedGreen.value = fc.pedestrianGreen;
        pedYellow.value = fc.pedestrianYellow;
      } else {
        modeDynamicBtn.classList.add('active');
        modeFixedBtn.classList.remove('active');
        fixedTimingsPanel.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
}

async function setMode(mode) {
  try {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
    const data = await res.json();
    if (data.success) {
      currentModeLabel.textContent = mode === 'FIXED' ? 'Fixed Cycle' : 'Dynamic (AI Powered)';
      if (mode === 'FIXED') {
        fixedTimingsPanel.style.display = 'block';
        await loadConfig();
      } else {
        fixedTimingsPanel.style.display = 'none';
      }
      showMessage(`Mode changed to ${mode === 'FIXED' ? 'Fixed Cycle' : 'Dynamic'}`);
    } else {
      showMessage('Failed to change mode', true);
    }
  } catch (err) {
    showMessage('Network error', true);
  }
}

async function saveFixedTimings() {
  const fixedCycle = {
    northGreen: parseInt(northGreen.value, 10),
    northYellow: parseInt(northYellow.value, 10),
    eastGreen: parseInt(eastGreen.value, 10),
    eastYellow: parseInt(eastYellow.value, 10),
    southGreen: parseInt(southGreen.value, 10),
    southYellow: parseInt(southYellow.value, 10),
    westGreen: parseInt(westGreen.value, 10),
    westYellow: parseInt(westYellow.value, 10),
    pedestrianGreen: parseInt(pedGreen.value, 10),
    pedestrianYellow: parseInt(pedYellow.value, 10)
  };
  
  for (let [key, val] of Object.entries(fixedCycle)) {
    if (isNaN(val) || val < 1) {
      showMessage(`Invalid value for ${key} – must be at least 1`, true);
      return;
    }
  }
  
  try {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixedCycle })
    });
    const data = await res.json();
    if (data.success) {
      showMessage('Fixed timings saved successfully');
    } else {
      showMessage('Failed to save timings', true);
    }
  } catch (err) {
    showMessage('Network error', true);
  }
}

modeFixedBtn.addEventListener('click', () => setMode('FIXED'));
modeDynamicBtn.addEventListener('click', () => setMode('DYNAMIC'));
saveTimingsBtn.addEventListener('click', saveFixedTimings);

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');
  window.location.href = '/';
});

loadConfig();