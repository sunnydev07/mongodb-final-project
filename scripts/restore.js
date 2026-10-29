const path = require('path');
const fs = require('fs').promises;
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');
const env = require('../src/config/env');

async function resolveBackupDir() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const root = path.resolve(env.BACKUP_DIR);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const backups = entries.filter((e) => e.isDirectory() && e.name.startsWith('backup-')).map((e) => e.name).sort();
  if (!backups.length) throw new Error('No backups found.');
  return path.join(root, backups[backups.length - 1]);
}

async function main() {
  const dir = await resolveBackupDir();
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));

  const client = new MongoClient(env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  for (const col of manifest.collections) {
    const raw = await fs.readFile(path.join(dir, col.file), 'utf8');
    const docs = EJSON.parse(raw, { relaxed: false });
    if (!docs.length) continue;
    await db.collection(col.name).deleteMany({});
    await db.collection(col.name).insertMany(docs, { ordered: false });
    console.log(`Restored ${docs.length} docs into ${col.name}`);
  }

  await client.close();
  console.log(`Restore completed from ${dir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
