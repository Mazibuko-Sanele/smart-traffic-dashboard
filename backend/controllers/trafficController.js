// backend/controllers/trafficController.js
const TrafficEvent = require('../models/TrafficEvent');

// WebSocket broadcast helper
// WebSocket broadcast helper
function broadcastState() {
  if (global.broadcastStateUpdate) {
    const cmd = getCommandForESP32();
    global.broadcastStateUpdate({
      densities: state.densities,
      waitTimes: state.waitTimes,
      phase: cmd.phase,
      phaseStep: cmd.phaseStep,
      mode: state.mode,
      timeRemaining: cmd.timeRemaining,
      pedestrianCount: state.pedestrianCount,
      ambulanceActive: ambulanceRequest !== null && ambulanceState === 'GREEN',
      ambulanceLane: (ambulanceRequest !== null && ambulanceState === 'GREEN')
        ? ambulanceRequest.lane
        : null,
      override: currentOverride ? {
        active: true,
        lane: currentOverride.phase,
        color: currentOverride.phaseStep
      } : { active: false },
      recentDecisions: decisionLog.slice(0, 8),
      lastUpdated: Date.now(),
      // ADD THESE TWO LINES:
// ADD THIS - send the fixed cycle values from config
allocatedTimes: {
  NORTH: config.mode === 'FIXED' ? config.fixedCycle.northGreen : (DYNAMIC_LANES[dynamicCurrentLaneIndex] === 'NORTH' ? dynamicGreenDuration : 0),
  EAST: config.mode === 'FIXED' ? config.fixedCycle.eastGreen : (DYNAMIC_LANES[dynamicCurrentLaneIndex] === 'EAST' ? dynamicGreenDuration : 0),
  SOUTH: config.mode === 'FIXED' ? config.fixedCycle.southGreen : (DYNAMIC_LANES[dynamicCurrentLaneIndex] === 'SOUTH' ? dynamicGreenDuration : 0),
  WEST: config.mode === 'FIXED' ? config.fixedCycle.westGreen : (DYNAMIC_LANES[dynamicCurrentLaneIndex] === 'WEST' ? dynamicGreenDuration : 0),
  PEDESTRIAN: config.mode === 'FIXED' ? config.fixedCycle.pedestrianGreen : calculateDynamicGreenTime('PEDESTRIAN')  // ← always calculate, don't return 0


},
      configMode: config.mode
    });
  }
}
async function saveEvent(eventType, data) {
  // MONGODB SAVING DISABLED - CPU optimization
  return;
}

const MIN_GREEN = 5;
const MAX_GREEN = 24;
const YELLOW_DUR = 6;            // yellow before ambulance (during car phase)
const POST_AMBULANCE_YELLOW = 6; // yellow on ambulance lane after it leaves

// ==========================================
// GLOBAL STATE
// ==========================================
const state = {
  densities: { j1: 0, j2: 0, j3: 0, j4: 0 },
  pedestrianCount: 0, 
  simulator: { north: 0, south: 0, east: 0, west: 0, phase: 0, greenTime: 0 },
  history: [],
  mode: 'AUTO',
  phase: 'NS_GREEN',
  phaseStartTs: Date.now(),
  phaseDuration: 20,
  waitTimes: { j1: 0, j2: 0, j3: 0, j4: 0 },
  pedestrianWaitTime: 0, 
  lastUpdateTs: Date.now(),
  timeSavedSec: 0,
  baselineGreen: 30,
  peakLane: '--'
};




let currentOverride = null;
let overrideExpiresAt = null;

// Ambulance state machine
let ambulanceRequest = null;          // { lane, timestamp }
let ambulanceState = 'IDLE';  

// Add after other state variables
let lastCompletedLane = null;
let lastDynamicTime = 0;
let lastFixedTime = 0;
let lastTimeSaved = 0;
let comparisonPaused = false;  // Pause during ambulance


// ==========================================
// AI vs FIXED MODE COMPARISON TRACKING
// ==========================================
let aiComparisonStats = {
  totalTimeSaved: 0,
  lanes: {
    NORTH: { dynamicGreenGiven: 0, fixedGreenWouldBe: 0, timeSaved: 0, phasesCompleted: 0 },
    EAST: { dynamicGreenGiven: 0, fixedGreenWouldBe: 0, timeSaved: 0, phasesCompleted: 0 },
    SOUTH: { dynamicGreenGiven: 0, fixedGreenWouldBe: 0, timeSaved: 0, phasesCompleted: 0 },
    WEST: { dynamicGreenGiven: 0, fixedGreenWouldBe: 0, timeSaved: 0, phasesCompleted: 0 }
  },
  currentPhaseStart: null,
  currentPhaseLane: null,
  currentPhaseDensity: 0
};

// ==========================================
// SMART LOGIC STATS (NEW - ADDED)
// ==========================================
let smartLogicStats = {
  laneSkipping: { count: 0, timeSaved: 0 },
  pedestrianSkip: { count: 0, timeSaved: 0 }
};

// IDLE, QUEUED, YELLOW_BEFORE, GREEN, YELLOW_AFTER
let ambulanceStepStart = 0;
let savedCycleState = null;           // stores the cycle state to resume after ambulance

let decisionLog = [];

// Configuration
let config = {
  mode: 'FIXED',          // 'FIXED' or 'DYNAMIC'
  fixedCycle: {
    northGreen: 20, northYellow: 5,
    eastGreen: 20, eastYellow: 5,
    southGreen: 20, southYellow: 5,
    westGreen: 20, westYellow: 5,
    pedestrianGreen: 15, pedestrianYellow: 5
  }
};

// ==========================================
// DECISION LOGGING
// ==========================================
// WITH THIS:
const dataManager = require('../utils/dataManager'); 

function logDecision(action, details) {
  // Save to RAM manager
  dataManager.addDecision(action, details);
  
  // Also keep in local array for backward compatibility
  decisionLog.unshift({ timestamp: Date.now(), action, details });
  if (decisionLog.length > 20) decisionLog.pop();
  console.log(`[DECISION] ${action}:`, details);
}

