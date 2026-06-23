import { getStatus, setOverride } from './api.js';

const nodes = {
  decisionList:     document.getElementById('decision-list'),
  lastUpdated:      document.getElementById('last-updated'),
  totalCars:        document.getElementById('total-cars'),
  totalCarsSub:     document.getElementById('total-cars-sub'),
  timeSaved:        document.getElementById('time-saved'),
  peakLane:         document.getElementById('peak-lane'),
  avgWait:          document.getElementById('avg-wait'),
  currentMode:      document.getElementById('current-mode'),
  activityLog:      document.getElementById('activity-log'),
  btnAuto:          document.getElementById('btn-auto'),
  btnNorth:         document.getElementById('btn-north'),
  btnEast:          document.getElementById('btn-east'),
  btnSouth:         document.getElementById('btn-south'),
  btnWest:          document.getElementById('btn-west'),
  btnAllRed:        document.getElementById('btn-all-red'),
  overrideDuration: document.getElementById('override-duration'),
};

const logEntries = [];
let previousState = null;
let socket = null;
let pollingInterval = null;
let lastDecisionsString = '';
let lastEmergencyState = { active: false, lane: null };

// ==========================================
// SOCKET.IO CONNECTION
// ==========================================

function connectSocketIO() {
  try {
    if (typeof io === 'undefined') {
      console.error('Socket.IO not loaded!');
      startPollingOnly();
      return;
    }
    
    console.log('Connecting to Socket.IO...');
    
    socket = io('/', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });
    
    socket.on('connect', () => {
      console.log('✅ Socket.IO connected!');
      pushLog('📡 Real-time connection established', 'info');
      socket.emit('subscribe', 'state');
      
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    });
    
    socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
      pushLog('Connection lost - reconnecting...', 'error');
      
      if (!pollingInterval) {
        startPollingOnly();
      }
    });
    
    socket.on('reconnect', (attemptNumber) => {
      console.log(`Reconnected after ${attemptNumber} attempts`);
      pushLog('Connection restored', 'info');
      socket.emit('subscribe', 'state');
      
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    });
    
    socket.on('reconnect_attempt', (attempt) => {
      console.log(`Reconnection attempt ${attempt}`);
    });
    
    socket.on('reconnect_error', (error) => {
      console.error('Reconnection error:', error);
    });
    
    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });
    
    socket.on('state-update', (data) => {
      console.log('📡 Update received, timeRemaining:', data.timeRemaining);
    
      applyStatus({ state: data });
    });
    
  } catch (err) {
    console.error('Socket.IO creation failed:', err);
    startPollingOnly();
  }
}

function startPollingOnly() {
  pushLog('Using polling mode (updates every 1s)', 'info');
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(async () => {
    await pollStatus();
  }, 1000);
}

async function pollStatus() {
  try {
    const res = await getStatus();
    if (res && res.success) {
      applyStatus(res);
    }
  } catch (err) {
    console.error('Polling error:', err);
  }
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString();
}

function pushLog(msg, type = 'info') {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  logEntries.unshift({ msg, time, type });
  if (logEntries.length > 12) logEntries.pop();
  if (nodes.activityLog) {
    nodes.activityLog.innerHTML = logEntries
      .map(e => `<li><span class="lt ${e.type}">${e.msg}</span><span class="ltime">${e.time}</span></li>`)
      .join('');
  }
}

function formatDecisionTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function updateDecisions(decisions) {
  if (decisions === undefined || decisions === null) return;

  if (!Array.isArray(decisions) || decisions.length === 0) {
    if (nodes.decisionList && nodes.decisionList.innerHTML !== '<div style="color:#3d4060; text-align:center;">No decisions yet</div>') {
      nodes.decisionList.innerHTML = '<div style="color:#3d4060; text-align:center;">No decisions yet</div>';
    }
    return;
  }
  
  // ✅ ONLY update if decisions have actually changed
  const newDecisionsString = JSON.stringify(decisions.slice(0, 8));
  if (newDecisionsString === lastDecisionsString) {
    return; // No change, skip updating DOM
  }
  lastDecisionsString = newDecisionsString;
  
  if (nodes.decisionList) {
    nodes.decisionList.innerHTML = decisions.map(d => {
      let text = '';
      switch (d.action) {
        case 'PHASE_START':
          text = `🟢 ${d.details.lane} GREEN – ${d.details.durationSec}s (${d.details.reason})`;
          break;
        case 'PHASE_END_EARLY':
          text = `⏩ ${d.details.lane} ended early – used ${d.details.usedSec}s / ${d.details.allocatedSec}s (${d.details.reason})`;
          break;
        case 'OVERRIDE':
          text = `🎛️ Override: ${d.details.lane} ${d.details.color} ${d.details.duration ? d.details.duration+'s' : ''}`;
          break;
        case 'AMBULANCE':
          text = `🚑 Ambulance – ${d.details.lane} priority`;
          break;
        case 'CONFIG_FIXED':
          text = `⚙️ Settings saved: ${d.details.northGreen}s N | ${d.details.eastGreen}s E | ${d.details.southGreen}s S | ${d.details.westGreen}s W | Ped:${d.details.pedestrianGreen}s`;
          break;
        case 'FIXED_PHASE':
          text = `🔄 Phase: ${d.details.lane} → ${d.details.step}`;
          break;
        default:
          let detailsStr = JSON.stringify(d.details);
          if (detailsStr.length > 60) {
            detailsStr = detailsStr.substring(0, 60) + '...';
          }
          text = `${d.action}: ${detailsStr}`;
      }
      return `<div style="margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #2a2d3e;">
                <span style="color:#7b7f9e; font-size:10px;">${formatDecisionTime(d.timestamp)}</span><br>
                <span style="font-size:12px;">${text}</span>
              </div>`;
    }).join('');
  }
}

function setJunction(j, status, count, wait, timeRemaining, allocatedTime, configMode, isActiveGreen, isActiveYellow, activeLaneName) {
  const countEl = document.getElementById(`j${j}_count`);
  const waitEl = document.getElementById(`j${j}_wait`);
  const waitLabelEl = document.getElementById(`j${j}_wait_label`);
  const timeEl = document.getElementById(`j${j}_time`);
  const dot = document.getElementById(`light-j${j}`);
  const statusEl = document.getElementById(`j${j}_status`);

  // Update car count
  if (countEl && countEl.innerText !== String(count)) {
    countEl.innerText = count;
  }
  
  // Map junction number to lane name
  const junctionToLane = { 1: 'NORTH', 2: 'EAST', 3: 'SOUTH', 4: 'WEST' };
  const thisLane = junctionToLane[j];
  const isThisActiveLane = (thisLane === activeLaneName);
  
  // Update wait/allocated display
  if (waitEl && waitLabelEl) {
    if (isThisActiveLane && (isActiveGreen || isActiveYellow)) {
      // GREEN or YELLOW on this lane - Show allocated time
      const displayTime = Math.round(allocatedTime);
      if (waitEl.innerText !== String(displayTime)) {
        waitEl.innerText = displayTime;
      }
      if (waitLabelEl.innerHTML !== '<i class="fas fa-chart-line"></i> Allocated:') {
        waitLabelEl.innerHTML = '<i class="fas fa-chart-line"></i> Allocated:';
      }
    } else {
      // Not the active lane - show nothing
      if (waitEl.innerText !== '--') {
        waitEl.innerText = '--';
      }
      if (waitLabelEl.innerHTML !== '<i class="fas fa-hourglass-half"></i>') {
        waitLabelEl.innerHTML = '<i class="fas fa-hourglass-half"></i>';
      }
    }
  }
  
  // Update time remaining (only for active lane)
  if (timeEl) {
    const timeValue = (isThisActiveLane && typeof timeRemaining === 'number') ? timeRemaining.toFixed(1) : '0.0';
    if (timeEl.innerText !== String(timeValue)) {
      timeEl.innerText = timeValue;
    }
  }

  // Update light dot
  if (dot) {
    let newClass = '';
    if (status === 'GO') newClass = 'light-green';
    else if (status === 'WAIT') newClass = 'light-yellow';
    else newClass = 'light-red';
    
    if (!dot.classList.contains(newClass)) {
      dot.classList.remove('light-green', 'light-yellow', 'light-red');
      dot.classList.add(newClass);
    }
  }
  
  // Update status text
  if (statusEl) {
    let newStatus = '';
    let newClass = '';
    if (status === 'GO') {
      newStatus = 'GO';
      newClass = 'status-go';
    } else if (status === 'WAIT') {
      newStatus = 'WAIT';
      newClass = 'status-wait';
    } else {
      newStatus = 'STOP';
      newClass = 'status-stop';
    }
    
    if (statusEl.innerText !== newStatus) {
      statusEl.innerText = newStatus;
    }
    
    if (!statusEl.classList.contains(newClass)) {
      statusEl.classList.remove('status-go', 'status-wait', 'status-stop');
      statusEl.classList.add(newClass);
    }
  }
}

