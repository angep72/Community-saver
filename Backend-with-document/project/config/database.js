const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`📦 MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
};

// Handle connection events
// mongoose.connection.on('disconnected', () => {
//   console.log('📦 MongoDB Disconnected');
// });

// process.on('SIGINT', async () => {
//   await mongoose.connection.close();
//   console.log('📦 MongoDB connection closed.');
//   process.exit(0);
// });

module.exports = connectDB;