// ==========================================
// DYNAMIC CYCLE (density‑based)
// ==========================================
let dynamicCycleStart = Date.now();
let dynamicCurrentLaneIndex = 0;
const DYNAMIC_LANES = ['NORTH', 'EAST', 'SOUTH', 'WEST', 'PEDESTRIAN'];
let dynamicGreenDuration = 10;
let dynamicStep = 'GREEN';
let dynamicStepStart = Date.now();

function calculateDynamicGreenTime(lane) {
  if (lane === 'PEDESTRIAN') {
    // 0 people = 0 seconds, 30+ people = 15 seconds max
    const count = state.pedestrianCount || 0;
    let green = (count / 30) * 15;
    return Math.min(15, Math.max(0, Math.round(green)));
  }
  const density = getDensityForLane(lane);
  let green = MIN_GREEN + (density / 12) * (MAX_GREEN - MIN_GREEN);
  return Math.min(MAX_GREEN, Math.max(MIN_GREEN, Math.round(green)));
}


function getDensityForLane(lane) {
  if (lane === 'PEDESTRIAN') return state.pedestrianCount;
  const map = { NORTH: 'j1', EAST: 'j2', SOUTH: 'j3', WEST: 'j4' };
  return state.densities[map[lane]] || 0;
}

// ✅ ADD THIS FUNCTION RIGHT AFTER
function getFixedGreenTimeForLane(lane) {
  const fixedCycle = config.fixedCycle;
  switch(lane) {
    case 'NORTH': return fixedCycle.northGreen;
    case 'EAST': return fixedCycle.eastGreen;
    case 'SOUTH': return fixedCycle.southGreen;
    case 'WEST': return fixedCycle.westGreen;
    default: return 20;
  }
}

function updateDynamicCycle() {
  if (ambulanceState !== 'IDLE') return;
  const now = Date.now();
  const elapsed = (now - dynamicStepStart) / 1000;
  const currentLane = DYNAMIC_LANES[dynamicCurrentLaneIndex];
  
  // Skip pedestrian if no people waiting
  if (currentLane === 'PEDESTRIAN' && state.pedestrianCount === 0 && dynamicStep === 'GREEN') {
    // ✅ ADD SMART LOGIC TRACKING FOR PEDESTRIAN SKIP
    const fixedPedestrianTime = config.fixedCycle.pedestrianGreen;
    smartLogicStats.pedestrianSkip.count++;
    smartLogicStats.pedestrianSkip.timeSaved += fixedPedestrianTime;
    console.log(`🧠 SMART LOGIC: Pedestrian skipped - saved ${fixedPedestrianTime}s`);
    
    dynamicCurrentLaneIndex = (dynamicCurrentLaneIndex + 1) % DYNAMIC_LANES.length;
    dynamicGreenDuration = calculateDynamicGreenTime(DYNAMIC_LANES[dynamicCurrentLaneIndex]);
    dynamicStep = 'GREEN';
    dynamicStepStart = now;
    return;
  }
  
  // ✅ Skip individual car lane if it has ZERO cars
  if (dynamicStep === 'GREEN' && currentLane !== 'PEDESTRIAN') {
    const density = getDensityForLane(currentLane);
    if (density === 0) {
      // ✅ ADD SMART LOGIC TRACKING FOR LANE SKIPPING
      const fixedTime = getFixedGreenTimeForLane(currentLane);
      smartLogicStats.laneSkipping.count++;
      smartLogicStats.laneSkipping.timeSaved += fixedTime;
      console.log(`🧠 SMART LOGIC: ${currentLane} lane skipped (no cars) - saved ${fixedTime}s`);
      
      // Skip green entirely, go straight to yellow
      dynamicStep = 'YELLOW';
      dynamicStepStart = now;
      logDecision('LANE_SKIPPED_NO_CARS', { lane: currentLane });
      return;
    }
  }
  
  if (dynamicStep === 'GREEN') {
    aiComparisonStats.currentPhaseStart = Date.now();
    aiComparisonStats.currentPhaseLane = DYNAMIC_LANES[dynamicCurrentLaneIndex];
    aiComparisonStats.currentPhaseDensity = getDensityForLane(DYNAMIC_LANES[dynamicCurrentLaneIndex]);

    const density = getDensityForLane(DYNAMIC_LANES[dynamicCurrentLaneIndex]);
    
    // Early termination when NO cars
    if (density === 0 && elapsed >= 2 && currentLane !== 'PEDESTRIAN') {
      dynamicStep = 'YELLOW';
      dynamicStepStart = now;
      logDecision('DYNAMIC_EARLY', { lane: DYNAMIC_LANES[dynamicCurrentLaneIndex], used: elapsed });

      // Comparison tracking for early termination
      if (config.mode === 'DYNAMIC' && ambulanceState === 'IDLE' && !comparisonPaused) {
        const lane = DYNAMIC_LANES[dynamicCurrentLaneIndex];
        if (lane !== 'PEDESTRIAN') {
          const actualTime = elapsed;
          const fixedTime = getFixedGreenTimeForLane(lane);
          const saved = Math.max(0, fixedTime - actualTime);
          
          lastCompletedLane = lane;
          lastDynamicTime = actualTime;
          lastFixedTime = fixedTime;
          lastTimeSaved = saved;
          
          if (aiComparisonStats.lanes[lane]) {
            aiComparisonStats.lanes[lane].dynamicGreenGiven += actualTime;
            aiComparisonStats.lanes[lane].fixedGreenWouldBe += fixedTime;
            aiComparisonStats.lanes[lane].timeSaved += saved;
            aiComparisonStats.lanes[lane].phasesCompleted++;
          }
          aiComparisonStats.totalTimeSaved += saved;
          state.timeSavedSec += saved;
          
          dataManager.updateStats({ totalTimeSaved: aiComparisonStats.totalTimeSaved });
          dataManager.updateComparison(lane, actualTime, fixedTime, saved);
          console.log(`📊 PHASE COMPLETE (early) - ${lane}: Dynamic=${actualTime.toFixed(1)}s, Fixed=${fixedTime}s, Saved=${saved.toFixed(1)}s`);
        }
      }
    } 
    else if (elapsed >= dynamicGreenDuration + 0.1) {
      dynamicStep = 'YELLOW';
      dynamicStepStart = now;
      logDecision('DYNAMIC_NORMAL_END', { lane: DYNAMIC_LANES[dynamicCurrentLaneIndex] });
      
      // Comparison tracking for normal end
      if (config.mode === 'DYNAMIC' && ambulanceState === 'IDLE' && !comparisonPaused) {
        const lane = DYNAMIC_LANES[dynamicCurrentLaneIndex];
        if (lane !== 'PEDESTRIAN') {
          const actualTime = dynamicGreenDuration;
          const fixedTime = getFixedGreenTimeForLane(lane);
          const saved = Math.max(0, fixedTime - actualTime);
          
          lastCompletedLane = lane;
          lastDynamicTime = actualTime;
          lastFixedTime = fixedTime;
          lastTimeSaved = saved;
          
          if (aiComparisonStats.lanes[lane]) {
            aiComparisonStats.lanes[lane].dynamicGreenGiven += actualTime;
            aiComparisonStats.lanes[lane].fixedGreenWouldBe += fixedTime;
            aiComparisonStats.lanes[lane].timeSaved += saved;
            aiComparisonStats.lanes[lane].phasesCompleted++;
          }
          aiComparisonStats.totalTimeSaved += saved;
          state.timeSavedSec += saved;
          
          console.log(`📊 PHASE COMPLETE - ${lane}: Dynamic=${actualTime}s, Fixed=${fixedTime}s, Saved=${saved}s`);
        }
      }
    }
  } else if (dynamicStep === 'YELLOW') {
    const phaseDuration = (Date.now() - dynamicStepStart) / 1000;
    const lane = DYNAMIC_LANES[dynamicCurrentLaneIndex];
    const fixedGreenTime = getFixedGreenTimeForLane(lane);
    
    let timeSaved = Math.max(0, fixedGreenTime - phaseDuration);
    
    if (aiComparisonStats.lanes[lane]) {
      aiComparisonStats.lanes[lane].dynamicGreenGiven += phaseDuration;
      aiComparisonStats.lanes[lane].fixedGreenWouldBe += fixedGreenTime;
      aiComparisonStats.lanes[lane].timeSaved += timeSaved;
      aiComparisonStats.lanes[lane].phasesCompleted++;
    }
    aiComparisonStats.totalTimeSaved += timeSaved;
    state.timeSavedSec += timeSaved;
    
    console.log(`📊 COMPARISON: ${lane} - Dynamic: ${phaseDuration.toFixed(1)}s, Fixed: ${fixedGreenTime}s, Saved: ${timeSaved.toFixed(1)}s`);

    if (elapsed >= YELLOW_DUR + 0.05) {
      dynamicCurrentLaneIndex = (dynamicCurrentLaneIndex + 1) % DYNAMIC_LANES.length;
      dynamicGreenDuration = calculateDynamicGreenTime(DYNAMIC_LANES[dynamicCurrentLaneIndex]);
      dynamicStep = 'GREEN';
      dynamicStepStart = now;
      logDecision('DYNAMIC_START', { lane: DYNAMIC_LANES[dynamicCurrentLaneIndex], duration: dynamicGreenDuration });
      
      broadcastState();
    }
  }
}

