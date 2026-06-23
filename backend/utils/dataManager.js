// backend/utils/dataManager.js

class DataManager {
  constructor() {
    this.liveData = {
      // Basic info
      startTime: Date.now(),
      sessionId: Date.now(),
      
      // Page 1-2: Summary stats
      summary: {
        totalTimeSaved: 0,
        aiDecisions: 0,
        emergencyResponses: 0,
        manualOverrides: 0,
        congestionLevels: [],
        peakCongestion: 0,
        performanceScore: 100
      },
      
      // Page 3: AI vs Fixed comparison
      comparison: {
        lanes: {
          NORTH: { dynamicTime: 0, fixedTime: 0, timeSaved: 0, phasesCompleted: 0 },
          EAST: { dynamicTime: 0, fixedTime: 0, timeSaved: 0, phasesCompleted: 0 },
          SOUTH: { dynamicTime: 0, fixedTime: 0, timeSaved: 0, phasesCompleted: 0 },
          WEST: { dynamicTime: 0, fixedTime: 0, timeSaved: 0, phasesCompleted: 0 }
        },
        totalDynamicTime: 0,
        totalFixedTime: 0
      },
      
      // Page 4: Traffic flow trends
      trafficHistory: {
        timestamps: [],
        densities: {
          NORTH: [],
          EAST: [],
          SOUTH: [],
          WEST: []
        },
        maxHistoryLength: 100
      },
      
      // Page 5: Emergency response
      emergency: {
        totalEmergencies: 0,
        interruptions: {
          NORTH: 0,
          EAST: 0,
          SOUTH: 0,
          WEST: 0
        },
        activeEmergency: false,
        currentInterruptedLane: null,
        interruptionStartTime: null
      },
      
      // Page 6: Override impact
      overrides: {
        total: 0,
        positive: 0,
        negative: 0,
        perLane: {
          NORTH: { count: 0, cleared: 0, built: 0, net: 0 },
          EAST: { count: 0, cleared: 0, built: 0, net: 0 },
          SOUTH: { count: 0, cleared: 0, built: 0, net: 0 },
          WEST: { count: 0, cleared: 0, built: 0, net: 0 },
          ALL_RED: { count: 0, cleared: 0, built: 0, net: 0 }
        }
      },
      
      // Page 7: Decision log
      decisions: [],
      
      // Page 8: System info
      systemInfo: {
        uptime: 0,
        lastBackup: null,
        dataPoints: 0
      }
    };
  }
  
  // Record a decision (called from trafficController)
  addDecision(action, details) {
    const decision = {
      timestamp: Date.now(),
      action: action,
      details: details,
      lane: details?.lane || null,
      duration: details?.duration || details?.usedSec || null
    };
    
    this.liveData.decisions.unshift(decision);
    this.liveData.summary.aiDecisions++;
    this.liveData.systemInfo.dataPoints++;
    
    // Keep last 500 decisions
    if (this.liveData.decisions.length > 500) {
      this.liveData.decisions.pop();
    }
  }
  
  // Record comparison data (AI vs Fixed)
  updateComparison(lane, dynamicTime, fixedTime, saved) {
    if (this.liveData.comparison.lanes[lane]) {
      this.liveData.comparison.lanes[lane].dynamicTime += dynamicTime;
      this.liveData.comparison.lanes[lane].fixedTime += fixedTime;
      this.liveData.comparison.lanes[lane].timeSaved += saved;
      this.liveData.comparison.lanes[lane].phasesCompleted++;
      
      this.liveData.comparison.totalDynamicTime += dynamicTime;
      this.liveData.comparison.totalFixedTime += fixedTime;
      this.liveData.summary.totalTimeSaved += saved;
    }
  }
  
