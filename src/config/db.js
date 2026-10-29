const mongoose = require('mongoose');
const env = require('./env');

let isConnected = false;

async function connectDatabase(uri = env.MONGODB_URI) {
  if (isConnected) return mongoose.connection;

  await mongoose.connect(uri, {
    autoIndex: process.env.NODE_ENV !== 'production',
    maxPoolSize: Number(process.env.MONGO_POOL_SIZE || 10),
    serverSelectionTimeoutMS: 5000,
    // Workaround for mongodb driver >= 7.6 handshake failure under Jest
    // (NODE-7832): resolve the `os` runtime adapter synchronously.
    runtimeAdapters: { os: require('os') },
  });

  isConnected = mongoose.connection.readyState === 1;
  mongoose.connection.on('connected', () => {
    process.stdout.write(`MongoDB connected -> ${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}\n`);
  });
  mongoose.connection.on('error', (err) => {
    process.stderr.write(`MongoDB connection error: ${err.message}\n`);
  });
  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    process.stdout.write('MongoDB disconnected\n');
  });

  return mongoose.connection;
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
}

module.exports = { connectDatabase, disconnectDatabase, mongoose };