function getDynamicCommand() {
  updateDynamicCycle();
  let remaining = (dynamicStep === 'GREEN')
    ? Math.max(0, dynamicGreenDuration - (Date.now() - dynamicStepStart)/1000)
    : Math.max(0, YELLOW_DUR - (Date.now() - dynamicStepStart)/1000);

  // FIX: Ensure remaining is never undefined or NaN
  if (isNaN(remaining) || remaining === undefined) {
    remaining = 0;
  }
  
  // CHANGED: Don't floor here, keep decimal
  return {
    command: dynamicStep === 'GREEN' ? 'GREEN' : 'YELLOW',
    phase: DYNAMIC_LANES[dynamicCurrentLaneIndex],
    phaseStep: dynamicStep,
    timeRemaining: remaining
  };
}

// ==========================================
// FIXED CYCLE (constant timings)
// ==========================================
let fixedCycleStart = Date.now();
let fixedPhaseIndex = 0;
const FIXED_PHASE_NAMES = ['SOUTH','SOUTH','NORTH','NORTH','EAST','EAST','WEST','WEST','PEDESTRIAN','PEDESTRIAN'];
const FIXED_PHASE_STEPS = ['GREEN','YELLOW','GREEN','YELLOW','GREEN','YELLOW','GREEN','YELLOW','GREEN','YELLOW'];

function getFixedPhaseDurations() {
  const fc = config.fixedCycle;
  return [
    fc.southGreen, fc.southYellow,
    fc.northGreen, fc.northYellow,
    fc.eastGreen, fc.eastYellow,
    fc.westGreen, fc.westYellow,
    fc.pedestrianGreen, fc.pedestrianYellow
  ];
}

function updateFixedCycle() {
  if (ambulanceState !== 'IDLE') return;
  const now = Date.now();
  const elapsed = (now - fixedCycleStart) / 1000;
  const durations = getFixedPhaseDurations();
  const total = durations.reduce((a,b)=>a+b,0);
  let t = elapsed % total;
  let acc = 0;
  let newIdx = 0;
  for (let i=0; i<durations.length; i++) {
    if (t < acc + durations[i]) { newIdx = i; break; }
    acc += durations[i];
  }
  
  // CHANGED: Only change phase when we're actually at the boundary
  // Add small buffer to prevent rapid switching
  if (newIdx !== fixedPhaseIndex) {
    // Make sure we're not switching too early (within 0.05 seconds of boundary)
    const timeIntoPhase = t - acc;
    if (timeIntoPhase > 0.05 || newIdx > fixedPhaseIndex) {
      const previousLane = FIXED_PHASE_NAMES[fixedPhaseIndex];
      const newLane = FIXED_PHASE_NAMES[newIdx];
      const previousDuration = durations[fixedPhaseIndex];
      
      fixedPhaseIndex = newIdx;
      logDecision('FIXED_PHASE', { lane: newLane, step: FIXED_PHASE_STEPS[newIdx] });

      broadcastState();
      
      // Save phase change event to MongoDB
      //saveEvent('PHASE_CHANGE', { from: previousLane, to: newLane, duration: previousDuration });
    }
  }
}

