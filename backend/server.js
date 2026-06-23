// backend/server.js
const express = require("express");
const path = require("path");
const cors = require("cors");
const http = require("http");

const authRoutes = require("./routes/authRoutes");
const trafficRoutes = require("./routes/trafficRoutes");
const viewRoutes = require("./routes/viewRoutes");
const analyticsRoutes = require('./routes/analyticsRoutes');

const app = express();

// Optional: connectDB only if you want Mongo (we keep previous db.js call - harmless)
try {
  const connectDB = require("./config/db");
  connectDB();
} catch (err) {
  console.warn("DB connect skipped or failed (no Mongo required).", err.message || err);
}

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files (CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname, "../frontend/public")));

// API routes - these should come first
app.use("/api/auth", authRoutes);
app.use("/api/traffic", trafficRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/reports', express.static(path.join(__dirname, 'reports')));

// View routes - HTML pages (including /, /login, /dashboard, /simulation, /settings)
app.use("/", viewRoutes);

// 404 fallback - this should be the LAST middleware
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "../frontend/views/index.html"));
});

// ========== WEBSOCKET SETUP ==========
// Create HTTP server from Express app
const server = http.createServer(app);

// Socket.io setup
const socketIo = require("socket.io");
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store connected clients
const connectedClients = new Set();
const esp32Devices = new Map();

io.on("connection", (socket) => {
  console.log("📡 Client connected:", socket.id);
  connectedClients.add(socket);
  
  // Handle subscription to specific channels (for dashboard)
  socket.on("subscribe", (channel) => {
    socket.join(channel);
    console.log(`📡 Client ${socket.id} subscribed to: ${channel}`);
  });
  
  // ========== YOLO DENSITY UPDATE ==========
  socket.on("density-update", (data) => {
    console.log("🚗 YOLO density update received:", data);
    
    // ONLY update densities in traffic controller
    // Let traffic controller handle broadcasting
    try {
      const trafficController = require("./controllers/trafficController");
      if (trafficController.updateDensityFromWebSocket) {
        trafficController.updateDensityFromWebSocket(data);
      }
    } catch (err) {
      console.error("Error updating densities:", err.message);
    }
  });
  
  // Register ESP32 device
socket.on("register-esp32", (data) => {
  console.log("🔌 ESP32 registered:", socket.id, data);
  esp32Devices.set(socket.id, {
    type: data.type || "esp32",
    lane: data.lane || "unknown",
    lastSeen: Date.now()
  });
  
  // Send acknowledgment
  socket.emit("connection-ack", { 
    status: "connected", 
    message: "ESP32 registered successfully",
    type: data.type 
  });
  
  // Send initial state immediately
  sendESP32State(socket);
  
  console.log(`✅ ESP32 ${data.type} registered. Total devices: ${esp32Devices.size}`);
});
  
  // Handle pedestrian updates from ESP32
  socket.on("pedestrian-update", (data) => {
    console.log("🚶 Pedestrian update:", data);
    try {
      const trafficController = require("./controllers/trafficController");
      if (trafficController.updatePedestrianCount) {
        trafficController.updatePedestrianCount(data.count || 0);
      }
    } catch (err) {
      console.error("Error processing pedestrian update:", err.message);
    }
  });
  
  // Handle ambulance events from ESP32
  socket.on("ambulance-event", (data) => {
    console.log("🚑 Ambulance event:", data);
    try {
      const trafficController = require("./controllers/trafficController");
      if (data.tag === "FRONT") {
        trafficController.requestAmbulance(data.lane);
      } else if (data.tag === "BACK") {
        trafficController.clearAmbulance();
      }
    } catch (err) {
      console.error("Error processing ambulance event:", err.message);
    }
  });
  
  socket.on("disconnect", () => {
    connectedClients.delete(socket);
    esp32Devices.delete(socket.id);
    console.log("📡 Client disconnected:", socket.id);
  });
});

// Function to send state to a specific ESP32
function sendESP32State(socket) {
  try {
    const trafficController = require("./controllers/trafficController");
    
    const cmd = trafficController.getESP32Command ? 
                trafficController.getESP32Command() : 
                { command: 'GREEN', phase: 'NORTH', phaseStep: 'GREEN', timeRemaining: 20 };
    
    const state = {
      command: cmd.command,
      phase: cmd.phase,
      phaseStep: cmd.phaseStep,
      timeRemaining: cmd.timeRemaining,
      timestamp: Date.now()
    };
    
    socket.emit("esp32-state", state);
  } catch (err) {
    console.error("Error sending ESP32 state:", err.message);
  }
}

// Broadcast state to ALL ESP32 devices
global.broadcastESP32State = () => {
  try {
    const trafficController = require("./controllers/trafficController");
    const cmd = trafficController.getESP32Command ? 
                trafficController.getESP32Command() : 
                { command: 'GREEN', phase: 'NORTH', phaseStep: 'GREEN', timeRemaining: 20 };
    
    const state = {
      command: cmd.command,
      phase: cmd.phase,
      phaseStep: cmd.phaseStep,
      timeRemaining: cmd.timeRemaining,
      timestamp: Date.now()
    };
    
    for (const [socketId, device] of esp32Devices) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit("esp32-state", state);
      }
    }
  } catch (err) {
    console.error("Error broadcasting ESP32 state:", err.message);
  }
};

// Make io available to routes
app.set("io", io);

// Helper function to broadcast state updates to dashboard
global.broadcastStateUpdate = (state) => {
  io.emit("state-update", state);
};

global.broadcastEvent = (event) => {
  io.emit("event-log", event);
};

console.log("✅ WebSocket enabled - real-time updates active");

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket ready at ws://localhost:${PORT}`);
});