function setPedestrian(status, count, wait, timeRemaining) {
  const dot = document.getElementById('light-ped');
  const statusEl = document.getElementById('ped_status');
  const countEl = document.getElementById('ped_count');
  const waitEl = document.getElementById('ped_wait');
  const timeEl = document.getElementById('ped_time');

  if (countEl && countEl.innerText !== String(count)) {
    countEl.innerText = count;
  }
  //if (waitEl && waitEl.innerText !== String(Math.round(wait))) {
  //  waitEl.innerText = Math.round(wait);
  //}
  if (timeEl) {
    const timeValue = typeof timeRemaining === 'number' ? timeRemaining.toFixed(1) : timeRemaining;
    if (timeEl.innerText !== String(timeValue)) {
      timeEl.innerText = timeValue;
    }
  }

  if (dot) {
    let newClass = '';
    if (status === 'GO') newClass = 'light-green';
    else if (status === 'WAIT') newClass = 'light-yellow';
    else newClass = 'light-red';
    
    if (!dot.classList.contains(newClass)) {
      dot.classList.remove('light-green', 'light-yellow', 'light-red');
      dot.classList.add(newClass);
    }
  }
  
  if (statusEl) {
    let newStatus = '';
    let newClass = '';
    if (status === 'GO') {
      newStatus = 'GO';
      newClass = 'status-go';
    } else if (status === 'WAIT') {
      newStatus = 'WAIT';
      newClass = 'status-wait';
    } else {
      newStatus = 'STOP';
      newClass = 'status-stop';
    }
    
    if (statusEl.innerText !== newStatus) {
      statusEl.innerText = newStatus;
    }
    
    if (!statusEl.classList.contains(newClass)) {
      statusEl.classList.remove('status-go', 'status-wait', 'status-stop');
      statusEl.classList.add(newClass);
    }
  }
}

function updateCongestionLevel(densities) {
  const maxCars = 5;
  
  const junctions = [
    { name: 'north', count: densities?.j1 || 0 },
    { name: 'east',  count: densities?.j2 || 0 },
    { name: 'south', count: densities?.j3 || 0 },
    { name: 'west',  count: densities?.j4 || 0 }
  ];
  
  let totalPercentage = 0;
  
  junctions.forEach(j => {
    let percentage = Math.min(100, Math.round((j.count / maxCars) * 100));
    totalPercentage += percentage;
    
    const percentEl = document.getElementById(`cong-${j.name}`);
    if (percentEl && percentEl.innerText !== percentage + '%') {
      percentEl.innerText = percentage + '%';
    }
    
    const barEl = document.getElementById(`cong-bar-${j.name}`);
    if (barEl) {
      barEl.style.width = percentage + '%';
      
      let newColor = '';
      if (percentage <= 30) {
        newColor = '#3db97a';
      } else if (percentage <= 60) {
        newColor = '#ffb74d';
      } else if (percentage <= 80) {
        newColor = '#ff8a65';
      } else {
        newColor = '#ef5350';
      }
      
      if (barEl.style.backgroundColor !== newColor) {
        barEl.style.backgroundColor = newColor;
      }
    }
  });
  
  const avgPercentage = Math.round(totalPercentage / 4);
  const statusEl = document.getElementById('congestion-status');
  
  if (statusEl) {
    let newText = '';
    let newColor = '';
    if (avgPercentage <= 30) {
      newText = '🟢 LOW CONGESTION';
      newColor = '#3db97a';
    } else if (avgPercentage <= 60) {
      newText = '🟡 MEDIUM CONGESTION';
      newColor = '#ffb74d';
    } else if (avgPercentage <= 80) {
      newText = '🟠 HIGH CONGESTION';
      newColor = '#ff8a65';
    } else {
      newText = '🔴 CRITICAL CONGESTION';
      newColor = '#ef5350';
    }
    
    if (statusEl.innerText !== newText) {
      statusEl.innerText = newText;
    }
    if (statusEl.style.color !== newColor) {
      statusEl.style.color = newColor;
    }
  }
}