function getFixedCommand() {
  updateFixedCycle();
  const durations = getFixedPhaseDurations();
  const now = Date.now();
  const elapsed = (now - fixedCycleStart) / 1000;
  const total = durations.reduce((a,b)=>a+b,0);
  let t = elapsed % total;
  let acc = 0;
  let idx = 0;
  for (let i=0; i<durations.length; i++) {
    if (t < acc + durations[i]) { idx = i; break; }
    acc += durations[i];
  }
  
  // CHANGED: Calculate remaining time with decimals, don't floor until display
  let remaining = durations[idx] - (t - acc);
  
  // CHANGED: Ensure remaining doesn't go negative
  if (remaining < 0) remaining = 0;
  if (remaining > durations[idx]) remaining = durations[idx];
  
  return {
    command: FIXED_PHASE_STEPS[idx] === 'GREEN' ? 'GREEN' : 'YELLOW',
    phase: FIXED_PHASE_NAMES[idx],
    phaseStep: FIXED_PHASE_STEPS[idx],
    timeRemaining: remaining  // Now returns decimal, not floored
  };
}

// ==========================================
// CYCLE STATE SAVE / RESTORE (for ambulance)
// ==========================================
function saveCurrentCycleState() {
  if (config.mode === 'FIXED') {
    const now = Date.now();
    const elapsed = (now - fixedCycleStart) / 1000;
    savedCycleState = {
      mode: 'FIXED',
      elapsed: elapsed,
      phaseIndex: fixedPhaseIndex
    };
  } else {
    savedCycleState = {
      mode: 'DYNAMIC',
      laneIndex: dynamicCurrentLaneIndex,
      step: dynamicStep,
      stepStartOffset: dynamicStepStart,
      greenDuration: dynamicGreenDuration
    };
  }
  logDecision('CYCLE_SAVED', savedCycleState);
}

function restoreCycleState() {
  if (!savedCycleState) return;
  if (savedCycleState.mode === 'FIXED') {
    fixedCycleStart = Date.now() - (savedCycleState.elapsed * 1000);
    fixedPhaseIndex = savedCycleState.phaseIndex;
  } else {
    dynamicCurrentLaneIndex = savedCycleState.laneIndex;
    dynamicStep = savedCycleState.step;
    dynamicStepStart = savedCycleState.stepStartOffset;
    dynamicGreenDuration = savedCycleState.greenDuration;
  }
  logDecision('CYCLE_RESTORED', savedCycleState);
  savedCycleState = null;

   broadcastState();
}

// ==========================================
// GET CURRENT PHASE INFO (for ambulance logic)
// ==========================================
// ==========================================
// GET CURRENT PHASE INFO (for ambulance logic)
// ==========================================
function getCurrentPhaseInfo() {
  let result = {
    isPedestrian: false,
    step: 'GREEN',
    lane: 'SOUTH',  // Default fallback
    timeRemaining: 10
  };
  
  if (config.mode === 'FIXED') {
    const durations = getFixedPhaseDurations();
    const now = Date.now();
    const elapsed = (now - fixedCycleStart) / 1000;
    const total = durations.reduce((a,b)=>a+b,0);
    let t = elapsed % total;
    let acc = 0;
    let idx = 0;
    for (let i=0; i<durations.length; i++) {
      if (t < acc + durations[i]) { idx = i; break; }
      acc += durations[i];
    }
    const remaining = durations[idx] - (t - acc);
    const lane = FIXED_PHASE_NAMES[idx];
    const step = FIXED_PHASE_STEPS[idx];
    
    // Only return valid car lanes
    if (lane === 'NORTH' || lane === 'SOUTH' || lane === 'EAST' || lane === 'WEST') {
      result = {
        isPedestrian: false,
        step: step,
        lane: lane,
        timeRemaining: remaining,
        idx: idx,
        durations: durations,
        totalCycle: total,
        elapsedInCycle: t
      };
    } else if (lane === 'PEDESTRIAN') {
      result = {
        isPedestrian: true,
        step: step,
        lane: 'PEDESTRIAN',
        timeRemaining: remaining,
        idx: idx,
        durations: durations,
        totalCycle: total,
        elapsedInCycle: t
      };
    } else {
      // Invalid lane (like ALL_RED) - return the last good car lane based on index
      const carLanes = ['SOUTH', 'NORTH', 'EAST', 'WEST'];
      const carIndex = Math.floor(idx / 2) % 4;
      result = {
        isPedestrian: false,
        step: 'GREEN',
        lane: carLanes[carIndex] || 'SOUTH',
        timeRemaining: 10,
        idx: idx,
        durations: durations,
        totalCycle: total,
        elapsedInCycle: t
      };
    }
  } 
  else {
    // DYNAMIC mode
    const lane = DYNAMIC_LANES[dynamicCurrentLaneIndex];
    const step = dynamicStep;
    const remaining = (dynamicStep === 'GREEN')
      ? Math.max(0, dynamicGreenDuration - (Date.now() - dynamicStepStart)/1000)
      : Math.max(0, YELLOW_DUR - (Date.now() - dynamicStepStart)/1000);
    
    if (lane === 'NORTH' || lane === 'SOUTH' || lane === 'EAST' || lane === 'WEST') {
      result = {
        isPedestrian: false,
        step: step,
        lane: lane,
        timeRemaining: remaining
      };
    } else if (lane === 'PEDESTRIAN') {
      result = {
        isPedestrian: true,
        step: step,
        lane: 'PEDESTRIAN',
        timeRemaining: remaining
      };
    } else {
      // Invalid lane - return default
      result = {
        isPedestrian: false,
        step: 'GREEN',
        lane: 'SOUTH',
        timeRemaining: 10
      };
    }
  }
  
  return result;
}
// ==========================================
// AMBULANCE HANDLING
// ==========================================
// ==========================================
// AMBULANCE HANDLING
// ==========================================
// AMBULANCE HANDLING (FIXED VERSION)
// ==========================================
function requestAmbulance(lane) {
  if (ambulanceState !== 'IDLE') {
    console.log(`🚑 Ambulance already active (state: ${ambulanceState}), ignoring request`);
    return;
  }

  console.log(`🚑 AMBULANCE REQUESTED on ${lane}`);
  // dataManager.addEmergencyEvent(lane, 'REQUESTED');
  // comparisonPaused = true;
  
  // Get current phase info
  const current = getCurrentPhaseInfo();
  console.log(`📊 Current phase: ${current.lane} (${current.step}), isPedestrian: ${current.isPedestrian}`);
  
  // Save current cycle state first
  saveCurrentCycleState();
  
  // Determine interrupted lane
  let interruptedLane = null;
  if (!current.isPedestrian && current.lane !== 'PEDESTRIAN') {
    interruptedLane = current.lane;
  } else {
    // Find the last car lane before pedestrian or current lane
    const laneOrder = ['SOUTH', 'NORTH', 'EAST', 'WEST'];
    const ambulanceIndex = laneOrder.indexOf(lane);
    interruptedLane = ambulanceIndex >= 0 ? laneOrder[ambulanceIndex] : 'SOUTH';
  }
  
  ambulanceRequest = {
    lane: lane,
    timestamp: Date.now(),
    interruptedLane: interruptedLane
  };
  
  // Start ambulance sequence
  if (current.isPedestrian && current.step === 'GREEN') {
    // Wait for pedestrian to finish
    ambulanceState = 'QUEUED';
    console.log(`🚑 Ambulance QUEUED - waiting for pedestrian to finish`);
    logDecision('AMBULANCE_QUEUED', { lane, interruptedLane });
  } else if (!current.isPedestrian && current.lane === lane) {
    // Ambulance already has green - just extend it
    ambulanceState = 'GREEN';
    ambulanceStepStart = Date.now();
    console.log(`🚑 Ambulance already on correct lane - extending green`);
    logDecision('AMBULANCE_GREEN_START', { lane, interruptedLane });
  } else if (!current.isPedestrian && current.step === 'GREEN') {
    // Need to interrupt current car lane
    ambulanceState = 'YELLOW_BEFORE';
    ambulanceStepStart = Date.now();
    console.log(`🚑 Giving YELLOW to ${current.lane}, then switching to ${lane}`);
    logDecision('AMBULANCE_YELLOW_START', { from: current.lane, to: lane, interruptedLane });
  } else {
    // Default - go directly to green
    ambulanceState = 'GREEN';
    ambulanceStepStart = Date.now();
    console.log(`🚑 Going directly to GREEN on ${lane}`);
    logDecision('AMBULANCE_GREEN_START', { lane, interruptedLane });
  }
  
  broadcastState();
}

