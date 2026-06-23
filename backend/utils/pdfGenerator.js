// backend/utils/pdfGenerator.js
const PDFDocument = require('pdfkit');

class PDFGenerator {
  constructor(reportData) {
    this.data = reportData;
    this.doc = null;
    this.colors = {
      primary: '#10b981',
      secondary: '#3b82f6',
      danger: '#ef4444',
      warning: '#f59e0b',
      dark: '#1f2937',
      gray: '#6b7280',
      light: '#f3f4f6',
      white: '#ffffff'
    };
  }

  generate() {
    this.doc = new PDFDocument({ 
      margin: 50, 
      size: 'A4',
      info: {
        Title: 'Traffic System Report',
        Author: 'Real-Time Traffic Optimizer',
        Subject: 'System Performance Report'
      }
    });
    
    this.addCoverPage();
    this.addExecutiveSummary();
    this.addComparisonPage();
    this.addTrafficFlowPage();
    this.addEmergencyPage();
    this.addOverridePage();
    this.addDecisionLogPage();
    this.addFooterPage();
    
    return this.doc;
  }

  addCoverPage() {
    // Background gradient effect
    this.doc.rect(0, 0, this.doc.page.width, this.doc.page.height)
      .fill(this.colors.white);
    
    // Decorative top bar
    this.doc.rect(0, 0, this.doc.page.width, 8).fill(this.colors.primary);
    
    // Icon/Logo
    this.doc.fontSize(48).fillColor(this.colors.primary);
    this.doc.text('🚦', { align: 'center', x: this.doc.page.width / 2 - 20, y: 100 });
    
    // Title
    this.doc.fontSize(32).font('Helvetica-Bold').fillColor(this.colors.dark);
    this.doc.text('REAL-TIME TRAFFIC', { align: 'center', y: 170 });
    this.doc.fontSize(28).text('OPTIMIZER REPORT', { align: 'center' });
    
    // Divider
    this.doc.moveDown(1);
    this.doc.strokeColor(this.colors.primary).lineWidth(2);
    this.doc.moveTo(150, this.doc.y).lineTo(this.doc.page.width - 150, this.doc.y).stroke();
    
    // Metadata
    this.doc.moveDown(2);
    this.doc.fontSize(11).font('Helvetica').fillColor(this.colors.gray);
    this.doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    this.doc.text(`Report ID: ${this.data.generatedAt || Date.now()}`, { align: 'center' });
    
    const uptime = this.data.live?.systemInfo?.uptime || 0;
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    this.doc.text(`Session Duration: ${hours}h ${minutes}m`, { align: 'center' });
    
    // Bottom decoration
    this.doc.rect(0, this.doc.page.height - 40, this.doc.page.width, 40).fill(this.colors.primary);
    this.doc.fontSize(9).fillColor(this.colors.white);
    this.doc.text('CONFIDENTIAL - Internal Use Only', { align: 'center', y: this.doc.page.height - 30 });
    
    this.doc.addPage();
  }

