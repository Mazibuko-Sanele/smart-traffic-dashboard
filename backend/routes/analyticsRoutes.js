const express = require('express');
const router = express.Router();
const TrafficEvent = require('../models/TrafficEvent');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const reportsDir = path.join(__dirname, '../reports');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

// GET events by date range
router.get('/events', async (req, res) => {
  const { start, end } = req.query;
  const query = {};
  if (start) query.timestamp = { $gte: new Date(start) };
  if (end) query.timestamp = { ...query.timestamp, $lte: new Date(end) };
  const events = await TrafficEvent.find(query).sort({ timestamp: -1 }).limit(500);
  res.json({ success: true, events });
});

// GET override history
router.get('/overrides', async (req, res) => {
  try {
    const events = await TrafficEvent.find({ eventType: 'OVERRIDE' })
      .sort({ timestamp: -1 })
      //.limit(200);
    res.json({ success: true, overrides: events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// POST generate PDF report
router.post('/report', async (req, res) => {
  const { start, end } = req.body;
  if (!start || !end) {
    return res.status(400).json({ success: false, error: 'Start and end dates required' });
  }

  const events = await TrafficEvent.find({
    timestamp: { $gte: new Date(start), $lte: new Date(end) }
  }).sort({ timestamp: -1 });

  const stats = await TrafficEvent.aggregate([
    { $match: { timestamp: { $gte: new Date(start), $lte: new Date(end) } } },
    { $group: { _id: '$eventType', count: { $sum: 1 } } }
  ]);

  const filename = `traffic_report_${Date.now()}.pdf`;
  const filepath = path.join(reportsDir, filename);

  const doc = new PDFDocument({ margin: 50 });
  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);

  // Header
  doc.fontSize(20).text('Smart Traffic Optimizer Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Period: ${new Date(start).toLocaleString()} – ${new Date(end).toLocaleString()}`);
  doc.text(`Generated: ${new Date().toLocaleString()}`);
  doc.moveDown();

  // Summary stats
  doc.fontSize(14).text('Summary Statistics', { underline: true });
  doc.moveDown(0.5);
  stats.forEach(s => {
    doc.text(`${s._id}: ${s.count} events`);
  });
  doc.moveDown();

  // Ambulance events
  const ambulanceEvents = events.filter(e => e.eventType === 'AMBULANCE');
  if (ambulanceEvents.length > 0) {
    doc.fontSize(14).text('Ambulance Events', { underline: true });
    doc.moveDown(0.5);
    ambulanceEvents.forEach(e => {
      doc.text(`[${new Date(e.timestamp).toLocaleString()}] ${e.data.action || e.data.lane}`);
    });
    doc.moveDown();
  }

  // Override events
  const overrideEvents = events.filter(e => e.eventType === 'OVERRIDE');
  if (overrideEvents.length > 0) {
    doc.fontSize(14).text('Override Events', { underline: true });
    doc.moveDown(0.5);
    overrideEvents.forEach(e => {
      doc.text(`[${new Date(e.timestamp).toLocaleString()}] Lane: ${e.data.lane}, Color: ${e.data.color}`);
    });
    doc.moveDown();
  }

  // Phase changes (last 20)
  const phaseChanges = events.filter(e => e.eventType === 'PHASE_CHANGE').slice(0, 20);
  if (phaseChanges.length > 0) {
    doc.fontSize(14).text('Recent Phase Changes (last 20)', { underline: true });
    doc.moveDown(0.5);
    phaseChanges.forEach(e => {
      doc.text(`[${new Date(e.timestamp).toLocaleString()}] ${e.data.from} → ${e.data.to} (${e.data.duration}s)`);
    });
  }

  doc.end();

  stream.on('finish', () => {
    res.json({ success: true, reportUrl: `/reports/${filename}` });
  });
  stream.on('error', (err) => {
    console.error('PDF stream error:', err);
    res.status(500).json({ success: false });
  });
});

module.exports = router;