  // Record traffic density (for trends)
  recordTrafficDensity(densities) {
    const timestamp = Date.now();
    this.liveData.trafficHistory.timestamps.push(timestamp);
    
    this.liveData.trafficHistory.densities.NORTH.push(densities.j1 || 0);
    this.liveData.trafficHistory.densities.EAST.push(densities.j2 || 0);
    this.liveData.trafficHistory.densities.SOUTH.push(densities.j3 || 0);
    this.liveData.trafficHistory.densities.WEST.push(densities.j4 || 0);
    
    // Track peak congestion
    const totalCars = (densities.j1 || 0) + (densities.j2 || 0) + (densities.j3 || 0) + (densities.j4 || 0);
    this.liveData.summary.congestionLevels.push(totalCars);
    if (totalCars > this.liveData.summary.peakCongestion) {
      this.liveData.summary.peakCongestion = totalCars;
    }
    
    // Keep history limited
    const maxLen = this.liveData.trafficHistory.maxHistoryLength;
    if (this.liveData.trafficHistory.timestamps.length > maxLen) {
      this.liveData.trafficHistory.timestamps.shift();
      this.liveData.trafficHistory.densities.NORTH.shift();
      this.liveData.trafficHistory.densities.EAST.shift();
      this.liveData.trafficHistory.densities.SOUTH.shift();
      this.liveData.trafficHistory.densities.WEST.shift();
    }
  }
  
  // Record emergency / ambulance event
  addEmergencyEvent(lane, action) {
    const event = {
      timestamp: Date.now(),
      lane: lane,
      action: action
    };
    
    if (action === 'REQUESTED') {
      this.liveData.emergency.totalEmergencies++;
      this.liveData.summary.emergencyResponses++;
      this.liveData.emergency.activeEmergency = true;
      this.liveData.emergency.currentInterruptedLane = lane;
      this.liveData.emergency.interruptionStartTime = Date.now();
    } else if (action === 'CLEARED' && this.liveData.emergency.interruptionStartTime) {
      const duration = (Date.now() - this.liveData.emergency.interruptionStartTime) / 1000;
      if (this.liveData.emergency.currentInterruptedLane) {
        this.liveData.emergency.interruptions[this.liveData.emergency.currentInterruptedLane] += duration;
      }
      this.liveData.emergency.activeEmergency = false;
      this.liveData.emergency.currentInterruptedLane = null;
      this.liveData.emergency.interruptionStartTime = null;
    }
    
    // Store in decisions array as well
    this.addDecision('AMBULANCE', { lane: lane, action: action });
  }
  
  // Record override
  addOverride(lane, color, duration) {
    const override = {
      timestamp: Date.now(),
      lane: lane,
      color: color,
      duration: duration
    };
    
    this.liveData.overrides.total++;
    this.liveData.summary.manualOverrides++;
    
    if (this.liveData.overrides.perLane[lane]) {
      this.liveData.overrides.perLane[lane].count++;
    }
  }
  
  // Update override impact (positive/negative)
  updateOverrideImpact(lane, cleared, built) {
    if (this.liveData.overrides.perLane[lane]) {
      this.liveData.overrides.perLane[lane].cleared += cleared;
      this.liveData.overrides.perLane[lane].built += built;
      this.liveData.overrides.perLane[lane].net = cleared - built;
      
      if (cleared > built) {
        this.liveData.overrides.positive++;
      } else if (built > cleared) {
        this.liveData.overrides.negative++;
      }
    }
  }
  
  // Update performance score
  updatePerformanceScore() {
    const avgWait = this.liveData.summary.congestionLevels.length > 0 
      ? this.liveData.summary.congestionLevels.reduce((a,b) => a+b, 0) / this.liveData.summary.congestionLevels.length
      : 0;
    
    // Score based on congestion and time saved
    let score = 100;
    if (avgWait > 30) score -= 20;
    if (avgWait > 50) score -= 20;
    if (this.liveData.summary.totalTimeSaved > 0) score += Math.min(10, this.liveData.summary.totalTimeSaved / 60);
    
    this.liveData.summary.performanceScore = Math.min(100, Math.max(0, score));
  }
  
  // Get full report data
  getReportData() {
    this.liveData.systemInfo.uptime = Math.floor((Date.now() - this.liveData.startTime) / 1000);
    this.updatePerformanceScore();
    
    return {
      ...this.liveData,
      generatedAt: Date.now()
    };
  }
  
  // Get live data (for quick access)
  getLiveData() {
    return this.getReportData();
  }
  
  // Generate report (for download)
  async generateReport(daysBack = 1) {
    return {
      live: this.getReportData(),
      generatedAt: Date.now(),
      reportRange: `${daysBack} day(s)`
    };
  }
}

// Singleton instance
module.exports = new DataManager();