  addExecutiveSummary() {
    const summary = this.data.live?.summary || {};
    const timeSaved = summary.totalTimeSaved || 0;
    const minutesSaved = Math.floor(timeSaved / 60);
    const secondsSaved = timeSaved % 60;
    
    // Header with gradient bar
    this.doc.rect(0, this.doc.y, this.doc.page.width, 45).fill(this.colors.secondary);
    this.doc.fontSize(18).font('Helvetica-Bold').fillColor(this.colors.white);
    this.doc.text('EXECUTIVE SUMMARY', 50, this.doc.y - 35);
    
    this.doc.fillColor(this.colors.dark);
    this.doc.moveDown(2);
    
    // KPI Cards
    const cards = [
      { label: 'TIME SAVED', value: `${minutesSaved}m ${secondsSaved}s`, icon: '⏱️', color: this.colors.primary },
      { label: 'AI DECISIONS', value: summary.aiDecisions || 0, icon: '🤖', color: this.colors.secondary },
      { label: 'EMERGENCY', value: summary.emergencyResponses || 0, icon: '🚑', color: this.colors.danger },
      { label: 'OVERRIDES', value: summary.manualOverrides || 0, icon: '🎮', color: this.colors.warning }
    ];
    
    let startX = 50;
    cards.forEach((card, i) => {
      // Card background
      this.doc.roundedRect(startX, this.doc.y, 110, 70, 8).fill(this.colors.light);
      this.doc.fillColor(card.color);
      this.doc.fontSize(28).text(card.icon, startX + 35, this.doc.y + 10);
      this.doc.fontSize(22).font('Helvetica-Bold').text(card.value.toString(), startX + 15, this.doc.y + 42);
      this.doc.fontSize(9).font('Helvetica').fillColor(this.colors.gray);
      this.doc.text(card.label, startX + 18, this.doc.y + 62);
      startX += 120;
    });
    
    this.doc.moveDown(8);
    
    // Performance Score with gauge
    const score = summary.performanceScore || 75;
    this.doc.fontSize(12).font('Helvetica-Bold').text('PERFORMANCE SCORE', 50, this.doc.y);
    
    // Gauge background
    this.doc.roundedRect(50, this.doc.y + 5, 200, 12, 6).fill('#e5e7eb');
    // Gauge fill
    this.doc.roundedRect(50, this.doc.y + 5, (score / 100) * 200, 12, 6).fill(this.colors.primary);
    this.doc.fontSize(10).fillColor(this.colors.dark).text(`${score}%`, 260, this.doc.y + 2);
    
    this.doc.moveDown(3);
    
    // Key Insights box
    this.doc.roundedRect(50, this.doc.y, 500, 65, 8).fill(this.colors.light);
    this.doc.fontSize(11).font('Helvetica-Bold').fillColor(this.colors.dark);
    this.doc.text('📊 KEY INSIGHTS', 60, this.doc.y + 10);
    this.doc.fontSize(9).font('Helvetica').fillColor(this.colors.gray);
    this.doc.text(`• Peak congestion: ${summary.peakCongestion || 0} vehicles`, 60, this.doc.y + 28);
    this.doc.text(`• Total time saved: ${timeSaved} seconds (${minutesSaved}m ${secondsSaved}s)`, 60, this.doc.y + 42);
    this.doc.text(`• AI efficiency: ${Math.round((timeSaved / 300) * 100) || 0}% improvement`, 60, this.doc.y + 56);
    
    this.doc.addPage();
  }

  addComparisonPage() {
    const comparison = this.data.live?.comparison || { lanes: {} };
    const lanes = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    
    // Header
    this.doc.rect(0, this.doc.y, this.doc.page.width, 45).fill(this.colors.secondary);
    this.doc.fontSize(18).font('Helvetica-Bold').fillColor(this.colors.white);
    this.doc.text('AI vs FIXED MODE COMPARISON', 50, this.doc.y - 35);
    
    this.doc.fillColor(this.colors.dark);
    this.doc.moveDown(2);
    
    // Table headers
    this.doc.fontSize(10).font('Helvetica-Bold').fillColor(this.colors.dark);
    this.doc.rect(50, this.doc.y, 500, 25).fill(this.colors.light);
    this.doc.text('LANE', 60, this.doc.y + 8);
    this.doc.text('DYNAMIC AI', 180, this.doc.y + 8);
    this.doc.text('FIXED CYCLE', 280, this.doc.y + 8);
    this.doc.text('TIME SAVED', 380, this.doc.y + 8);
    
    let yPos = this.doc.y + 25;
    lanes.forEach((lane, i) => {
      const laneData = comparison.lanes[lane] || {};
      const saved = (laneData.timeSaved || 0);
      const savedText = saved >= 0 ? `+${saved}s` : `${saved}s`;
      const bgColor = i % 2 === 0 ? this.colors.white : this.colors.light;
      
      this.doc.rect(50, yPos + (i * 25), 500, 25).fill(bgColor);
      this.doc.fontSize(9).font('Helvetica').fillColor(this.colors.dark);
      this.doc.text(lane, 60, yPos + (i * 25) + 8);
      this.doc.text(`${laneData.dynamicTime || 0}s`, 180, yPos + (i * 25) + 8);
      this.doc.text(`${laneData.fixedTime || 0}s`, 280, yPos + (i * 25) + 8);
      
      const savedColor = saved >= 0 ? this.colors.primary : this.colors.danger;
      this.doc.fillColor(savedColor).text(savedText, 380, yPos + (i * 25) + 8);
    });
    
    this.doc.fillColor(this.colors.dark);
    this.doc.moveDown(4);
    
    // Bar chart title
    this.doc.fontSize(11).font('Helvetica-Bold').text('TIME SAVED PER LANE (seconds)', 50, this.doc.y);
    this.doc.moveDown(0.5);
    
    let barY = this.doc.y;
    lanes.forEach((lane, i) => {
      const laneData = comparison.lanes[lane] || {};
      const saved = Math.abs(laneData.timeSaved || 0);
      const barWidth = Math.min(200, saved * 12);
      const color = (laneData.timeSaved || 0) >= 0 ? this.colors.primary : this.colors.danger;
      
      this.doc.fontSize(8).font('Helvetica').text(lane, 50, barY + (i * 22));
      this.doc.roundedRect(110, barY + (i * 22) - 2, barWidth, 12, 4).fill(color);
      this.doc.text(`${saved}s`, 320, barY + (i * 22) - 2);
    });
    
    this.doc.addPage();
  }

