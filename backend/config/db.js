const mongoose = require("mongoose");

async function connectDB() {
    try {
        await mongoose.connect("mongodb://localhost:27017/traffic_optimizer");
        console.log("MongoDB connected");
    } catch (err) {
        console.log("MongoDB error:", err.message);
    }
}

module.exports = connectDB;
