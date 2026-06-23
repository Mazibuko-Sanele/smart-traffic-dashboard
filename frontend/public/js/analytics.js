// frontend/public/js/analytics.js - CLEANED VERSION

let socket = null;
let pollingInterval = null;

// ========== CHART CONFIGURATION ==========
let chart = null;
let lastChartUpdateTime = 0;
const CHART_UPDATE_INTERVAL = 2000;
const MAX_CHART_POINTS = 12;

// ========== AI vs FIXED COMPARISON ==========
let comparisonData = {
  mode: 'DYNAMIC',
  totalTimeSaved: 0,
  perLane: {
    NORTH: { dynamicGreenGiven: 0, fixedGreenWouldBe: 0, timeSaved: 0, phasesCompleted: 0, lastDynamic: 0, lastFixed: 0, lastSaved: 0 },
    EAST: { dynamicGreenGiven: 0, fixedGreenWouldBe: 0, timeSaved: 0, phasesCompleted: 0, lastDynamic: 0, lastFixed: 0, lastSaved: 0 },
    SOUTH: { dynamicGreenGiven: 0, fixedGreenWouldBe: 0, timeSaved: 0, phasesCompleted: 0, lastDynamic: 0, lastFixed: 0, lastSaved: 0 },
    WEST: { dynamicGreenGiven: 0, fixedGreenWouldBe: 0, timeSaved: 0, phasesCompleted: 0, lastDynamic: 0, lastFixed: 0, lastSaved: 0 }
  }
};

// ========== AMBULANCE INTERRUPTION TRACKING ==========
let totalAmbulances = 0;
let totalInterruptionAllLanes = 0;
let laneInterruption = {
  'NORTH': 0,
  'EAST': 0,
  'SOUTH': 0,
  'WEST': 0
};

let currentlyInterruptedLane = null;
let currentInterruptionStartTime = null;
let lastActivePhase = null;
let liveInterruptionInterval = null;

// ========== LOAD PERSISTENT DATA ==========
function loadPersistentData() {
  totalAmbulances = parseInt(sessionStorage.getItem('totalAmbulances') || '0');
  totalInterruptionAllLanes = parseFloat(sessionStorage.getItem('totalInterruptionAllLanes') || '0');
  
  laneInterruption = {
    'NORTH': parseFloat(sessionStorage.getItem('laneInterruption_NORTH') || '0'),
    'EAST': parseFloat(sessionStorage.getItem('laneInterruption_EAST') || '0'),
    'SOUTH': parseFloat(sessionStorage.getItem('laneInterruption_SOUTH') || '0'),
    'WEST': parseFloat(sessionStorage.getItem('laneInterruption_WEST') || '0')
  };
  
  lastActivePhase = sessionStorage.getItem('lastActivePhase') || null;
  
  const savedInterruptedLane = sessionStorage.getItem('currentlyInterruptedLane');
  const savedStartTime = sessionStorage.getItem('currentInterruptionStartTime');
  
  if (savedInterruptedLane && savedStartTime && savedInterruptedLane !== 'null') {
    currentlyInterruptedLane = savedInterruptedLane;
    currentInterruptionStartTime = parseInt(savedStartTime);
    
    const now = Date.now();
    const elapsedWhileAway = (now - currentInterruptionStartTime) / 1000;
    
    if (elapsedWhileAway > 0 && laneInterruption[currentlyInterruptedLane] !== undefined) {
      laneInterruption[currentlyInterruptedLane] += elapsedWhileAway;
      totalInterruptionAllLanes += elapsedWhileAway;
      currentInterruptionStartTime = now;
      saveInterruptionData();
    }
  }
  
  const totalEl = document.getElementById('emergency-total');
  if (totalEl) totalEl.innerText = totalAmbulances;
  
  updateInterruptionDisplays();
  if (currentlyInterruptedLane) startLiveInterruptionCounter();
}