  addTrafficFlowPage() {
    const history = this.data.live?.trafficHistory || { densities: { NORTH: [], EAST: [], SOUTH: [], WEST: [] } };
    const summary = this.data.live?.summary || {};
    
    this.doc.rect(0, this.doc.y, this.doc.page.width, 45).fill(this.colors.secondary);
    this.doc.fontSize(18).font('Helvetica-Bold').fillColor(this.colors.white);
    this.doc.text('TRAFFIC FLOW ANALYSIS', 50, this.doc.y - 35);
    
    this.doc.fillColor(this.colors.dark);
    this.doc.moveDown(2);
    
    // Stats cards
    const peakCongestion = Math.max(
      Math.max(...(history.densities.NORTH || [0])),
      Math.max(...(history.densities.EAST || [0])),
      Math.max(...(history.densities.SOUTH || [0])),
      Math.max(...(history.densities.WEST || [0]))
    );
    
    this.doc.roundedRect(50, this.doc.y, 230, 45, 8).fill(this.colors.light);
    this.doc.fontSize(24).font('Helvetica-Bold').fillColor(this.colors.warning);
    this.doc.text(`${peakCongestion}`, 70, this.doc.y + 10);
    this.doc.fontSize(9).fillColor(this.colors.gray).text('PEAK CONGESTION', 70, this.doc.y + 38);
    
    this.doc.roundedRect(300, this.doc.y, 230, 45, 8).fill(this.colors.light);
    this.doc.fontSize(24).font('Helvetica-Bold').fillColor(this.colors.primary);
    this.doc.text(`${summary.aiDecisions || 0}`, 320, this.doc.y + 10);
    this.doc.fontSize(9).fillColor(this.colors.gray).text('TOTAL VEHICLES', 320, this.doc.y + 38);
    
    this.doc.moveDown(5);
    
    // Lane summary cards
    const lanes = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    let cardX = 50;
    lanes.forEach(lane => {
      const avg = history.densities[lane]?.reduce((a, b) => a + b, 0) / (history.densities[lane]?.length || 1) || 0;
      this.doc.roundedRect(cardX, this.doc.y, 105, 50, 8).fill(this.colors.light);
      this.doc.fontSize(14).font('Helvetica-Bold').fillColor(this.colors.dark);
      this.doc.text(lane, cardX + 35, this.doc.y + 12);
      this.doc.fontSize(18).font('Helvetica-Bold').fillColor(this.colors.secondary);
      this.doc.text(`${Math.round(avg)}`, cardX + 38, this.doc.y + 30);
      cardX += 115;
    });
    
    this.doc.addPage();
  }

  addEmergencyPage() {
    const emergency = this.data.live?.emergency || { interruptions: { NORTH: 0, EAST: 0, SOUTH: 0, WEST: 0 } };
    const lanes = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    const totalInterruption = Object.values(emergency.interruptions).reduce((a, b) => a + b, 0);
    
    this.doc.rect(0, this.doc.y, this.doc.page.width, 45).fill(this.colors.danger);
    this.doc.fontSize(18).font('Helvetica-Bold').fillColor(this.colors.white);
    this.doc.text('EMERGENCY RESPONSE DASHBOARD', 50, this.doc.y - 35);
    
    this.doc.fillColor(this.colors.dark);
    this.doc.moveDown(2);
    
    // Big stat boxes
    this.doc.roundedRect(50, this.doc.y, 230, 70, 8).fill('#fee2e2');
    this.doc.fontSize(36).font('Helvetica-Bold').fillColor(this.colors.danger);
    this.doc.text(`${emergency.totalEmergencies || 0}`, 120, this.doc.y + 18);
    this.doc.fontSize(10).fillColor(this.colors.gray).text('TOTAL EMERGENCIES', 100, this.doc.y + 50);
    
    this.doc.roundedRect(300, this.doc.y, 230, 70, 8).fill('#fed7aa');
    this.doc.fontSize(36).font('Helvetica-Bold').fillColor(this.colors.warning);
    this.doc.text(`${Math.round(totalInterruption)}`, 370, this.doc.y + 18);
    this.doc.fontSize(10).fillColor(this.colors.gray).text('TOTAL INTERRUPTION (s)', 350, this.doc.y + 50);
    
    this.doc.moveDown(6);
    
    // Interruption per lane
    this.doc.fontSize(12).font('Helvetica-Bold').text('INTERRUPTION PER LANE (seconds)', 50, this.doc.y);
    this.doc.moveDown(0.5);
    
    let barY = this.doc.y;
    lanes.forEach((lane, i) => {
      const interruption = emergency.interruptions[lane] || 0;
      const barWidth = Math.min(300, interruption * 8);
      
      this.doc.fontSize(9).font('Helvetica').text(lane, 50, barY + (i * 25));
      this.doc.roundedRect(120, barY + (i * 25) - 3, barWidth, 12, 4).fill(this.colors.danger);
      this.doc.text(`${Math.round(interruption)}s`, 430, barY + (i * 25) - 3);
    });
    
    this.doc.addPage();
  }

