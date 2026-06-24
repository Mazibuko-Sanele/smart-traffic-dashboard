// Mock User model - No MongoDB
// This mock returns null so the app uses hardcoded credentials

class MockUser {
  constructor(data) {
    this.data = data || {};
    this._id = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  static async find(query = {}) {
    console.log('👤 [Mock] User.find() called with:', query);
    return [];
  }
  
  static async findOne(query = {}) {
    console.log('👤 [Mock] User.findOne() called with:', query);
    // Check if the query matches hardcoded admin credentials
    if (query.email === 'admin@gmail.com' && query.password === '1234') {
      return new MockUser({ email: 'admin@gmail.com', password: '1234' });
    }
    return null;
  }
  
  static async findById(id) {
    console.log('👤 [Mock] User.findById() called with:', id);
    return null;
  }
  
  async save() {
    console.log('👤 [Mock] User.save() called with:', this.data);
    return this;
  }
  
  static async deleteMany(query = {}) {
    console.log('👤 [Mock] User.deleteMany() called with:', query);
    return { deletedCount: 0 };
  }
  
  static async updateOne(query = {}, update = {}) {
    console.log('👤 [Mock] User.updateOne() called with:', { query, update });
    return { modifiedCount: 0 };
  }
  
  static async countDocuments(query = {}) {
    console.log('👤 [Mock] User.countDocuments() called with:', query);
    return 0;
  }
}

// Export the mock
module.exports = MockUser;