function loadComparisonData() {
  const saved = sessionStorage.getItem('comparisonData');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      comparisonData.totalTimeSaved = parsed.totalTimeSaved || 0;
      if (parsed.perLane) {
        Object.keys(comparisonData.perLane).forEach(lane => {
          if (parsed.perLane[lane]) {
            comparisonData.perLane[lane].dynamicGreenGiven = parsed.perLane[lane].dynamicGreenGiven || 0;
            comparisonData.perLane[lane].fixedGreenWouldBe = parsed.perLane[lane].fixedGreenWouldBe || 0;
            comparisonData.perLane[lane].timeSaved = parsed.perLane[lane].timeSaved || 0;
            comparisonData.perLane[lane].phasesCompleted = parsed.perLane[lane].phasesCompleted || 0;
          }
        });
      }
    } catch(e) {}
  }
  updateComparisonTable();
}

function saveComparisonData() {
  sessionStorage.setItem('comparisonData', JSON.stringify({
    totalTimeSaved: comparisonData.totalTimeSaved,
    perLane: comparisonData.perLane
  }));
}

function saveInterruptionData() {
  sessionStorage.setItem('totalAmbulances', totalAmbulances);
  sessionStorage.setItem('totalInterruptionAllLanes', totalInterruptionAllLanes);
  sessionStorage.setItem('laneInterruption_NORTH', laneInterruption['NORTH']);
  sessionStorage.setItem('laneInterruption_EAST', laneInterruption['EAST']);
  sessionStorage.setItem('laneInterruption_SOUTH', laneInterruption['SOUTH']);
  sessionStorage.setItem('laneInterruption_WEST', laneInterruption['WEST']);
  sessionStorage.setItem('lastActivePhase', lastActivePhase || '');
  
  if (currentlyInterruptedLane && currentInterruptionStartTime) {
    sessionStorage.setItem('currentlyInterruptedLane', currentlyInterruptedLane);
    sessionStorage.setItem('currentInterruptionStartTime', currentInterruptionStartTime);
  } else {
    sessionStorage.removeItem('currentlyInterruptedLane');
    sessionStorage.removeItem('currentInterruptionStartTime');
  }
}

// ========== CHART ==========
function initChart() {
  const ctx = document.getElementById('flowTrendChart')?.getContext('2d');
  if (!ctx) return;
  
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'NORTH', data: [], borderColor: '#3b82f6', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: false },
        { label: 'SOUTH', data: [], borderColor: '#10b981', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: false },
        { label: 'EAST', data: [], borderColor: '#f59e0b', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: false },
        { label: 'WEST', data: [], borderColor: '#ef4444', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: false }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { color: '#9ca3af', font: { size: 11 } } } },
      scales: { x: { ticks: { color: '#6b7280' }, grid: { color: '#1f2937' } }, y: { ticks: { color: '#6b7280' }, grid: { color: '#1f2937' }, beginAtZero: true } }
    }
  });
}