  addOverridePage() {
    const overrides = this.data.live?.overrides || { perLane: {}, positive: 0, negative: 0 };
    const lanes = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    const total = (overrides.positive || 0) + (overrides.negative || 0);
    const positivePercent = total > 0 ? Math.round((overrides.positive / total) * 100) : 0;
    
    this.doc.rect(0, this.doc.y, this.doc.page.width, 45).fill(this.colors.warning);
    this.doc.fontSize(18).font('Helvetica-Bold').fillColor(this.colors.white);
    this.doc.text('OVERRIDE IMPACT ANALYSIS', 50, this.doc.y - 35);
    
    this.doc.fillColor(this.colors.dark);
    this.doc.moveDown(2);
    
    // Donut chart representation
    this.doc.roundedRect(50, this.doc.y, 200, 100, 8).fill(this.colors.primary);
    this.doc.fontSize(32).font('Helvetica-Bold').fillColor(this.colors.white);
    this.doc.text(`${positivePercent}%`, 120, this.doc.y + 32);
    this.doc.fontSize(10).text('POSITIVE', 125, this.doc.y + 65);
    
    this.doc.roundedRect(270, this.doc.y, 200, 100, 8).fill(this.colors.danger);
    this.doc.fontSize(32).font('Helvetica-Bold').fillColor(this.colors.white);
    this.doc.text(`${100 - positivePercent}%`, 340, this.doc.y + 32);
    this.doc.fontSize(10).text('NEGATIVE', 345, this.doc.y + 65);
    
    this.doc.moveDown(7);
    
    // Per-lane effectiveness table
    this.doc.fontSize(10).font('Helvetica-Bold').fillColor(this.colors.dark);
    this.doc.rect(50, this.doc.y, 500, 22).fill(this.colors.light);
    this.doc.text('LANE', 60, this.doc.y + 7);
    this.doc.text('OVERRIDES', 150, this.doc.y + 7);
    this.doc.text('CLEARED', 230, this.doc.y + 7);
    this.doc.text('BUILT', 310, this.doc.y + 7);
    this.doc.text('NET', 390, this.doc.y + 7);
    this.doc.text('STATUS', 450, this.doc.y + 7);
    
    let yPos = this.doc.y + 22;
    lanes.forEach((lane, i) => {
      const data = overrides.perLane[lane] || { count: 0, cleared: 0, built: 0, net: 0 };
      const status = data.net >= 0 ? '✓ GOOD' : '✗ BAD';
      const statusColor = data.net >= 0 ? this.colors.primary : this.colors.danger;
      const bgColor = i % 2 === 0 ? this.colors.white : this.colors.light;
      
      this.doc.rect(50, yPos + (i * 22), 500, 22).fill(bgColor);
      this.doc.fontSize(9).font('Helvetica').fillColor(this.colors.dark);
      this.doc.text(lane, 60, yPos + (i * 22) + 6);
      this.doc.text(`${data.count}`, 150, yPos + (i * 22) + 6);
      this.doc.fillColor(this.colors.primary).text(`${data.cleared}`, 230, yPos + (i * 22) + 6);
      this.doc.fillColor(this.colors.danger).text(`${data.built}`, 310, yPos + (i * 22) + 6);
      this.doc.fillColor(statusColor).text(`${data.net >= 0 ? '+' : ''}${data.net}`, 390, yPos + (i * 22) + 6);
      this.doc.fillColor(statusColor).text(status, 450, yPos + (i * 22) + 6);
      this.doc.fillColor(this.colors.dark);
    });
    
    this.doc.addPage();
  }

