const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 4000),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mongo_final_project',
  MONGODB_TEST_URI: process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/mongo_final_project_test',
  JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX || 100),
  BACKUP_DIR: process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups'),
};

if (env.NODE_ENV === 'production' && env.JWT_SECRET === 'change-me-in-production') {
  throw new Error('JWT_SECRET must be set in production.');
}

module.exports = env;