function clearAmbulance() {
  console.log(`🚑 CLEAR AMBULANCE called, current state: ${ambulanceState}`);
  
  if (!ambulanceRequest) {
    console.log(`🚑 No active ambulance request`);
    return;
  }
  
  // dataManager.addEmergencyEvent(ambulanceRequest.lane, 'CLEARED');
  
  if (ambulanceState === 'GREEN') {
    ambulanceState = 'YELLOW_AFTER';
    ambulanceStepStart = Date.now();
    console.log(`🚑 Ambulance DEPARTED - giving YELLOW on ${ambulanceRequest.lane}`);
    logDecision('AMBULANCE_YELLOW_AFTER_START', { lane: ambulanceRequest.lane });
  } else if (ambulanceState === 'QUEUED') {
    // Never got green, just cancel
    ambulanceState = 'IDLE';
    ambulanceRequest = null;
    comparisonPaused = false;
    restoreCycleState();
    console.log(`🚑 Ambulance CANCELLED (was queued)`);
    logDecision('AMBULANCE_CANCELLED', {});
  } else {
    // Other states
    ambulanceState = 'IDLE';
    ambulanceRequest = null;
    comparisonPaused = false;
    restoreCycleState();
    console.log(`🚑 Ambulance CLEARED from state: ${ambulanceState}`);
    logDecision('AMBULANCE_CLEARED', {});
  }
  
  broadcastState();
}