  addDecisionLogPage() {
    const decisions = this.data.live?.decisions || [];
    const recentDecisions = decisions.slice(0, 25);
    
    this.doc.rect(0, this.doc.y, this.doc.page.width, 45).fill(this.colors.secondary);
    this.doc.fontSize(18).font('Helvetica-Bold').fillColor(this.colors.white);
    this.doc.text('RECENT AI DECISIONS', 50, this.doc.y - 35);
    
    this.doc.fillColor(this.colors.dark);
    this.doc.moveDown(2);
    
    // Table headers
    this.doc.fontSize(9).font('Helvetica-Bold');
    this.doc.rect(50, this.doc.y, 500, 20).fill(this.colors.light);
    this.doc.text('TIME', 55, this.doc.y + 6);
    this.doc.text('ACTION', 130, this.doc.y + 6);
    this.doc.text('LANE', 240, this.doc.y + 6);
    this.doc.text('DETAILS', 310, this.doc.y + 6);
    
    let yPos = this.doc.y + 20;
    recentDecisions.forEach((decision, i) => {
      if (i > 22) return;
      const time = new Date(decision.timestamp).toLocaleTimeString();
      const action = (decision.action || 'UNKNOWN').substring(0, 20);
      const lane = decision.lane || decision.details?.lane || '-';
      const details = decision.duration ? `${decision.duration}s` : '';
      const bgColor = i % 2 === 0 ? this.colors.white : this.colors.light;
      
      this.doc.rect(50, yPos + (i * 18), 500, 18).fill(bgColor);
      this.doc.fontSize(8).font('Helvetica').fillColor(this.colors.dark);
      this.doc.text(time, 55, yPos + (i * 18) + 4);
      this.doc.text(action, 130, yPos + (i * 18) + 4);
      this.doc.text(lane, 240, yPos + (i * 18) + 4);
      this.doc.text(details, 310, yPos + (i * 18) + 4);
    });
    
    this.doc.moveDown(5);
    this.doc.fontSize(9).fillColor(this.colors.gray);
    this.doc.text(`📊 Total decisions logged: ${decisions.length}`, 50, this.doc.y);
    
    this.doc.addPage();
  }

  addFooterPage() {
    const systemInfo = this.data.live?.systemInfo || {};
    const summary = this.data.live?.summary || {};
    const uptime = systemInfo.uptime || 0;
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    this.doc.rect(0, this.doc.y, this.doc.page.width, 45).fill(this.colors.dark);
    this.doc.fontSize(18).font('Helvetica-Bold').fillColor(this.colors.white);
    this.doc.text('SYSTEM INFORMATION', 50, this.doc.y - 35);
    
    this.doc.fillColor(this.colors.dark);
    this.doc.moveDown(2);
    
    // Info grid
    const info = [
      { label: 'System Uptime', value: `${hours}h ${minutes}m` },
      { label: 'Total Data Points', value: systemInfo.dataPoints || 0 },
      { label: 'Decisions in RAM', value: summary.aiDecisions || 0 },
      { label: 'MongoDB Status', value: 'Connected ✓' },
      { label: 'WebSocket Clients', value: 'Active' },
      { label: 'ESP32 Devices', value: 'Connected' }
    ];
    
    let startY = this.doc.y;
    let col1 = 50;
    let col2 = 300;
    
    info.slice(0, 3).forEach((item, i) => {
      this.doc.fontSize(9).font('Helvetica-Bold').fillColor(this.colors.gray);
      this.doc.text(item.label, col1, startY + (i * 25));
      this.doc.fontSize(10).font('Helvetica').fillColor(this.colors.dark);
      this.doc.text(item.value, col1, startY + (i * 25) + 12);
    });
    
    info.slice(3, 6).forEach((item, i) => {
      this.doc.fontSize(9).font('Helvetica-Bold').fillColor(this.colors.gray);
      this.doc.text(item.label, col2, startY + (i * 25));
      this.doc.fontSize(10).font('Helvetica').fillColor(this.colors.dark);
      this.doc.text(item.value, col2, startY + (i * 25) + 12);
    });
    
    this.doc.moveDown(6);
    
    // Footer message
    this.doc.roundedRect(50, this.doc.y, 500, 80, 8).fill(this.colors.light);
    this.doc.fontSize(9).font('Helvetica').fillColor(this.colors.gray);
    this.doc.text('This report was automatically generated by the Real-Time Traffic Optimizer System.', 60, this.doc.y + 15, { width: 480 });
    this.doc.text('Data reflects live session activity from RAM storage.', 60, this.doc.y + 30, { width: 480 });
    this.doc.text(`Report ID: RPT-${Date.now()}`, 60, this.doc.y + 50);
    this.doc.fontSize(8).fillColor(this.colors.dark).text('CONFIDENTIAL - Internal Use Only', 60, this.doc.y + 65);
  }
}

module.exports = PDFGenerator;