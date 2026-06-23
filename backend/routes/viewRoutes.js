// backend/routes/viewRoutes.js
const express = require("express");
const path = require("path");
const router = express.Router();

// HOME PAGE
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/views/index.html"));
});

// LOGIN PAGE
router.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/views/login.html"));
});

// DASHBOARD PAGE
router.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/views/dashboard.html"));
});

// SIMULATION PAGE
router.get("/simulation", (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/views/simulation.html"));
});

// SETTINGS PAGE
router.get("/settings", (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/views/settings.html"));
});

// LIVE PAGE (FIXED PATH)
router.get("/live", (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/views/live.html"));
});

// ANALYTICS PAGE  ← new
router.get("/analytics", (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/views/analytics.html"));
});

router.get('/simulator', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/views/simulator.html'));
});

router.get("/yolo-simulator", (req, res) => {
    res.sendFile(path.join(__dirname, "../../frontend/views/yolo-simulator.html"));
});
module.exports = router;