// ==========================================
// MAIN COMMAND GENERATOR
// ==========================================
function getCommandForESP32() {
  // 1. Manual override
  if (currentOverride && currentOverride.command === 'OVERRIDE') {
    // Check if override has expired
    if (overrideExpiresAt && Date.now() > overrideExpiresAt) {
      // Override expired – clear it and resume normal cycle
      currentOverride = null;
      overrideExpiresAt = null;
      state.mode = 'AUTO';
      // Reset cycle state to avoid stuck phase
      if (config.mode === 'FIXED') {
        fixedCycleStart = Date.now();
        fixedPhaseIndex = 0;
      } else {
        dynamicCycleStart = Date.now();
        dynamicCurrentLaneIndex = 0;
        dynamicGreenDuration = calculateDynamicGreenTime(DYNAMIC_LANES[0]);
        dynamicStep = 'GREEN';
        dynamicStepStart = Date.now();
      }
      logDecision('OVERRIDE_EXPIRED', {});
      // Fall through to normal operation
    } else {
      let remaining = overrideExpiresAt ? Math.max(0, (overrideExpiresAt - Date.now()) / 1000) : 0;
      // Override still active
      return {
        command: 'OVERRIDE',
        phase: currentOverride.phase,
        phaseStep: currentOverride.phaseStep,
        timeRemaining: remaining  // FIXED: Use the variable instead of recalculating
      };
    }
  }

  // 2. Ambulance state machine
  if (ambulanceRequest) {
    const now = Date.now();

    // QUEUED: waiting for pedestrian to finish
    if (ambulanceState === 'QUEUED') {
      const current = getCurrentPhaseInfo();
      if (current.isPedestrian && (current.step === 'GREEN' || current.step === 'YELLOW')) {
        // FIXED: Ensure timeRemaining is a valid number
        let remaining = (typeof current.timeRemaining === 'number' && !isNaN(current.timeRemaining)) 
          ? current.timeRemaining 
          : 10;
        
        return {
          command: 'WAIT_AMBULANCE',
          phase: 'PEDESTRIAN',
          phaseStep: current.step,
          timeRemaining: remaining 
        };
      } else {
        // Pedestrian phase finished – go directly to ambulance green (no yellow)
        saveCurrentCycleState();   // save the upcoming car phase state
        ambulanceState = 'GREEN';
        ambulanceStepStart = now;
        logDecision('AMBULANCE_GREEN_START', { lane: ambulanceRequest.lane });
      }
    }

    // YELLOW_BEFORE: give yellow to current car lane (only if we came from car phase)
    if (ambulanceState === 'YELLOW_BEFORE') {
      const elapsed = (now - ambulanceStepStart) / 1000;
      if (elapsed < YELLOW_DUR) {
        const current = getCurrentPhaseInfo();
        const lane = (current && !current.isPedestrian) ? current.lane : null;
        // FIXED: Ensure at least 0.1 seconds to avoid division by zero
        let remaining = Math.max(0.1, YELLOW_DUR - elapsed);
        if (lane) {
          return {
            command: 'YELLOW',
            phase: lane,
            phaseStep: 'YELLOW',
            timeRemaining: remaining 
          };
        } else {
          return {
            command: 'ALL_RED',
            phase: 'ALL_RED',
            phaseStep: 'RED',
            timeRemaining: remaining 
          };
        }
      } else {
        ambulanceState = 'GREEN';
        ambulanceStepStart = now;
        logDecision('AMBULANCE_GREEN_START', { lane: ambulanceRequest.lane });
      }
    }

    // GREEN: ambulance lane green – stays indefinitely until clearAmbulance()
    if (ambulanceState === 'GREEN') {
      // FIXED: Use a large number instead of 0 to avoid dashboard issues
      return {
        command: 'AMBULANCE',
        phase: ambulanceRequest.lane,
        phaseStep: 'GREEN',
        timeRemaining: 999  // 999 seconds = "indefinite" for dashboard display
      };
    }

    // YELLOW_AFTER: caution on ambulance lane after it leaves
    if (ambulanceState === 'YELLOW_AFTER') {
      const elapsed = (now - ambulanceStepStart) / 1000;
      if (elapsed < POST_AMBULANCE_YELLOW) {
        // FIXED: Ensure at least 0.1 seconds
        let remaining = Math.max(0.1, POST_AMBULANCE_YELLOW - elapsed);
        return {
          command: 'YELLOW',
          phase: ambulanceRequest.lane,
          phaseStep: 'YELLOW',
          timeRemaining: remaining
        };
      } else {
        const reqLane = ambulanceRequest.lane;
        ambulanceState = 'IDLE';
        ambulanceRequest = null;
        comparisonPaused = false;
        restoreCycleState();
        logDecision('AMBULANCE_FINISHED_RESUME_CYCLE', { lane: reqLane });

        if (config.mode === 'FIXED') {
          return getFixedCommand();
        } else {
          return getDynamicCommand();
        }
      }
    }
  }

  // 3. Normal operation
  let normalCommand;
  if (config.mode === 'FIXED') {
    normalCommand = getFixedCommand();
  } else {
    normalCommand = getDynamicCommand();
  }
  
  // FIXED: Ensure timeRemaining is always a valid number
  if (normalCommand && typeof normalCommand.timeRemaining !== 'number') {
    normalCommand.timeRemaining = 10;
  }
  
  return normalCommand;
}
// Get AI vs Fixed Mode comparison statistics
exports.getComparisonStats = (req, res) => {
  const avgWaitPerLane = {
    NORTH: state.waitTimes?.j1 || 0,
    EAST: state.waitTimes?.j2 || 0,
    SOUTH: state.waitTimes?.j3 || 0,
    WEST: state.waitTimes?.j4 || 0
  };
  
  const totalCycleTime = 80;
  const fixedWaitPerLane = {};
  
  for (const lane of ['NORTH', 'EAST', 'SOUTH', 'WEST']) {
    const density = getDensityForLane(lane);
    const fixedGreen = getFixedGreenTimeForLane(lane);
    
    if (density === 0) {
      fixedWaitPerLane[lane] = 0;
    } else {
      const timeToClear = density * 2;
      if (timeToClear <= fixedGreen) {
        fixedWaitPerLane[lane] = (totalCycleTime - fixedGreen) / 2;
      } else {
        fixedWaitPerLane[lane] = fixedGreen + (totalCycleTime - fixedGreen);
      }
    }
  }
  
  const avgDynamicWait = (avgWaitPerLane.NORTH + avgWaitPerLane.EAST + avgWaitPerLane.SOUTH + avgWaitPerLane.WEST) / 4;
  const avgFixedWait = (fixedWaitPerLane.NORTH + fixedWaitPerLane.EAST + fixedWaitPerLane.SOUTH + fixedWaitPerLane.WEST) / 4;
  
  let totalDynamic = 0;
  let totalFixed = 0;
  for (const lane of ['NORTH', 'EAST', 'SOUTH', 'WEST']) {
    totalDynamic += aiComparisonStats.lanes[lane].dynamicGreenGiven;
    totalFixed += aiComparisonStats.lanes[lane].fixedGreenWouldBe;
  }
  const phaseEfficiency = totalFixed === 0 ? 100 : Math.round((totalDynamic / totalFixed) * 100);
  
  res.json({
    success: true,
    comparison: {
      dynamic: {
        avgWaitTime: avgDynamicWait,
        throughput: state.densities.j1 + state.densities.j2 + state.densities.j3 + state.densities.j4,
        timeSaved: aiComparisonStats.totalTimeSaved,
        phaseEfficiency: phaseEfficiency
      },
      fixed: {
        avgWaitTime: avgFixedWait,
        throughput: 180,
        timeSaved: 0,
        phaseEfficiency: 70
      },
      perLane: aiComparisonStats.lanes,
      totalTimeSavedMinutes: Math.round(aiComparisonStats.totalTimeSaved / 60)
    }
  });
};

// ==========================================
// CONTINUOUS BROADCAST FOR REAL-TIME UPDATES
// ==========================================

let broadcastInterval = null;

// In startContinuousBroadcast(), before sending broadcastData:
console.log('PEDESTRIAN CONFIG VALUE:', config.fixedCycle.pedestrianGreen);
console.log('FULL ALLOCATED TIMES:', {
  north: config.fixedCycle.northGreen,
  east: config.fixedCycle.eastGreen,
  south: config.fixedCycle.southGreen,
  west: config.fixedCycle.westGreen,
  pedestrian: config.fixedCycle.pedestrianGreen
});