function applyStatus(data) {
  if (!data) return;
  const s = data.state || data;

  if (nodes.lastUpdated) {
    const newTime = formatTime(Date.now());
    if (nodes.lastUpdated.innerText !== newTime) {
      nodes.lastUpdated.innerText = newTime;
    }
  }

  if (s.recentDecisions !== undefined) {
    updateDecisions(s.recentDecisions);
  }

  if (nodes.totalCars && nodes.totalCars.innerText !== String(s.totalCars || 0)) {
    nodes.totalCars.innerText = s.totalCars || 0;
  }
  if (nodes.peakLane && nodes.peakLane.innerText !== (s.peakLane || '--').toUpperCase()) {
    nodes.peakLane.innerText = (s.peakLane || '--').toUpperCase();
  }
  
  const nextPhaseEl = document.getElementById('next-phase');
  if (nextPhaseEl && s.nextPhase) {
    let displayNext = s.nextPhase;
    let icon = '';
    
    if (s.nextPhase === 'PEDESTRIAN') {
      icon = '<i class="fas fa-person-walking"></i> ';
      displayNext = 'PEDESTRIAN';
    } else if (s.nextPhase === 'NORTH') {
      icon = '<i class="fas fa-arrow-up"></i> ';
    } else if (s.nextPhase === 'EAST') {
      icon = '<i class="fas fa-arrow-right"></i> ';
    } else if (s.nextPhase === 'SOUTH') {
      icon = '<i class="fas fa-arrow-down"></i> ';
    } else if (s.nextPhase === 'WEST') {
      icon = '<i class="fas fa-arrow-left"></i> ';
    }
    
    const newHTML = icon + displayNext;
    if (nextPhaseEl.innerHTML !== newHTML) {
      nextPhaseEl.innerHTML = newHTML;
    }
  }
  
  // ✅ EMERGENCY STATUS - Only update when changed
  const newActive = Boolean(s.ambulanceActive);
  const newLane = s.ambulanceLane || null;

  if (lastEmergencyState.active !== newActive || lastEmergencyState.lane !== newLane) {
    lastEmergencyState = { active: newActive, lane: newLane };

    const emergencyStatusEl = document.getElementById('emergency-status');
    const emergencyLaneEl = document.getElementById('emergency-lane');
    const emergencyCard = document.getElementById('emergency-card');

    if (emergencyStatusEl) {
      if (newActive) {
        emergencyStatusEl.innerHTML = '🚑 ACTIVE';
        emergencyStatusEl.style.color = '#ef5350';
        if (emergencyLaneEl) {
          emergencyLaneEl.innerText = `${newLane} lane`;
          emergencyLaneEl.style.color = '#ef5350';
        }
        if (emergencyCard) emergencyCard.style.animation = 'blink-bg 1s step-end infinite';
      } else {
        emergencyStatusEl.innerHTML = '● INACTIVE';
        emergencyStatusEl.style.color = '#3db97a';
        if (emergencyLaneEl) {
          emergencyLaneEl.innerText = '--';
          emergencyLaneEl.style.color = '#7b7f9e';
        }
        if (emergencyCard) emergencyCard.style.animation = 'none';
      }
    }
  }

  const laneToJunction = {
    'NORTH': 'light-j1',
    'EAST': 'light-j2',
    'SOUTH': 'light-j3',
    'WEST': 'light-j4'
  };
  
  // Only reset animations if needed
  let needsReset = false;
  for (const id of ['light-j1', 'light-j2', 'light-j3', 'light-j4']) {
    const el = document.getElementById(id);
    if (el && el.style.animation !== 'none') {
      el.style.animation = 'none';
    }
  }
  
  if (s.ambulanceActive && s.ambulanceLane && laneToJunction[s.ambulanceLane]) {
    const junctionId = laneToJunction[s.ambulanceLane];
    const el = document.getElementById(junctionId);
    if (el && el.style.animation !== 'blink 0.5s step-end infinite') {
      el.style.animation = 'blink 0.5s step-end infinite';
    }
  }

  if (previousState) {
    if (previousState.phase !== s.phase) {
      pushLog(`Phase changed: ${previousState.phase} → ${s.phase}`, 'phase');
    }
    if (!previousState.override?.active && s.override?.active) {
      pushLog(`Override started: ${s.override.lane} ${s.override.color}`, 'override');
    }
    if (previousState.override?.active && !s.override?.active) {
      pushLog(`Override ended – returning to auto mode`, 'override');
    }
  }

  const phase = s.phase;
  const phaseStep = s.phaseStep;
  const timeRemaining = s.timeRemaining || 0;

  let junctionStatus = { 1: 'STOP', 2: 'STOP', 3: 'STOP', 4: 'STOP' };
  let activeLaneIndex = null;

  if (phase !== 'PEDESTRIAN') {
    const laneMap = { 'NORTH': 1, 'EAST': 2, 'SOUTH': 3, 'WEST': 4 };
    if (laneMap[phase]) {
      activeLaneIndex = laneMap[phase];
      if (phaseStep === 'GREEN') {
        junctionStatus[activeLaneIndex] = 'GO';
      } else if (phaseStep === 'YELLOW') {
        junctionStatus[activeLaneIndex] = 'WAIT';
      }
    }
  }

    // Get allocated times from broadcast
    const allocatedTimes = s.allocatedTimes || {};
    const configMode = s.configMode || 'FIXED';

      //👇 ADD THIS DEBUG CODE HERE 👇
        console.log('🔍 FULL allocatedTimes object:', JSON.stringify(allocatedTimes));
        console.log('🔍 Specific PEDESTRIAN value:', allocatedTimes.PEDESTRIAN);
        console.log('🔍 Type of PEDESTRIAN value:', typeof allocatedTimes.PEDESTRIAN);
      // 👆 END DEBUG CODE 👆

  // Map junction to lane name
    const junctionToLane = { 1: 'NORTH', 2: 'EAST', 3: 'SOUTH', 4: 'WEST' };
    const activeLaneName = phase; // Current active lane (NORTH, EAST, SOUTH, WEST, or PEDESTRIAN)

  for (let i = 1; i <= 4; i++) {
   const count = s.densities?.[`j${i}`] || 0;
   const wait = s.waitTimes?.[`j${i}`] || 0;
   const time = (activeLaneIndex === i && phase !== 'PEDESTRIAN') ? timeRemaining : 0;
   const lane = junctionToLane[i];
   const allocatedTime = allocatedTimes[lane] || 0;
   const isActiveGreen = (activeLaneIndex === i && phaseStep === 'GREEN');
   const isActiveYellow = (activeLaneIndex === i && phaseStep === 'YELLOW');
  
  setJunction(i, junctionStatus[i], count, wait, time, allocatedTime, configMode, isActiveGreen, isActiveYellow, activeLaneName);
}

// 👇 INSERT PEDESTRIAN CODE HERE 👇
  const pedAllocatedTime = allocatedTimes.PEDESTRIAN || 0;
// AFTER - show allocated time during both green AND yellow on pedestrian phase
const isPedActive  = (phase === 'PEDESTRIAN');
const isPedGreen   = isPedActive && phaseStep === 'GREEN';
const isPedYellow  = isPedActive && phaseStep === 'YELLOW';

  // ADD THIS DEBUG LOG
  console.log('🚶 PEDESTRIAN DEBUG:', {
    pedAllocatedTime,
    isPedActive,
    isPedGreen,
    isPedYellow,
    phase,
    phaseStep,
    allocatedTimes
  });

  const pedWaitEl = document.getElementById('ped_wait');
  const pedWaitLabelEl = document.getElementById('ped_wait_label');

  if (pedWaitEl && pedWaitLabelEl) {
    if (isPedActive && (isPedGreen || isPedYellow)) {
      const displayTime = Math.round(pedAllocatedTime);
      if (pedWaitEl.innerText !== String(displayTime)) {
        pedWaitEl.innerText = displayTime;
      }
      if (pedWaitLabelEl.innerHTML !== '<i class="fas fa-chart-line"></i> Allocated:') {
        pedWaitLabelEl.innerHTML = '<i class="fas fa-chart-line"></i> Allocated:';
      }
    } else {
      if (pedWaitEl.innerText !== '--') {
        pedWaitEl.innerText = '--';
      }
      if (pedWaitLabelEl.innerHTML !== '<i class="fas fa-hourglass-half"></i>') {
        pedWaitLabelEl.innerHTML = '<i class="fas fa-hourglass-half"></i>';
      }
    }
  }
  // 👆 END PEDESTRIAN CODE 👆

  let pedStatus = 'STOP';
  let pedTime = 0;
  if (phase === 'PEDESTRIAN') {
    if (phaseStep === 'GREEN') {
      pedStatus = 'GO';
      pedTime = timeRemaining;
    } else if (phaseStep === 'YELLOW') {
      pedStatus = 'WAIT';
      pedTime = timeRemaining;
    }
  }
  const pedCount = s.pedestrianCount || 0;
  const pedWait = s.pedestrianWaitTime || 0;
  setPedestrian(pedStatus, pedCount, pedWait, pedTime);

  updateCongestionLevel(s.densities);

  previousState = { ...s };
}

