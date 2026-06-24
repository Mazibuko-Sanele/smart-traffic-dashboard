// Mock TrafficEvent model - No MongoDB
// This mock returns empty data so the app works without a database

class MockTrafficEvent {
  constructor(data) {
    this.data = data || {};
    this.timestamp = new Date();
    this._id = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  static async find(query = {}) {
    console.log('📋 [Mock] TrafficEvent.find() called with:', query);
    return [];
  }
  
  static async findOne(query = {}) {
    console.log('📋 [Mock] TrafficEvent.findOne() called with:', query);
    return null;
  }
  
  static async findById(id) {
    console.log('📋 [Mock] TrafficEvent.findById() called with:', id);
    return null;
  }
  
  static async aggregate(pipeline = []) {
    console.log('📋 [Mock] TrafficEvent.aggregate() called with pipeline');
    return [];
  }
  
  async save() {
    console.log('📋 [Mock] TrafficEvent.save() called with:', this.data);
    return this;
  }
  
  static async deleteMany(query = {}) {
    console.log('📋 [Mock] TrafficEvent.deleteMany() called with:', query);
    return { deletedCount: 0 };
  }
  
  static async updateOne(query = {}, update = {}) {
    console.log('📋 [Mock] TrafficEvent.updateOne() called with:', { query, update });
    return { modifiedCount: 0 };
  }
  
  static async countDocuments(query = {}) {
    console.log('📋 [Mock] TrafficEvent.countDocuments() called with:', query);
    return 0;
  }
  
  static sort(sortObj) {
    console.log('📋 [Mock] TrafficEvent.sort() called with:', sortObj);
    return this;
  }
  
  static limit(n) {
    console.log('📋 [Mock] TrafficEvent.limit() called with:', n);
    return this;
  }
  
  static skip(n) {
    console.log('📋 [Mock] TrafficEvent.skip() called with:', n);
    return this;
  }
  
  // Chainable methods for query building
  static exec() {
    return [];
  }
}

// Export the mock
module.exports = MockTrafficEvent;