function updateChart(state) {
  if (!chart) initChart();
  
  const now = Date.now();
  if (now - lastChartUpdateTime >= CHART_UPDATE_INTERVAL) {
    chart.data.labels.push(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    chart.data.datasets[0].data.push(state.densities?.j1 || 0);
    chart.data.datasets[1].data.push(state.densities?.j3 || 0);
    chart.data.datasets[2].data.push(state.densities?.j2 || 0);
    chart.data.datasets[3].data.push(state.densities?.j4 || 0);
    
    if (chart.data.labels.length > MAX_CHART_POINTS) {
      chart.data.labels.shift();
      chart.data.datasets.forEach(d => d.data.shift());
    }
    chart.update('none');
    lastChartUpdateTime = now;
  }
}

// ========== WEBSOCKET ==========
function connectWebSocket() {
  try {
    socket = io();
    
    socket.on('connect', () => {
      console.log('✅ WebSocket connected');
      if (pollingInterval) clearInterval(pollingInterval);
    });
    
    socket.on('state-update', (data) => {
      if (!data.ambulanceActive && data.phase && data.phase !== 'YELLOW' && data.phase !== 'PEDESTRIAN') {
        if (lastActivePhase !== data.phase) {
          lastActivePhase = data.phase;
          sessionStorage.setItem('lastActivePhase', lastActivePhase);
        }
      }
      
      updateKPIs(data);
      updateHeatmap(data);
      updateWaitTimes(data);
      updateEmergencyDashboard(data);
      updateChart(data);

      if (data.comparison) {
        setComparisonCardMode(data.comparison.mode);
        comparisonData.mode = data.comparison.mode;
        
        if (data.comparison.totalTimeSaved !== undefined) {
          comparisonData.totalTimeSaved = data.comparison.totalTimeSaved;
          saveComparisonData();
        }
        
        if (data.comparison.lastCompleted && data.comparison.lastCompleted.lane) {
          const lane = data.comparison.lastCompleted.lane;
          if (comparisonData.perLane[lane]) {
            comparisonData.perLane[lane].lastDynamic = data.comparison.lastCompleted.dynamicTime || 0;
            comparisonData.perLane[lane].lastFixed = data.comparison.lastCompleted.fixedTime || 0;
            comparisonData.perLane[lane].lastSaved = data.comparison.lastCompleted.saved || 0;
            comparisonData.perLane[lane].timeSaved = data.comparison.perLane[lane]?.timeSaved || comparisonData.perLane[lane].timeSaved;
            saveComparisonData();
          }
        }
        
        updateComparisonTable();
      }
      
      if (data.phase && data.phaseStep) {
        updateLaneColors({ phase: data.phase, phaseStep: data.phaseStep });
      }
    });
    
    socket.on('disconnect', () => startPolling());
  } catch (err) {
    startPolling();
  }
}

function startPolling() {
  if (pollingInterval) return;
  pollingInterval = setInterval(async () => {
    try {
      const response = await fetch('/api/traffic/status');
      const data = await response.json();
      if (data && data.state) {
        updateKPIs(data.state);
        updateHeatmap(data.state);
        updateWaitTimes(data.state);
        updateEmergencyDashboard(data.state);
        updateChart(data.state);
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 1000);
}

// ========== EMERGENCY DASHBOARD ==========
function updateEmergencyDashboard(data) {
  const ambulanceActive = data.ambulanceActive;
  const ambulanceLane = data.ambulanceLane;
  const interruptedLane = data.interruptedLane;
  
  if (ambulanceActive && !currentlyInterruptedLane) {
    const invalidLanes = ['ALL_RED', 'YELLOW', 'PEDESTRIAN', null, undefined];
    
    if (interruptedLane && !invalidLanes.includes(interruptedLane)) {
      currentlyInterruptedLane = interruptedLane;
      currentInterruptionStartTime = Date.now();
      totalAmbulances++;
      saveInterruptionData();
      
      const totalEl = document.getElementById('emergency-total');
      if (totalEl) totalEl.innerText = totalAmbulances;
      
      updateInterruptionDisplays();
      startLiveInterruptionCounter();
      updateEmergencyList();
    } else {
      totalAmbulances++;
      saveInterruptionData();
      const totalEl = document.getElementById('emergency-total');
      if (totalEl) totalEl.innerText = totalAmbulances;
    }
  }
  
  if (!ambulanceActive && currentlyInterruptedLane) {
    const duration = (Date.now() - currentInterruptionStartTime) / 1000;
    
    if (laneInterruption[currentlyInterruptedLane] !== undefined) {
      laneInterruption[currentlyInterruptedLane] += duration;
    }
    totalInterruptionAllLanes += duration;
    
    saveInterruptionData();
    updateInterruptionDisplays();
    stopLiveInterruptionCounter();
    
    currentlyInterruptedLane = null;
    currentInterruptionStartTime = null;
    updateEmergencyList();
  }
}

function startLiveInterruptionCounter() {
  if (liveInterruptionInterval) clearInterval(liveInterruptionInterval);
  liveInterruptionInterval = setInterval(() => {
    if (currentlyInterruptedLane && currentInterruptionStartTime) {
      const current = (Date.now() - currentInterruptionStartTime) / 1000;
      const el = document.getElementById('live-interruption-seconds');
      const bar = document.getElementById('live-interruption-bar');
      if (el) el.innerHTML = Math.round(current) + '<span style="font-size:0.7rem;">s</span>';
      if (bar) bar.style.width = Math.min(100, (current / 60) * 100) + '%';
    }
  }, 1000);
}

function stopLiveInterruptionCounter() {
  if (liveInterruptionInterval) {
    clearInterval(liveInterruptionInterval);
    liveInterruptionInterval = null;
  }
  const el = document.getElementById('live-interruption-seconds');
  const bar = document.getElementById('live-interruption-bar');
  if (el) el.innerHTML = '0<span style="font-size:0.7rem;">s</span>';
  if (bar) bar.style.width = '0%';
}

function updateInterruptionDisplays() {
  const totalEl = document.getElementById('total-interruption-all');
  if (totalEl) totalEl.innerHTML = Math.round(totalInterruptionAllLanes) + '<span style="font-size:0.8rem;">s</span>';
  
  const northEl = document.getElementById('interruption-north');
  if (northEl) northEl.innerText = Math.round(laneInterruption['NORTH']);
  
  const eastEl = document.getElementById('interruption-east');
  if (eastEl) eastEl.innerText = Math.round(laneInterruption['EAST']);
  
  const southEl = document.getElementById('interruption-south');
  if (southEl) southEl.innerText = Math.round(laneInterruption['SOUTH']);
  
  const westEl = document.getElementById('interruption-west');
  if (westEl) westEl.innerText = Math.round(laneInterruption['WEST']);
  
  const bar = document.getElementById('wasted-fill');
  if (bar) bar.style.width = Math.min(100, (totalInterruptionAllLanes / 120) * 100) + '%';
}

function updateEmergencyList() {
  const container = document.getElementById('emergency-list');
  if (!container) return;
  
  if (currentlyInterruptedLane && currentInterruptionStartTime) {
    const current = (Date.now() - currentInterruptionStartTime) / 1000;
    container.innerHTML = `
      <div style="padding:12px; border-left:3px solid #ef4444; background:rgba(239,68,68,0.15); border-radius:8px;">
        <div style="display:flex; justify-content:space-between;">
          <div><i class="fas fa-ambulance"></i> <strong style="color:#ef4444;">AMBULANCE ACTIVE</strong></div>
          <div style="font-family:monospace; font-size:1.2rem; font-weight:700; color:#ef4444;">${current.toFixed(0)}s</div>
        </div>
        <div style="font-size:12px; margin-top:6px;">⚠️ <strong>${currentlyInterruptedLane}</strong> lane is interrupted</div>
      </div>
    `;
  } else {
    container.innerHTML = `<div style="text-align:center; padding:1rem; color:var(--text-muted); background:var(--bg-tertiary); border-radius:8px;">✅ No active emergency</div>`;
  }
}

// ========== KPI UPDATES ==========
function updateKPIs(state) {
  const totalCars = (state.densities?.j1 || 0) + (state.densities?.j2 || 0) + (state.densities?.j3 || 0) + (state.densities?.j4 || 0);
  const avgWait = ((state.waitTimes?.j1 || 0) + (state.waitTimes?.j2 || 0) + (state.waitTimes?.j3 || 0) + (state.waitTimes?.j4 || 0)) / 4;
  
  const totalEl = document.getElementById('total-vehicles');
  if (totalEl) totalEl.innerText = totalCars;
  
  const avgWaitEl = document.getElementById('avg-wait-time');
  if (avgWaitEl) avgWaitEl.innerHTML = Math.round(avgWait) + 's';
  
  const confidence = Math.max(0, Math.min(100, 100 - ((avgWait - 15) / 45) * 100));
  const aiConfidenceEl = document.getElementById('ai-confidence');
  if (aiConfidenceEl) aiConfidenceEl.innerHTML = Math.round(confidence) + '%';
  
  const fill = document.getElementById('confidence-fill');
  if (fill) {
    fill.style.width = confidence + '%';
    fill.style.background = confidence > 70 ? '#10b981' : (confidence > 40 ? '#f59e0b' : '#ef4444');
  }
}

function updateHeatmap(state) {
  const junctions = [
    { id: 'north', key: 'j1' }, { id: 'east', key: 'j2' },
    { id: 'south', key: 'j3' }, { id: 'west', key: 'j4' }
  ];
  junctions.forEach(j => {
    const count = state.densities?.[j.key] || 0;
    const wait = state.waitTimes?.[j.key] || 0;
    const pct = Math.min(100, (count / 50) * 100);
    
    const countEl = document.getElementById(`${j.id}-count`);
    if (countEl) countEl.innerText = count;
    
    const waitEl = document.getElementById(`${j.id}-wait`);
    if (waitEl) waitEl.innerHTML = Math.round(wait) + 's';
    
    const fill = document.getElementById(`${j.id}-fill`);
    if (fill) {
      fill.style.width = pct + '%';
      fill.style.background = pct < 30 ? '#10b981' : (pct < 60 ? '#f59e0b' : '#ef4444');
    }
  });
  
  const phaseEl = document.getElementById('active-phase');
  if (phaseEl) phaseEl.innerHTML = `${state.phase || '--'} ${state.phaseStep || ''}`;
}

function updateWaitTimes(state) {
  for (let i = 1; i <= 4; i++) {
    const wait = state.waitTimes?.[`j${i}`] || 0;
    const bar = document.getElementById(`wait-bar-${i}`);
    const val = document.getElementById(`wait-val-${i}`);
    if (bar) {
      bar.style.width = Math.min((wait / 60) * 100, 100) + '%';
      bar.style.background = wait < 15 ? '#10b981' : (wait < 30 ? '#f59e0b' : '#ef4444');
    }
    if (val) val.innerText = Math.round(wait) + 's';
  }
}

// ========== COMPARISON TABLE UPDATE ==========
function updateComparisonTable() {
  const tbody = document.getElementById('comparison-tbody');
  if (!tbody) return;
  
  const lanes = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
  
  tbody.innerHTML = lanes.map(lane => {
    const stats = comparisonData.perLane[lane];
    const dynamicTime = stats.lastDynamic || 0;
    const fixedTime = stats.lastFixed || 0;
    const saved = stats.lastSaved || 0;
    const savedClass = saved > 0 ? 'text-success' : (saved < 0 ? 'text-danger' : '');
    const savedText = saved > 0 ? `+${saved}s` : `${saved}s`;
    
    const lightColor = currentLaneColors[lane] || 'gray';
    const lightClass = `light-${lightColor}`;
    
    return `
      <tr>
        <td style="display: flex; align-items: center; gap: 8px;">
          <div class="jdot ${lightClass}" style="width: 24px; height: 24px; margin: 0;"></div>
          <strong>${lane}</strong>
        </td>
        <td>${dynamicTime.toFixed(1)}s</td>
        <td>${fixedTime.toFixed(1)}s</td>
        <td class="${savedClass}">${savedText}</td>
      </tr>
    `;
  }).join('');
  
  const totalEl = document.getElementById('total-time-saved');
  if (totalEl) {
    const totalSec = comparisonData.totalTimeSaved;
    const minutes = Math.floor(totalSec / 60);
    const seconds = Math.round(totalSec % 60);
    totalEl.innerHTML = `<strong>${minutes}m ${seconds}s</strong>`;
  }
}

function setComparisonCardMode(mode) {
  const card = document.getElementById('comparison-card');
  if (!card) return;
  
  if (mode === 'FIXED') {
    card.classList.add('comparison-card-blur');
  } else {
    card.classList.remove('comparison-card-blur');
  }
}

let currentLaneColors = {
  NORTH: 'red',
  EAST: 'red',
  SOUTH: 'red',
  WEST: 'red'
};

function updateLaneColors(state) {
  const phase = state.phase;
  const phaseStep = state.phaseStep;
  const laneMap = { 'NORTH': 'j1', 'EAST': 'j2', 'SOUTH': 'j3', 'WEST': 'j4' };
  
  Object.keys(currentLaneColors).forEach(lane => {
    currentLaneColors[lane] = 'red';
  });
  
  if (phase !== 'PEDESTRIAN' && laneMap[phase]) {
    if (phaseStep === 'GREEN') {
      currentLaneColors[phase] = 'green';
    } else if (phaseStep === 'YELLOW') {
      currentLaneColors[phase] = 'yellow';
    }
  }
  
  updateComparisonTable();
}

// ========== SIMPLE PDF & EXPORT FUNCTIONS ==========

function downloadJSONReport() {
  const data = {
    totalAmbulances: totalAmbulances,
    totalInterruptionAllLanes: totalInterruptionAllLanes,
    laneInterruption: laneInterruption,
    comparisonData: comparisonData,
    generatedAt: new Date().toLocaleString()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `traffic-data-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  alert('✅ JSON downloaded!');
}

function downloadCSVReport() {
  let csv = `"Report Generated: ${new Date().toLocaleString()}"\n\n`;
  csv += `"Total Emergencies","${totalAmbulances}"\n`;
  csv += `"Total Time Saved (seconds)","${comparisonData.totalTimeSaved || 0}"\n\n`;
  csv += `"Lane","Dynamic Time","Fixed Time","Time Saved","Phases"\n`;
  
  const lanes = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
  lanes.forEach(lane => {
    const stats = comparisonData.perLane[lane] || {};
    csv += `"${lane}","${(stats.dynamicGreenGiven || 0).toFixed(1)}","${(stats.fixedGreenWouldBe || 0).toFixed(1)}","${(stats.timeSaved || 0).toFixed(1)}","${stats.phasesCompleted || 0}"\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `traffic-data-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  alert('✅ CSV downloaded!');
}

function quickExportTimeRange(minutes) {
  const data = {
    exportType: `Last ${minutes} minutes`,
    totalAmbulances: totalAmbulances,
    totalInterruptionAllLanes: totalInterruptionAllLanes,
    laneInterruption: laneInterruption,
    comparisonData: comparisonData,
    generatedAt: new Date().toLocaleString()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quick-export-${minutes}min-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  alert(`✅ Exported last ${minutes} minutes of data!`);
}

// ========== PDF REPORT FROM SAVED DATA ==========
function downloadPDFReport() {
  // Read data from your existing variables (which already have the saved data)
  const reportData = {
    totalAmbulances: totalAmbulances,
    totalInterruptionAllLanes: totalInterruptionAllLanes,
    laneInterruption: laneInterruption,
    comparisonData: comparisonData,
    generatedAt: new Date().toLocaleString()
  };
  
  // Calculate totals
  const totalTimeSavedSec = reportData.comparisonData.totalTimeSaved || 0;
  const totalTimeSavedMin = (totalTimeSavedSec / 60).toFixed(1);
  
  const lanes = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
  let totalDynamicTime = 0;
  let totalFixedTime = 0;
  let totalPhases = 0;
  
  const perLaneData = {};
  lanes.forEach(lane => {
    const stats = reportData.comparisonData.perLane?.[lane] || { 
      dynamicGreenGiven: 0, 
      fixedGreenWouldBe: 0, 
      timeSaved: 0, 
      phasesCompleted: 0 
    };
    perLaneData[lane] = stats;
    totalDynamicTime += stats.dynamicGreenGiven;
    totalFixedTime += stats.fixedGreenWouldBe;
    totalPhases += stats.phasesCompleted;
  });
  
  const efficiency = totalFixedTime > 0 ? ((totalDynamicTime / totalFixedTime) * 100).toFixed(1) : 0;
  const totalInterruptionMin = (reportData.totalInterruptionAllLanes / 60).toFixed(1);
  
  // Create HTML report
  const reportHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Traffic System Report</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Arial, sans-serif; 
 background: white; 
          color: #1a1a2e; 
          padding: 40px;
        }
        .report-container { max-width: 1100px; margin: 0 auto; }
        .header { 
          text-align: center; 
          border-bottom: 3px solid #10b981; 
          padding-bottom: 20px; 
          margin-bottom: 30px;
        }
        .logo { font-size: 14px; color: #10b981; letter-spacing: 2px; margin-bottom: 10px; }
        h1 { font-size: 28px; margin-bottom: 8px; }
        .subtitle { color: #666; font-size: 12px; margin-top: 10px; }
        .stats-grid { 
          display: grid; 
          grid-template-columns: repeat(4, 1fr); 
          gap: 20px; 
          margin-bottom: 40px;
        }
        .stat-card { 
          border-radius: 12px; 
          padding: 20px; 
          text-align: center; 
          color: white;
        }
        .stat-card.green { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
        .stat-card.red { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); }
        .stat-card.blue { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
        .stat-card.orange { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
        .stat-value { font-size: 32px; font-weight: 700; }
        .stat-label { font-size: 12px; opacity: 0.9; margin-top: 8px; }
        .section { margin-bottom: 30px; }
        .section-title { 
          font-size: 18px; 
          font-weight: 600; 
          border-left: 4px solid #10b981; 
          padding-left: 12px; 
          margin-bottom: 20px;
        }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f3f4f6; font-weight: 600; }
        .saved-positive { color: #10b981; font-weight: bold; }
        .footer { 
          margin-top: 50px; 
          padding-top: 20px; 
          border-top: 1px solid #e5e7eb; 
          text-align: center; 
          font-size: 11px; 
          color: #9ca3af;
        }
        @media print {
          body { padding: 20px; }
          .stat-card { break-inside: avoid; }
          table { break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="report-container">
        <div class="header">
          <div class="logo">REAL-TIME TRAFFIC OPTIMIZER</div>
          <h1>SYSTEM PERFORMANCE REPORT</h1>
          <div class="subtitle">Generated: ${reportData.generatedAt}</div>
        </div>
        
        <div class="stats-grid">
          <div class="stat-card green">
            <div class="stat-value">${totalTimeSavedMin} min</div>
            <div class="stat-label">Total Time Saved</div>
          </div>
          <div class="stat-card red">
            <div class="stat-value">${reportData.totalAmbulances}</div>
            <div class="stat-label">Emergency Events</div>
          </div>
          <div class="stat-card blue">
            <div class="stat-value">${totalPhases}</div>
            <div class="stat-label">Phases Completed</div>
          </div>
          <div class="stat-card orange">
            <div class="stat-value">${efficiency}%</div>
            <div class="stat-label">AI Efficiency</div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">📊 PERFORMANCE SUMMARY</div>
          <table>
            <tr><th>Metric</th><th>Value</th></tr>
            <tr><td>Total Time Saved</td><td class="saved-positive">${totalTimeSavedMin} minutes (${totalTimeSavedSec} seconds)</td></tr>
            <tr><td>Dynamic Mode Total Time</td><td>${totalDynamicTime.toFixed(1)} seconds</td></tr>
            <tr><td>Fixed Mode Baseline Time</td><td>${totalFixedTime.toFixed(1)} seconds</td></tr>
            <tr><td>System Efficiency</td><td>${efficiency}%</td></tr>
            <tr><td>Total Interruption Time</td><td>${totalInterruptionMin} minutes (${reportData.totalInterruptionAllLanes.toFixed(1)} seconds)</td></tr>
          </table>
        </div>
        
        <div class="section">
          <div class="section-title">🚦 AI vs FIXED MODE COMPARISON</div>
          <table>
            <thead>
              <tr><th>LANE</th><th>DYNAMIC AI</th><th>FIXED CYCLE</th><th>TIME SAVED</th><th>PHASES</th></tr>
            </thead>
            <tbody>
              ${lanes.map(lane => {
                const stats = perLaneData[lane];
                const saved = stats.timeSaved || 0;
                const savedClass = saved > 0 ? 'saved-positive' : '';
                const savedText = saved > 0 ? `+${saved.toFixed(1)}s` : `${saved.toFixed(1)}s`;
                return `
                  <tr>
                    <td><strong>${lane}</strong></td>
                    <td>${(stats.dynamicGreenGiven || 0).toFixed(1)}s</td>
                    <td>${(stats.fixedGreenWouldBe || 0).toFixed(1)}s</td>
                    <td class="${savedClass}">${savedText}</td>
                    <td>${stats.phasesCompleted || 0}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        
        <div class="section">
          <div class="section-title">🚑 EMERGENCY INTERRUPTION BY LANE</div>
          <table>
            <thead><tr><th>LANE</th><th>INTERRUPTION (seconds)</th><th>INTERRUPTION (minutes)</th></tr></thead>
            <tbody>
              ${Object.entries(reportData.laneInterruption).map(([lane, seconds]) => `
                <tr>
                  <td><strong>${lane}</strong></td>
                  <td>${seconds.toFixed(1)}s</td>
                  <td>${(seconds / 60).toFixed(1)} min</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        
        <div class="footer">
          <p>Report generated by Real-Time Traffic Optimizer System</p>
          <p>Data from sessionStorage | Report ID: RPT-${Date.now()}</p>
        </div>
      </div>
      <script>window.print();<\/script>
    </body>
    </html>
  `;
  
  // Open new window with report and trigger print
  const printWindow = window.open('', '_blank');
  printWindow.document.write(reportHtml);
  printWindow.document.close();
}

// ========== EXPORT FUNCTIONS ==========
function downloadJSONReport() {
  const data = {
    totalAmbulances: totalAmbulances,
    totalInterruptionAllLanes: totalInterruptionAllLanes,
    laneInterruption: laneInterruption,
    comparisonData: comparisonData,
    generatedAt: new Date().toLocaleString()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `traffic-data-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  alert('✅ JSON downloaded!');
}

function downloadCSVReport() {
  let csv = `"Report Generated: ${new Date().toLocaleString()}"\n\n`;
  csv += `"Total Emergencies","${totalAmbulances}"\n`;
  csv += `"Total Time Saved (seconds)","${comparisonData.totalTimeSaved || 0}"\n\n`;
  csv += `"Lane","Dynamic Time","Fixed Time","Time Saved","Phases"\n`;
  
  const lanes = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
  lanes.forEach(lane => {
    const stats = comparisonData.perLane[lane] || {};
    csv += `"${lane}","${(stats.dynamicGreenGiven || 0).toFixed(1)}","${(stats.fixedGreenWouldBe || 0).toFixed(1)}","${(stats.timeSaved || 0).toFixed(1)}","${stats.phasesCompleted || 0}"\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `traffic-data-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  alert('✅ CSV downloaded!');
}

function quickExportTimeRange(minutes) {
  const data = {
    exportType: `Last ${minutes} minutes`,
    totalAmbulances: totalAmbulances,
    totalInterruptionAllLanes: totalInterruptionAllLanes,
    laneInterruption: laneInterruption,
    comparisonData: comparisonData,
    generatedAt: new Date().toLocaleString()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quick-export-${minutes}min-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  alert(`✅ Exported last ${minutes} minutes of data!`);
}



function setupExportButtons() {
  // Make PDF button download JSON instead (simple and reliable)
  const pdfBtn = document.getElementById('downloadReportBtn');
  if (pdfBtn) {
    pdfBtn.onclick = (e) => {
      e.preventDefault();
      downloadJSONReport();  // Just download JSON
    };
    console.log('✅ PDF button now downloads JSON data');
  }
  
  // CSV Button - keep as is
  const csvBtn = document.getElementById('downloadCsvBtn');
  if (csvBtn) {
    csvBtn.onclick = (e) => {
      e.preventDefault();
      downloadCSVReport();
    };
  }
  
  // Time range buttons - keep as is
  const timeRangeBtns = document.querySelectorAll('.time-range-btn');
  timeRangeBtns.forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const minutes = parseInt(btn.dataset.minutes);
      if (!isNaN(minutes)) {
        quickExportTimeRange(minutes);
      }
    };
  });
  
  // Add JSON button if needed
  if (!document.getElementById('downloadJsonBtn')) {
    const btnGroup = document.querySelector('.export-buttons');
    if (btnGroup) {
      const jsonBtn = document.createElement('button');
      jsonBtn.id = 'downloadJsonBtn';
      jsonBtn.innerHTML = '📄 JSON';
      jsonBtn.style.cssText = 'padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; margin: 0 5px;';
      jsonBtn.onclick = downloadJSONReport;
      btnGroup.appendChild(jsonBtn);
    }
  }
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Analytics page loaded');
  loadPersistentData();
  
  const totalEl = document.getElementById('emergency-total');
  if (totalEl) totalEl.innerText = totalAmbulances;
  
  loadComparisonData(); 
  initChart();
  connectWebSocket();
  setupExportButtons(); // Initialize export buttons
  
  fetch('/api/traffic/status')
    .then(res => res.json())
    .then(data => {
      if (data && data.state) {
        updateKPIs(data.state);
        updateHeatmap(data.state);
        updateWaitTimes(data.state);
        updateEmergencyDashboard(data.state);
        updateChart(data.state);
      }
    })
    .catch(err => console.error('Initial load error:', err));

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      loadPersistentData();
      const totalEl = document.getElementById('emergency-total');
      if (totalEl) totalEl.innerText = totalAmbulances;
      updateInterruptionDisplays();
      updateEmergencyList();
    }
  });
});

window.addEventListener('beforeunload', () => {
  saveInterruptionData();
  saveComparisonData();
});

// CSS animation for toasts
const style = document.createElement('style');
style.textContent = `@keyframes slideIn{from{transform:translateX(100%);opacity:0;}to{transform:translateX(0);opacity:1;}}`;
document.head.appendChild(style);