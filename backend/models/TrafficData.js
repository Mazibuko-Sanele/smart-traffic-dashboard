// Mock TrafficData model - No MongoDB
// This mock returns empty data so the app works without a database

class MockTrafficData {
  constructor(data) {
    this.data = data || {};
  }
  
  static async find(query = {}) {
    console.log('📊 [Mock] TrafficData.find() called with:', query);
    return [];
  }
  
  static async findOne(query = {}) {
    console.log('📊 [Mock] TrafficData.findOne() called with:', query);
    return null;
  }
  
  static async findById(id) {
    console.log('📊 [Mock] TrafficData.findById() called with:', id);
    return null;
  }
  
  async save() {
    console.log('📊 [Mock] TrafficData.save() called with:', this.data);
    return this;
  }
  
  static async deleteMany(query = {}) {
    console.log('📊 [Mock] TrafficData.deleteMany() called with:', query);
    return { deletedCount: 0 };
  }
  
  static async updateOne(query = {}, update = {}) {
    console.log('📊 [Mock] TrafficData.updateOne() called with:', { query, update });
    return { modifiedCount: 0 };
  }
  
  static async countDocuments(query = {}) {
    console.log('📊 [Mock] TrafficData.countDocuments() called with:', query);
    return 0;
  }
}

// Export the mock
module.exports = MockTrafficData;