// Mock database connection - No MongoDB
// This mock does nothing so the app doesn't try to connect

console.log('ℹ️ [Mock] MongoDB disabled - running in demo mode');

async function connectDB() {
  console.log('ℹ️ [Mock] Database connection skipped - using demo mode');
  return Promise.resolve();
}

module.exports = connectDB;