async function sendOverride(lane, color) {
  const duration = Number(nodes.overrideDuration?.value) || null;
  try {
    await setOverride({ lane, color, duration });
    pushLog(`Override: ${lane} ${color}${duration ? ` (${duration}s)` : ''}`, 'override');
  } catch (err) {
    pushLog(`Override failed: ${err.message}`, 'error');
  }
}

function attachControls() {
  if (nodes.btnAuto) nodes.btnAuto.addEventListener('click', () => sendOverride('AUTO', null));
  if (nodes.btnNorth) nodes.btnNorth.addEventListener('click', () => sendOverride('NORTH', 'GREEN'));
  if (nodes.btnEast) nodes.btnEast.addEventListener('click', () => sendOverride('EAST', 'GREEN'));
  if (nodes.btnSouth) nodes.btnSouth.addEventListener('click', () => sendOverride('SOUTH', 'GREEN'));
  if (nodes.btnWest) nodes.btnWest.addEventListener('click', () => sendOverride('WEST', 'GREEN'));
  if (nodes.btnAllRed) nodes.btnAllRed.addEventListener('click', () => sendOverride('ALL_RED', 'RED'));

  const logoutBtn = document.getElementById('logoutBtn');
  const modal = document.getElementById('logoutModal');
  const cancelBtn = document.getElementById('cancelLogoutBtn');
  const confirmBtn = document.getElementById('confirmLogoutBtn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (modal) modal.style.display = 'flex';
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (modal) modal.style.display = 'none';
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/traffic/logout', { method: 'POST' });
      } catch (err) {
        console.log('Logout error:', err);
      }
      
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
      window.location.href = '/';
    });
  }

  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      if (modal) modal.style.display = 'none';
    }
  });

  const reconnectBtn = document.getElementById('reconnectBtn');
  if (reconnectBtn) {
    reconnectBtn.addEventListener('click', () => {
      if (socket) {
        socket.disconnect();
        setTimeout(() => {
          socket.connect();
        }, 100);
        pushLog('Manual reconnection attempted', 'info');
      } else {
        connectSocketIO();
        pushLog('Connecting to WebSocket...', 'info');
      }
    });
  }
}

// Initialize
pushLog('System started', 'info');
attachControls();
connectSocketIO();

// Backup poll every 2 seconds (supplements Socket.IO)
setInterval(async () => { await pollStatus(); }, 2000);
pollStatus();