function startContinuousBroadcast() {
  if (broadcastInterval) clearInterval(broadcastInterval);
  
  broadcastInterval = setInterval(() => {
    try {
      // Get current state
      const cmd = getCommandForESP32();
      
      // Calculate total cars
      const totalCars = (state.densities?.j1 || 0) + (state.densities?.j2 || 0) + 
                        (state.densities?.j3 || 0) + (state.densities?.j4 || 0);
      
      const recentDecisions = (decisionLog && Array.isArray(decisionLog)) ? decisionLog.slice(0, 8) : [];                 
      const broadcastData = {
        densities: state.densities || { j1: 0, j2: 0, j3: 0, j4: 0 },
        waitTimes: state.waitTimes || { j1: 0, j2: 0, j3: 0, j4: 0 },
        phase: cmd.phase || 'NORTH',
        phaseStep: cmd.phaseStep || 'GREEN',
        mode: state.mode || 'AUTO',
        timeRemaining: typeof cmd.timeRemaining === 'number' ? cmd.timeRemaining : 0,
        pedestrianCount: state.pedestrianCount || 0,
        pedestrianWaitTime: state.pedestrianWaitTime || 0,
        ambulanceActive: ambulanceRequest !== null && ambulanceState === 'GREEN',
        ambulanceLane: ambulanceRequest?.lane || null,
        interruptedLane: ambulanceRequest?.interruptedLane || null,  // ← ADD THIS
        override: currentOverride ? {
          active: true,
          lane: currentOverride.phase,
          color: currentOverride.phaseStep
        } : { active: false },
        nextPhase: getNextPhase(),
        totalCars: totalCars,
        peakLane: state.peakLane || '--',
        lastUpdated: Date.now(),
        recentDecisions: recentDecisions,
allocatedTimes: {
  NORTH: config.mode === 'FIXED' ? config.fixedCycle.northGreen : (DYNAMIC_LANES[dynamicCurrentLaneIndex] === 'NORTH' ? dynamicGreenDuration : 0),
  EAST: config.mode === 'FIXED' ? config.fixedCycle.eastGreen : (DYNAMIC_LANES[dynamicCurrentLaneIndex] === 'EAST' ? dynamicGreenDuration : 0),
  SOUTH: config.mode === 'FIXED' ? config.fixedCycle.southGreen : (DYNAMIC_LANES[dynamicCurrentLaneIndex] === 'SOUTH' ? dynamicGreenDuration : 0),
  WEST: config.mode === 'FIXED' ? config.fixedCycle.westGreen : (DYNAMIC_LANES[dynamicCurrentLaneIndex] === 'WEST' ? dynamicGreenDuration : 0),
  PEDESTRIAN: config.mode === 'FIXED' ? config.fixedCycle.pedestrianGreen : calculateDynamicGreenTime('PEDESTRIAN')
},
  // ADD THIS COMPARISON OBJECT
  comparison: {
    mode: config.mode,
    totalTimeSaved: aiComparisonStats.totalTimeSaved,
    lastCompleted: lastCompletedLane ? {
      lane: lastCompletedLane,
      dynamicTime: lastDynamicTime,
      fixedTime: lastFixedTime,
      saved: lastTimeSaved
    } : null,
    perLane: aiComparisonStats.lanes,
    // ✅ ADD SMART LOGIC STATS
    smartLogic: {
      laneSkipping: smartLogicStats.laneSkipping,
      pedestrianSkip: smartLogicStats.pedestrianSkip
    }
  },
  
  configMode: config.mode

          
        
      };
      
      // Broadcast to all connected clients
      if (global.broadcastStateUpdate) {
        global.broadcastStateUpdate(broadcastData);
      }
    } catch (err) {
      console.error('Broadcast error:', err.message);
    }
  }, 500); // Update every 500ms for smooth display
  
  console.log('✅ Continuous broadcast started (every 100ms)');
}

// Start the broadcast when the server loads
startContinuousBroadcast();

// ==========================================
// WEBSOCKET DENSITY UPDATE HANDLER (for YOLO)
// ==========================================

exports.updateDensityFromWebSocket = (data) => {
  // Update densities
  state.densities = {
    j1: data.j1 || 0,
    j2: data.j2 || 0,
    j3: data.j3 || 0,
    j4: data.j4 || 0
  };
  
  // ADD THIS LINE - Record traffic trend
  dataManager.recordTrafficDensity(state.densities);

  // Update peak lane
  const entries = [['j1', data.j1 || 0], ['j2', data.j2 || 0], ['j3', data.j3 || 0], ['j4', data.j4 || 0]];
  let max = 0, maxKey = '--';
  for (let [k,v] of entries) if (v > max) { max = v; maxKey = k; }
  state.peakLane = { j1:'NORTH', j2:'EAST', j3:'SOUTH', j4:'WEST' }[maxKey] || '--';
  
  state.lastUpdateTs = Date.now();
  
  console.log("📊 Densities updated via WebSocket:", state.densities);
  
  // Note: No need to broadcast here - the continuous broadcast (every 500ms) will pick up the new densities

 
};


// ==========================================
// ESP32 COMMAND GETTER FOR WEBSOCKET
// ==========================================
exports.getESP32Command = () => {
  return getCommandForESP32();
};


exports.updatePedestrianCount = (count) => {
  state.pedestrianCount = Math.min(30, Math.max(0, Number(count)));
  const now = Date.now();
  const timeDiff = (now - state.lastUpdateTs) / 1000;
  if (state.pedestrianCount > 0) {
    state.pedestrianWaitTime += timeDiff;
  } else {
    state.pedestrianWaitTime = Math.max(0, state.pedestrianWaitTime - timeDiff);
  }
  state.lastUpdateTs = now;
  broadcastState();
};

// ==========================================
// EXPORTED FUNCTIONS
// ==========================================
exports._setOverride = (command, expiresAt) => {
  // ADD THIS LINE
  dataManager.addOverride(command.phase, command.phaseStep, 
    expiresAt ? Math.floor((expiresAt - Date.now()) / 1000) : null);
  console.log("🔴 OVERRIDE RECEIVED:", command); // ← ADD THIS LINE
  // Special case: "AUTO" mode clears any override and resumes normal cycle
  if (command.command === 'AUTO') {
    currentOverride = null;
    overrideExpiresAt = null;
    state.mode = 'AUTO';
    // Reset the cycle to a fresh start
    if (config.mode === 'FIXED') {
      fixedCycleStart = Date.now();
      fixedPhaseIndex = 0;
    } else {
      dynamicCycleStart = Date.now();
      dynamicCurrentLaneIndex = 0;
      dynamicGreenDuration = calculateDynamicGreenTime(DYNAMIC_LANES[0]);
      dynamicStep = 'GREEN';
      dynamicStepStart = Date.now();
    }
    logDecision('AUTO_MODE_RESUMED', {});

    broadcastState();
    console.log("📡 Broadcast sent"); // ← ADD THIS LINE
    return;

    
  }

  // Normal override (e.g., NORTH GREEN, ALL_RED, etc.)
  currentOverride = command;
  overrideExpiresAt = expiresAt;
  state.mode = 'OVERRIDE';

  
  
  // FIXED: Send proper lane and color for the dashboard
  logDecision('OVERRIDE', { 
    lane: command.phase, 
    color: command.phaseStep,
    duration: expiresAt ? Math.floor((expiresAt - Date.now()) / 1000) : null
  });
     broadcastState();
};

