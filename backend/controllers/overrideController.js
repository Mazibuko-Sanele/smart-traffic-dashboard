const trafficController = require('./trafficController');

let pendingOverride = null;

exports.setOverride = (req, res) => {
  try {
    const { lane, color, duration } = req.body;
    const { mode } = req.body;

    let overrideCommand = null;

    if (lane === 'AUTO') {
  trafficController._setOverride({ command: 'AUTO' }, null);
  return res.json({ success: true, message: 'Auto mode resumed' });
}

    // New format: lane + color (individual lane overrides)
    if (lane && color) {
      const allowedLanes = ["NORTH", "EAST", "SOUTH", "WEST", "ALL_RED"];
      const allowedColors = ["GREEN", "YELLOW", "RED"];
      if (!allowedLanes.includes(lane) || !allowedColors.includes(color)) {
        return res.status(400).json({ success: false, message: "Invalid lane or color" });
      }
      overrideCommand = {
        command: "OVERRIDE",
        phase: lane,
        phaseStep: color
      };
    }
    // Old format: mode (AUTO, NS_GREEN, EW_GREEN, ALL_RED) – keep for compatibility
    else if (mode) {
      if (!["AUTO", "NS_GREEN", "EW_GREEN", "ALL_RED"].includes(mode)) {
        return res.status(400).json({ success: false, message: "Invalid mode" });
      }
      if (mode === "AUTO") {
        overrideCommand = { command: "AUTO" };
      } else if (mode === "ALL_RED") {
        overrideCommand = { command: "OVERRIDE", phase: "ALL_RED", phaseStep: "RED" };
      } else {
        // NS_GREEN or EW_GREEN – map to individual lanes? Not needed for new buttons
        overrideCommand = { command: "OVERRIDE", phase: mode, phaseStep: "GREEN" };
      }
    } else {
      return res.status(400).json({ success: false, message: "Missing lane/color or mode" });
    }

    let expiresAt = null;
    if (duration && Number(duration) > 0) {
      expiresAt = Date.now() + Number(duration) * 1000;
    }

    trafficController._setOverride(overrideCommand, expiresAt);

    pendingOverride = {
      mode: overrideCommand.phase || overrideCommand.command,
      duration: duration || 0,
      timestamp: Date.now()
    };

    console.log("Override Set:", pendingOverride);
    res.json({ success: true, override: pendingOverride, expiresAt });
  } catch (err) {
    console.error("Override Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.pollOverride = (req, res) => {
  try {
    if (pendingOverride) {
      const command = pendingOverride;
      pendingOverride = null;
      console.log("ESP32 received override:", command);
      return res.json({ success: true, override: command });
    }
    res.json({ success: true, override: null });
  } catch (err) {
    console.error("Override Poll Error:", err);
    res.status(500).json({ success: false });
  }
};

exports.getCurrentOverride = (req, res) => {
  try {
    const state = trafficController._getState ? trafficController._getState() : { mode: 'AUTO', overrideExpiresAt: null };
    res.json({ success: true, mode: state.mode, expiresAt: state.overrideExpiresAt });
  } catch (err) {
    console.error("Override Status Error:", err);
    res.status(500).json({ success: false });
  }
};