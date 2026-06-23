// frontend/public/js/api.js
const API_BASE = "/api";

// Get current traffic control status
export async function getStatus() {
  const res = await fetch(`${API_BASE}/traffic/status`);
  return await res.json();
}

// Send manual override
export async function setOverride({ lane, color, duration }) {
  const res = await fetch('/api/traffic/override', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lane, color, duration })
  });
  return res.json();
}