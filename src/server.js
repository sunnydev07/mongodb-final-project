const http = require('http');
const env = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const app = require('./app');

let server;

async function start() {
  try {
    await connectDatabase();
    server = http.createServer(app);
    server.listen(env.PORT, () => {
      console.log(`Server listening on port ${env.PORT} (${env.NODE_ENV})`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  if (server) server.close();
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

if (require.main === module) {
  start();
}

module.exports = { start, app };
