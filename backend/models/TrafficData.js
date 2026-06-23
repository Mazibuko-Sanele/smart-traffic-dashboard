const mongoose = require("mongoose");

const trafficSchema = new mongoose.Schema({
    j1: Number,
    j2: Number,
    j3: Number,
    j4: Number,
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("TrafficData", trafficSchema);