exports.requestAmbulance = (lane) => requestAmbulance(lane);
exports.clearAmbulance = () => clearAmbulance();

exports.getESP32State = (req, res) => {
  const cmd = getCommandForESP32();
  res.json({
    command: cmd.command,
    phase: cmd.phase,
    phaseStep: cmd.phaseStep,
    message: '',
    north: state.densities.j1,
    south: state.densities.j3,
    east: state.densities.j2,
    west: state.densities.j4,
    timeRemaining: cmd.timeRemaining
  });
};

exports.updateDensity = (req, res) => {
  const { j1 = 0, j2 = 0, j3 = 0, j4 = 0 } = req.body;
  state.densities = { j1: Number(j1), j2: Number(j2), j3: Number(j3), j4: Number(j4) };
  state.lastUpdateTs = Date.now();

  broadcastState();

  const entries = [['j1', j1], ['j2', j2], ['j3', j3], ['j4', j4]];
  let max = 0, maxKey = '--';
  for (let [k,v] of entries) if (v > max) { max = v; maxKey = k; }
  state.peakLane = { j1:'NORTH', j2:'EAST', j3:'SOUTH', j4:'WEST' }[maxKey] || '--';
  res.json({ success: true });
};
// ==========================================
// GET NEXT PHASE (just the name)
// ==========================================
function getNextPhase() {
  if (config.mode === 'FIXED') {
    const durations = getFixedPhaseDurations();
    const now = Date.now();
    const elapsed = (now - fixedCycleStart) / 1000;
    const total = durations.reduce((a,b)=>a+b,0);
    let t = elapsed % total;
    let acc = 0;
    let currentIdx = 0;
    
    for (let i = 0; i < durations.length; i++) {
      if (t < acc + durations[i]) { 
        currentIdx = i; 
        break; 
      }
      acc += durations[i];
    }
    
    let nextIdx = (currentIdx + 1) % durations.length;
    return FIXED_PHASE_NAMES[nextIdx];
  } 
  else {
    let nextIdx = (dynamicCurrentLaneIndex + 1) % DYNAMIC_LANES.length;
    return DYNAMIC_LANES[nextIdx];
  }
}

exports.getStatus = (req, res) => {
  const totalCars = state.densities.j1 + state.densities.j2 + state.densities.j3 + state.densities.j4;
  const overrideInfo = currentOverride && currentOverride.command === 'OVERRIDE' ? {
    active: true,
    lane: currentOverride.phase,
    color: currentOverride.phaseStep,
    expiresAt: overrideExpiresAt
  } : { active: false };

  const cmd = getCommandForESP32();
  
  // ADD THIS LINE
  const nextPhase = getNextPhase();

  const ambulanceActive = (ambulanceRequest !== null && 
    (ambulanceState === 'GREEN' || ambulanceState === 'YELLOW_BEFORE' || ambulanceState === 'YELLOW_AFTER'));
  const ambulanceLane = ambulanceRequest ? ambulanceRequest.lane : null;

  res.json({
    success: true,
    state: {
      densities: state.densities,
      phase: cmd.phase,
      phaseStep: cmd.phaseStep,
      timeRemaining: cmd.timeRemaining,
      mode: state.mode,
      totalCars,
      timeSavedSec: state.timeSavedSec,
      waitTimes: state.waitTimes,
      peakLane: state.peakLane,
      lastUpdated: state.lastUpdateTs,
      override: overrideInfo,
      recentDecisions: decisionLog.slice(0, 8),
      configMode: config.mode,
      ambulanceActive: ambulanceActive,
      ambulanceLane: ambulanceLane,
      interruptedLane: ambulanceRequest?.interruptedLane || null,
      pedestrianCount: state.pedestrianCount || 0,
      pedestrianWaitTime: Math.round(state.pedestrianWaitTime || 0),
      pedestrianWaiting: (cmd.phase === 'PEDESTRIAN'),
      // ADD THIS LINE
      nextPhase: nextPhase
    }
  });
};



exports.getConfig = (req, res) => res.json({ success: true, config });
exports.setConfig = (req, res) => {
  const { mode, fixedCycle } = req.body;
  if (mode === 'FIXED' || mode === 'DYNAMIC') {
    config.mode = mode;
    logDecision('CONFIG_MODE', { mode });
  }
  if (fixedCycle) {
    config.fixedCycle = { ...config.fixedCycle, ...fixedCycle };
    logDecision('CONFIG_FIXED', fixedCycle);
  }
  res.json({ success: true, config });
};

exports.updatePedestrian = (req, res) => {
  const { count = 0 } = req.body;
  state.pedestrianCount = Math.min(30, Math.max(0, Number(count)));
  
  // Update wait time
  const now = Date.now();
  const timeDiff = (now - state.lastUpdateTs) / 1000;
  if (state.pedestrianCount > 0) {
    state.pedestrianWaitTime += timeDiff;
  } else {
    state.pedestrianWaitTime = Math.max(0, state.pedestrianWaitTime - timeDiff);
  }
  state.lastUpdateTs = now;
  
  res.json({ success: true });
};

// Legacy simulator functions (keep as they were)
exports.simulate = (req, res) => { /* unchanged – you can keep your existing code */ };
exports.simulatorYolo = (req, res) => { /* unchanged */ };
exports.simulatorState = (req, res) => res.json(state.simulator);
exports.simulatorESP32Update = (req, res) => { /* unchanged */ };
exports.simulatorUpdate = (req, res) => res.json(state.simulator);
exports.simulatorHistory = (req, res) => res.json(state.history);