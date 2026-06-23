const express = require('express');
const router = express.Router();
const trafficController = require('../controllers/trafficController');
const overrideController = require('../controllers/overrideController');


// Logout route
router.post('/logout', (req, res) => {
  // Clear session if you have one
  res.json({ success: true, message: 'Logged out' });
});

const dataManager = require('../utils/dataManager');

// PDF Report with custom data
router.post('/download-pdf-range', async (req, res) => {
  try {
    const report = req.body;
    const PDFDocument = require('pdfkit');
    
    const doc = new PDFDocument({ margin: 50 });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=traffic-report-${Date.now()}.pdf`);
    
    doc.pipe(res);
    
    // Title
    doc.fontSize(20).text('TRAFFIC SYSTEM REPORT', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    
    // Time range info
    if (report.timeRange) {
      doc.moveDown();
      doc.fontSize(12).text(`TIME RANGE: Last ${report.timeRange.minutes} minutes`, { align: 'center', color: '#ef4444' });
      doc.fontSize(9).text(`${report.timeRange.decisionCount} decisions recorded in this period`, { align: 'center' });
    }
    
    doc.moveDown();
    
    // Summary
    doc.fontSize(14).text('SUMMARY', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Total Time Saved: ${report.live?.stats?.totalTimeSaved || 0} seconds`);
    doc.text(`Decisions in Range: ${report.timeRange?.decisionCount || 0}`);
    doc.text(`Ambulance Events: ${report.live?.ambulanceEvents?.length || 0}`);
    doc.moveDown();
    
    // Recent Decisions (only those in time range)
    doc.fontSize(14).text('DECISIONS IN SELECTED TIME RANGE', { underline: true });
    doc.moveDown(0.5);
    
    const decisions = report.live?.decisions?.slice(0, 50) || [];
    if (decisions.length === 0) {
      doc.fontSize(10).text('No decisions recorded in this time period.', { color: '#666' });
    } else {
      decisions.forEach(d => {
        doc.fontSize(8).text(`[${new Date(d.timestamp).toLocaleTimeString()}] ${d.action}: ${JSON.stringify(d.details).substring(0, 60)}`);
        doc.moveDown(0.3);
      });
    }
    
    doc.end();
    
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Download report endpoint
router.get('/download-report', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 1;
    const report = await dataManager.generateReport(days);
    
    // Convert to JSON
    const jsonReport = JSON.stringify(report, null, 2);
    
    // Send as file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=traffic-report-${Date.now()}.json`);
    res.send(jsonReport);
    
  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get live stats (fast - from RAM)
router.get('/live-stats', (req, res) => {
  res.json({
    success: true,
    data: dataManager.getLiveData()
  });
});

router.get('/comparison', trafficController.getComparisonStats);

const PDFDocument = require('pdfkit');
const fs = require('fs');

// Download PDF Report
router.get('/download-pdf', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 1;
    const report = await dataManager.generateReport(days);
    
    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=traffic-report-${Date.now()}.pdf`);
    
    // Pipe PDF to response
    doc.pipe(res);
    
    // Title
    doc.fontSize(20).text('TRAFFIC SYSTEM REPORT', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown();
    
    // Summary
    doc.fontSize(14).text('SUMMARY', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Total Time Saved: ${report.live.stats.totalTimeSaved || 0} seconds`);
    doc.text(`Decisions Recorded: ${report.live.decisions.length}`);
    doc.text(`Ambulance Events: ${report.live.ambulanceEvents.length}`);
    doc.text(`System Uptime: ${Math.floor(report.live.uptime / 60)} minutes`);
    doc.moveDown();
    
    // Recent Decisions
    doc.fontSize(14).text('RECENT DECISIONS', { underline: true });
    doc.moveDown(0.5);
    const recentDecisions = report.live.decisions.slice(0, 20);
    recentDecisions.forEach(d => {
      doc.fontSize(9).text(`[${new Date(d.timestamp).toLocaleTimeString()}] ${d.action}: ${JSON.stringify(d.details).substring(0, 80)}`);
    });
    doc.moveDown();
    
    // Ambulance Events
    doc.fontSize(14).text('AMBULANCE EVENTS', { underline: true });
    doc.moveDown(0.5);
    report.live.ambulanceEvents.slice(0, 10).forEach(e => {
      doc.fontSize(9).text(`[${new Date(e.timestamp).toLocaleTimeString()}] ${e.action} on ${e.lane}`);
    });
    
    // Finalize PDF
    doc.end();
    
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// PEDESTRIAN COUNT FROM ESP32 (FSR SENSOR)
// ========================================
router.post('/pedestrian', (req, res) => {
  console.log('🚶 Pedestrian endpoint hit:', req.body);
  try {
    const { count = 0 } = req.body;
    trafficController.updatePedestrianCount(count);
    res.json({ success: true, message: 'Pedestrian count updated' });
  } catch (err) {
    console.error('Pedestrian update error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================
// ESP32 STATE (used by car & pedestrian ESP32s)
// ========================================
router.get('/state', trafficController.getESP32State);

// ========================================
// RFID AMBULANCE DETECTION (from ESP32 #2)
// ========================================
router.post('/rfid', (req, res) => {
  console.log('🚑 RFID endpoint hit:', req.body);
  
  const { tag, lane } = req.body;
  
  if (!tag) {
    return res.status(400).json({ success: false, error: 'Missing tag parameter' });
  }
  
  try {
    if (tag === 'FRONT') {
      console.log(`🚑 Ambulance ARRIVING on lane: ${lane || 'SOUTH'}`);
      trafficController.requestAmbulance(lane || 'SOUTH');
      res.json({ success: true, message: 'Ambulance request processed', action: 'ARRIVED' });
    } 
    else if (tag === 'BACK') {
      console.log(`🚑 Ambulance DEPARTING from lane: ${lane || 'SOUTH'}`);
      trafficController.clearAmbulance();
      res.json({ success: true, message: 'Ambulance cleared processed', action: 'DEPARTED' });
    }
    else {
      res.status(400).json({ success: false, error: `Unknown tag: ${tag}` });
    }
  } catch (err) {
    console.error('❌ RFID processing error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/config', trafficController.getConfig);
router.post('/config', trafficController.setConfig);

// ========================================
// REAL SYSTEM ROUTES (YOLO + dashboard status)
// ========================================
router.post('/updateDensity', trafficController.updateDensity);
router.get('/status', trafficController.getStatus);
router.post('/simulate', trafficController.simulate);

// 8-Page Professional PDF Report
router.get('/download-professional-pdf', async (req, res) => {
  try {
    const report = await dataManager.generateReport(1);
    const PDFGenerator = require('../utils/pdfGenerator');
    const generator = new PDFGenerator(report);
    const doc = generator.generate();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=professional-report-${Date.now()}.pdf`);
    
    doc.pipe(res);
    doc.end();
    
  } catch (err) {
    console.error('Professional PDF error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// MANUAL OVERRIDE (dashboard)
// ========================================
router.post('/override', overrideController.setOverride);
router.get('/override-poll', overrideController.pollOverride);
router.get('/override-status', overrideController.getCurrentOverride);

// ========================================
// SIMULATOR ROUTES (temporary, used by yolo-simulator.html)
// ========================================
router.post('/yolo', trafficController.simulatorYolo);
router.get('/simulator-state', trafficController.simulatorState);
router.post('/esp32-update', trafficController.simulatorESP32Update);
router.get('/update', trafficController.simulatorUpdate);
router.get('/history', trafficController.simulatorHistory);

module.exports = router;