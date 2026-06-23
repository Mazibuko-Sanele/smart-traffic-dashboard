const mongoose = require('mongoose');

const TrafficEventSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  eventType: { 
    type: String, 
    enum: ['PHASE_CHANGE', 'CAR_COUNT', 'WAIT_TIME', 'AMBULANCE', 'OVERRIDE', 'DECISION'],
    enum: ['DECISION', 'PHASE_CHANGE', 'AMBULANCE', 'OVERRIDE', 'SYSTEM_SNAPSHOT'], // ← Add this
    required: true 
  },
  data: { type: mongoose.Schema.Types.Mixed, required: true }
});

TrafficEventSchema.index({ timestamp: -1 });
module.exports = mongoose.model('TrafficEvent', TrafficEventSchema);